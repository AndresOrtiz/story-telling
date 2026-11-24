# Status

Last updated: 2026-11-24. Read together with `design.md` and `implementation-plan.md`.

## Built and tested

M0 to M9 of the plan, except for the items under "Not done". With the fake keys, a whole session runs from lobby to PDF and public page on the built-in story.

| Check | Result |
|---|---|
| Unit and integration tests (`pnpm test`) | 79 passing |
| Browser tests, Chromium | 13 passing (10 players + host + stage, full session, phones only, write-ins, pause, late join, seat recovery, privacy, WCAG 2.2 AA, keyboard voting, languages) |
| Device matrix in Chromium, Firefox and WebKit | 12 passing (every role on phone, tablet and laptop) |
| AI failure injected at each step (mocked AI) | Session always finishes, switching at the right dilemma |
| Simulator | 200 concurrent and 20 N=5 sessions, all complete, exactly N dilemmas |

## Not tested, because it needs real credentials

- **Claude and Gemini with real keys.** All AI logic was tested with mocks only. Prompt quality, real latency and real cost per session are unknown.
- **The app against the Supabase database.** The schema is applied to the `story-teller` project (advisors: informational notes only), but the app has only run on the embedded database. Realtime, anonymous sign-in and Storage have not run.
- **TMDB and Google Books.** Open Library works.
- **Inngest.** The endpoint registers its functions. Jobs have only run in-process.
- **Real phones, tablets and Safari.** Only emulated sizes and Playwright's WebKit.
- **A load test over HTTP.** The 200 sessions ran in one process against the embedded database.

## To go live

1. Supabase dashboard, Authentication: enable **anonymous sign-ins** (currently off; until then a signed cookie is used).
2. In `.env.local` (or the host's settings) set real values for `DATABASE_URL` (transaction pooler string), `SUPABASE_SECRET_KEY`, `COOKIE_SECRET`, then `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` and optionally TMDB, Google Books and Inngest.
3. Deploy `apps/web` to Vercel. Without Inngest, jobs run inside the web server and the 30-day cleanup does not run.
4. Run `pnpm simulate --sessions 3` with real keys (costs money) before the first real session.

The migrations were applied through the Supabase connector, which gave them its own version numbers. Before using `supabase db push`, repair the migration history.

## Differences from the design

| Design | Built | Why |
|---|---|---|
| Browsers subscribe to tables; RLS policies per row | Browsers get a role-scoped snapshot from the server and only a "version changed" signal. Tables have RLS on and no client policies | Simpler, and nothing private can leak through a policy |
| Supabase only | Supabase or an embedded Postgres (PGlite) with the same SQL | Playable and testable without credentials |
| Presence | Heartbeats every 15 s | Works the same in both databases |
| Imagen 4 Fast as image fallback | `gemini-3.1-flash-lite-image` | Imagen was shut down in August 2026 |
| Seat code of 4 characters | 8 characters | There is no rate limiter, so it must not be guessable |
| Co-host takes over after 60 s | Co-host always has the host controls | Simpler |
| Built-in story rated Teen | Written to suit every rating, so the rating derived from the selections still holds | A Family pick must never produce Teen content |
| shadcn/ui, TanStack Query, Zustand | Small own components and one hook | Not needed |
| Text streams while it is generated | Typewriter effect on finished text | Simpler |
| The stage link works for the host only | It carries a secret token, so it opens on any device | A TV or tablet is not the host's browser |

## Not done

- Two image candidates with an automatic vision check (§7.2), and speculative branching (§13).
- Optional host accounts, saved sessions and templates. Every session is deleted after 30 days.
- promptfoo evals (§17): without real keys they would measure nothing. The simulator reports validity, exactly-N, rejected diffs, grounding and cost.
- The built-in story and the profile texts exist in English only. The interface has 5 languages, and AI text follows the session language.
- The translations were not reviewed by native speakers.
- The PDF font covers Western European letters only. Emoji are left out.
- Remote repository: CI is configured but has never run.
