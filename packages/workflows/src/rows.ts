import type { Bible, Dilemma, Phase, Rating, SessionConfig, StoryScene, Tone, ValueTags } from "@cs/schemas";
import type { Candidate, GroupMetrics, PlayerScores, Archetype } from "@cs/engine";
import type { GroupNarrative, ProfileNarrative, TitleThemes, WriteInCheck } from "@cs/schemas";
import type { Sql } from "@cs/db";

export type SessionRow = {
  id: string;
  code: string;
  stage_token: string;
  host_user_id: string;
  phase: Phase;
  paused_from: Phase | null;
  state_version: number;
  config: SessionConfig;
  dilemma_count: number;
  current_k: number;
  ends_at: Date | null;
  paused_remaining_ms: number | null;
  locked: boolean;
  content_source: "ai" | "default";
  fallback_from_k: number | null;
  content_rating: Rating | null;
  rating_lowered: boolean;
  universe_regenerated: boolean;
  tone: Tone | null;
  derived_from: { title: string; rating: Rating; tone: Tone; favorite: boolean }[] | null;
  scene_index: number;
  auto_advance: boolean;
  share_slug: string | null;
  shared: boolean;
  host_seen_at: Date;
  created_at: Date;
  updated_at: Date;
};

export type ParticipantRow = {
  id: string;
  session_id: string;
  user_id: string;
  nickname: string;
  avatar: string;
  role: "player" | "spectator";
  is_cohost: boolean;
  approved: boolean;
  seat_code: string;
  joined_at_k: number;
  kicked_at: Date | null;
  persona_key: string | null;
  share_profile: boolean;
  nudged_at: Date | null;
  ready: boolean;
  last_seen_at: Date;
};

export type TitleRow = {
  id: string;
  source: string;
  external_id: string;
  title: string;
  year: number | null;
  kind: "book" | "movie" | "series";
  cover_url: string | null;
  themes: TitleThemes | null;
  rating_level: Rating | null;
  rating_source: "metadata" | "ai" | "builtin" | null;
  tone: Tone | null;
  themes_version: string | null;
};

export type DilemmaRow = {
  id: string;
  session_id: string;
  k: number;
  source: "ai" | "default";
  status: "generating" | "ready" | "presented" | "closed";
  payload: Dilemma;
  image_asset_id: string | null;
};

export type OptionRow = {
  dilemma_id: string;
  key: string;
  label: string;
  description: string;
  visible_consequence: string;
  hidden_consequence: string;
  value_tags: ValueTags;
  origin: "ai" | "write_in";
  proposed_by: string | null;
};

export type RoundRow = {
  id: string;
  dilemma_id: string;
  round_no: number;
  kind: "initial" | "final" | "revote";
  status: "open" | "closed" | "superseded";
  candidates: string[] | Candidate[];
  min_select: number;
  max_select: number;
  exclusive: string[][];
  ends_at: Date | null;
};

export type VoteRow = {
  round_id: string;
  participant_id: string;
  option_keys: string[];
  confidence: number | null;
  prediction: string | null;
  abstained: boolean;
};

export type WriteInRow = {
  id: string;
  dilemma_id: string;
  participant_id: string;
  raw_text: string;
  status: "checking" | "open" | "approved" | "rejected";
  reason: string | null;
  option: WriteInCheck["option"] | null;
  option_key: string | null;
  endorsements: string[];
};

export type DecisionRow = {
  dilemma_id: string;
  option_keys: string[];
  resolved_by: "final_vote" | "unanimous" | "revote" | "fate";
  tally: unknown;
  leaders: string[];
  split_index: number;
};

export type ConsequenceRow = {
  dilemma_id: string;
  narrative: string;
  revealed_hidden: { key: string; label: string; text: string }[];
  minority_echo: string;
  image_asset_id: string | null;
};

export type AssetRow = {
  id: string;
  session_id: string;
  role: string;
  url: string;
  alt: string;
  blurhash: string | null;
};

export type ProfileRow = {
  participant_id: string;
  scores: PlayerScores;
  archetype: Archetype;
  secondary_archetype: Archetype;
  narrative: ProfileNarrative;
};

export type GroupRow = { metrics: GroupMetrics; narrative: GroupNarrative };

export type StoredScene = StoryScene & { url: string; alt: string };
export type StoryRow = {
  title: string;
  logline: string;
  ending_id: string;
  scenes: StoredScene[];
  epilogue: { name: string; fate: string }[];
};

export class GameError extends Error {
  readonly status: number;
  constructor(code: string, status = 400) {
    super(code);
    this.status = status;
  }
}

const one = <T>(rows: T[]): T | null => rows[0] ?? null;

export const sessionById = async (q: Sql, id: string, lock = false) =>
  one(await q.query<SessionRow>(`select * from sessions where id = $1${lock ? " for update" : ""}`, [id]));
export const sessionByCode = async (q: Sql, code: string) =>
  one(await q.query<SessionRow>("select * from sessions where code = $1", [code]));
export const participantOf = async (q: Sql, sessionId: string, userId: string) =>
  one(await q.query<ParticipantRow>("select * from participants where session_id = $1 and user_id = $2", [sessionId, userId]));
export const activePlayers = (q: Sql, sessionId: string) =>
  q.query<ParticipantRow>(
    "select * from participants where session_id = $1 and role = 'player' and kicked_at is null and approved order by created_at, id",
    [sessionId],
  );
export const dilemmaAt = async (q: Sql, sessionId: string, k: number) =>
  one(await q.query<DilemmaRow>("select * from dilemmas where session_id = $1 and k = $2", [sessionId, k]));
export const optionsOf = (q: Sql, dilemmaId: string) =>
  q.query<OptionRow>("select * from dilemma_options where dilemma_id = $1 order by key", [dilemmaId]);
export const roundsOf = (q: Sql, dilemmaId: string) =>
  q.query<RoundRow>("select * from vote_rounds where dilemma_id = $1 order by round_no", [dilemmaId]);
export const votesOf = (q: Sql, roundId: string) => q.query<VoteRow>("select * from votes where round_id = $1", [roundId]);
export const decisionOf = async (q: Sql, dilemmaId: string) =>
  one(
    await q.query<DecisionRow>(
      "select dilemma_id, option_keys, resolved_by, tally, leaders, split_index::float8 as split_index from group_decisions where dilemma_id = $1",
      [dilemmaId],
    ),
  );
export const consequenceOf = async (q: Sql, dilemmaId: string) =>
  one(await q.query<ConsequenceRow>("select * from consequences where dilemma_id = $1", [dilemmaId]));
export const writeInsOf = (q: Sql, dilemmaId: string) =>
  q.query<WriteInRow>("select * from write_ins where dilemma_id = $1 order by created_at", [dilemmaId]);
export const latestBible = async (q: Sql, sessionId: string) =>
  one(
    await q.query<{ version: number; bible: Bible }>(
      "select version, bible from story_bibles where session_id = $1 order by version desc limit 1",
      [sessionId],
    ),
  );
export const assetById = async (q: Sql, id: string | null) =>
  id ? one(await q.query<AssetRow>("select * from assets where id = $1", [id])) : null;
/** Newest asset per role. */
export const assetsByRole = (q: Sql, sessionId: string) =>
  q.query<AssetRow>(
    "select distinct on (role) * from assets where session_id = $1 and kind = 'image' order by role, created_at desc, id",
    [sessionId],
  );

/** Announces a change that is not a phase change. */
export const bump = (q: Sql, sessionId: string) =>
  q.query("update sessions set state_version = state_version + 1, updated_at = now() where id = $1", [sessionId]);
