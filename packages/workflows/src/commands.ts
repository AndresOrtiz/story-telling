import { createHash, randomInt, randomUUID } from "node:crypto";
import * as ai from "@cs/ai";
import { selectionError } from "@cs/engine";
import { CATALOG, SURPRISE_POOL } from "@cs/default-story";
import { DILEMMA_LIMITS, Nickname, ROOM_ALPHABET, SelectionInput, SessionConfig, VoteInput, type Dilemma } from "@cs/schemas";
import { errorCode, getDb, json, type Sql } from "@cs/db";
import { aiContext } from "./jobs.ts";
import { dispatch } from "./dispatch.ts";
import { nextAttempt } from "./flow.ts";
import * as r from "./rows.ts";
import { GameError } from "./rows.ts";

const pick = (length: number) => Array.from({ length }, () => ROOM_ALPHABET[randomInt(ROOM_ALPHABET.length)]).join("");

/** Turns the short error codes of SQL functions into game errors. */
async function sql<T>(run: () => Promise<T>): Promise<T> {
  try {
    return await run();
  } catch (e) {
    const code = errorCode(e);
    if (code === "internal") throw e;
    throw new GameError(code, code === "not_found" ? 404 : 400);
  }
}

export type Access = {
  session: r.SessionRow;
  participant: r.ParticipantRow | null;
  /** Opened the room, whether or not they are logged in. */
  isOwner: boolean;
  isHost: boolean;
  /** Host, approved participant or a valid stage link. */
  canView: boolean;
};

/** `hostLogin` is false when hosts must log in and this browser has not. Co-hosts never log in. */
export async function access(code: string, userId: string, stageToken?: string | null, hostLogin = true): Promise<Access> {
  const db = await getDb();
  const session = await r.sessionByCode(db, code);
  if (!session) throw new GameError("not_found", 404);
  const found = await r.participantOf(db, session.id, userId);
  const participant = found && !found.kicked_at ? found : null;
  const isOwner = session.host_user_id === userId;
  const isHost = isOwner ? hostLogin : Boolean(participant?.is_cohost);
  const stage = Boolean(stageToken) && stageToken === session.stage_token;
  return { session, participant, isOwner, isHost, canView: isHost || stage || Boolean(participant?.approved) };
}

export async function isOwner(code: string, userId: string): Promise<boolean> {
  return (await access(code, userId)).isOwner;
}

export async function requireHost(code: string, userId: string): Promise<r.SessionRow> {
  const a = await access(code, userId);
  if (!a.isHost) throw new GameError("forbidden", 403);
  return a.session;
}

async function requirePlayer(code: string, userId: string) {
  const a = await access(code, userId);
  const p = a.participant;
  if (!p || p.role !== "player" || !p.approved) throw new GameError("forbidden", 403);
  return { session: a.session, player: p };
}

/* ---------- Rooms ---------- */
export async function createSession(userId: string, input: unknown): Promise<{ code: string }> {
  const config = SessionConfig.parse(input ?? {});
  const db = await getDb();
  for (let i = 0; i < 5; i++) {
    const code = pick(6);
    const rows = await db.query(
      `insert into sessions (code, host_user_id, config, dilemma_count, content_source) values ($1, $2, $3, $4, $5)
       on conflict (code) do nothing returning id`,
      [code, userId, json(config), config.dilemmas, config.builtInStory ? "default" : "ai"],
    );
    if (rows.length) return { code };
  }
  throw new GameError("try_again", 503);
}

export async function updateConfig(code: string, userId: string, input: unknown): Promise<void> {
  const { id } = await requireHost(code, userId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    // Every save changes one setting and writes them all, so saves that overlap must wait for each other.
    const s = await r.sessionById(tx, id, true);
    if (s?.phase !== "lobby") throw new GameError("started", 409);
    const config = SessionConfig.parse({ ...s.config, ...(input as object) });
    await tx.query(
      "update sessions set config = $2, dilemma_count = $3, content_source = $4, state_version = state_version + 1 where id = $1",
      [id, json(config), config.dilemmas, config.builtInStory ? "default" : "ai"],
    );
  });
}

export async function join(
  code: string,
  userId: string,
  input: { nickname: string; avatar?: string; role?: "player" | "spectator" },
): Promise<r.ParticipantRow> {
  const parsed = Nickname.safeParse(input.nickname);
  if (!parsed.success) throw new GameError("bad_nickname");
  const db = await getDb();
  const s = await r.sessionByCode(db, code);
  if (!s) throw new GameError("not_found", 404);
  if (!(await ai.acceptable(await aiContext(s), "nickname", parsed.data))) throw new GameError("bad_nickname");
  const avatar = [...(input.avatar ?? "🙂")].slice(0, 4).join("");
  return sql(
    async () =>
      (
        await db.query<r.ParticipantRow>("select * from join_session($1, $2, $3, $4, $5, $6)", [
          code,
          userId,
          parsed.data,
          avatar,
          input.role ?? "player",
          pick(8),
        ])
      )[0]!,
  );
}

/** Moves a seat to this browser. */
export async function recoverSeat(code: string, userId: string, seatCode: string): Promise<void> {
  const db = await getDb();
  const s = await r.sessionByCode(db, code);
  if (!s) throw new GameError("not_found", 404);
  const clean = seatCode.toUpperCase().replace(/[^A-Z0-9]/g, "");
  const [seat] = await db.query<r.ParticipantRow>(
    "select * from participants where session_id = $1 and seat_code = $2 and kicked_at is null",
    [s.id, clean],
  );
  if (!seat) throw new GameError("bad_seat");
  if (seat.user_id === userId) return;
  if (await r.participantOf(db, s.id, userId)) throw new GameError("already_joined");
  await db.query("update participants set user_id = $2, last_seen_at = now() where id = $1", [seat.id, userId]);
  await r.bump(db, s.id);
}

export type RoomAction =
  | { type: "kick" | "approve" | "cohost" | "nudge"; participantId: string }
  | { type: "rename"; participantId: string; nickname: string }
  | { type: "lock"; locked: boolean };

export async function roomAction(code: string, userId: string, action: RoomAction): Promise<void> {
  const s = await requireHost(code, userId);
  const db = await getDb();
  const set = (column: string, value: unknown, participantId: string) =>
    db.query(`update participants set ${column} = $3 where id = $1 and session_id = $2`, [participantId, s.id, value]);
  switch (action.type) {
    case "kick":
      await set("kicked_at", new Date(), action.participantId);
      break;
    case "approve":
      await set("approved", true, action.participantId);
      break;
    case "cohost":
      // Only the real host hands out host rights.
      if (s.host_user_id !== userId) throw new GameError("forbidden", 403);
      await db.query("update participants set is_cohost = not is_cohost where id = $1 and session_id = $2", [action.participantId, s.id]);
      break;
    case "nudge":
      await set("nudged_at", new Date(), action.participantId);
      break;
    case "rename": {
      const nickname = Nickname.safeParse(action.nickname);
      if (!nickname.success || !ai.locallyAcceptable(nickname.data)) throw new GameError("bad_nickname");
      try {
        await set("nickname", nickname.data, action.participantId);
      } catch {
        throw new GameError("nickname_taken");
      }
      break;
    }
    case "lock":
      await db.query("update sessions set locked = $2 where id = $1", [s.id, action.locked]);
      break;
  }
  await r.bump(db, s.id);
}

export async function heartbeat(code: string, userId: string): Promise<void> {
  const db = await getDb();
  await db.query("update sessions set host_seen_at = now() where code = $1 and host_user_id = $2", [code, userId]);
  await db.query(
    "update participants set last_seen_at = now() where user_id = $2 and session_id = (select id from sessions where code = $1)",
    [code, userId],
  );
}

/* ---------- Selections ---------- */
const keyOf = (title: string) => createHash("sha256").update(title.toLowerCase().trim()).digest("hex").slice(0, 24);

async function upsertTitle(
  q: Sql,
  t: { source: string; externalId: string; title: string; year: number | null; kind: string; coverUrl: string | null; rating?: string | null; ratingSource?: string | null; tone?: unknown },
): Promise<string> {
  const [row] = await q.query<{ id: string }>(
    `insert into title_catalog (source, external_id, title, year, kind, cover_url, rating_level, rating_source, tone)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9)
     on conflict (source, external_id) do update set cover_url = coalesce(title_catalog.cover_url, excluded.cover_url)
     returning id`,
    [t.source, t.externalId, t.title, t.year, t.kind, t.coverUrl, t.rating ?? null, t.ratingSource ?? null, t.tone ? json(t.tone) : null],
  );
  return row!.id;
}

/** Called by the search endpoint, so that players can only pick titles the server found. */
export async function rememberTitles(
  list: { source: string; externalId: string; title: string; year: number | null; kind: "book" | "movie" | "series"; coverUrl: string | null; rating?: "family" | "teen" | "mature" | null }[],
): Promise<{ id: string; title: string; year: number | null; kind: string; coverUrl: string | null }[]> {
  const db = await getDb();
  const out = [];
  for (const t of list) {
    const known = t.source === "builtin" ? CATALOG.find((c) => c.id === t.externalId) : undefined;
    const id = await upsertTitle(db, {
      ...t,
      rating: t.rating ?? known?.rating ?? null,
      ratingSource: t.rating ? "metadata" : known ? "builtin" : null,
      tone: known?.tone,
    });
    out.push({ id, title: t.title, year: t.year, kind: t.kind, coverUrl: t.coverUrl });
  }
  return out;
}

export async function saveSelections(code: string, userId: string, input: unknown): Promise<void> {
  const list = SelectionInput.array().min(1).max(3).parse(input);
  const { session: s, player } = await requirePlayer(code, userId);
  if (s.phase !== "selection") throw new GameError("invalid_transition", 409);
  const db = await getDb();
  const ctx = await aiContext(s);
  const resolved: { id: string; favorite: boolean; loveTags: string[]; unverified: boolean }[] = [];
  for (const item of list) {
    let id = item.titleId;
    if (id) {
      if ((await db.query("select 1 from title_catalog where id = $1", [id])).length === 0) throw new GameError("unknown_title");
    } else {
      const title = item.title!;
      if (!(await ai.acceptable(ctx, "title", title))) throw new GameError("bad_title");
      id = await upsertTitle(db, { source: "manual", externalId: keyOf(`${item.kind}:${title}`), title, year: null, kind: item.kind, coverUrl: null });
    }
    if (!resolved.some((x) => x.id === id)) {
      resolved.push({ id, favorite: item.favorite, loveTags: item.loveTags, unverified: !item.titleId });
    }
  }
  // At most one favourite.
  const favorite = resolved.findIndex((x) => x.favorite);
  await db.transaction(async (tx) => {
    await tx.query("delete from selections where participant_id = $1", [player.id]);
    for (const [i, x] of resolved.entries()) {
      await tx.query(
        "insert into selections (session_id, participant_id, title_id, is_favorite, love_tags, unverified) values ($1, $2, $3, $4, $5, $6)",
        [s.id, player.id, x.id, i === favorite, x.loveTags, x.unverified],
      );
    }
    await tx.query("update participants set ready = true where id = $1", [player.id]);
    await r.bump(tx, s.id);
  });
  // Theme extraction starts as soon as the first player confirms (§13).
  if (s.content_source === "ai") {
    for (const x of resolved) await dispatch({ kind: "title", sessionId: s.id, k: 0, ref: x.id });
  }
}

/** Players without a selection get a surprise title when the host continues. */
export async function fillMissingSelections(s: r.SessionRow): Promise<void> {
  const db = await getDb();
  const missing = await db.query<{ id: string }>(
    `select p.id from participants p where p.session_id = $1 and p.role = 'player' and p.kicked_at is null and p.approved
     and not exists (select 1 from selections x where x.participant_id = p.id)`,
    [s.id],
  );
  for (const p of missing) {
    const t = SURPRISE_POOL[randomInt(SURPRISE_POOL.length)]!;
    const id = await upsertTitle(db, { source: "builtin", externalId: t.id, title: t.title, year: t.year, kind: t.kind, coverUrl: null, rating: t.rating, ratingSource: "builtin", tone: t.tone });
    await db.query("insert into selections (session_id, participant_id, title_id) values ($1, $2, $3) on conflict do nothing", [s.id, p.id, id]);
  }
}

/* ---------- Voting ---------- */
export async function castVote(code: string, userId: string, input: unknown): Promise<void> {
  const v = VoteInput.parse(input);
  const { session: s, player } = await requirePlayer(code, userId);
  const db = await getDb();
  const d = await r.dilemmaAt(db, s.id, s.current_k);
  if (!d) throw new GameError("round_closed", 409);
  const round = (await r.roundsOf(db, d.id)).find((x) => x.status === "open");
  if (!round) throw new GameError("round_closed", 409);
  if (round.kind === "initial") {
    const error = selectionError({ ...d.payload, options: d.payload.options }, v.optionKeys);
    if (error) throw new GameError(error);
  }
  const prediction =
    round.kind === "initial" && s.config.predictions && d.payload.options.some((o) => o.key === v.prediction) ? v.prediction : null;
  await sql(() =>
    db.query("select cast_vote($1, $2, $3, $4, $5)", [
      round.id,
      player.id,
      v.optionKeys,
      round.kind === "initial" ? v.confidence : null,
      prediction,
    ]),
  );
  await r.bump(db, s.id);
}

export async function proposeWriteIn(code: string, userId: string, text: string): Promise<void> {
  const { session: s, player } = await requirePlayer(code, userId);
  const clean = text.replace(/\s+/g, " ").trim();
  if (!s.config.writeIns) throw new GameError("write_ins_off");
  if (clean.length < 3 || clean.length > 140) throw new GameError("bad_write_in");
  if (!["voting", "results", "discussion"].includes(s.phase)) throw new GameError("round_closed", 409);
  if (!ai.locallyAcceptable(clean)) throw new GameError("bad_write_in");
  const db = await getDb();
  const d = await r.dilemmaAt(db, s.id, s.current_k);
  if (!d) throw new GameError("round_closed", 409);
  const rows = await db.query<{ id: string }>(
    "insert into write_ins (dilemma_id, participant_id, raw_text) values ($1, $2, $3) on conflict (dilemma_id, participant_id) do nothing returning id",
    [d.id, player.id, clean],
  );
  if (rows.length === 0) throw new GameError("already_proposed");
  await r.bump(db, s.id);
  await dispatch({ kind: "writein", sessionId: s.id, k: d.k, ref: rows[0]!.id });
}

/** Turns an accepted proposal into an option of the final vote. */
async function approve(q: Sql, s: r.SessionRow, w: r.WriteInRow): Promise<void> {
  if (w.status !== "open" || !w.option) return;
  const taken = (await r.optionsOf(q, w.dilemma_id)).filter((o) => o.origin === "write_in");
  if (taken.length >= 3) throw new GameError("too_many_write_ins");
  const key = `W${taken.length + 1}`;
  const o: Dilemma["options"][number] = { ...w.option, key };
  await q.query(
    `insert into dilemma_options (dilemma_id, key, label, description, visible_consequence, hidden_consequence, value_tags, origin, proposed_by)
     values ($1, $2, $3, $4, $5, $6, $7, 'write_in', $8)`,
    [w.dilemma_id, key, o.label, o.description, o.visible_consequence, o.hidden_consequence, json(o.value_tags), w.participant_id],
  );
  await q.query("update write_ins set status = 'approved', option_key = $2 where id = $1", [w.id, key]);
}

async function openWriteIn(q: Sql, s: r.SessionRow, id: string): Promise<r.WriteInRow> {
  if (!["voting", "results", "discussion"].includes(s.phase)) throw new GameError("round_closed", 409);
  const [w] = await q.query<r.WriteInRow>(
    "select w.* from write_ins w join dilemmas d on d.id = w.dilemma_id where w.id = $1 and d.session_id = $2 and d.k = $3 for update of w",
    [id, s.id, s.current_k],
  );
  if (!w) throw new GameError("not_found", 404);
  return w;
}

export async function endorseWriteIn(code: string, userId: string, id: string): Promise<void> {
  const { session, player } = await requirePlayer(code, userId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const s = (await r.sessionById(tx, session.id, true))!;
    const w = await openWriteIn(tx, s, id);
    if (w.participant_id === player.id) throw new GameError("own_write_in");
    if (w.status !== "open" || w.endorsements.includes(player.id)) return;
    const endorsements = [...w.endorsements, player.id];
    await tx.query("update write_ins set endorsements = $2 where id = $1", [w.id, endorsements]);
    if (endorsements.length >= s.config.writeInEndorsements) await approve(tx, s, w);
    await r.bump(tx, s.id);
  });
}

export async function reviewWriteIn(code: string, userId: string, id: string, ok: boolean): Promise<void> {
  const session = await requireHost(code, userId);
  const db = await getDb();
  await db.transaction(async (tx) => {
    const s = (await r.sessionById(tx, session.id, true))!;
    const w = await openWriteIn(tx, s, id);
    if (ok) await approve(tx, s, w);
    else if (w.status === "open") await tx.query("update write_ins set status = 'rejected', reason = 'host' where id = $1", [w.id]);
    await r.bump(tx, s.id);
  });
}

/* ---------- Host editing (U11) ---------- */
export async function regenerateDilemma(code: string, userId: string): Promise<void> {
  const s = await requireHost(code, userId);
  const db = await getDb();
  // Before it is shown: the next dilemma is ready while the group is still in an earlier phase.
  const k = s.phase === "universe_reveal" ? 1 : s.phase === "consequence" ? s.current_k + 1 : 0;
  const d = k ? await r.dilemmaAt(db, s.id, k) : null;
  if (!d || d.status !== "ready") throw new GameError("not_regenerable", 409);
  if (d.source === "default") throw new GameError("built_in", 409);
  await db.query("delete from dilemmas where id = $1", [d.id]);
  await r.bump(db, s.id);
  await dispatch({ kind: "dilemma", sessionId: s.id, k, attempt: await nextAttempt(db, s.id, "dilemma", k) });
}

export async function editDilemma(code: string, userId: string, patch: { title?: string; context?: string; question?: string }): Promise<void> {
  const s = await requireHost(code, userId);
  if (s.phase !== "dilemma_presenting") throw new GameError("invalid_transition", 409);
  const db = await getDb();
  const d = await r.dilemmaAt(db, s.id, s.current_k);
  if (!d) throw new GameError("no_dilemma", 409);
  const next = { ...d.payload };
  for (const key of ["title", "context", "question"] as const) {
    const value = patch[key]?.trim();
    if (!value) continue;
    if (value.length > DILEMMA_LIMITS[key] || !ai.locallyAcceptable(value)) throw new GameError("bad_text");
    next[key] = value;
  }
  await db.query("update dilemmas set payload = $2 where id = $1", [d.id, json(next)]);
  await r.bump(db, s.id);
}

export async function regenerateImage(code: string, userId: string, role: "key_art" | "dilemma"): Promise<void> {
  const s = await requireHost(code, userId);
  const db = await getDb();
  const ref = role === "key_art" ? "key_art" : `dilemma:${s.current_k}`;
  const k = role === "key_art" ? 0 : s.current_k;
  await dispatch({ kind: "image", sessionId: s.id, k, ref, attempt: await nextAttempt(db, s.id, `image:${ref}`, k) });
}

/* ---------- Story playback and sharing ---------- */
export async function setScene(code: string, userId: string, index: number, autoAdvance?: boolean): Promise<void> {
  const s = await requireHost(code, userId);
  if (s.phase !== "story_playback" && s.phase !== "completed") throw new GameError("invalid_transition", 409);
  const db = await getDb();
  const [story] = await db.query<r.StoryRow>("select * from final_stories where session_id = $1", [s.id]);
  // One extra position for the credits.
  const max = story?.scenes.length ?? 0;
  await db.query(
    "update sessions set scene_index = $2, auto_advance = coalesce($3, auto_advance), state_version = state_version + 1 where id = $1",
    [s.id, Math.max(0, Math.min(max, Math.trunc(index) || 0)), autoAdvance ?? null],
  );
}

export async function setShared(code: string, userId: string, shared: boolean): Promise<string | null> {
  const s = await requireHost(code, userId);
  const db = await getDb();
  if (shared && !["story_playback", "completed"].includes(s.phase)) throw new GameError("invalid_transition", 409);
  const slug = s.share_slug ?? randomUUID().replace(/-/g, "").slice(0, 20);
  await db.query("update sessions set shared = $2, share_slug = $3, state_version = state_version + 1 where id = $1", [s.id, shared, slug]);
  return shared ? slug : null;
}

export async function setProfileShared(code: string, userId: string, shared: boolean): Promise<void> {
  const { session: s, player } = await requirePlayer(code, userId);
  const db = await getDb();
  await db.query("update participants set share_profile = $2 where id = $1", [player.id, shared]);
  await r.bump(db, s.id);
}

/** Removes a player's personal data. Their past votes stay as anonymous numbers (§14.3). */
export async function deleteMe(code: string, userId: string): Promise<void> {
  const a = await access(code, userId);
  const p = a.participant;
  if (!p) throw new GameError("not_found", 404);
  const db = await getDb();
  await db.transaction(async (tx) => {
    await tx.query("delete from player_profiles where participant_id = $1", [p.id]);
    await tx.query("delete from selections where participant_id = $1", [p.id]);
    await tx.query("update write_ins set raw_text = '(deleted)' where participant_id = $1", [p.id]);
    await tx.query(
      `update participants set user_id = gen_random_uuid(), nickname = 'Player ' || left(id::text, 4), avatar = '▫️',
         seat_code = gen_random_uuid()::text, kicked_at = now(), is_cohost = false, share_profile = false where id = $1`,
      [p.id],
    );
    await r.bump(tx, a.session.id);
  });
}
