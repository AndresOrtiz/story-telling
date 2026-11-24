import type { Dilemma } from "@cs/schemas";

export type VotingRules = Pick<Dilemma, "format" | "min_select" | "max_select" | "exclusive"> & {
  options: { key: string }[];
};
export type Ballot = { participantId: string; optionKeys: string[]; abstained?: boolean };
export type Candidate = { id: string; optionKeys: string[] };

const sortKeys = (keys: readonly string[]) => [...new Set(keys)].sort();
export const comboId = (keys: readonly string[]) => sortKeys(keys).join("+");
export const castBallots = <T extends Ballot>(ballots: T[]): T[] =>
  ballots.filter((b) => !b.abstained && b.optionKeys.length > 0);

export function selectionError(rules: VotingRules, keys: string[]): string | null {
  if (new Set(keys).size !== keys.length) return "duplicate_option";
  const valid = new Set(rules.options.map((o) => o.key));
  if (keys.some((k) => !valid.has(k))) return "unknown_option";
  if (rules.format === "single") return keys.length === 1 ? null : "select_one";
  if (keys.length < rules.min_select) return "too_few";
  if (keys.length > rules.max_select) return "too_many";
  if (rules.exclusive.some(([a, b]) => keys.includes(a!) && keys.includes(b!))) return "incompatible";
  return null;
}

export type Tally = {
  counts: Record<string, number>;
  percentages: Record<string, number>;
  voters: number;
  abstentions: number;
  top: string[];
};

/** Percentages are relative to voters, so multi-select totals can exceed 100%. */
export function tally(keys: string[], ballots: Ballot[]): Tally {
  const cast = castBallots(ballots);
  const counts: Record<string, number> = Object.fromEntries(keys.map((k) => [k, 0]));
  for (const b of cast) for (const k of new Set(b.optionKeys)) if (k in counts) counts[k]!++;
  const max = Math.max(0, ...Object.values(counts));
  return {
    counts,
    percentages: Object.fromEntries(
      keys.map((k) => [k, cast.length ? Math.round((counts[k]! / cast.length) * 100) : 0]),
    ),
    voters: cast.length,
    abstentions: ballots.length - cast.length,
    top: max === 0 ? [] : keys.filter((k) => counts[k] === max),
  };
}

export function jaccard(a: readonly string[], b: readonly string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 1 : inter / union;
}

/** 0 = everyone agreed, 1 = no two voters agreed. */
export function splitIndex(ballots: Ballot[]): number {
  const cast = castBallots(ballots);
  if (cast.length < 2) return 0;
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < cast.length; i++)
    for (let j = i + 1; j < cast.length; j++) {
      total += 1 - jaccard(cast[i]!.optionKeys, cast[j]!.optionKeys);
      pairs++;
    }
  return Math.round((total / pairs) * 1000) / 1000;
}

function validCombos(rules: VotingRules, keys: string[]): string[][] {
  const out: string[][] = [];
  for (let mask = 1; mask < 1 << keys.length; mask++) {
    const combo = keys.filter((_, i) => mask & (1 << i));
    if (selectionError(rules, combo) === null) out.push(combo);
  }
  return out;
}

export type CandidateResult = { unanimous: Candidate | null; candidates: Candidate[] };

/** Final-vote candidates after the first vote (design §5 Stage 6). */
export function finalCandidates(rules: VotingRules, ballots: Ballot[], writeInKeys: string[] = []): CandidateResult {
  const base = rules.options.map((o) => o.key).filter((k) => !writeInKeys.includes(k));
  const cast = castBallots(ballots);
  const writeIns = writeInKeys.map((k) => ({ id: k, optionKeys: [k] }));
  let candidates: Candidate[];

  if (rules.format === "single") {
    const t = tally(base, cast);
    const ranked = [...base].sort((a, b) => t.counts[b]! - t.counts[a]!);
    if (cast.length === 0) {
      candidates = ranked.slice(0, 3).map((k) => ({ id: k, optionKeys: [k] }));
    } else {
      const second = t.counts[ranked[1]!] ?? 0;
      candidates = ranked
        .filter((k, i) => t.counts[k]! > 0 && (i < 2 || t.counts[k]! >= second - 1))
        .slice(0, 3)
        .map((k) => ({ id: k, optionKeys: [k] }));
    }
  } else {
    candidates = validCombos({ ...rules, options: base.map((key) => ({ key })) }, base)
      .map((combo) => ({ combo, score: cast.reduce((s, b) => s + jaccard(b.optionKeys, combo), 0) }))
      .sort(
        (a, b) =>
          b.score - a.score || a.combo.length - b.combo.length || comboId(a.combo).localeCompare(comboId(b.combo)),
      )
      .slice(0, 3)
      .map(({ combo }) => ({ id: comboId(combo), optionKeys: combo }));
  }

  const ids = new Set(cast.map((b) => comboId(b.optionKeys)));
  const unanimous =
    cast.length > 0 && ids.size === 1 && writeIns.length === 0
      ? { id: comboId(cast[0]!.optionKeys), optionKeys: sortKeys(cast[0]!.optionKeys) }
      : null;
  return { unanimous, candidates: [...candidates, ...writeIns] };
}

export type FinalResolution =
  | { kind: "decided"; winner: Candidate; resolvedBy: "final_vote" | "revote" | "fate" }
  | { kind: "revote"; candidates: Candidate[] };

/** A tie gets one revote between the tied candidates; a second tie is decided by fate. */
export function resolveFinal(
  candidates: Candidate[],
  ballots: Ballot[],
  isRevote: boolean,
  random: () => number,
): FinalResolution {
  const t = tally(
    candidates.map((c) => c.id),
    ballots,
  );
  const tied = t.top.length ? candidates.filter((c) => t.top.includes(c.id)) : candidates;
  if (tied.length === 1) return { kind: "decided", winner: tied[0]!, resolvedBy: isRevote ? "revote" : "final_vote" };
  if (!isRevote) return { kind: "revote", candidates: tied };
  const pick = Math.min(tied.length - 1, Math.floor(random() * tied.length));
  return { kind: "decided", winner: tied[pick]!, resolvedBy: "fate" };
}

export type Conviction = "persuaded" | "held_firm" | "none";
/** Did a player change position between the first and the final vote? */
export function conviction(initial: string[] | undefined, finalKeys: string[] | undefined): Conviction {
  if (!initial?.length || !finalKeys?.length) return "none";
  return jaccard(initial, finalKeys) > 0 ? "held_firm" : "persuaded";
}
