import { jaccard, type Candidate, type DilemmaRecord } from "@cs/engine";
import type { Sql } from "@cs/db";
import type { TurnMemory } from "@cs/ai";
import { asBallots, initialRound, lastFinalRound } from "./flow.ts";
import * as r from "./rows.ts";

export type Turn = {
  dilemma: r.DilemmaRow;
  options: r.OptionRow[];
  decision: r.DecisionRow;
  consequence: r.ConsequenceRow | null;
  record: DilemmaRecord;
  labels: string[];
  /** Options of the first vote that lost, most-voted first. */
  minority: { key: string; label: string; votes: number }[];
};

/** Everything that happened, for the decided dilemmas only. */
export async function turnsOf(q: Sql, sessionId: string): Promise<Turn[]> {
  const dilemmas = await q.query<r.DilemmaRow>("select * from dilemmas where session_id = $1 order by k", [sessionId]);
  const turns: Turn[] = [];
  for (const dilemma of dilemmas) {
    const decision = await r.decisionOf(q, dilemma.id);
    if (!decision) continue;
    const options = await r.optionsOf(q, dilemma.id);
    const rounds = await r.roundsOf(q, dilemma.id);
    const initial = initialRound(rounds);
    const last = lastFinalRound(rounds);
    const initialBallots = initial ? asBallots(await r.votesOf(q, initial.id)) : [];
    const finalBallots = last ? asBallots(await r.votesOf(q, last.id)) : [];
    const expand = new Map(((last?.candidates ?? []) as Candidate[]).map((c) => [c.id, c.optionKeys]));
    const labelOf = (key: string) => options.find((o) => o.key === key)?.label ?? key;
    const votesFor = (key: string) => initialBallots.filter((b) => b.optionKeys.includes(key)).length;
    turns.push({
      dilemma,
      options,
      decision,
      consequence: await r.consequenceOf(q, dilemma.id),
      labels: decision.option_keys.map(labelOf),
      minority: options
        .filter((o) => !decision.option_keys.includes(o.key) && votesFor(o.key) > 0)
        .map((o) => ({ key: o.key, label: o.label, votes: votesFor(o.key) }))
        .sort((a, b) => b.votes - a.votes),
      record: {
        k: dilemma.k,
        options: options.map((o) => ({ key: o.key, tags: o.value_tags })),
        initial: initialBallots,
        final: finalBallots.map((b) => ({ ...b, optionKeys: b.optionKeys.flatMap((id) => expand.get(id) ?? []) })),
        decision: decision.option_keys,
        leaders: decision.leaders,
        splitIndex: decision.split_index,
      },
    });
  }
  return turns;
}

/** Compact memory for prompts: the last two turns in full, the rest as summaries. */
export async function memoryOf(q: Sql, sessionId: string): Promise<TurnMemory[]> {
  const turns = await turnsOf(q, sessionId);
  const summaries = new Map(
    (await q.query<{ k: number; summary: string }>("select k, summary from turn_summaries where session_id = $1", [sessionId])).map(
      (x) => [x.k, x.summary],
    ),
  );
  return turns.map((t, i) => ({
    k: t.dilemma.k,
    title: t.dilemma.payload.title,
    decision: t.labels,
    minority: t.minority.map((m) => m.label),
    summary: summaries.get(t.dilemma.k) ?? "",
    ...(i >= turns.length - 2 && t.consequence ? { full: t.consequence.narrative } : {}),
  }));
}

export function decisionsOf(turns: Turn[], participantId: string) {
  return turns.flatMap((t) => {
    const b = t.record.initial.find((x) => x.participantId === participantId && !x.abstained && x.optionKeys.length);
    if (!b) return [];
    return [
      {
        k: t.dilemma.k,
        title: t.dilemma.payload.title,
        labels: b.optionKeys.map((key) => t.options.find((o) => o.key === key)?.label ?? key),
        withGroup: jaccard(b.optionKeys, t.decision.option_keys) > 0,
      },
    ];
  });
}
