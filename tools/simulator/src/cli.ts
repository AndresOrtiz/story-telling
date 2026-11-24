import { createEmbeddedDb, getDb, setDb } from "@cs/db";
import { playSession, type Result } from "./run.ts";

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > 0 ? Number(process.argv[i + 1]) : fallback;
};
const sessions = arg("sessions", 5);
const n = arg("n", 5);
const players = arg("players", 6);
const parallel = arg("parallel", 1);

// Bots never touch the configured database: every run uses a fresh in-memory one.
setDb(await createEmbeddedDb());
const results: Result[] = [];
const errors: unknown[] = [];
let next = 0;
await Promise.all(
  Array.from({ length: Math.min(parallel, sessions) }, async () => {
    while (next < sessions) {
      const i = next++;
      try {
        const r = await playSession({ n, players, writeIns: i % 2 === 0 });
        results.push(r);
        console.log(
          `${r.code} ${r.completed ? "ok" : "INCOMPLETE"} dilemmas=${r.dilemmas}/${r.expected} scenes=${r.scenes} rejected=${r.rejectedOps}/${r.totalOps} ${JSON.stringify(r.resolvedBy)} $${r.costUsd.toFixed(3)} ${r.seconds.toFixed(1)}s${r.builtIn ? " built-in" : ""}`,
        );
      } catch (e) {
        errors.push(e);
        console.error("Session failed:", e);
      }
    }
  }),
);
const sum = (f: (r: Result) => number) => results.reduce((s, r) => s + f(r), 0);
console.log("\nSummary");
console.table({
  sessions,
  completed: results.filter((r) => r.completed).length,
  errors: errors.length,
  "exactly N": results.filter((r) => r.dilemmas === r.expected).length,
  "ungrounded profiles": sum((r) => r.ungrounded),
  "rejected diff ops": `${sum((r) => r.rejectedOps)} of ${sum((r) => r.totalOps)}`,
  "built-in sessions": results.filter((r) => r.builtIn).length,
  "cost per session (USD)": results.length ? (sum((r) => r.costUsd) / results.length).toFixed(3) : "-",
});
await (await getDb()).close();
process.exit(errors.length || results.some((r) => !r.completed || r.dilemmas !== r.expected) ? 1 : 0);
