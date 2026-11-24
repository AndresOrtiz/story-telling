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

const inngestEnabled = () => process.env.INNGEST_DEV === "1" || !isFake(process.env.INNGEST_EVENT_KEY);

type Handler = (job: Required<Pick<Job, "attempt">> & Job) => Promise<void>;
const registry = globalThis as unknown as {
  __csHandlers?: Partial<Record<JobKind, Handler>>;
  __csPending?: Set<Promise<void>>;
  __csBackground?: (work: () => Promise<void>) => void;
};
registry.__csHandlers ??= {};
registry.__csPending ??= new Set();

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
    await handler({ ...job, attempt });
    await finish("done");
  } catch (e) {
    console.error(`Job ${kind} (k=${job.k}, attempt=${attempt}) failed:`, e);
    await finish("failed").catch(() => {});
  }
}

export async function dispatch(job: Job): Promise<void> {
  if (inngestEnabled()) {
    try {
      await inngest.send({ name: "cs/job", data: job });
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
