import { AsyncLocalStorage } from "node:async_hooks";
import { getDb, isFake } from "@cs/db";
import { Inngest } from "inngest";

export type JobKind =
  | "title"
  | "universe"
  | "portraits"
  | "dilemma"
  | "consequence"
  | "analysis"
  | "story"
  | "writein"
  | "image";

export type Job = {
  kind: JobKind;
  sessionId: string;
  k: number;
  attempt?: number;
  /** Extra id: write-in, or the role of the image to regenerate. */
  ref?: string;
  /** Skip the AI. Used when a previous attempt died. */
  forceDefault?: boolean;
};

export const inngest = new Inngest({
  id: "collective-story",
  isDev: process.env.INNGEST_DEV === "1",
  ...(isFake(process.env.INNGEST_EVENT_KEY) ? {} : { eventKey: process.env.INNGEST_EVENT_KEY }),
});

/** Inngest rejects the whole app when a function asks for more than the plan allows. The free plan allows 5. */
export function concurrencyLimit(value = process.env.INNGEST_CONCURRENCY): number {
  const n = Number(value);
  return Number.isInteger(n) && n >= 1 ? n : 5;
}

/**
 * Waiting phases send their job again on every snapshot read until it starts, and Inngest drops events whose id it knows.
 * The minute lets a lost event be sent again.
 */
export const eventId = (job: Job, now: number): string =>
  [job.sessionId, job.kind, job.ref ?? "", job.k, job.attempt ?? 0, Math.floor(now / 60_000)].join(":");

/**
 * A server function is stopped after 300 seconds (`maxDuration` in apps/web/app/api/inngest/route.ts), so every job
 * ends itself before that. Text stops early enough to leave a minute for the images of the same job.
 */
export const TEXT_MS = 215_000;
export const JOB_MS = 275_000;

export type JobTime = { text: number; end: number };

/**
 * Inngest's cloud accepts events from anywhere, but can only run them on a server it can call back with both keys.
 * `pnpm dev` is on localhost, so it never uses the cloud, only the local Inngest server (INNGEST_DEV=1).
 */
export function inngestEnabled(env: Record<string, string | undefined> = process.env): boolean {
  if (env.INNGEST_DEV === "1") return true;
  return env.NODE_ENV === "production" && !isFake(env.INNGEST_EVENT_KEY) && !isFake(env.INNGEST_SIGNING_KEY);
}

type Handler = (job: Required<Pick<Job, "attempt">> & Job) => Promise<void>;
const registry = globalThis as unknown as {
  __csHandlers?: Partial<Record<JobKind, Handler>>;
  __csPending?: Set<Promise<void>>;
  __csBackground?: (work: () => Promise<void>) => void;
  __csJobTime?: AsyncLocalStorage<JobTime>;
  __csSent?: Set<string>;
};
registry.__csHandlers ??= {};
registry.__csPending ??= new Set();
registry.__csJobTime ??= new AsyncLocalStorage();
registry.__csSent ??= new Set();

/** The deadlines of the job that is running, or undefined outside a job. */
export const jobTime = (): JobTime | undefined => registry.__csJobTime!.getStore();

export function registerHandlers(handlers: Record<JobKind, Handler>): void {
  registry.__csHandlers = handlers;
}

/** The web server supplies `after()` so that inline jobs survive the end of a request. */
export function setBackground(run: (work: () => Promise<void>) => void): void {
  registry.__csBackground = run;
}

/** Runs a job once. A second call with the same key does nothing. */
export async function runJob(job: Job): Promise<void> {
  const db = await getDb();
  const attempt = job.attempt ?? 0;
  const kind = job.ref ? `${job.kind}:${job.ref}` : job.kind;
  const claimed = await db.query(
    "insert into jobs (session_id, kind, k, attempt) values ($1, $2, $3, $4) on conflict do nothing returning id",
    [job.sessionId, kind, job.k, attempt],
  );
  if (claimed.length === 0) return;
  const finish = (status: "done" | "failed") =>
    db.query("update jobs set status = $5 where session_id = $1 and kind = $2 and k = $3 and attempt = $4", [
      job.sessionId,
      kind,
      job.k,
      attempt,
      status,
    ]);
  try {
    const handler = registry.__csHandlers![job.kind];
    if (!handler) throw new Error(`No handler for ${job.kind}`);
    const now = Date.now();
    await registry.__csJobTime!.run({ text: now + TEXT_MS, end: now + JOB_MS }, () => handler({ ...job, attempt }));
    await finish("done");
  } catch (e) {
    console.error(`Job ${kind} (k=${job.k}, attempt=${attempt}) failed:`, e);
    await finish("failed").catch(() => {});
  }
}

/** Starts a job. `here` skips Inngest: used when Inngest took the event but did not start the job. */
export async function dispatch(job: Job, here = false): Promise<void> {
  if (!here && inngestEnabled()) {
    const id = eventId(job, Date.now());
    const sent = registry.__csSent!;
    if (sent.has(id)) return;
    try {
      await inngest.send({ id, name: "cs/job", data: job });
      if (sent.size > 500) sent.clear();
      sent.add(id);
      return;
    } catch (e) {
      console.error("Inngest is unreachable, running the job in this process:", e instanceof Error ? e.message : e);
    }
  }
  const work = async () => {
    const p = runJob(job);
    registry.__csPending!.add(p);
    await p.finally(() => registry.__csPending!.delete(p));
  };
  if (registry.__csBackground) registry.__csBackground(work);
  else void work();
}

/** Tests and the simulator wait until every inline job is done. */
export async function drainJobs(): Promise<void> {
  // Let freshly dispatched work register itself first.
  await new Promise((r) => setTimeout(r, 0));
  while (registry.__csPending!.size) {
    await Promise.allSettled([...registry.__csPending!]);
    await new Promise((r) => setTimeout(r, 0));
  }
}
