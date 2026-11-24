import { AXES, type EndingFamily, type ValueTags } from "@cs/schemas";

/** Dilemmas per act (design §6.3): 3 -> 1/1/1, 5 -> 1/3/1, 10 -> 2/6/2, 15 -> 3/9/3. */
export function actsFor(n: number): [number, number, number] {
  const edge = Math.max(1, Math.floor(n / 5));
  return [edge, n - edge * 2, edge];
}

export function actOf(k: number, n: number): 1 | 2 | 3 {
  const [a, b] = actsFor(n);
  return k <= a ? 1 : k <= a + b ? 2 : 3;
}

/** The ending family whose value profile best matches the group's decisions. */
export function pickEnding(endings: EndingFamily[], values: ValueTags): EndingFamily {
  const score = (e: EndingFamily) => {
    const norm = Math.sqrt(AXES.reduce((s, a) => s + e.values[a] ** 2, 0)) || 1;
    return AXES.reduce((s, a) => s + e.values[a] * values[a], 0) / norm;
  };
  return endings.reduce((best, e) => (score(e) > score(best) ? e : best));
}

/** Number of scenes in the final story, 8 to 15. */
export const sceneCount = (n: number) => Math.max(8, Math.min(15, n + 5));
