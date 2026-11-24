# Implementation Plan — The Collective Story

## Context

`C:\Projects\story-telling` holds only the two design docs (`collective-story-project-initial.md`, `story-telling-final-design.md`) and a JetBrains `.idea/` folder. There is no code, no git repo, and Node/pnpm/Supabase CLI/Docker are not installed (git 2.50 is).

Goal: build the web app specified in `story-telling-final-design.md` (v1.1) in this folder. All roles run in a browser (laptop/tablet/phone). The v1 scope has:
- no audio or video export
- Discussion + final vote as the only decision mode
- content rating and tone derived from the selections
- Claude for text, Gemini for images, Supabase, Inngest

Also set the folder up as a Claude Code project (CLAUDE.md + `.claude/`).

User decisions:
- Install tooling via winget.
- Use a **Supabase cloud dev project** (no Docker).
- Implement **all milestones M0–M9** in sequence.

The design doc is the source of truth. Section refs (§) below point to it.

---

## Step 0 — Prerequisites (machine)

1. `winget install OpenJS.NodeJS.LTS`, then `corepack enable` and `corepack prepare pnpm@latest --activate`.
2. Supabase CLI as a workspace dev dependency (`pnpm add -Dw supabase`, run via `pnpm supabase …`). No global install and no Docker.
3. Create a Supabase cloud project named `collective-story-dev` via the Supabase MCP (`create_project`, free tier, after the cost confirmation). Store its URL and keys in `.env.local`.
4. **Credentials: fake by default.** `.env.local` (and `.env.example`) are created with **obviously fake placeholder values** for every third-party API. Only Supabase gets real values, from the cloud dev project created in step 3, because the app can't run without its database. The user swaps in real keys later.

| Key | Initial value | When the call fails (fake key, network, quota, invalid output) |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` | **Real** (dev project) | Required |
| `ANTHROPIC_API_KEY` | `sk-ant-FAKE-replace-me` | **Default story** (see "Default story fallback") |
| `GEMINI_API_KEY` | `FAKE-gemini-replace-me` | **Placeholder image** |
| `TMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY` | `FAKE-…` | Built-in catalog of ~100 popular titles (+ Open Library, which needs no key) |
| `INNGEST_EVENT_KEY` / `INNGEST_SIGNING_KEY` | `FAKE-…` | The local Inngest dev server ignores them |

Every integration goes through a wrapper that catches the failure, logs it once, and falls back. **The app never crashes or blocks because of an API failure.**

---

## Default story fallback (core requirement, built in M2 and used everywhere)

### Default content
`packages/default-story` holds hardcoded, typed content validated by the same Zod schemas (`packages/schemas`):

- **Universe** "The Last Civilization", from the design's own example (§5 Stage 3): setting, factions, 5 NPCs, world rules, Story Spine, 10 generic personas, inspiration-map text that works for any selection, rating **Teen** and tone "Dark · Grounded".
- **15 dilemmas**, a mix of single and multiple select. Each option has value tags, visible and hidden consequences, and **one hardcoded consequence text per option** (for multi-select: per selected combination group), so the story still reacts to what the group chose.
- **N handling**: for any N from 3 to 15, the default spine picks the first N−1 dilemmas in order, and the last one is always the **climax dilemma** (#15).
- **Final story template**: an opening and ending per ending family, plus one scene per dilemma. Each scene's text is built from the chosen option's consequence. Personas are inserted by name.
- **Analysis**: deterministic scoring already works on the hardcoded value tags. Profile and group texts come from **templates per archetype**, with slots filled by real decisions ("In *The Sealed Gate* you chose …").

### Placeholder images
`apps/web/public/placeholders/` holds static **SVG placeholders**:
- key art
- portrait silhouettes (10)
- one image per default dilemma (15)
- a generic scene image
- a universal "image unavailable" image

They are atmospheric gradients and silhouettes, in 16:9 (portraits 1:1), with the scene title rendered on top. They ship in the repo, so they need no network. Any image generation failure uses a placeholder (dilemma-specific when one exists, otherwise the generic one). The text still comes from AI when it worked.

### Fallback behavior
- `STORY_MODE` env: `auto` (default: try the AI, fall back on failure), `ai`, or `default` (never call the AI). The host console also has a "Use built-in story" toggle.
- **Session-level switch** (keeps the story consistent):
  - If **theme extraction, universe or spine generation** fails → the session switches to the default story (`sessions.content_source = 'default'`).
  - If a **mid-session AI call** fails after one repair retry (dilemma k, consequence k) → the session switches to the default story **from dilemma k on**: default dilemma k (or the climax if k = N) and default consequences. The Stage shows a short banner, "Continuing with the built-in story".
  - If **analysis or final story** generation fails → template texts built on the real recorded votes.
- Search failure → built-in title catalog. Selections still drive the derived rating and tone (the catalog rows carry rating and tone).
- Every fallback is logged in `ai_calls` with `status = 'fallback'`. The host console shows a small "offline content" indicator.

**Result: with the initial fake keys, the whole app (M1–M8) is fully playable end to end** using the default story and placeholder images.

---

## Step 0.5 — Update the design doc (first edit after approval)

Remove the rate limiter (Upstash Redis) and all telemetry (Langfuse, Sentry, PostHog) from `story-telling-final-design.md`. The affected places:
- §2.1: drop the Observability row.
- §8: drop the Rate limiting, LLM observability and Errors/analytics rows. The Testing row becomes promptfoo evals only.
- §9: drop "Rate limiting (Upstash)" and "Langfuse" from the diagram.
- §15: drop the Langfuse/PostHog dashboard line. Cost stays tracked in the `ai_calls` table.
- §17: rename to "Quality and Testing" and remove the Telemetry block. Keep the evals, the simulator and the tests (the evals run with promptfoo).
- §19 M0: drop "Sentry/PostHog".
- TOC: update the §17 entry.

The Gemini quota handling in §7.3 (Inngest concurrency + retry/backoff) is not the Redis rate limiter, so it stays.

## Step 1 — Claude Code project setup (part of M0)

- `git init` with a `.gitignore` covering Node, Next, `.env*` except `.env.example`, `.idea/workspace.xml`, and `.claude/settings.local.json`.
- Move the docs to `docs/` (`docs/design.md` = final design, `docs/initial-concept.md`) and keep this plan as `docs/implementation-plan.md`.
- **`CLAUDE.md` (root)** covers:
  - project summary
  - the pointer "design is `docs/design.md`, read the relevant § before working on a feature"
  - monorepo map
  - commands (`pnpm dev`, `pnpm dev:inngest`, `pnpm test`, `pnpm e2e`, `pnpm db:push`, `pnpm db:types`, `pnpm simulate`)
  - architecture rules: server-authoritative phases, clients never call AI providers, all AI output validated with Zod from `packages/schemas`, `packages/engine` stays pure TS with no I/O, user text is data
  - v1 scope exclusions (no audio/video, single decision mode)
  - **fallback rule**: every external call goes through `withFallback`; with fake keys the app must stay fully playable on the default story and placeholder images
  - the Windows/PowerShell note
  - the testing expectations per change
- **`packages/engine/CLAUDE.md`**: purity rules, and that every rule change needs a unit test.
- **`packages/ai/CLAUDE.md`**:
  - model routing table (§6.4: `claude-opus-5-5`, `claude-sonnet-5-5`, `claude-haiku-5-5`), set in `ai/config.ts`
  - prompt versioning
  - the injection-hardening rules (§6.5)
  - the copyright rules (§14.2)
- **`.claude/settings.json`**: allow-list for `pnpm *`, `git status/diff/log/add/commit`, `npx playwright *` and `pnpm supabase *` read commands. Deny reading `.env*`.
- **`.claude/commands/`**:
  - `milestone.md` (implement the next milestone: read the design §, the plan, tests)
  - `db-migrate.md` (new migration → push → regenerate types)
  - `simulate.md` (run the synthetic-player session)

---

## Repository layout (§18)

```
apps/web/                 Next.js App Router (TS strict, Tailwind, shadcn/ui, Motion, next-intl)
  app/(marketing) host/[code] stage/[code] play/[code] watch/[code] j/[code] s/[slug]
  app/api/inngest  app/api/session/[code]/snapshot  app/api/search
  components/ lib/ (supabase clients, realtime hooks, wake-lock/fullscreen/visibility helpers)
packages/schemas          Zod: config, Bible, Dilemma, Option, ValueTags, BibleDiffOp, Consequence, StoryScene, Profile (§11)
packages/engine           state machine, tallying, final-vote candidates, split index, scoring/archetypes, diff apply, rating/tone derivation
packages/ai               Vercel AI SDK + @ai-sdk/anthropic; prompts/, context assembly, validators, model routing
packages/media            Gemini image client (@google/genai), Imagen fallback, WebP + blurhash (sharp)
packages/default-story    hardcoded universe, 15 dilemmas, consequences, story/analysis templates, title catalog
packages/workflows        Inngest functions (every step wrapped with fallback to default-story / placeholders)
packages/ui               shared components/tokens
supabase/migrations       SQL schema, RLS, RPCs
apps/web/public/placeholders   SVG placeholder images
tools/simulator           synthetic-player CLI
```

Tooling: pnpm workspaces + Turborepo, ESLint, Prettier, Vitest, Playwright, and GitHub Actions (lint, typecheck, unit, e2e on demo mode).

---

## Milestones

Each milestone ends with green tests and a commit. I keep working through the milestones and report at each boundary.

### M0 — Foundations
- Steps 0–1, the monorepo scaffold, Next.js app, Tailwind + shadcn/ui, and the `packages/schemas` skeleton.
- Supabase clients: browser, server and service role. Anonymous auth enabled on the project.
- First migration with **all tables from §10**: `sessions` incl. `content_rating`, `tone`, `derived_from`, `content_source` (`ai`/`default`), `fallback_from_k`; `title_catalog` incl. `rating_level`, `tone`; `vote_rounds.kind` ∈ initial/final/revote; `group_decisions.resolved_by`. Also RLS enabled on every table and generated DB types (`pnpm db:types`).
- CI workflow.
- **Exit:** `pnpm dev` serves a page; `pnpm test` and CI are green; migrations are applied to the cloud project.

### M1 — Rooms & lobby (§3, §5 Stage 1, §12)
- Create session (host config form: N 3–15, max players, language, timer, reveal, personas, write-ins, predictions, spectators, late join. **No rating/tone/mode fields.**)
- 6-char code, `/j/[code]` shortlink, QR (SVG) on Host and Stage.
- `join_session` RPC (capacity, lock, nickname moderation stub, dedupe suffix), anonymous auth, seat recovery code.
- State machine in `packages/engine` (§4.2) and the `transition_phase` RPC with `state_version` optimistic concurrency.
- Realtime: one channel per session for Presence, Postgres Changes on `sessions`, and server Broadcast. Snapshot endpoint and resync on reconnect/visibility.
- Responsive layouts for all four roles (§3.3), the Story view, and browser capability helpers with fallbacks (§3.5: Wake Lock, Fullscreen, Vibration, Web Share, Visibility).
- Kick/rename/lock, co-host promotion, host-away handling.
- **Exit:** Playwright with 10 player contexts + host + stage in mixed viewports. Everyone joins, sees the same lobby and survives a refresh.

### M2 — Default story + game loop (§5 Stages 5–6, U13)
- Build `packages/default-story` (the full content described above) and the SVG placeholders. Add the `STORY_MODE` switch and the fallback wrapper (`withFallback(task, aiFn, defaultFn)`) in `packages/ai`, plus the default-story content provider used whenever `content_source = 'default'`.
- `cast_vote` RPC: validates round open/eligibility, option keys, min/max and exclusivity. Unique per round, abstentions recorded at close.
- RLS keeps votes private until reveal. Counts are broadcast and the timer is server-side via `voting_ends_at` + `timer_sync`.
- Results reveal: percentages (multi-select >100% note), minority positions, split index, named/anonymous.
- **Discussion + final vote** (§5 Stage 6):
  - timed discussion (extend/end)
  - final candidates: top 2–3 options within 1 vote of second place, plus approved write-ins; unanimous first vote skips the final vote; up to 3 compatible combinations for multi-select
  - one revote between tied options, then "let fate decide"
  - persuaded/held-firm recorded
- Nudges, revote, pause. Consequences come from the default story's per-option texts.
- Template-based analysis and final story for the default story, so a whole session (lobby → slideshow) is playable from M2 on. The slideshow player gets its basic version here and is polished in M7.
- **Exit:** a full session in Playwright for N = 3, 5 and 15 with fake keys, plus engine unit tests for tallying, candidates, ties, revote, fate and split index.

### M3 — Selection & universe (§5 Stages 2–3, §6.1, §6.3)
- `/api/search` proxy: Open Library + Google Books + TMDB, cached in `title_catalog`. Manual entry, love-tags and "Surprise me".
- Inngest + local dev server (`pnpm dev:inngest`).
- Workflows:
  - `title.extract` (Haiku): themes, rating level from metadata or AI, tone scores, cached globally
  - `session.synthesize`: incremental theme synthesis
  - **rating/tone derivation** in `engine`: most conservative rating; favorite-weighted average tone, capped by rating
  - `universe.create` (Opus): universe + Story Spine + personas + inspiration map, Zod-validated with one repair retry
- Gemini image client in `packages/media` (§7.3):
  - key art first, then portraits
  - WebP + blurhash to Supabase Storage
  - Imagen 4 Fast fallback, then the **SVG placeholder** fallback
- Universe reveal on Stage: "Rated Teen · Dark and fantastical, based on your selections", the inspiration panel, and the host "make it more family-friendly" option.
- **Exit:** a real universe generated end to end, covered by the "world is forming" interlude.

### M4 — Live narrative engine (§5 Stages 4 & 6, §6, §7)
- `dilemma.prepare` (Sonnet): context assembly (Bible prefix with prompt caching, spine beat, last 2 turns in full, summaries) → Haiku validator (§5 quality rules) → image pipeline.
- `consequence.generate`: narrative, revealed hidden consequences, minority echo and diff. Diff validation and apply in `engine` (append-only `story_bibles`). Then `turn.summarize`.
- Pipelining (§13): the next dilemma starts as soon as the diff commits.
- Host editorial controls: regenerate image or dilemma before it is shown, edit text.
- `ai_calls` cost logging and per-session budget degradation (§15).
- `tools/simulator`: bot players with value profiles run full sessions headless.
- **Exit:** 20+ simulated sessions with schema validity ≈100%, no continuity-validator failures, and exactly N dilemmas each time.

### M5 — Player agency (§5 Stage 5, U4/U5/U8)
- Write-ins: Haiku moderation + canonization into an option card; endorsements or host approval add it to the final vote.
- Predictions, confidence toggle, persona cards + inner monologue, and minority echoes resurfacing in later dilemmas.
- **Exit:** a write-in → final vote → consequence works in E2E with mocked AI.

### M6 — Analysis (§5 Stage 7)
- Deterministic scoring in `engine`: value vectors, `challenge_options`, conformity, minority loyalty, read-the-room, drift, nearest-centroid archetypes.
- Sonnet interpretations that cite real decisions, plus a grounding validator.
- Group report with charts (split index over time, alliances).
- Profiles private by default; opt-in "show mine on screen" and share cards.
- **Exit:** the grounding check passes 100% on simulator runs.

### M7 — Story slideshow (§5 Stage 8)
- `story.generate` (Opus): 8–15 scenes, the ending family chosen from cumulative values, image reuse, and new scene images via Gemini.
- React + Motion player: pan/zoom, crossfade, host next/prev and keyboard, optional auto-advance by reading length, mirrored in the Story view, credits.
- **Exit:** 8–15 scenes stay in sync across the Stage and players.

### M8 — Share & export (U12)
- Public `/s/[slug]` page (unlisted, host opt-in, AI-image notice).
- React-PDF storybook (`story.export`) and per-player OG profile cards.
- **Exit:** the PDF is ready in under 1 min and the public page renders without auth.

### M9 — Hardening (§14, §16, §17)
- Full moderation gates (nicknames, titles, write-ins, image prompts) and the copyright deny-list scan.
- next-intl in 5 languages (EN/ES/PT/FR/DE).
- WCAG 2.2 AA pass, reduced motion and alt text from image briefs.
- promptfoo narrative evals in CI (run only when real keys are configured).
- 30-day retention cleanup cron, player self-delete, and an "update your browser" page.
- Cross-browser Playwright matrix (Chromium/WebKit/Firefox × phone/tablet/desktop), a phones-only session test, and a load test of 200 concurrent simulated sessions.
- Vercel deploy config and production Inngest keys.
- **Exit:** the §20 Definition-of-Done checklist is fully ticked.

---

## Verification (end to end)

- `pnpm test`: engine and schema unit tests (tallying, final-vote candidates, ties, rating/tone derivation, scoring, diff apply).
- **Fallback tests**:
  - with the fake keys from `.env.example`, a full session completes on the default story with placeholder images
  - unit tests inject failures at each AI step (universe, dilemma k, consequence k, analysis, story) and assert the session switches to the default content from the right point, with no crash
- `pnpm e2e`: Playwright multi-context session with fake keys (host + stage + 10 players, mixed viewports, reconnect/kill-tab), plus a phones-only run.
- `pnpm simulate --sessions 20 --n 5`: runs on the default story with fake keys. Once real keys are added, it becomes the real-AI quality run that reports schema validity, continuity, exactly-N, grounding and cost per session.
- Manual: `pnpm dev` + `pnpm dev:inngest`. Open `/host` on a laptop and `/stage` in a second window, and join from a real phone on the LAN via QR. Play a full N=3 session through to the slideshow and PDF.
- Supabase MCP `get_advisors` (security/performance) after each migration milestone to catch RLS gaps.
