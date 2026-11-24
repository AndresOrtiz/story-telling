import * as ai from "@cs/ai";
import {
  applyDiff,
  createBible,
  deriveRating,
  deriveTone,
  groupValues,
  lowerRating,
  capTone,
  pickEnding,
  scoreGroup,
  scorePlayer,
  type TitleSignal,
} from "@cs/engine";
import * as builtin from "@cs/default-story";
import { createImage, imagePrompt, placeholders, type Reference } from "@cs/media";
import type { Bible, ImageBrief, Universe } from "@cs/schemas";
import { getDb, json, type Sql } from "@cs/db";
import { dispatch, registerHandlers, type Job } from "./dispatch.ts";
import { nextAttempt, revealUniverse, settle } from "./flow.ts";
import { decisionsOf, memoryOf, turnsOf } from "./history.ts";
import * as r from "./rows.ts";
import { loadReference, store } from "./store.ts";

const budget = () => Number(process.env.SESSION_BUDGET_USD || 3);

async function spent(q: Sql, sessionId: string): Promise<number> {
  const [row] = await q.query<{ usd: number }>(
    `select (coalesce((select sum(cost_usd) from ai_calls where session_id = $1), 0)
           + coalesce((select sum(cost_usd) from assets where session_id = $1), 0))::float8 as usd`,
    [sessionId],
  );
  return row!.usd;
}

/** Text AI for a session. Every call is logged; nothing is called once the session uses the built-in story. */
export async function aiContext(s: r.SessionRow | null, force = false): Promise<ai.CallContext> {
  const db = await getDb();
  const usable =
    !force && (!s || (s.content_source === "ai" && !s.config.builtInStory && (await spent(db, s.id)) < budget()));
  return {
    enabled: usable,
    log: async (e) => {
      await db.query(
        `insert into ai_calls (session_id, task, model, input_tokens, output_tokens, cached_tokens, latency_ms, cost_usd, status, error)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
        [s?.id ?? null, e.task, e.model, e.inputTokens, e.outputTokens, e.cachedTokens, e.latencyMs, e.costUsd, e.status, e.error ?? null],
      );
    },
  };
}

async function session(id: string): Promise<r.SessionRow> {
  const s = await r.sessionById(await getDb(), id);
  if (!s) throw new Error("Session is gone");
  return s;
}

const frameOf = (s: r.SessionRow): ai.StoryFrame => ({
  language: s.config.language,
  rating: s.content_rating ?? "teen",
  tone: s.tone ?? { hopefulDark: 0, groundedFantastical: 0 },
  n: s.dilemma_count,
});

async function logFallback(s: r.SessionRow, task: string, error = "") {
  const db = await getDb();
  await db.query("insert into ai_calls (session_id, task, model, status, error) values ($1, $2, 'built-in', 'fallback', $3)", [s.id, task, error]);
}

/** From dilemma k on, this session uses the built-in story. */
async function switchToDefault(s: r.SessionRow, k: number) {
  const db = await getDb();
  await logFallback(s, "session");
  await db.query(
    "update sessions set content_source = 'default', fallback_from_k = coalesce(fallback_from_k, $2), state_version = state_version + 1 where id = $1",
    [s.id, k],
  );
}

async function denyList(q: Sql, sessionId: string): Promise<string[]> {
  const rows = await q.query<{ terms: string[] | null }>(
    `select distinct t.themes -> 'forbidden_terms' as terms from selections s join title_catalog t on t.id = s.title_id where s.session_id = $1`,
    [sessionId],
  );
  return rows.flatMap((x) => x.terms ?? []);
}

/* ---------- Images ---------- */
type ImageJob = {
  role: string;
  brief: ImageBrief;
  alt: string;
  placeholder: string;
  characterIds?: string[];
  locationId?: string;
  aspect?: "16:9" | "1:1";
};

async function illustrate(s: r.SessionRow, bible: Pick<Bible, "universe" | "characters" | "locations">, job: ImageJob, enabled = true): Promise<string> {
  const db = await getDb();
  const canPay = (await spent(db, s.id)) < budget();
  const people = bible.characters.filter((c) => job.characterIds?.includes(c.id)).slice(0, 3);
  const references: Reference[] = [];
  if (enabled && canPay && people.length) {
    const assets = new Map((await r.assetsByRole(db, s.id)).map((a) => [a.role, a]));
    for (const c of people) {
      const url = assets.get(`portrait:${c.id}`)?.url;
      const ref = url ? await loadReference(url) : null;
      if (ref) references.push(ref);
    }
  }
  const prompt = imagePrompt(bible.universe, job.brief, {
    characters: people.map((c) => `${c.name}: ${c.visual_descriptor}`),
    location: bible.locations.find((l) => l.id === job.locationId)?.visual_descriptor,
    rating: s.content_rating ?? "teen",
  });
  // The prompt is derived from generated text, so it is checked too (§14.1).
  const safe = ai.locallyAcceptable(prompt);
  const image = await createImage({
    enabled: enabled && safe && canPay && s.content_source === "ai" && !s.config.builtInStory,
    prompt,
    references,
    aspect: job.aspect,
    path: `${s.id}/${job.role.replace(/[^a-z0-9-]/gi, "-")}-${Date.now()}`,
    store,
    placeholder: job.placeholder,
  });
  const [row] = await db.query<{ id: string }>(
    `insert into assets (session_id, role, kind, url, alt, blurhash, width, height, provider, prompt, cost_usd)
     values ($1, $2, 'image', $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
    [s.id, job.role, image.url, job.alt.slice(0, 300), image.blurhash, image.width, image.height, image.provider, prompt, image.costUsd],
  );
  return row!.id;
}

/* ---------- Stage 2: titles ---------- */
async function extractTitle(titleId: string, s: r.SessionRow | null): Promise<r.TitleRow> {
  const db = await getDb();
  const [title] = await db.query<r.TitleRow>("select * from title_catalog where id = $1", [titleId]);
  if (!title) throw new Error("Unknown title");
  if (title.themes && title.themes_version === ai.PROMPT_VERSION) return title;
  const ctx = await aiContext(s);
  try {
    const themes = await ai.extractThemes(ctx, { title: title.title, kind: title.kind, year: title.year, rating: title.rating_level });
    const [row] = await db.query<r.TitleRow>(
      `update title_catalog set themes = $2, themes_version = $3, tone = $4,
         rating_level = coalesce(rating_level, $5), rating_source = coalesce(rating_source, 'ai')
       where id = $1 returning *`,
      [titleId, json(themes), ai.PROMPT_VERSION, json(themes.tone), themes.rating],
    );
    return row!;
  } catch {
    return title;
  }
}

/* ---------- Stage 3: universe ---------- */
async function universe(job: Job & { attempt: number }) {
  const db = await getDb();
  let s = await session(job.sessionId);
  const selections = await db.query<{ title_id: string; is_favorite: boolean; love_tags: string[] }>(
    "select title_id, is_favorite, love_tags from selections where session_id = $1",
    [s.id],
  );
  const titles = job.forceDefault
    ? await db.query<r.TitleRow>("select t.* from title_catalog t join selections x on x.title_id = t.id where x.session_id = $1", [s.id])
    : await Promise.all([...new Set(selections.map((x) => x.title_id))].map((id) => extractTitle(id, s)));
  const byId = new Map(titles.map((t) => [t.id, t]));
  const picked = selections.flatMap((x) => {
    const t = byId.get(x.title_id);
    return t ? [{ ...x, t }] : [];
  });

  // Rating and tone come from the selections, whatever happens with the AI.
  const signals: TitleSignal[] = picked.map(({ t, is_favorite }) => {
    const known = builtin.findInCatalog(t.title);
    return {
      title: t.title,
      rating: t.rating_level ?? known?.rating ?? "teen",
      tone: t.tone ?? known?.tone ?? { hopefulDark: 0, groundedFantastical: 0 },
      favorite: is_favorite,
    };
  });
  const derived = deriveRating(signals);
  const rating = s.rating_lowered ? lowerRating(derived) : derived;
  const tone = capTone(deriveTone(signals, rating), rating);
  await db.query("update sessions set content_rating = $2, tone = $3, derived_from = $4 where id = $1", [
    s.id,
    rating,
    json(tone),
    json(signals),
  ]);
  s = await session(s.id);

  const players = await r.activePlayers(db, s.id);
  const ctx = await aiContext(s, job.forceDefault);
  const withThemes = picked.filter((p) => p.t.themes);
  const { value, source } = await ai.withFallback(
    async () => {
      if (withThemes.length === 0) throw new ai.AiUnavailable("No themes");
      const synthesis = await ai.synthesizeThemes(
        ctx,
        withThemes.map((p) => ({ themes: p.t.themes!, favorite: p.is_favorite, loveTags: p.love_tags })),
      );
      return ai.createUniverse(ctx, frameOf(s), {
        synthesis,
        players: players.length,
        sources: [...new Set(picked.map((p) => p.t.title))],
        deny: await denyList(db, s.id),
      });
    },
    () => {
      const base = builtin.defaultUniverse(s.dilemma_count);
      const sources = [...new Set(picked.map((p) => p.t.title))].slice(0, 6);
      const became = base.universe.inspiration;
      return {
        ...base,
        universe: {
          ...base.universe,
          inspiration: sources.length
            ? sources.map((source, i) => ({ source, became: became[i % became.length]!.became }))
            : became,
        },
      };
    },
  );

  const newest = (await nextAttempt(db, s.id, "universe", 0)) - 1;
  if (newest !== job.attempt) return;
  if (source === "default" && s.content_source === "ai") {
    await switchToDefault(s, 0);
    s = await session(s.id);
  }
  const bible = createBible(value);
  const [{ v }] = (await db.query<{ v: number }>("select coalesce(max(version), 0)::int + 1 as v from story_bibles where session_id = $1", [s.id])) as [{ v: number }];
  await db.query("insert into story_bibles (session_id, version, bible) values ($1, $2, $3)", [s.id, v, json(bible)]);

  await db.query("delete from characters where session_id = $1", [s.id]);
  for (const c of value.universe.characters) {
    await db.query("insert into characters (session_id, bible_key, name, kind) values ($1, $2, $3, 'npc')", [s.id, c.id, c.name]);
  }
  for (const [i, p] of players.entries()) {
    const persona = s.config.personas ? value.universe.personas[i] : undefined;
    await db.query("update participants set persona_key = $2 where id = $1", [p.id, persona?.id ?? null]);
    if (persona) {
      await db.query(
        `insert into characters (session_id, bible_key, name, kind, participant_id) values ($1, $2, $3, 'persona', $4)
         on conflict (session_id, bible_key) do nothing`,
        [s.id, `persona-${persona.id}`, persona.name, p.id],
      );
    }
  }

  await Promise.all([
    illustrate(s, bible, {
      role: "key_art",
      brief: value.universe.key_art,
      alt: `${value.universe.name}. ${value.universe.key_art.moment}`,
      placeholder: placeholders.keyArt,
    }),
    ...value.universe.characters.map((c, i) =>
      illustrate(s, bible, {
        role: `portrait:${c.id}`,
        brief: { moment: `Portrait of ${c.name}, ${c.visual_descriptor}`, emotion: c.motivation, composition: "centered head and shoulders" },
        alt: `${c.name}, ${c.role}`,
        placeholder: placeholders.portrait(i + 5),
        aspect: "1:1",
      }),
    ),
  ]);
  await revealUniverse(s.id);
  if (s.config.personas) await dispatch({ kind: "portraits", sessionId: s.id, k: 0, attempt: job.attempt });
  await dispatch({ kind: "dilemma", sessionId: s.id, k: 1, attempt: await nextAttempt(db, s.id, "dilemma", 1) });
}

async function portraits(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const bible = (await r.latestBible(db, s.id))!.bible;
  const players = await r.activePlayers(db, s.id);
  await Promise.all(
    players.map(async (p, i) => {
      const persona = bible.universe.personas.find((x) => x.id === p.persona_key);
      if (!persona) return;
      const id = await illustrate(s, bible, {
        role: `persona:${persona.id}`,
        brief: { moment: `Portrait of ${persona.name}, ${persona.role}`, emotion: persona.bond, composition: "centered head and shoulders" },
        alt: `${persona.name}, ${persona.role}`,
        placeholder: placeholders.portrait(i),
        aspect: "1:1",
      });
      await db.query("update characters set portrait_asset_id = $3 where session_id = $1 and bible_key = $2", [s.id, `persona-${persona.id}`, id]);
    }),
  );
  await r.bump(db, s.id);
}

/* ---------- Stage 4: dilemmas ---------- */
async function dilemma(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const existing = await r.dilemmaAt(db, s.id, job.k);
  if (existing && existing.status !== "generating") return settle(s.id);
  const current = await r.latestBible(db, s.id);
  if (!current) throw new Error("No bible");
  const history = await memoryOf(db, s.id);
  const last = history.at(-1);
  const ctx = await aiContext(s, job.forceDefault);
  const { value, source } = await ai.withFallback(
    async () =>
      ai.generateDilemma(ctx, frameOf(s), { bible: current.bible, k: job.k, history, deny: await denyList(db, s.id) }),
    () => builtin.defaultDilemma(job.k, s.dilemma_count, last ? { title: last.title, labels: last.decision } : null),
  );

  // The universe may have been regenerated meanwhile; then this dilemma belongs to a story that no longer exists.
  const still = await r.latestBible(db, s.id);
  if (still?.version !== current.version) return;
  if (source === "default" && s.content_source === "ai") await switchToDefault(s, job.k);

  const inserted = await db.transaction(async (tx) => {
    const [row] = await tx.query<{ id: string }>(
      `insert into dilemmas (session_id, k, source, payload, format, min_select, max_select)
       values ($1, $2, $3, $4, $5, $6, $7) on conflict (session_id, k) do nothing returning id`,
      [s.id, job.k, source, json(value), value.format, value.min_select, value.max_select],
    );
    if (!row) return null;
    for (const o of value.options) {
      await tx.query(
        `insert into dilemma_options (dilemma_id, key, label, description, visible_consequence, hidden_consequence, value_tags)
         values ($1, $2, $3, $4, $5, $6, $7)`,
        [row.id, o.key, o.label, o.description, o.visible_consequence, o.hidden_consequence, json(o.value_tags)],
      );
    }
    return row.id;
  });
  const id = inserted ?? (await r.dilemmaAt(db, s.id, job.k))?.id;
  if (!id) return;
  const asset = await illustrate(await session(s.id), current.bible, {
    role: `dilemma:${job.k}`,
    brief: value.image,
    alt: value.alt_text,
    placeholder: source === "default" ? placeholders.dilemma(builtin.defaultIndex(job.k, s.dilemma_count)) : placeholders.scene,
    characterIds: value.featured_character_ids,
    locationId: value.location_id,
  });
  await db.query("update dilemmas set image_asset_id = $2, status = 'ready' where id = $1 and status = 'generating'", [id, asset]);
  await r.bump(db, s.id);
  await settle(s.id);
}

/* ---------- Stage 6: consequences ---------- */
async function consequence(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const turns = await turnsOf(db, s.id);
  const turn = turns.find((t) => t.dilemma.k === job.k);
  if (!turn) throw new Error("No decision yet");
  if (turn.consequence) return settle(s.id);
  const current = (await r.latestBible(db, s.id))!;
  const chosen = turn.options.filter((o) => turn.decision.option_keys.includes(o.key));
  const byFate = turn.decision.resolved_by === "fate";
  const ctx = await aiContext(s, job.forceDefault);
  const { value, source } = await ai.withFallback(
    async () => {
      if (turn.dilemma.source !== "ai") throw new ai.AiUnavailable("Built-in dilemma");
      return ai.generateConsequence(ctx, frameOf(s), {
        bible: current.bible,
        k: job.k,
        dilemma: turn.dilemma.payload,
        chosen: chosen.map((o) => ({ key: o.key, label: o.label, hidden: o.hidden_consequence })),
        minority: turn.minority.map(({ label, votes }) => ({ label, votes })),
        byFate,
        history: (await memoryOf(db, s.id)).filter((h) => h.k < job.k),
        deny: await denyList(db, s.id),
      });
    },
    () =>
      builtin.defaultConsequence({
        k: job.k,
        n: s.dilemma_count,
        dilemma: turn.dilemma.payload,
        chosen: chosen.map((o) => ({
          key: o.key,
          label: o.label,
          origin: o.origin,
          visible: o.visible_consequence,
          hidden: o.hidden_consequence,
        })),
        minorityLabels: turn.minority.map((m) => m.label),
        byFate,
      }),
  );
  if (source === "default" && s.content_source === "ai") await switchToDefault(s, job.k);

  const { bible, rejected } = applyDiff(current.bible, value.diff, job.k);
  const own = source === "ai" && (s.dilemma_count <= 8 || job.k % 2 === 1);
  const asset = own
    ? await illustrate(s, bible, {
        role: `consequence:${job.k}`,
        brief: value.image,
        alt: value.image.moment,
        placeholder: placeholders.scene,
        characterIds: turn.dilemma.payload.featured_character_ids,
        locationId: turn.dilemma.payload.location_id,
      })
    : turn.dilemma.image_asset_id;
  await db.transaction(async (tx) => {
    const [row] = await tx.query(
      `insert into consequences (dilemma_id, narrative, revealed_hidden, minority_echo, diff, rejected, image_asset_id, bible_version)
       values ($1, $2, $3, $4, $5, $6, $7, $8) on conflict (dilemma_id) do nothing returning id`,
      [
        turn.dilemma.id,
        value.narrative,
        json(chosen.map((o) => ({ key: o.key, label: o.label, text: o.hidden_consequence }))),
        value.minority_echo,
        json(value.diff),
        json(rejected),
        asset,
        current.version + 1,
      ],
    );
    if (!row) return;
    await tx.query("insert into story_bibles (session_id, version, bible) values ($1, $2, $3)", [s.id, current.version + 1, json(bible)]);
    await tx.query("insert into turn_summaries (session_id, k, summary) values ($1, $2, $3) on conflict do nothing", [s.id, job.k, value.summary]);
  });
  await settle(s.id);
}

/* ---------- Stage 7: analysis ---------- */
async function analysis(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const turns = await turnsOf(db, s.id);
  const records = turns.map((t) => t.record);
  const players = await r.activePlayers(db, s.id);
  const bible = (await r.latestBible(db, s.id))!.bible;
  const writeIns = await db.query<r.WriteInRow>(
    "select w.* from write_ins w join dilemmas d on d.id = w.dilemma_id where d.session_id = $1 and w.status <> 'rejected'",
    [s.id],
  );
  const ctx = await aiContext(s, job.forceDefault);

  await Promise.all(
    players.map(async (p) => {
      const scores = scorePlayer(p.id, records, {
        writeIns: writeIns.filter((w) => w.participant_id === p.id).length,
        endorsements: writeIns.filter((w) => w.endorsements.includes(p.id)).length,
      });
      const decisions = decisionsOf(turns, p.id);
      const persona = bible.universe.personas.find((x) => x.id === p.persona_key);
      const { value } = await ai.withFallback(
        () => {
          if (decisions.length === 0) throw new ai.AiUnavailable("No votes to interpret");
          return ai.writeProfile(ctx, frameOf(s), {
            nickname: p.nickname,
            persona: persona ? `${persona.name}, ${persona.role}` : null,
            archetype: builtin.ARCHETYPE_TEXT[scores.archetype].name,
            scores,
            decisions,
          });
        },
        () => builtin.defaultProfile(scores, decisions),
      );
      await db.query(
        `insert into player_profiles (session_id, participant_id, scores, archetype, secondary_archetype, narrative)
         values ($1, $2, $3, $4, $5, $6) on conflict (participant_id) do nothing`,
        [s.id, p.id, json(scores), scores.archetype, scores.secondary, json(value)],
      );
    }),
  );

  const metrics = scoreGroup(
    players.map((p) => p.id),
    records,
  );
  const { value: group } = await ai.withFallback(
    () =>
      ai.writeGroup(ctx, frameOf(s), {
        metrics,
        names: Object.fromEntries(players.map((p) => [p.id, p.nickname])),
        turns: turns.map((t) => ({
          k: t.dilemma.k,
          title: t.dilemma.payload.title,
          decision: t.labels,
          split: t.decision.split_index,
          resolvedBy: t.decision.resolved_by,
        })),
      }),
    () => builtin.defaultGroup(metrics, Object.fromEntries(turns.map((t) => [t.dilemma.k, t.dilemma.payload.title]))),
  );
  await db.query("insert into group_analyses (session_id, metrics, narrative) values ($1, $2, $3) on conflict do nothing", [
    s.id,
    json(metrics),
    json(group),
  ]);
  await r.bump(db, s.id);
  await settle(s.id);
  // The story is written while the group looks at the analysis.
  await dispatch({ kind: "story", sessionId: s.id, k: 0 });
}

/* ---------- Stage 8: story ---------- */
async function story(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const turns = await turnsOf(db, s.id);
  const players = await r.activePlayers(db, s.id);
  const profiles = await db.query<r.ProfileRow>("select * from player_profiles where session_id = $1", [s.id]);
  const bible = (await r.latestBible(db, s.id))!.bible;
  const ending = pickEnding(bible.spine.endings, groupValues(turns.map((t) => t.record)));
  const ctx = await aiContext(s, job.forceDefault);
  const cast = players.map((p) => {
    const persona = bible.universe.personas.find((x) => x.id === p.persona_key);
    const profile = profiles.find((x) => x.participant_id === p.id);
    return {
      nickname: p.nickname,
      persona: persona?.name ?? null,
      archetype: profile?.archetype ?? "wildcard",
      legacy: profile?.narrative.legacy ?? "",
    };
  });
  const { value, source } = await ai.withFallback(
    async () =>
      ai.writeStory(ctx, frameOf(s), {
        bible,
        ending,
        turns: turns.map((t) => ({
          k: t.dilemma.k,
          title: t.dilemma.payload.title,
          decision: t.labels,
          consequence: t.consequence?.narrative ?? "",
        })),
        players: cast,
        deny: await denyList(db, s.id),
      }),
    () =>
      builtin.defaultStory({
        universe: bible.universe,
        endingId: ending.id,
        endingPremise: ending.premise,
        turns: turns.map((t) => ({
          k: t.dilemma.k,
          title: t.dilemma.payload.title,
          labels: t.labels,
          narrative: t.consequence?.narrative ?? "",
          dilemma: t.dilemma.payload,
        })),
        personas: cast.map((c) => ({ player: c.nickname, persona: c.persona ?? "one of the ten", legacy: c.legacy })),
      }),
  );

  const assets = new Map((await r.assetsByRole(db, s.id)).map((a) => [a.role, a]));
  const keyArt = assets.get("key_art");
  let fresh = 0;
  const scenes: r.StoredScene[] = await Promise.all(
    value.scenes.map(async (scene, i) => {
      const reuse = scene.source_k ? (assets.get(`consequence:${scene.source_k}`) ?? assets.get(`dilemma:${scene.source_k}`)) : null;
      if (reuse) return { ...scene, url: reuse.url, alt: reuse.alt };
      if (source === "ai" && i > 0 && fresh++ < 4) {
        const id = await illustrate(s, bible, { role: `scene:${i}`, brief: scene.image, alt: scene.image.moment, placeholder: keyArt?.url ?? placeholders.scene });
        const a = (await r.assetById(db, id))!;
        return { ...scene, url: a.url, alt: a.alt };
      }
      return { ...scene, url: keyArt?.url ?? placeholders.keyArt, alt: keyArt?.alt ?? scene.headline };
    }),
  );
  await db.query(
    "insert into final_stories (session_id, title, logline, ending_id, scenes, epilogue) values ($1, $2, $3, $4, $5, $6) on conflict do nothing",
    [s.id, value.title, value.logline, ending.id, json(scenes), json(value.epilogue)],
  );
  await r.bump(db, s.id);
  await settle(s.id);
}

/* ---------- Write-ins and host image regeneration ---------- */
async function writeIn(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const [w] = await db.query<r.WriteInRow>("select * from write_ins where id = $1", [job.ref]);
  const d = await r.dilemmaAt(db, s.id, job.k);
  if (!w || !d || w.status !== "checking") return;
  const bible = (await r.latestBible(db, s.id))!.bible;
  const ctx = await aiContext(s, job.forceDefault);
  const { value } = await ai.withFallback(
    () => ai.checkWriteIn(ctx, frameOf(s), { bible, dilemma: d.payload, text: w.raw_text }),
    () => builtin.defaultWriteIn(w.raw_text),
  );
  await db.query("update write_ins set status = $2, reason = $3, option = $4 where id = $1 and status = 'checking'", [
    w.id,
    value.allowed ? "open" : "rejected",
    value.reason,
    json(value.option),
  ]);
  await r.bump(db, s.id);
}

async function regenerateImage(job: Job) {
  const db = await getDb();
  const s = await session(job.sessionId);
  const bible = (await r.latestBible(db, s.id))!.bible;
  const u: Universe = bible.universe;
  const role = job.ref!;
  if (role === "key_art") {
    await illustrate(s, bible, { role, brief: u.key_art, alt: u.key_art.moment, placeholder: placeholders.keyArt });
  } else if (role === `dilemma:${job.k}`) {
    const d = await r.dilemmaAt(db, s.id, job.k);
    if (!d) return;
    const id = await illustrate(s, bible, {
      role,
      brief: d.payload.image,
      alt: d.payload.alt_text,
      placeholder: d.source === "default" ? placeholders.dilemma(builtin.defaultIndex(job.k, s.dilemma_count)) : placeholders.scene,
      characterIds: d.payload.featured_character_ids,
      locationId: d.payload.location_id,
    });
    await db.query("update dilemmas set image_asset_id = $2 where id = $1", [d.id, id]);
  }
  await r.bump(db, s.id);
}

registerHandlers({
  title: async (job) => void (await extractTitle(job.ref!, await session(job.sessionId))),
  universe,
  portraits,
  dilemma,
  consequence,
  analysis,
  story,
  writein: writeIn,
  image: regenerateImage,
});
