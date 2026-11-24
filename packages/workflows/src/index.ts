import { getDb } from "@cs/db";
import { access, fillMissingSelections, requireHost } from "./commands.ts";
import { hostAction, type HostAction } from "./flow.ts";
import { inngest, runJob, type Job } from "./dispatch.ts";
import { deleteMedia } from "./store.ts";
import "./jobs.ts";

export * from "./commands.ts";
export * from "./snapshot.ts";
export { GameError } from "./rows.ts";
export { drainJobs, inngest, setBackground } from "./dispatch.ts";
export { localMediaPath } from "./store.ts";
export type { HostAction } from "./flow.ts";

export async function runHostAction(
  code: string,
  userId: string,
  action: HostAction,
  expected?: { phase: string; k: number },
): Promise<void> {
  const s = await requireHost(code, userId);
  if (action === "continue_selection" && s.phase === "selection") await fillMissingSelections(s);
  await hostAction(s.id, action, userId, expected);
}

/** Deletes sessions older than 30 days with everything they contain (§14.3). */
export async function cleanup(days = 30): Promise<number> {
  const db = await getDb();
  const rows = await db.query<{ id: string }>(
    "delete from sessions where created_at < now() - $1::int * interval '1 day' returning id",
    [days],
  );
  for (const row of rows) await deleteMedia(row.id).catch((e) => console.error("Media cleanup failed:", e));
  return rows.length;
}

export const functions = [
  inngest.createFunction(
    { id: "run-job", retries: 1, concurrency: [{ limit: 20 }, { limit: 4, key: "event.data.sessionId" }], triggers: [{ event: "cs/job" }] },
    async ({ event }) => runJob(event.data as Job),
  ),
  inngest.createFunction({ id: "cleanup", triggers: [{ cron: "0 4 * * *" }] }, async () => ({ deleted: await cleanup() })),
];

export { access };
