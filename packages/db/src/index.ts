import { existsSync, mkdirSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { PGlite as PGliteType } from "@electric-sql/pglite";

export type Row = Record<string, unknown>;
export interface Sql {
  query<T = Row>(text: string, params?: unknown[]): Promise<T[]>;
}
export interface Db extends Sql {
  readonly kind: "postgres" | "embedded";
  transaction<T>(fn: (tx: Sql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export const isFake = (v: string | undefined): boolean => !v || v.includes("FAKE");

/** Short error codes raised by SQL functions, e.g. `room_full`. */
export function errorCode(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return /^[a-z_]{3,40}$/.test(m) ? m : "internal";
}

function repoRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, "pnpm-workspace.yaml"))) {
    const up = dirname(dir);
    if (up === dir) throw new Error("Repository root not found");
    dir = up;
  }
  return dir;
}

/** Postgres arrays and JSON go in as parameters: plain objects are sent as JSON text. */
const isPlain = (p: unknown) => p !== null && typeof p === "object" && !Array.isArray(p) && !(p instanceof Date);
/** Wrap a value that must be stored as jsonb even when it is an array, string or number. */
export const json = (v: unknown): string => JSON.stringify(v ?? null);

/** Minimal stand-ins for what Supabase provides, so the same migrations run on PGlite. */
const PRELUDE = `
  do $$ begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  end $$;
  create table if not exists public._migrations (name text primary key);
`;

export async function createEmbeddedDb(dataDir?: string): Promise<Db> {
  const { PGlite } = await import("@electric-sql/pglite");
  if (dataDir) mkdirSync(dirname(resolve(dataDir)), { recursive: true });
  const pg: PGliteType = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.exec(PRELUDE);
  const dir = join(repoRoot(), "supabase", "migrations");
  const done = new Set((await pg.query<{ name: string }>("select name from public._migrations")).rows.map((r) => r.name));
  for (const name of readdirSync(dir).filter((f) => f.endsWith(".sql")).sort()) {
    if (done.has(name)) continue;
    await pg.transaction(async (tx) => {
      await tx.exec(readFileSync(join(dir, name), "utf8"));
      await tx.query("insert into public._migrations values ($1)", [name]);
    });
  }
  const run = async <T>(q: Pick<PGliteType, "query">, text: string, params: unknown[] = []) =>
    (await q.query<T>(text, params.map((p) => (isPlain(p) ? JSON.stringify(p) : p)))).rows;
  return {
    kind: "embedded",
    query: (text, params) => run(pg, text, params),
    transaction: (fn) => pg.transaction((tx) => fn({ query: (text, params) => run(tx as never, text, params) })) as never,
    close: () => pg.close(),
  };
}

export async function createPostgresDb(url: string): Promise<Db> {
  const { default: postgres } = await import("postgres");
  // prepare:false works with Supabase's transaction pooler.
  const sql = postgres(url, {
    prepare: false,
    max: 5,
    // One query at a time per connection: Supabase's pooler (Supavisor before 2.10) loses the answers of pipelined
    // queries, and the caller then waits forever. For the same reason, never use Promise.all inside a transaction.
    max_pipeline: 1,
    // A pooler that stops answering becomes an error instead of an endless wait (seconds).
    query_timeout: 30,
    idle_timeout: 20,
    // Values arrive as JSON text already; the default serializer would encode them twice.
    types: {
      json: {
        to: 3802,
        from: [114, 3802],
        serialize: (v: unknown) => (typeof v === "string" ? v : JSON.stringify(v)),
        parse: (v: string) => JSON.parse(v),
      },
    },
  });
  const run = async (q: { unsafe: (t: string, p?: never[]) => PromiseLike<unknown> }, text: string, params: unknown[] = []) =>
    (await q.unsafe(text, params.map((p) => (isPlain(p) ? JSON.stringify(p) : p)) as never[])) as never;
  return {
    kind: "postgres",
    query: async (text, params) => [...((await run(sql as never, text, params)) as never[])],
    transaction: (fn) =>
      sql.begin((tx) =>
        fn({ query: async (text, params) => [...((await run(tx as never, text, params)) as never[])] }),
      ) as never,
    close: () => sql.end(),
  };
}

const holder = globalThis as unknown as { __csDb?: Promise<Db> };
export function getDb(): Promise<Db> {
  holder.__csDb ??= isFake(process.env.DATABASE_URL)
    ? createEmbeddedDb(process.env.PGLITE_DIR || join(repoRoot(), ".data", "pglite"))
    : createPostgresDb(process.env.DATABASE_URL!);
  holder.__csDb.catch(() => (holder.__csDb = undefined));
  return holder.__csDb;
}
/** Tests and tools can supply their own database. */
export function setDb(db: Db): void {
  holder.__csDb = Promise.resolve(db);
}
