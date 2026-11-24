import { AXES, type Axis, type ValueTags } from "@cs/schemas";
import { conviction, jaccard, type Ballot } from "./votes.ts";

export const zeroTags = (): ValueTags => Object.fromEntries(AXES.map((a) => [a, 0])) as ValueTags;

export function meanTags(list: { tags: ValueTags; weight?: number }[]): ValueTags {
  const out = zeroTags();
  const total = list.reduce((s, x) => s + (x.weight ?? 1), 0);
  if (!total) return out;
  for (const a of AXES) out[a] = list.reduce((s, x) => s + x.tags[a] * (x.weight ?? 1), 0) / total;
  return out;
}

export const ARCHETYPES = [
  "strategist",
  "protector",
  "idealist",
  "rebel",
  "pragmatist",
  "diplomat",
  "gambler",
  "guardian",
  "lone_wolf",
  "wildcard",
] as const;
export type Archetype = (typeof ARCHETYPES)[number];

type Feature = Axis | "challenge" | "conformity" | "driftSize";
/** Centroids in normalised space: axes -1..1; challenge, conformity and driftSize 0..1. */
const CENTROIDS: Record<Archetype, Partial<Record<Feature, number>>> = {
  strategist: { time: 0.7, pragmatism: 0.5 },
  protector: { collective: 0.6, sacrifice: 0.6, risk: -0.3 },
  idealist: { pragmatism: -0.7, driftSize: 0.05 },
  rebel: { authority: -0.7, challenge: 0.6 },
  pragmatist: { pragmatism: 0.7, driftSize: 0.3 },
  diplomat: { conflict: 0.7, trust: 0.5 },
  gambler: { risk: 0.8, time: -0.4 },
  guardian: { authority: 0.7, risk: -0.4 },
  lone_wolf: { collective: -0.6, conformity: 0.2 },
  wildcard: { driftSize: 0.8 },
};

export type DilemmaRecord = {
  k: number;
  options: { key: string; tags: ValueTags }[];
  initial: (Ballot & { confidence?: number | null; prediction?: string | null })[];
  /** Candidate ids already expanded to option keys. */
  final: Ballot[];
  decision: string[];
  /** Most-voted options of the first vote. */
  leaders: string[];
  splitIndex: number;
};

export type PlayerScores = {
  tags: ValueTags;
  drift: ValueTags;
  driftSize: number;
  challenge: number;
  conformity: number;
  minorityLoyalty: number;
  readTheRoom: number | null;
  persuaded: number;
  heldFirm: number;
  votes: number;
  archetype: Archetype;
  secondary: Archetype;
  /** Axis with the largest change between the halves of the session. */
  turningAxis: Axis | null;
};

const ratio = (a: number, b: number) => (b === 0 ? 0 : a / b);
const round = (n: number) => Math.round(n * 1000) / 1000 + 0;

export function rankArchetypes(features: Record<Feature, number>): Archetype[] {
  const distance = (a: Archetype) => {
    const entries = Object.entries(CENTROIDS[a]) as [Feature, number][];
    return entries.reduce((s, [f, v]) => s + (features[f] - v) ** 2, 0) / entries.length;
  };
  return [...ARCHETYPES].sort((x, y) => distance(x) - distance(y));
}

export function scorePlayer(
  participantId: string,
  records: DilemmaRecord[],
  extra: { writeIns: number; endorsements: number } = { writeIns: 0, endorsements: 0 },
): PlayerScores {
  const perDilemma: { tags: ValueTags; weight: number }[] = [];
  let conform = 0;
  let minority = 0;
  let loyal = 0;
  let predictions = 0;
  let correct = 0;
  let persuaded = 0;
  let heldFirm = 0;

  for (const r of records) {
    const mine = r.initial.find((b) => b.participantId === participantId && !b.abstained && b.optionKeys.length);
    if (!mine) continue;
    const chosen = r.options.filter((o) => mine.optionKeys.includes(o.key));
    if (chosen.length === 0) continue;
    perDilemma.push({ tags: meanTags(chosen), weight: 0.5 + (mine.confidence ?? 1) * 0.5 });
    if (jaccard(mine.optionKeys, r.decision) > 0) conform++;
    const fin = r.final.find((b) => b.participantId === participantId && !b.abstained);
    const c = conviction(mine.optionKeys, fin?.optionKeys);
    if (c === "persuaded") persuaded++;
    if (c === "held_firm") heldFirm++;
    if (fin && !mine.optionKeys.some((k) => r.leaders.includes(k))) {
      minority++;
      if (c === "held_firm" && jaccard(fin.optionKeys, r.decision) === 0) loyal++;
    }
    if (mine.prediction) {
      predictions++;
      if (r.decision.includes(mine.prediction)) correct++;
    }
  }

  const tags = meanTags(perDilemma);
  const half = Math.floor(perDilemma.length / 2);
  const first = meanTags(perDilemma.slice(0, half));
  const second = meanTags(perDilemma.slice(perDilemma.length - half));
  const drift = zeroTags();
  let driftSize = 0;
  let turningAxis: Axis | null = null;
  if (half > 0) {
    for (const a of AXES) {
      drift[a] = round(second[a] - first[a]);
      driftSize += Math.abs(drift[a]) / AXES.length;
      if (Math.abs(drift[a]) >= 1 && (!turningAxis || Math.abs(drift[a]) > Math.abs(drift[turningAxis]))) {
        turningAxis = a;
      }
    }
  }
  const challenge = Math.min(1, ratio(extra.writeIns * 2 + extra.endorsements, Math.max(2, perDilemma.length)));
  const conformity = ratio(conform, perDilemma.length);
  const [archetype, secondary] = rankArchetypes({
    ...(Object.fromEntries(AXES.map((a) => [a, tags[a] / 2])) as Record<Axis, number>),
    challenge,
    conformity,
    driftSize: Math.min(1, driftSize / 1.5),
  });
  return {
    tags: Object.fromEntries(AXES.map((a) => [a, round(tags[a])])) as ValueTags,
    drift,
    driftSize: round(driftSize),
    challenge: round(challenge),
    conformity: round(conformity),
    minorityLoyalty: round(ratio(loyal, minority)),
    readTheRoom: predictions ? round(correct / predictions) : null,
    persuaded,
    heldFirm,
    votes: perDilemma.length,
    archetype: archetype!,
    secondary: secondary!,
    turningAxis,
  };
}

export type GroupMetrics = {
  values: ValueTags;
  splitByDilemma: { k: number; split: number }[];
  mostControversial: number | null;
  mostUnanimous: number | null;
  trend: "united" | "divided" | "steady";
  alliances: { a: string; b: string; agreement: number }[];
  independentVoices: { participantId: string; minorityVotes: number }[];
};

export function scoreGroup(participantIds: string[], records: DilemmaRecord[]): GroupMetrics {
  const splitByDilemma = records.map((r) => ({ k: r.k, split: r.splitIndex }));
  const sorted = [...splitByDilemma].sort((a, b) => b.split - a.split);
  const half = Math.floor(records.length / 2);
  const avg = (xs: number[]) => ratio(xs.reduce((s, x) => s + x, 0), xs.length);
  const splits = splitByDilemma.map((s) => s.split);
  const delta = half ? avg(splits.slice(-half)) - avg(splits.slice(0, half)) : 0;
  const ballot = (r: DilemmaRecord, id: string) =>
    r.initial.find((b) => b.participantId === id && !b.abstained && b.optionKeys.length > 0);

  const alliances: GroupMetrics["alliances"] = [];
  for (let i = 0; i < participantIds.length; i++)
    for (let j = i + 1; j < participantIds.length; j++) {
      const [a, b] = [participantIds[i]!, participantIds[j]!];
      const sims = records.flatMap((r) => {
        const x = ballot(r, a);
        const y = ballot(r, b);
        return x && y ? [jaccard(x.optionKeys, y.optionKeys)] : [];
      });
      if (sims.length) alliances.push({ a, b, agreement: round(avg(sims)) });
    }

  return {
    values: groupValues(records),
    splitByDilemma,
    mostControversial: sorted[0]?.k ?? null,
    mostUnanimous: sorted.at(-1)?.k ?? null,
    trend: delta < -0.1 ? "united" : delta > 0.1 ? "divided" : "steady",
    alliances: alliances.sort((a, b) => b.agreement - a.agreement).slice(0, 5),
    independentVoices: participantIds
      .map((participantId) => ({
        participantId,
        minorityVotes: records.filter((r) => {
          const b = ballot(r, participantId);
          return b && !b.optionKeys.some((k) => r.leaders.includes(k));
        }).length,
      }))
      .filter((v) => v.minorityVotes > 0)
      .sort((a, b) => b.minorityVotes - a.minorityVotes)
      .slice(0, 3),
  };
}

/** Mean value vector of the official group decisions. */
export function groupValues(records: Pick<DilemmaRecord, "options" | "decision">[]): ValueTags {
  return meanTags(
    records.flatMap((r) => {
      const chosen = r.options.filter((o) => r.decision.includes(o.key));
      return chosen.length ? [{ tags: meanTags(chosen) }] : [];
    }),
  );
}
