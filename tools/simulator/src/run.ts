import { randomUUID } from "node:crypto";
import { AXES, type ValueTags } from "@cs/schemas";
import { getDb } from "@cs/db";
import * as game from "@cs/workflows";
import type { Snapshot } from "@cs/workflows";

export type Bot = { id: string; name: string; values: Partial<ValueTags>; stubborn: number };

const randomValues = (random: () => number): Partial<ValueTags> =>
  Object.fromEntries(AXES.map((a) => [a, Math.round((random() * 2 - 1) * 20) / 10])) as Partial<ValueTags>;

export type Result = {
  code: string;
  completed: boolean;
  dilemmas: number;
  expected: number;
  rejectedOps: number;
  totalOps: number;
  fallbacks: number;
  builtIn: boolean;
  scenes: number;
  ungrounded: number;
  resolvedBy: Record<string, number>;
  costUsd: number;
  seconds: number;
};

const TITLES = ["The Hobbit", "The Hunger Games", "Interstellar", "The Martian", "Dune", "Up", "Arrival"];

/** Plays a whole session with bots that vote according to their values. */
export async function playSession(opts: { n: number; players: number; random?: () => number; config?: object; writeIns?: boolean }): Promise<Result> {
  const random = opts.random ?? Math.random;
  const started = Date.now();
  const host = randomUUID();
  const { code } = await game.createSession(host, {
    dilemmas: opts.n,
    votingSeconds: 0,
    discussionSeconds: 600,
    predictions: true,
    writeInEndorsements: 1,
    ...opts.config,
  });
  const bots: Bot[] = Array.from({ length: opts.players }, (_, i) => ({
    id: randomUUID(),
    name: `Bot ${i + 1}`,
    values: randomValues(random),
    stubborn: random(),
  }));
  for (const b of bots) await game.join(code, b.id, { nickname: b.name });

  const view = async (userId: string = host) => {
    const s = await game.snapshot(code, userId);
    if ("limited" in s) throw new Error("Bot was locked out");
    return s;
  };
  const act = async (action: game.HostAction) => {
    const s = await view();
    await game.runHostAction(code, host, action, { phase: s.phase, k: s.k });
    await game.drainJobs();
  };
  const choose = async (b: Bot, s: Snapshot, keys: string[]) => {
    const db = await getDb();
    const rows = await db.query<{ key: string; value_tags: ValueTags }>(
      "select o.key, o.value_tags from dilemma_options o join dilemmas d on d.id = o.dilemma_id where d.session_id = $1 and d.k = $2",
      [s.sessionId, s.k],
    );
    const score = (key: string) => {
      const tags = rows.find((x) => x.key === key)?.value_tags;
      return tags ? AXES.reduce((sum, a) => sum + tags[a] * (b.values[a] ?? 0), 0) + random() : 0;
    };
    return [...keys].sort((x, y) => score(y) - score(x));
  };

  await act("start");
  for (const b of bots) {
    const title = TITLES[Math.floor(random() * TITLES.length)]!;
    await game.saveSelections(code, b.id, [{ title, kind: "movie", favorite: true }]);
  }
  await game.drainJobs();
  await act("continue_selection");
  await act("begin_story");

  for (let k = 1; k <= opts.n; k++) {
    await act("open_voting");
    for (const b of bots) {
      const s = await view(b.id);
      const d = s.dilemma!;
      const ranked = await choose(b, s, d.options.filter((o) => !o.writeIn).map((o) => o.key));
      const picked: string[] = [];
      const want = d.format === "single" ? 1 : d.min + Math.floor(random() * (d.max - d.min + 1));
      for (const key of ranked) {
        if (picked.length >= want) break;
        if (!d.exclusive.some((pair) => pair.includes(key) && pair.some((x) => picked.includes(x)))) picked.push(key);
      }
      await game.castVote(code, b.id, { optionKeys: picked, confidence: 1 + Math.floor(random() * 3), prediction: ranked[0] });
    }
    if (opts.writeIns && k === 1) {
      await game.proposeWriteIn(code, bots[0]!.id, "Ask everyone to vote with their feet");
      await game.drainJobs();
      const w = (await view(bots[1]!.id)).writeIns!.find((x) => x.status === "open");
      if (w) await game.endorseWriteIn(code, bots[1]!.id, w.id);
    }
    await act("close_voting");
    if ((await view()).results!.unanimous) await act("confirm_unanimous");
    else {
      await act("start_discussion");
      await act("open_final_vote");
      for (let guard = 0; guard < 3 && (await view()).phase === "final_vote"; guard++) {
        for (const b of bots) {
          const s = await view(b.id);
          const ranked = [...s.round!.candidates].sort(() => random() - 0.5);
          await game.castVote(code, b.id, { optionKeys: [ranked[0]!.id] });
        }
        await act("close_final_vote");
      }
    }
    await act("next");
  }
  await act("show_story");
  await act("finish");

  const s = await view();
  const db = await getDb();
  const [stats] = await db.query<{ dilemmas: number; rejected: number; ops: number; fallbacks: number; usd: number }>(
    `select (select count(*) from dilemmas where session_id = $1)::int as dilemmas,
            (select coalesce(sum(jsonb_array_length(c.rejected)), 0) from consequences c join dilemmas d on d.id = c.dilemma_id where d.session_id = $1)::int as rejected,
            (select coalesce(sum(jsonb_array_length(c.diff)), 0) from consequences c join dilemmas d on d.id = c.dilemma_id where d.session_id = $1)::int as ops,
            (select count(*) from ai_calls where session_id = $1 and status = 'fallback')::int as fallbacks,
            (select coalesce(sum(cost_usd), 0) from ai_calls where session_id = $1)::float8 as usd`,
    [s.sessionId],
  );
  const decisions = await db.query<{ resolved_by: string; n: number }>(
    "select g.resolved_by, count(*)::int as n from group_decisions g join dilemmas d on d.id = g.dilemma_id where d.session_id = $1 group by 1",
    [s.sessionId],
  );
  const profiles = await db.query<{ cited: number[] }>(
    "select narrative -> 'cited_dilemmas' as cited from player_profiles where session_id = $1",
    [s.sessionId],
  );
  return {
    code,
    completed: s.phase === "completed",
    dilemmas: stats!.dilemmas,
    expected: opts.n,
    rejectedOps: stats!.rejected,
    totalOps: stats!.ops,
    fallbacks: stats!.fallbacks,
    builtIn: s.builtIn,
    scenes: s.story?.scenes.length ?? 0,
    // Every bot votes on everything, so any dilemma that exists is grounded.
    ungrounded: profiles.filter((p) => p.cited.length === 0 || p.cited.some((k) => k < 1 || k > opts.n)).length,
    resolvedBy: Object.fromEntries(decisions.map((d) => [d.resolved_by, d.n])),
    costUsd: stats!.usd,
    seconds: (Date.now() - started) / 1000,
  };
}
