import { conviction, jaccard, SYSTEM_PHASES, sessionStatus, tally, type Candidate, type GroupMetrics, type PlayerScores } from "@cs/engine";
import { ARCHETYPE_TEXT } from "@cs/default-story";
import type { GroupNarrative, Phase, ProfileNarrative, Rating, SessionConfig, Tone } from "@cs/schemas";
import { getDb, type Sql } from "@cs/db";
import { access, type Access } from "./commands.ts";
import { candidatesFor, initialRound, lastFinalRound, tick, asBallots } from "./flow.ts";
import { turnsOf } from "./history.ts";
import * as r from "./rows.ts";

const ONLINE_MS = 45_000;

export type ImageView = { url: string; alt: string; blurhash: string | null };
export type OptionView = { key: string; label: string; description: string; visible: string; writeIn: boolean };
export type ProfileView = {
  participantId: string;
  nickname: string;
  avatar: string;
  archetype: string;
  archetypeName: string;
  secondaryName: string;
  scores: PlayerScores;
  narrative: ProfileNarrative;
};

export type Snapshot = {
  version: number;
  now: number;
  code: string;
  sessionId: string;
  phase: Phase;
  pausedFrom: Phase | null;
  status: string;
  k: number;
  n: number;
  endsAt: number | null;
  config: SessionConfig;
  locked: boolean;
  builtIn: boolean;
  fallbackFromK: number | null;
  hostOnline: boolean;
  me: {
    userIsHost: boolean;
    isHost: boolean;
    participantId: string | null;
    nickname: string | null;
    role: "player" | "spectator" | null;
    approved: boolean;
    seatCode: string | null;
    ready: boolean;
    nudgedAt: number | null;
    shareProfile: boolean;
    persona: { name: string; role: string; bond: string; monologue: string; portrait: ImageView | null } | null;
  };
  players: {
    id: string;
    nickname: string;
    avatar: string;
    role: "player" | "spectator";
    online: boolean;
    ready: boolean;
    cohost: boolean;
    persona: string | null;
  }[];
  host?: {
    stageToken: string;
    pending: { id: string; nickname: string }[];
    nextReady: boolean;
    nextTitle: string | null;
    canRegenerateNext: boolean;
    canRegenerateUniverse: boolean;
    canLowerRating: boolean;
    shared: boolean;
    shareSlug: string | null;
  };
  selection?: { ready: number; total: number; wall: { title: string; coverUrl: string | null }[]; themes: string[]; mine: MySelection[] };
  universe?: {
    name: string;
    logline: string;
    opening: string[];
    atmosphere: string;
    conflict: string;
    rules: string[];
    characters: { id: string; name: string; role: string; portrait: ImageView | null }[];
    factions: { name: string; goal: string }[];
    inspiration: { source: string; became: string }[];
    keyArt: ImageView | null;
    rating: Rating;
    tone: Tone;
  };
  dilemma?: {
    k: number;
    title: string;
    connection: string;
    context: string;
    conflict: string;
    question: string;
    format: "single" | "multiple";
    min: number;
    max: number;
    exclusive: string[][];
    options: OptionView[];
    stakes: string;
    image: ImageView | null;
  };
  round?: {
    kind: "initial" | "final" | "revote";
    candidates: Candidate[];
    submitted: number;
    eligible: number;
    votedIds: string[];
    canVote: boolean;
    myVote: string[] | null;
  };
  writeIns?: { id: string; label: string; status: r.WriteInRow["status"]; reason: string | null; endorsements: number; mine: boolean; endorsed: boolean }[];
  results?: {
    counts: Record<string, number>;
    percentages: Record<string, number>;
    voters: number;
    abstentions: number;
    top: string[];
    minority: string[];
    split: number;
    voterNames: Record<string, string[]> | null;
    unanimous: boolean;
    candidates: Candidate[];
    pair: { a: string; b: string } | null;
  };
  decision?: {
    optionKeys: string[];
    labels: string[];
    resolvedBy: r.DecisionRow["resolved_by"];
    final: { id: string; labels: string[]; count: number }[] | null;
    persuaded: number;
    heldFirm: number;
    readers: string[] | null;
  };
  consequence?: { narrative: string; hidden: { label: string; text: string }[]; minorityEcho: string; image: ImageView | null };
  history: { k: number; title: string; labels: string[] }[];
  analysis?: {
    group: GroupNarrative;
    metrics: GroupMetrics;
    titles: Record<number, string>;
    names: Record<string, string>;
    mine: ProfileView | null;
    shared: ProfileView[];
  };
  story?: {
    title: string;
    logline: string;
    scenes: { headline: string; text: string; url: string; alt: string; transition: string }[];
    epilogue: { name: string; fate: string }[];
    credits: { players: string[]; inspiredBy: string[] };
    index: number;
    autoAdvance: boolean;
  };
};
export type MySelection = { titleId: string; title: string; year: number | null; kind: string; favorite: boolean; loveTags: string[] };

export type Limited = { limited: true; code: string; phase: Phase; reason: "join" | "waiting_approval"; lateJoin: boolean; spectators: boolean; locked: boolean };

const image = (a: r.AssetRow | null | undefined): ImageView | null => (a ? { url: a.url, alt: a.alt, blurhash: a.blurhash } : null);

const AFTER_UNIVERSE: Phase[] = [
  "universe_reveal",
  "dilemma_preparing",
  "dilemma_presenting",
  "voting",
  "results",
  "discussion",
  "final_vote",
  "decision_confirmed",
  "consequence",
  "analysis_generating",
  "analysis_reveal",
  "story_generating",
  "story_playback",
  "completed",
];
const WITH_DILEMMA: Phase[] = ["dilemma_presenting", "voting", "results", "discussion", "final_vote", "decision_confirmed", "consequence"];
const AFTER_REVEAL: Phase[] = ["results", "discussion", "final_vote", "decision_confirmed", "consequence"];

export async function profileViews(q: Sql, sessionId: string): Promise<(ProfileView & { shared: boolean })[]> {
  const rows = await q.query<r.ProfileRow & { nickname: string; avatar: string; share_profile: boolean }>(
    `select f.*, p.nickname, p.avatar, p.share_profile from player_profiles f join participants p on p.id = f.participant_id
     where f.session_id = $1 and p.kicked_at is null order by p.created_at`,
    [sessionId],
  );
  return rows.map((x) => ({
    participantId: x.participant_id,
    nickname: x.nickname,
    avatar: x.avatar,
    archetype: x.archetype,
    archetypeName: ARCHETYPE_TEXT[x.archetype].name,
    secondaryName: ARCHETYPE_TEXT[x.secondary_archetype].name,
    scores: x.scores,
    narrative: x.narrative,
    shared: x.share_profile,
  }));
}

/** Everything one viewer may see, and nothing else. */
export async function snapshot(
  code: string,
  userId: string,
  stageToken?: string | null,
  knownVersion?: number,
): Promise<Snapshot | Limited> {
  const db = await getDb();
  let a: Access = await access(code, userId, stageToken);
  if (await tick(a.session)) a = await access(code, userId, stageToken);
  const { session: s, participant: p, isHost } = a;
  // While paused, everyone keeps seeing the phase the session was paused in.
  const phase: Phase = s.phase === "paused" ? s.paused_from! : s.phase;

  if (!a.canView) {
    return {
      limited: true,
      code,
      phase: s.phase,
      reason: p ? "waiting_approval" : "join",
      lateJoin: s.config.lateJoin === "host",
      spectators: s.config.spectators,
      locked: s.locked,
    };
  }
  // The caller already has this version: send only the clock.
  if (knownVersion === s.state_version) return { unchanged: true, now: Date.now() } as never;

  const people = await db.query<r.ParticipantRow>(
    "select * from participants where session_id = $1 and kicked_at is null order by created_at, id",
    [s.id],
  );
  const now = Date.now();
  const online = (d: Date) => now - d.getTime() < ONLINE_MS;
  const assets = new Map((await r.assetsByRole(db, s.id)).map((x) => [x.role, x]));
  const bibleRow = AFTER_UNIVERSE.includes(phase) ? await r.latestBible(db, s.id) : null;
  const u = bibleRow?.bible.universe;
  const personaOf = (x: r.ParticipantRow) => u?.personas.find((y) => y.id === x.persona_key) ?? null;
  const myPersona = p ? personaOf(p) : null;
  const turns = await turnsOf(db, s.id);
  const nameOf = new Map(people.map((x) => [x.id, x.nickname]));

  const snap: Snapshot = {
    version: s.state_version,
    now,
    code,
    sessionId: s.id,
    phase: s.phase,
    pausedFrom: s.paused_from,
    status: sessionStatus(s.phase),
    k: s.current_k,
    n: s.dilemma_count,
    endsAt: s.ends_at?.getTime() ?? null,
    config: s.config,
    locked: s.locked,
    builtIn: s.content_source === "default" && AFTER_UNIVERSE.includes(phase),
    fallbackFromK: s.fallback_from_k,
    hostOnline: online(s.host_seen_at),
    me: {
      userIsHost: s.host_user_id === userId,
      isHost,
      participantId: p?.id ?? null,
      nickname: p?.nickname ?? null,
      role: p?.role ?? null,
      approved: p?.approved ?? false,
      seatCode: p?.seat_code ?? null,
      ready: p?.ready ?? false,
      nudgedAt: p?.nudged_at?.getTime() ?? null,
      shareProfile: p?.share_profile ?? false,
      persona: myPersona
        ? { name: myPersona.name, role: myPersona.role, bond: myPersona.bond, monologue: myPersona.monologue, portrait: image(assets.get(`persona:${myPersona.id}`)) }
        : null,
    },
    players: people
      .filter((x) => x.approved)
      .map((x) => ({
        id: x.id,
        nickname: x.nickname,
        avatar: x.avatar,
        role: x.role,
        online: online(x.last_seen_at),
        ready: x.ready,
        cohost: x.is_cohost,
        persona: personaOf(x)?.name ?? null,
      })),
    history: turns
      // The decision of the current dilemma is public only from its own phase on.
      .filter((t) => t.dilemma.k < s.current_k || !["voting", "results", "discussion", "final_vote"].includes(phase))
      .map((t) => ({ k: t.dilemma.k, title: t.dilemma.payload.title, labels: t.labels })),
  };

  if (isHost) {
    const nextK = phase === "universe_reveal" ? 1 : phase === "consequence" ? s.current_k + 1 : 0;
    const next = nextK && nextK <= s.dilemma_count ? await r.dilemmaAt(db, s.id, nextK) : null;
    const has = async (table: "group_analyses" | "final_stories") =>
      (await db.query(`select 1 from ${table} where session_id = $1`, [s.id])).length > 0;
    let nextReady = !SYSTEM_PHASES.has(phase);
    if (nextK && nextK <= s.dilemma_count) nextReady = next?.status === "ready";
    if (phase === "consequence" && nextK > s.dilemma_count) nextReady = await has("group_analyses");
    if (phase === "analysis_reveal") nextReady = await has("final_stories");
    snap.host = {
      stageToken: s.stage_token,
      pending: people.filter((x) => !x.approved).map((x) => ({ id: x.id, nickname: x.nickname })),
      nextReady,
      nextTitle: next?.status === "ready" ? next.payload.title : null,
      canRegenerateNext: next?.status === "ready" && next.source === "ai",
      canRegenerateUniverse: phase === "universe_reveal" && !s.universe_regenerated && s.content_source === "ai",
      canLowerRating: phase === "universe_reveal" && !s.rating_lowered && s.content_rating !== "family",
      shared: s.shared,
      shareSlug: s.share_slug,
    };
  }

  if (phase === "selection" || phase === "universe_generating") {
    const rows = await db.query<r.TitleRow & { participant_id: string; is_favorite: boolean; love_tags: string[]; title_id: string }>(
      `select t.*, x.participant_id, x.is_favorite, x.love_tags, x.title_id from selections x join title_catalog t on t.id = x.title_id
       where x.session_id = $1 order by x.created_at, t.id`,
      [s.id],
    );
    const players = people.filter((x) => x.role === "player" && x.approved);
    snap.selection = {
      ready: players.filter((x) => x.ready).length,
      total: players.length,
      wall: [...new Map(rows.map((x) => [x.title_id, { title: x.title, coverUrl: x.cover_url }])).values()],
      themes: [...new Set(rows.flatMap((x) => x.themes?.themes ?? []))].slice(0, 24),
      mine: rows
        .filter((x) => x.participant_id === p?.id)
        .map((x) => ({ titleId: x.title_id, title: x.title, year: x.year, kind: x.kind, favorite: x.is_favorite, loveTags: x.love_tags })),
    };
  }

  if (u) {
    snap.universe = {
      name: u.name,
      logline: u.logline,
      opening: u.opening,
      atmosphere: u.atmosphere,
      conflict: u.central_conflict,
      rules: u.world_rules,
      characters: u.characters.map((c) => ({ id: c.id, name: c.name, role: c.role, portrait: image(assets.get(`portrait:${c.id}`)) })),
      factions: u.factions.map((f) => ({ name: f.name, goal: f.goal })),
      inspiration: u.inspiration,
      keyArt: image(assets.get("key_art")),
      rating: s.content_rating ?? "teen",
      tone: s.tone ?? { hopefulDark: 0, groundedFantastical: 0 },
    };
  }

  const d = WITH_DILEMMA.includes(phase) ? await r.dilemmaAt(db, s.id, s.current_k) : null;
  if (d) {
    const options = await r.optionsOf(db, d.id);
    const x = d.payload;
    snap.dilemma = {
      k: d.k,
      title: x.title,
      connection: x.narrative_connection,
      context: x.context,
      conflict: x.moral_conflict,
      question: x.question,
      format: x.format,
      min: x.min_select,
      max: x.max_select,
      exclusive: x.exclusive,
      options: options.map((o) => ({
        key: o.key,
        label: o.label,
        description: o.description,
        visible: o.visible_consequence,
        writeIn: o.origin === "write_in",
      })),
      stakes: x.stakes,
      image: image(await r.assetById(db, d.image_asset_id)),
    };

    const rounds = await r.roundsOf(db, d.id);
    const open = rounds.find((y) => y.status === "open");
    const voters = people.filter((y) => y.role === "player" && y.approved);
    if (open) {
      const votes = await r.votesOf(db, open.id);
      const mine = votes.find((v) => v.participant_id === p?.id);
      snap.round = {
        kind: open.kind,
        candidates: (open.candidates as (string | Candidate)[]).map((c) => (typeof c === "string" ? { id: c, optionKeys: [c] } : c)),
        submitted: votes.length,
        eligible: voters.length,
        votedIds: votes.map((v) => v.participant_id),
        canVote: Boolean(p && p.role === "player" && s.phase !== "paused"),
        myVote: mine?.option_keys ?? null,
      };
    }

    if (s.config.writeIns && phase !== "dilemma_presenting") {
      snap.writeIns = (await r.writeInsOf(db, d.id))
        // Proposals still being checked, and rejected ones, are only shown to their author.
        .filter((w) => w.participant_id === p?.id || w.status === "open" || w.status === "approved")
        .map((w) => ({
          id: w.id,
          label: w.option?.label ?? w.raw_text,
          status: w.status,
          reason: w.participant_id === p?.id ? w.reason : null,
          endorsements: w.endorsements.length,
          mine: w.participant_id === p?.id,
          endorsed: Boolean(p && w.endorsements.includes(p.id)),
        }));
    }

    if (AFTER_REVEAL.includes(phase)) {
      const { ballots, base, unanimous, candidates } = await candidatesFor(db, d);
      const t = tally(base, ballots);
      const cast = ballots.filter((b) => !b.abstained);
      const agreed = turns.length >= 2 ? bestPair([...turns.map((y) => y.record.initial)], nameOf) : null;
      snap.results = {
        counts: t.counts,
        percentages: t.percentages,
        voters: t.voters,
        abstentions: t.abstentions,
        top: t.top,
        minority: base.filter((key) => t.counts[key]! > 0 && !t.top.includes(key)),
        split: splitOf(cast),
        voterNames:
          s.config.reveal === "named"
            ? Object.fromEntries(
                base.map((key) => [key, cast.filter((b) => b.optionKeys.includes(key)).flatMap((b) => nameOf.get(b.participantId) ?? [])]),
              )
            : null,
        unanimous: Boolean(unanimous),
        candidates,
        pair: s.config.reveal === "named" ? agreed : null,
      };
    }

    if (phase === "decision_confirmed" || phase === "consequence") {
      const turn = turns.find((y) => y.dilemma.k === d.k);
      if (turn) {
        const last = lastFinalRound(rounds);
        const label = (key: string) => options.find((o) => o.key === key)?.label ?? key;
        const finalVotes = last ? asBallots(await r.votesOf(db, last.id)) : [];
        const moves = turn.record.initial.map((b) =>
          conviction(b.optionKeys, turn.record.final.find((f) => f.participantId === b.participantId)?.optionKeys),
        );
        const initial = initialRound(rounds);
        const initialVotes = initial ? await r.votesOf(db, initial.id) : [];
        snap.decision = {
          optionKeys: turn.decision.option_keys,
          labels: turn.labels,
          resolvedBy: turn.decision.resolved_by,
          final: last
            ? (last.candidates as Candidate[]).map((c) => ({
                id: c.id,
                labels: c.optionKeys.map(label),
                count: finalVotes.filter((v) => v.optionKeys.includes(c.id)).length,
              }))
            : null,
          persuaded: moves.filter((m) => m === "persuaded").length,
          heldFirm: moves.filter((m) => m === "held_firm").length,
          readers: s.config.predictions
            ? initialVotes
                .filter((v) => v.prediction && turn.decision.option_keys.includes(v.prediction))
                .flatMap((v) => nameOf.get(v.participant_id) ?? [])
            : null,
        };
        if (phase === "consequence" && turn.consequence) {
          snap.consequence = {
            narrative: turn.consequence.narrative,
            hidden: turn.consequence.revealed_hidden.map((h) => ({ label: h.label, text: h.text })),
            minorityEcho: turn.consequence.minority_echo,
            image: image(await r.assetById(db, turn.consequence.image_asset_id)),
          };
        }
      }
    }
  }

  if (["analysis_reveal", "story_generating", "story_playback", "completed"].includes(phase)) {
    const [group] = await db.query<r.GroupRow>("select metrics, narrative from group_analyses where session_id = $1", [s.id]);
    if (group) {
      const profiles = await profileViews(db, s.id);
      const strip = ({ shared: _, ...v }: (typeof profiles)[number]): ProfileView => v;
      const mine = profiles.find((x) => x.participantId === p?.id);
      snap.analysis = {
        group: group.narrative,
        metrics: s.config.reveal === "named" ? group.metrics : { ...group.metrics, alliances: [], independentVoices: [] },
        titles: Object.fromEntries(turns.map((t) => [t.dilemma.k, t.dilemma.payload.title])),
        names: Object.fromEntries(nameOf),
        mine: mine ? strip(mine) : null,
        shared: profiles.filter((x) => x.shared).map(strip),
      };
    }
  }

  if (phase === "story_playback" || phase === "completed") {
    const story = await storyView(db, s);
    if (story) snap.story = { ...story, index: s.scene_index, autoAdvance: s.auto_advance };
  }
  return snap;
}

function splitOf(ballots: { optionKeys: string[] }[]): number {
  let total = 0;
  let pairs = 0;
  for (let i = 0; i < ballots.length; i++)
    for (let j = i + 1; j < ballots.length; j++) {
      total += 1 - jaccard(ballots[i]!.optionKeys, ballots[j]!.optionKeys);
      pairs++;
    }
  return pairs ? Math.round((total / pairs) * 100) / 100 : 0;
}

/** Two players who agreed on everything so far. */
function bestPair(rounds: { participantId: string; optionKeys: string[]; abstained?: boolean }[][], names: Map<string, string>) {
  const ids = [...names.keys()];
  for (let i = 0; i < ids.length; i++)
    for (let j = i + 1; j < ids.length; j++) {
      const same = rounds.every((round) => {
        const a = round.find((b) => b.participantId === ids[i] && !b.abstained);
        const b = round.find((x) => x.participantId === ids[j] && !x.abstained);
        return a && b && jaccard(a.optionKeys, b.optionKeys) === 1;
      });
      if (same && rounds.length) return { a: names.get(ids[i]!)!, b: names.get(ids[j]!)! };
    }
  return null;
}

export async function storyView(q: Sql, s: r.SessionRow) {
  const [story] = await q.query<r.StoryRow>("select * from final_stories where session_id = $1", [s.id]);
  if (!story) return null;
  const players = await r.activePlayers(q, s.id);
  const titles = await q.query<{ title: string }>(
    "select distinct t.title from selections x join title_catalog t on t.id = x.title_id where x.session_id = $1 order by t.title",
    [s.id],
  );
  return {
    title: story.title,
    logline: story.logline,
    scenes: story.scenes.map((x) => ({ headline: x.headline, text: x.text, url: x.url, alt: x.alt, transition: x.transition })),
    epilogue: story.epilogue,
    credits: { players: players.map((p) => p.nickname), inspiredBy: titles.map((t) => t.title) },
  };
}

/** Public story page: only when the host shared it. Individual profiles only with each player's consent. */
export async function sharedStory(slug: string) {
  const db = await getDb();
  const [s] = await db.query<r.SessionRow>("select * from sessions where share_slug = $1 and shared", [slug]);
  if (!s) return null;
  const story = await storyView(db, s);
  if (!story) return null;
  const turns = await turnsOf(db, s.id);
  return {
    ...story,
    decisions: turns.map((t) => ({
      k: t.dilemma.k,
      title: t.dilemma.payload.title,
      question: t.dilemma.payload.question,
      options: t.options.map((o) => ({ key: o.key, label: o.label })),
      chosen: t.decision.option_keys,
      counts: tally(
        t.options.map((o) => o.key),
        t.record.initial,
      ).counts,
    })),
    profiles: (await profileViews(db, s.id))
      .filter((x) => x.shared)
      .map((x) => ({ nickname: x.nickname, avatar: x.avatar, archetypeName: x.archetypeName, explanation: x.narrative.explanation })),
  };
}

/** Full history for the host (JSON export, §5 Stage 8). Contains no other player's profile. */
export async function exportSession(code: string, userId: string) {
  const a = await access(code, userId);
  if (!a.isHost) throw new r.GameError("forbidden", 403);
  const db = await getDb();
  const s = a.session;
  const turns = await turnsOf(db, s.id);
  const named = s.config.reveal === "named";
  const names = new Map((await r.activePlayers(db, s.id)).map((p) => [p.id, p.nickname]));
  return {
    code: s.code,
    createdAt: s.created_at,
    rating: s.content_rating,
    tone: s.tone,
    universe: (await r.latestBible(db, s.id))?.bible.universe ?? null,
    turns: turns.map((t) => ({
      k: t.dilemma.k,
      dilemma: t.dilemma.payload,
      decision: t.decision.option_keys,
      resolvedBy: t.decision.resolved_by,
      consequence: t.consequence?.narrative ?? null,
      votes: t.record.initial.map((b) => ({ player: named ? (names.get(b.participantId) ?? null) : null, options: b.optionKeys })),
    })),
    story: await storyView(db, s),
  };
}
