import type { Rating, Tone } from "@cs/schemas";

const ORDER: Rating[] = ["family", "teen", "mature"];
export type TitleSignal = { title: string; rating: Rating; tone: Tone; favorite: boolean };

/** Most conservative rating among the selections; teen when nothing was selected. */
export function deriveRating(signals: TitleSignal[]): Rating {
  if (signals.length === 0) return "teen";
  return ORDER[Math.min(...signals.map((s) => ORDER.indexOf(s.rating)))]!;
}

/** Adding 0 turns -0 into 0, which keeps JSON and equality checks clean. */
const step = (n: number) => Math.max(-2, Math.min(2, Math.round(n))) + 0;

export function capTone(tone: Tone, rating: Rating): Tone {
  return rating === "family" ? { ...tone, hopefulDark: Math.min(tone.hopefulDark, 1) } : tone;
}

/** Favourite-weighted average (a favourite counts double), capped by the rating. */
export function deriveTone(signals: TitleSignal[], rating: Rating): Tone {
  let w = 0;
  let dark = 0;
  let fantastical = 0;
  for (const s of signals) {
    const weight = s.favorite ? 2 : 1;
    w += weight;
    dark += s.tone.hopefulDark * weight;
    fantastical += s.tone.groundedFantastical * weight;
  }
  if (w === 0) return { hopefulDark: 0, groundedFantastical: 0 };
  return capTone({ hopefulDark: step(dark / w), groundedFantastical: step(fantastical / w) }, rating);
}

/** The host may only lower the rating, one level. */
export function lowerRating(rating: Rating): Rating {
  return ORDER[Math.max(0, ORDER.indexOf(rating) - 1)]!;
}

export const isAtMost = (a: Rating, limit: Rating) => ORDER.indexOf(a) <= ORDER.indexOf(limit);
