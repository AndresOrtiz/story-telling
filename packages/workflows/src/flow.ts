import { randomInt } from "node:crypto";
import {
  canTransition,
  finalCandidates,
  resolveFinal,
  splitIndex,
  SYSTEM_PHASES,
  tally,
  TIMED_PHASES,
  type Ballot,
  type Candidate,
  type VotingRules,
} from "@cs/engine";
import type { Phase } from "@cs/schemas";
import { getDb, json, type Sql } from "@cs/db";
import { dispatch, type Job } from "./dispatch.ts";
import * as r from "./rows.ts";
import { GameError } from "./rows.ts";

export const asBallots = (votes: r.VoteRow[]) =>
  votes.map((v) => ({
    participantId: v.participant_id,
    optionKeys: v.option_keys,
    abstained: v.abstained,
    confidence: v.confidence,
    prediction: v.prediction,
  }));

/** Voting rules of a dilemma. Approved write-ins count as options only in the final vote. */
export function rulesOf(d: r.DilemmaRow, options: r.OptionRow[]): VotingRules {
  const { format, min_select, max_select, exclusive } = d.payload;
  return { format, min_select, max_select, exclusive, options: options.map((o) => ({ key: o.key })) };
}

type Pending = Job[];
/** The only place that changes a phase. Must run inside a transaction that locked the session row. */
async function go(
  tx: Sql,
  s: r.SessionRow,
  to: Phase,
  actor: string,
  opts: { seconds?: number; k?: number } = {},
): Promise<r.SessionRow> {
  if (!canTransition(s.phase, to, { pausedFrom: s.paused_from, k: s.current_k, n: s.dilemma_count })) {
    throw new GameError("invalid_transition", 409);
  }
  const endsAt = opts.seconds ? new Date(Date.now() + opts.seconds * 1000) : null;
  const rows = await tx.query<r.SessionRow>("select * from transition_phase($1, $2, $3, $4, $5, $6)", [
    s.id,
    s.state_version,
    to,
    actor,
    endsAt,
    opts.k ?? null,
  ]);
  return rows[0]!;
}

async function locked<T>(sessionId: string, fn: (tx: Sql, s: r.SessionRow, jobs: Pending) => Promise<T>): Promise<T> {
  const db = await getDb();
  const jobs: Pending = [];
  const out = await db.transaction(async (tx) => {
    const s = await r.sessionById(tx, sessionId, true);
    if (!s) throw new GameError("not_found", 404);
    return fn(tx, s, jobs);
  });
  for (const job of jobs) await dispatch(job);
  return out;
}

/* ---------- Rounds ---------- */
async function openRound(
  tx: Sql,
  d: r.DilemmaRow,
  kind: r.RoundRow["kind"],
  candidates: string[] | Candidate[],
  limits: { min: number; max: number; exclusive: string[][] },
  seconds: number,
) {
  await tx.query(
    `insert into vote_rounds (dilemma_id, round_no, kind, candidates, min_select, max_select, exclusive, ends_at)
     values ($1, (select coalesce(max(round_no), 0) + 1 from vote_rounds where dilemma_id = $1), $2, $3, $4, $5, $6, $7)`,
    [
      d.id,
      kind,
      json(candidates),
      limits.min,
      limits.max,
      json(limits.exclusive),
      seconds ? new Date(Date.now() + seconds * 1000) : null,
    ],
  );
}

async function currentDilemma(q: Sql, s: r.SessionRow): Promise<r.DilemmaRow> {
  const d = await r.dilemmaAt(q, s.id, s.current_k);
  if (!d) throw new GameError("no_dilemma", 409);
  return d;
}

const openRoundOf = (rounds: r.RoundRow[]) => rounds.find((x) => x.status === "open") ?? null;
export const initialRound = (rounds: r.RoundRow[]) => rounds.findLast((x) => x.kind === "initial" && x.status !== "superseded") ?? null;
export const lastFinalRound = (rounds: r.RoundRow[]) => {
  const initial = initialRound(rounds);
  return rounds.findLast((x) => x.kind !== "initial" && x.status !== "superseded" && x.round_no > (initial?.round_no ?? 0)) ?? null;
};

export async function candidatesFor(q: Sql, d: r.DilemmaRow) {
  const [options, rounds] = [await r.optionsOf(q, d.id), await r.roundsOf(q, d.id)];
  const initial = initialRound(rounds);
  const ballots = initial ? asBallots(await r.votesOf(q, initial.id)) : [];
  const writeIns = options.filter((o) => o.origin === "write_in").map((o) => o.key);
  const base = options.filter((o) => o.origin === "ai").map((o) => o.key);
  return { ...finalCandidates(rulesOf(d, options), ballots, writeIns), ballots, base, options };
}

async function startVoting(tx: Sql, s: r.SessionRow, actor: string) {
  const d = await currentDilemma(tx, s);
  const keys = d.payload.options.map((o) => o.key);
  await tx.query("update vote_rounds set status = 'superseded' where dilemma_id = $1 and status <> 'superseded'", [d.id]);
  await tx.query("update dilemmas set status = 'presented' where id = $1", [d.id]);
  await openRound(
    tx,
    d,
    "initial",
    keys,
    { min: d.payload.min_select, max: d.payload.max_select, exclusive: d.payload.exclusive },
    s.config.votingSeconds,
  );
  await go(tx, s, "voting", actor, { seconds: s.config.votingSeconds });
}

async function closeVoting(tx: Sql, s: r.SessionRow, actor: string) {
  const d = await currentDilemma(tx, s);
  const round = openRoundOf(await r.roundsOf(tx, d.id));
  if (round) await tx.query("select close_round($1)", [round.id]);
  await go(tx, s, "results", actor);
}

async function startFinalVote(tx: Sql, s: r.SessionRow, actor: string) {
  const d = await currentDilemma(tx, s);
  const { candidates } = await candidatesFor(tx, d);
  await openRound(tx, d, "final", candidates, { min: 1, max: 1, exclusive: [] }, s.config.votingSeconds);
  await go(tx, s, "final_vote", actor, { seconds: s.config.votingSeconds });
}

async function confirm(
  tx: Sql,
  s: r.SessionRow,
  actor: string,
  jobs: Pending,
  winner: Candidate,
  resolvedBy: r.DecisionRow["resolved_by"],
  finalTally: unknown,
) {
  const d = await currentDilemma(tx, s);
  const { ballots, base } = await candidatesFor(tx, d);
  const first = tally(base, ballots);
  await tx.query(
    `insert into group_decisions (dilemma_id, option_keys, resolved_by, tally, leaders, split_index)
     values ($1, $2, $3, $4, $5, $6) on conflict (dilemma_id) do nothing`,
    [d.id, winner.optionKeys, resolvedBy, json({ first, final: finalTally }), first.top, splitIndex(ballots)],
  );
  await tx.query("update dilemmas set status = 'closed' where id = $1", [d.id]);
  await go(tx, s, "decision_confirmed", actor);
  jobs.push({ kind: "consequence", sessionId: s.id, k: s.current_k });
}

async function closeFinalVote(tx: Sql, s: r.SessionRow, actor: string, jobs: Pending) {
  const d = await currentDilemma(tx, s);
  const round = openRoundOf(await r.roundsOf(tx, d.id));
  if (!round) throw new GameError("no_open_round", 409);
  await tx.query("select close_round($1)", [round.id]);
  const candidates = round.candidates as Candidate[];
  const ballots: Ballot[] = asBallots(await r.votesOf(tx, round.id));
  const result = resolveFinal(candidates, ballots, round.kind === "revote", () => randomInt(1_000_000) / 1_000_000);
  if (result.kind === "revote") {
    await openRound(tx, d, "revote", result.candidates, { min: 1, max: 1, exclusive: [] }, s.config.votingSeconds);
    await go(tx, s, "final_vote", actor, { seconds: s.config.votingSeconds });
    return;
  }
  await confirm(
    tx,
    s,
    actor,
    jobs,
    result.winner,
    result.resolvedBy,
    tally(
      candidates.map((c) => c.id),
      ballots,
    ),
  );
}

/* ---------- Host actions ---------- */
export type HostAction =
  | "start"
  | "continue_selection"
  | "regenerate_universe"
  | "lower_rating"
  | "begin_story"
  | "open_voting"
  | "close_voting"
  | "revote"
  | "start_discussion"
  | "extend_discussion"
  | "confirm_unanimous"
  | "open_final_vote"
  | "close_final_vote"
  | "next"
  | "show_story"
  | "finish"
  | "pause"
  | "resume"
  | "abort"
  | "skip_timer";

/** Runs a host action. `expected` is what the host was looking at, so double clicks are harmless. */
export async function hostAction(
  sessionId: string,
  action: HostAction,
  actor: string,
  expected?: { phase: string; k: number },
): Promise<void> {
  await locked(sessionId, async (tx, s, jobs) => {
    if (expected && (expected.phase !== s.phase || expected.k !== s.current_k)) throw new GameError("conflict", 409);
    const need = (...phases: Phase[]) => {
      if (!phases.includes(s.phase)) throw new GameError("invalid_transition", 409);
    };
    switch (action) {
      case "start": {
        if ((await r.activePlayers(tx, s.id)).length < 2) throw new GameError("need_players");
        await go(tx, s, "selection", actor);
        return;
      }
      case "continue_selection":
        need("selection");
        await go(tx, s, "universe_generating", actor);
        jobs.push({ kind: "universe", sessionId: s.id, k: 0 });
        return;
      case "regenerate_universe":
      case "lower_rating": {
        need("universe_reveal");
        if (action === "regenerate_universe") {
          if (s.universe_regenerated) throw new GameError("already_regenerated");
          await tx.query("update sessions set universe_regenerated = true where id = $1", [s.id]);
        } else {
          if (s.rating_lowered || s.content_rating === "family") throw new GameError("already_lowered");
          await tx.query("update sessions set rating_lowered = true where id = $1", [s.id]);
        }
        await tx.query("delete from dilemmas where session_id = $1", [s.id]);
        await go(tx, s, "universe_generating", actor);
        const attempt = await nextAttempt(tx, s.id, "universe", 0);
        jobs.push({ kind: "universe", sessionId: s.id, k: 0, attempt });
        return;
      }
      case "begin_story":
        need("universe_reveal");
        await go(tx, s, "dilemma_preparing", actor, { k: 1 });
        jobs.push({ kind: "dilemma", sessionId: s.id, k: 1 });
        return;
      case "open_voting":
        need("dilemma_presenting");
        return startVoting(tx, s, actor);
      case "close_voting":
        need("voting");
        return closeVoting(tx, s, actor);
      case "revote":
        need("results");
        return startVoting(tx, s, actor);
      case "start_discussion":
        need("results");
        await go(tx, s, "discussion", actor, { seconds: s.config.discussionSeconds });
        return;
      case "extend_discussion":
        need("discussion");
        await tx.query(
          "update sessions set ends_at = greatest(ends_at, now()) + interval '60 seconds', state_version = state_version + 1 where id = $1",
          [s.id],
        );
        return;
      case "confirm_unanimous": {
        need("results");
        const { unanimous } = await candidatesFor(tx, await currentDilemma(tx, s));
        if (!unanimous) throw new GameError("not_unanimous", 409);
        return confirm(tx, s, actor, jobs, unanimous, "unanimous", null);
      }
      case "open_final_vote":
        need("discussion");
        return startFinalVote(tx, s, actor);
      case "close_final_vote":
        need("final_vote");
        return closeFinalVote(tx, s, actor, jobs);
      case "skip_timer":
        need("voting", "discussion", "final_vote");
        if (s.phase === "voting") return closeVoting(tx, s, actor);
        if (s.phase === "discussion") return startFinalVote(tx, s, actor);
        return closeFinalVote(tx, s, actor, jobs);
      case "next": {
        need("consequence");
        if (s.current_k < s.dilemma_count) {
          await go(tx, s, "dilemma_preparing", actor, { k: s.current_k + 1 });
          jobs.push({ kind: "dilemma", sessionId: s.id, k: s.current_k + 1 });
        } else {
          await go(tx, s, "analysis_generating", actor);
          jobs.push({ kind: "analysis", sessionId: s.id, k: 0 });
        }
        return;
      }
      case "show_story":
        need("analysis_reveal");
        await go(tx, s, "story_generating", actor);
        jobs.push({ kind: "story", sessionId: s.id, k: 0 });
        return;
      case "finish":
        need("story_playback");
        await go(tx, s, "completed", actor);
        return;
      case "pause": {
        const left = s.ends_at ? Math.max(0, s.ends_at.getTime() - Date.now()) : null;
        await go(tx, s, "paused", actor);
        await tx.query("update sessions set paused_remaining_ms = $2 where id = $1", [s.id, left]);
        // Open rounds stop their clock too; resuming gives them a new deadline.
        await tx.query(
          "update vote_rounds set ends_at = null where status = 'open' and dilemma_id in (select id from dilemmas where session_id = $1)",
          [s.id],
        );
        return;
      }
      case "resume": {
        need("paused");
        const seconds = s.paused_remaining_ms ? Math.max(5, s.paused_remaining_ms / 1000) : 0;
        const resumed = await go(tx, s, s.paused_from!, actor, { seconds });
        await tx.query("update sessions set paused_remaining_ms = null where id = $1", [s.id]);
        if (resumed.ends_at) {
          await tx.query(
            "update vote_rounds set ends_at = $2 where status = 'open' and dilemma_id in (select id from dilemmas where session_id = $1)",
            [s.id, resumed.ends_at],
          );
        }
        return;
      }
      case "abort":
        await go(tx, s, "aborted", actor);
        return;
    }
  });
  await settle(sessionId);
}

export async function nextAttempt(q: Sql, sessionId: string, kind: string, k: number): Promise<number> {
  const [row] = await q.query<{ n: number }>(
    "select coalesce(max(attempt) + 1, 0)::int as n from jobs where session_id = $1 and kind = $2 and k = $3",
    [sessionId, kind, k],
  );
  return row!.n;
}

/** Is the content the current system phase waits for available? */
async function contentReady(q: Sql, s: r.SessionRow): Promise<{ ready: boolean; to: Phase; job: Job["kind"]; k: number }> {
  const exists = async (sql: string, params: unknown[]) => (await q.query(sql, params)).length > 0;
  switch (s.phase) {
    case "universe_generating":
      return { ready: false, to: "universe_reveal", job: "universe", k: 0 };
    case "dilemma_preparing": {
      const d = await r.dilemmaAt(q, s.id, s.current_k);
      return { ready: Boolean(d && d.status !== "generating"), to: "dilemma_presenting", job: "dilemma", k: s.current_k };
    }
    case "decision_confirmed": {
      const d = await currentDilemma(q, s);
      return { ready: Boolean(await r.consequenceOf(q, d.id)), to: "consequence", job: "consequence", k: s.current_k };
    }
    case "analysis_generating":
      return {
        ready: await exists("select 1 from group_analyses where session_id = $1", [s.id]),
        to: "analysis_reveal",
        job: "analysis",
        k: 0,
      };
    default:
      return {
        ready: await exists("select 1 from final_stories where session_id = $1", [s.id]),
        to: "story_playback",
        job: "story",
        k: 0,
      };
  }
}

/** Moves a system phase forward as soon as its content exists. Safe to call at any time. */
export async function settle(sessionId: string): Promise<void> {
  await locked(sessionId, async (tx, s, jobs) => {
    if (!SYSTEM_PHASES.has(s.phase) || s.phase === "universe_generating") return;
    const c = await contentReady(tx, s);
    if (!c.ready) return;
    await go(tx, s, c.to, "system");
    // Pipelining (§13): start the next step while the group reads this one.
    if (c.to === "consequence") {
      jobs.push(
        s.current_k < s.dilemma_count
          ? { kind: "dilemma", sessionId: s.id, k: s.current_k + 1 }
          : { kind: "analysis", sessionId: s.id, k: 0 },
      );
    }
  });
}

/** Used by the universe job, which must also check that it is still the newest attempt. */
export async function revealUniverse(sessionId: string): Promise<void> {
  await locked(sessionId, async (tx, s) => {
    if (s.phase === "universe_generating") await go(tx, s, "universe_reveal", "system");
  });
}

const STUCK_MS = 5 * 60_000;
/** Inngest normally starts a job within seconds. After this time the job runs in this process instead. */
const PICKUP_MS = 45_000;

/** Expired timers and jobs that died with their server. Called on every snapshot read. */
export async function tick(s: r.SessionRow): Promise<boolean> {
  const now = Date.now();
  if (TIMED_PHASES.has(s.phase) && s.ends_at && s.ends_at.getTime() <= now) {
    let changed = false;
    await locked(s.id, async (tx, fresh, jobs) => {
      if (fresh.state_version < s.state_version || fresh.phase !== s.phase) return;
      if (!fresh.ends_at || fresh.ends_at.getTime() > now) return;
      changed = true;
      if (fresh.phase === "voting") await closeVoting(tx, fresh, "timer");
      else if (fresh.phase === "discussion") await startFinalVote(tx, fresh, "timer");
      else await closeFinalVote(tx, fresh, "timer", jobs);
    });
    return changed;
  }
  if (SYSTEM_PHASES.has(s.phase)) {
    const db = await getDb();
    const c = await contentReady(db, s);
    if (c.ready) {
      await settle(s.id);
      return true;
    }
    const [job] = await db.query<{ attempt: number; status: string; started_at: Date }>(
      "select attempt, status, started_at from jobs where session_id = $1 and kind = $2 and k = $3 order by attempt desc limit 1",
      [s.id, c.job, c.k],
    );
    const age = job ? now - job.started_at.getTime() : 0;
    const waiting = now - s.updated_at.getTime();
    // Missing, failed or finished without content: give it a moment. Still running: wait longer.
    const dead = job?.status === "running" ? age > STUCK_MS : waiting > 10_000;
    if (dead) {
      if (job) await db.query("update jobs set status = 'failed' where session_id = $1 and kind = $2 and k = $3", [s.id, c.job, c.k]);
      // A job that Inngest starts later, after all, finds its work claimed and does nothing.
      const here = waiting > PICKUP_MS;
      if (here && !job) console.warn(`[jobs] ${c.job} of session ${s.id} did not start in ${Math.round(waiting / 1000)} s, running it in this process`);
      await dispatch({ kind: c.job, sessionId: s.id, k: c.k, attempt: (job?.attempt ?? -1) + 1, forceDefault: Boolean(job) }, here);
    }
  }
  return false;
}
