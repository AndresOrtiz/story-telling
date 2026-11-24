import type { Phase } from "@cs/schemas";

/** Allowed phase transitions (design §4.2). Pause and abort are handled separately. */
export const TRANSITIONS: Record<Phase, readonly Phase[]> = {
  lobby: ["selection"],
  selection: ["universe_generating"],
  universe_generating: ["universe_reveal"],
  universe_reveal: ["dilemma_preparing", "universe_generating"],
  dilemma_preparing: ["dilemma_presenting"],
  dilemma_presenting: ["voting", "dilemma_preparing"],
  voting: ["results"],
  results: ["discussion", "voting", "decision_confirmed"],
  discussion: ["final_vote"],
  final_vote: ["decision_confirmed", "final_vote"],
  decision_confirmed: ["consequence"],
  consequence: ["dilemma_preparing", "analysis_generating"],
  analysis_generating: ["analysis_reveal"],
  analysis_reveal: ["story_generating"],
  story_generating: ["story_playback"],
  story_playback: ["completed"],
  completed: [],
  paused: [],
  aborted: [],
};

/** Phases that advance on their own when generation finishes; the rest need the host or a timer. */
export const SYSTEM_PHASES: ReadonlySet<Phase> = new Set([
  "universe_generating",
  "dilemma_preparing",
  "decision_confirmed",
  "analysis_generating",
  "story_generating",
]);

export const TIMED_PHASES: ReadonlySet<Phase> = new Set(["voting", "discussion", "final_vote"]);
const TERMINAL: ReadonlySet<Phase> = new Set(["completed", "aborted"]);

export function canTransition(
  from: Phase,
  to: Phase,
  ctx: { pausedFrom?: Phase | null; k?: number; n?: number } = {},
): boolean {
  if (to === "aborted") return !TERMINAL.has(from);
  if (to === "paused") return from !== "paused" && from !== "lobby" && !TERMINAL.has(from) && !SYSTEM_PHASES.has(from);
  if (from === "paused") return to === ctx.pausedFrom;
  if (!TRANSITIONS[from].includes(to)) return false;
  if (from === "consequence" && ctx.k !== undefined && ctx.n !== undefined) {
    return to === (ctx.k < ctx.n ? "dilemma_preparing" : "analysis_generating");
  }
  return true;
}

export function sessionStatus(phase: Phase): "waiting" | "in_progress" | "completed" | "aborted" {
  if (phase === "lobby") return "waiting";
  if (phase === "completed" || phase === "aborted") return phase;
  return "in_progress";
}
