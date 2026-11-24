/** Bump when a prompt changes. Stored with cached title themes. */
export const PROMPT_VERSION = "3";

export type Task =
  | "title.extract"
  | "theme.synthesize"
  | "universe.create"
  | "dilemma.generate"
  | "dilemma.validate"
  | "consequence.generate"
  | "writein.check"
  | "moderate"
  | "profile.write"
  | "group.write"
  | "story.write";

type Effort = "low" | "medium" | "high";
type Route = { model: string; effort: Effort; maxTokens: number; timeoutMs: number };

const OPUS = "claude-opus-5-5";
const SONNET = "claude-sonnet-5-5";
const HAIKU = "claude-haiku-5-5";

/** Design §6.4: Opus for the once-per-session creative work, Sonnet for turns, Haiku for checks. */
export const ROUTES: Record<Task, Route> = {
  "title.extract": { model: HAIKU, effort: "low", maxTokens: 4_000, timeoutMs: 45_000 },
  "theme.synthesize": { model: HAIKU, effort: "low", maxTokens: 4_000, timeoutMs: 45_000 },
  "universe.create": { model: OPUS, effort: "medium", maxTokens: 20_000, timeoutMs: 240_000 },
  "dilemma.generate": { model: SONNET, effort: "low", maxTokens: 12_000, timeoutMs: 90_000 },
  "dilemma.validate": { model: HAIKU, effort: "low", maxTokens: 2_000, timeoutMs: 30_000 },
  "consequence.generate": { model: SONNET, effort: "low", maxTokens: 10_000, timeoutMs: 90_000 },
  "writein.check": { model: HAIKU, effort: "low", maxTokens: 3_000, timeoutMs: 30_000 },
  moderate: { model: HAIKU, effort: "low", maxTokens: 1_500, timeoutMs: 15_000 },
  "profile.write": { model: SONNET, effort: "low", maxTokens: 6_000, timeoutMs: 60_000 },
  "group.write": { model: SONNET, effort: "low", maxTokens: 6_000, timeoutMs: 60_000 },
  "story.write": { model: OPUS, effort: "medium", maxTokens: 24_000, timeoutMs: 240_000 },
};

/** USD per million tokens: input, output, cache read. Used for the per-session budget. */
const PRICES: Record<string, [number, number, number]> = {
  [OPUS]: [4, 20, 0.2],
  [SONNET]: [2, 10, 0.1],
  [HAIKU]: [0.1, 0.5, 0.01],
};

export function costUsd(model: string, input: number, output: number, cached: number): number {
  const [i, o, c] = PRICES[model] ?? [4, 20, 0.4];
  return (Math.max(0, input - cached) * i + output * o + cached * c) / 1e6;
}
