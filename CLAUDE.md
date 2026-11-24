# The Collective Story

Web app where a host and up to 10 players build one story by deciding moral dilemmas together. Every role (host, stage, player, spectator) runs in a browser on a laptop, tablet or phone.

- **Design (source of truth):** `docs/design.md`. Read the relevant § before working on a feature.
- **Plan:** `docs/implementation-plan.md`. **Differences from the design, and what is still open:** `docs/status.md`. Keep it current.

## Map

| Path | What it is |
|---|---|
| `packages/schemas` | Zod schemas shared by AI output, API and UI |
| `packages/engine` | Game rules: phases, votes, rating/tone, scoring, Bible diffs. Pure TypeScript |
| `packages/default-story` | Hardcoded story, templates and title catalog used as the fallback |
| `packages/db` | SQL client: Supabase Postgres, or embedded PGlite when `DATABASE_URL` is fake |
| `packages/ai` | Claude calls, prompts, `withFallback` |
| `packages/media` | Gemini images, placeholder fallback |
| `packages/workflows` | Game service (commands, snapshots) and background jobs (Inngest or inline) |
| `apps/web` | Next.js app |
| `supabase/migrations` | Schema. Applied to both PGlite and Supabase |
| `tools/simulator` | Bot players that run full sessions |

## Commands

`pnpm dev` · `pnpm dev:inngest` (optional) · `pnpm test` · `pnpm e2e` · `pnpm typecheck` · `pnpm lint` · `pnpm simulate --sessions 20 --n 5` · `pnpm build`

The machine is Windows. In Git Bash, put `/c/Program Files/nodejs` and `/c/Users/<user>/AppData/Roaming/npm` on `PATH`. Write long files with the Write tool, because long shell commands fail.

## Rules

1. **Phases are server-authoritative.** Change them only through `packages/workflows`, which checks `engine.canTransition` and calls the `transition_phase` SQL function (optimistic lock on `state_version`).
2. **Browsers never query tables and never call AI providers.** They send commands to the API and read a role-scoped snapshot. Hidden consequences, open votes and other players' profiles must never reach a snapshot that shouldn't have them.
3. **Fallback rule:** every external call goes through `withFallback` (or the media equivalent). With the fake keys in `.env.example` the whole app must stay playable on the default story and placeholder images.
4. All AI output is validated with the Zod schemas, then with the checks in `engine/validate.ts`.
5. `packages/engine` has no I/O. Every rule change needs a unit test.
6. User text (nicknames, titles, write-ins) is data, never instructions: delimit it in prompts and moderate it.
7. Every new table gets RLS enabled with no client policies.

## Out of scope for v1

Narration, music, sound, video export, other decision modes, rate limiting, telemetry. See §22 and §23 of the design. Don't add services the user didn't ask for.

## Before finishing a change

Run `pnpm test`, `pnpm typecheck` and `pnpm lint`. For UI or flow changes also run `pnpm e2e`.
