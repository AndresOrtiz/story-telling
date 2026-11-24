import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { createEmbeddedDb, json, type Db } from "../src/index.ts";

let db: Db;
beforeAll(async () => {
  db = await createEmbeddedDb();
});
afterAll(() => db.close());

const config = (extra = {}) => ({ maxPlayers: 2, lateJoin: "locked", spectators: false, ...extra });
async function session(extra = {}, phase = "lobby") {
  const code = randomUUID().slice(0, 6).toUpperCase();
  const [s] = await db.query<{ id: string }>(
    "insert into sessions (code, host_user_id, config, dilemma_count, phase) values ($1, $2, $3, 3, $4) returning id",
    [code, randomUUID(), json(config(extra)), phase],
  );
  return { code, id: s!.id };
}
const join = async (code: string, nickname: string, user = randomUUID(), role = "player") =>
  (
    await db.query<{ id: string; nickname: string; approved: boolean }>("select * from join_session($1,$2,$3,'x',$4,$5)", [
      code,
      user,
      nickname,
      role,
      randomUUID().slice(0, 4),
    ])
  )[0]!;

describe("join_session", () => {
  it("dedupes nicknames, returns the same seat and enforces capacity", async () => {
    const s = await session();
    const user = randomUUID();
    const a = await join(s.code, "Ana", user);
    expect((await join(s.code, "Other", user)).id).toBe(a.id);
    expect((await join(s.code, "ana")).nickname).toBe("ana 2");
    await expect(join(s.code, "Leo")).rejects.toThrow("room_full");
    await expect(join("NOPE00", "Leo")).rejects.toThrow("not_found");
  });
  it("applies late-join, lock and spectator rules", async () => {
    await expect(join((await session({}, "voting")).code, "Leo")).rejects.toThrow("started");
    expect((await join((await session({ lateJoin: "host" }, "voting")).code, "Leo")).approved).toBe(false);
    await expect(join((await session()).code, "Leo", randomUUID(), "spectator")).rejects.toThrow("no_spectators");
    const locked = await session();
    await db.query("update sessions set locked = true where id = $1", [locked.id]);
    await expect(join(locked.code, "Leo")).rejects.toThrow("locked");
  });
});

describe("cast_vote and close_round", () => {
  async function round(min = 1, max = 2, seconds: number | null = 60) {
    const s = await session({}, "voting");
    await db.query("update sessions set phase = 'lobby' where id = $1", [s.id]);
    const a = await join(s.code, "Ana");
    const b = await join(s.code, "Leo");
    await db.query("update sessions set phase = 'voting' where id = $1", [s.id]);
    const [d] = await db.query<{ id: string }>(
      "insert into dilemmas (session_id, k, source, payload, format, min_select, max_select) values ($1, 1, 'default', '{}', 'multiple', $2, $3) returning id",
      [s.id, min, max],
    );
    const [r] = await db.query<{ id: string }>(
      "insert into vote_rounds (dilemma_id, round_no, kind, candidates, min_select, max_select, exclusive, ends_at) values ($1, 1, 'initial', $2, $3, $4, $5, now() + $6::int * interval '1 second') returning id",
      [d!.id, json(["A", "B", "C"]), min, max, json([["A", "C"]]), seconds],
    );
    const vote = (p: string, keys: string[]) => db.query("select cast_vote($1, $2, $3, null, null)", [r!.id, p, keys]);
    return { s, a, b, r: r!.id, vote };
  }
  it("accepts one valid ballot per player", async () => {
    const { a, b, r, vote } = await round();
    await expect(vote(a.id, ["Z"])).rejects.toThrow("unknown_option");
    await expect(vote(a.id, ["A", "C"])).rejects.toThrow("incompatible");
    await expect(vote(a.id, ["A", "B", "C"])).rejects.toThrow("too_many");
    await expect(vote(a.id, ["A", "A"])).rejects.toThrow("duplicate_option");
    await expect(vote(a.id, [])).rejects.toThrow("too_few");
    await expect(vote(randomUUID(), ["A"])).rejects.toThrow("not_eligible");
    await vote(a.id, ["A", "B"]);
    await expect(vote(a.id, ["B"])).rejects.toThrow("already_voted");
    expect((await db.query<{ ok: boolean }>("select close_round($1) as ok", [r]))[0]!.ok).toBe(true);
    expect((await db.query<{ ok: boolean }>("select close_round($1) as ok", [r]))[0]!.ok).toBe(false);
    await expect(vote(b.id, ["B"])).rejects.toThrow("round_closed");
    const rows = await db.query<{ abstained: boolean }>("select abstained from votes where round_id = $1 order by abstained", [r]);
    expect(rows.map((x) => x.abstained)).toEqual([false, true]);
  });
  it("rejects votes after the deadline", async () => {
    const { a, vote } = await round(1, 1, -10);
    await expect(vote(a.id, ["A"])).rejects.toThrow("round_closed");
  });
});

describe("transition_phase", () => {
  it("uses optimistic locking and logs the event", async () => {
    const s = await session();
    const go = (v: number, to: string) => db.query("select * from transition_phase($1, $2, $3, 'host')", [s.id, v, to]);
    await go(1, "selection");
    await expect(go(1, "universe_generating")).rejects.toThrow("conflict");
    await go(2, "paused");
    const [row] = await db.query("select phase, paused_from, state_version from sessions where id = $1", [s.id]);
    expect(row).toEqual({ phase: "paused", paused_from: "selection", state_version: 3 });
    expect(await db.query("select 1 from events_log where session_id = $1", [s.id])).toHaveLength(2);
  });
});

it("keeps every table private to the server", async () => {
  const open = await db.query(
    "select relname from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r' and not relrowsecurity and relname <> '_migrations'",
  );
  expect(open).toEqual([]);
  expect(await db.query("select 1 from pg_policies where schemaname = 'public'")).toEqual([]);
});
