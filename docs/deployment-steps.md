# Deployment steps: from local to Vercel

Written 2026-11-24 against branch `build/v1`. Follow the phases in order. Dashboards change, so menu names may differ slightly.

**Who does what:** 👤 = you (accounts, payments, dashboards). 💻 = code change that can be done in this repository.

## Contents

1. [Where we are today](#1-where-we-are-today)
2. [Task checklist](#2-task-checklist)
3. [Accounts to create](#3-accounts-to-create)
4. [Code changes (done)](#4-code-changes-done)
5. [Get the keys](#5-get-the-keys)
6. [Prepare Supabase](#6-prepare-supabase)
7. [Test locally with the real services](#7-test-locally-with-the-real-services)
8. [Push to GitHub](#8-push-to-github)
9. [Create the Vercel project](#9-create-the-vercel-project)
10. [Connect Inngest](#10-connect-inngest)
11. [Verify the deployment](#11-verify-the-deployment)
12. [Open it to players](#12-open-it-to-players)
13. [Environment variable reference](#13-environment-variable-reference)
14. [Troubleshooting](#14-troubleshooting)
15. [Design components: what is deployed and what is not](#15-design-components-what-is-deployed-and-what-is-not)

---

## 1. Where we are today

| Item | State | How we know |
|---|---|---|
| App on the built-in story | Works locally | `docs/status.md` |
| Unit tests, typecheck, lint, production build | Pass | Run 2026-11-24 (122 tests) |
| Browser tests (`pnpm e2e`) | Pass | Run 2026-11-24 (25 tests) |
| Local database | Embedded Postgres in `.data/pglite` | Folder exists |
| Supabase project `story-teller` | Active, region **us-east-2** (Ohio), Postgres 17 | Checked 2026-11-24 |
| Supabase schema | 21 tables, all with RLS on; public `media` bucket; the `sessions_announce` Realtime trigger; no sessions yet | Checked 2026-11-24 |
| Anonymous sign-ins | Off | `docs/status.md`, not re-checked |
| GitHub | No remote. `main` has only the documents; all code is on `build/v1`, part of it uncommitted | `git` |
| Vercel, Inngest | Nothing in the repository or in this guide's checks shows they exist | |
| Claude with a real key | Every text step works on its own; a full session is still to be played | `docs/status.md` |
| Gemini, Google Books with real keys | Never run | `docs/status.md` |
| App against Supabase | Connects. Lobby and selection worked; a hang when creating the universe was fixed (`max_pipeline: 1` in `packages/db`). A full session is still to be played | Checked 2026-11-24 |

`.env.local` was not opened while writing this guide.

## 2. Task checklist

**Accounts (§3)**
- [ ] 👤 GitHub
- [ ] 👤 Vercel
- [ ] 👤 Claude Console, with credits
- [ ] 👤 Google AI Studio, with billing
- [ ] 👤 Google Cloud project for Google Books
- [ ] 👤 TMDB
- [ ] 👤 Inngest
- [x] 👤 Supabase (project `story-teller` exists)

**Code (§4)**
- [x] 💻 C1 Inngest concurrency fits the plan
- [x] 💻 C2 Every job fits the time limit
- [x] 💻 C3 Show AI errors
- [x] 💻 C4 Better AI retries
- [x] 💻 C5 TMDB logo
- [ ] 👤 Review and commit the changes

**Keys and Supabase (§5, §6)**
- [ ] 👤 Collect 8 service values, and generate `COOKIE_SECRET` and `HOST_PASSWORD`
- [ ] 👤 Set spend limits for Claude and Gemini
- [ ] 👤 Enable anonymous sign-ins and check Realtime

**Test and deploy (§7 to §12)**
- [ ] 👤 Short AI simulation
- [ ] 👤 Full local session on Supabase
- [ ] 👤 Push to GitHub, CI green, merge to `main`
- [ ] 👤 Create the Vercel project, add variables, deploy
- [ ] 👤 Test the deployment **without** Inngest
- [ ] 👤 Connect Inngest, redeploy and sync
- [ ] 👤 Full AI session on the deployment, with real devices
- [ ] 👤 Decide who can reach the app, then share it

---

## 3. Accounts to create

| # | Account | Where | Used for | What to know |
|---|---|---|---|---|
| 1 | GitHub | https://github.com | Code and CI | Use a **private** repository |
| 2 | Vercel | https://vercel.com | Runs the app | Sign up with GitHub. Hobby is for personal, non-commercial use only. Functions stop at 300 s on Hobby and can be raised to 800 s on Pro |
| 3 | Supabase | https://supabase.com | Database, sign-in, Realtime, image storage | Exists. Free projects are paused after about 7 days of low activity; paid ones are not |
| 4 | Inngest | https://app.inngest.com | Background jobs, daily cleanup | Needed for AI stories on Vercel (§10). The free plan allows 5 concurrent steps |
| 5 | Claude Console | https://platform.claude.com | Story text and moderation | Pay per use. Add credits |
| 6 | Google AI Studio | https://aistudio.google.com | Images | No free tier for these image models. Minimum prepayment about $5 |
| 7 | Google Cloud | https://console.cloud.google.com | Google Books search | Can be the same Google account as AI Studio |
| 8 | TMDB | https://www.themoviedb.org | Movie and series search | Commercial use needs a written agreement with TMDB |

Open Library needs no account or key.

**Cost to expect:** 5 dilemmas with 5 players makes up to 26 images at $0.0336, or about **$0.87**, plus Claude usage that has not been measured. `SESSION_BUDGET_USD` (default 3) stops new AI work once a session's recorded spend reaches it.

---

## 4. Code changes (done)

All five are built and covered by tests. The Claude steps ran once each with a real key; Gemini and Inngest have not run yet.

| # | What it does now | Where |
|---|---|---|
| **C1** | At most 5 jobs run at once (`INNGEST_CONCURRENCY`), and at most 4 per session. Inngest rejects the **whole app** when this is above the plan's limit. A job that waits in the queue is not sent again and again | `packages/workflows/src/index.ts`, `dispatch.ts` |
| **C2** | Every job, not only the universe, stops its AI work before Vercel's 300 s: text at 215 s and images at 275 s. Saving to the database and storage comes on top. A retry only starts if it can finish. Without time, the built-in text or a placeholder image is used | `dispatch.ts`, `packages/ai/src/generate.ts`, `packages/media/src/index.ts` |
| **C3** | AI failures appear in the server log, and the reason is stored in `ai_calls.error`. The log has the provider's error message or the names of the wrong fields, not prompts, answers or player text | `packages/ai/src/errors.ts`, `generate.ts`, `packages/workflows/src/jobs.ts` |
| **C4** | The retry shows Claude its rejected answer and the exact problems, for example `universe.logline: Too big`. Tokens of rejected answers count toward the session budget | `packages/ai/src/generate.ts`, `errors.ts` |
| **C5** | The official TMDB logo is next to the notice, on the player and Stage selection screens. Don't edit `apps/web/public/tmdb.svg`: TMDB does not allow changes | `apps/web/components/ui.tsx` |

### What you may need to adjust

- **Paid Inngest plan:** set `INNGEST_CONCURRENCY` to a number within your plan. It is about jobs at the same time, so it matters when several rooms play at once.
- **The universe needs more than 215 s** (check in §7.2): on Vercel Pro, raise these four values **together**, keeping this order: `TEXT_MS` < `JOB_MS` (`packages/workflows/src/dispatch.ts`) < `maxDuration` (`apps/web/app/api/inngest/route.ts`) <= `STUCK_MS` (`packages/workflows/src/flow.ts`). Otherwise the app restarts jobs that are still working. Also raise the timeout of `universe.create` (240 s) in `packages/ai/src/config.ts`. On Hobby, 300 s is the maximum.

---

## 5. Get the keys

Keep the values in a password manager. Never commit them, paste them in chats, or give any of them a `NEXT_PUBLIC_` name except the two Supabase values listed below.

### 5.1 Claude: `ANTHROPIC_API_KEY`
1. In the Claude Console, add a payment method and credits.
2. Create a **workspace** for this app, for example `collective-story`. Spend limits cannot be set on the default workspace.
3. Set a monthly **spend limit** on that workspace.
4. Create an **API key** in that workspace and copy it (`sk-ant-...`).

### 5.2 Gemini: `GEMINI_API_KEY`
1. In AI Studio open **API keys** and create a key.
2. Choose **Set up billing** and add prepaid credit.
3. On the **Spend** page set a **monthly spend cap**.

### 5.3 Google Books: `GOOGLE_BOOKS_API_KEY`
Use a separate key: AI Studio keys are restricted to the Gemini API.
1. In Google Cloud, choose a project, open **API Library** and enable **Books API**.
2. **Credentials → Create credentials → API key**.
3. Under **API restrictions** allow only Books API. Don't add a website restriction, because the server makes the calls.

### 5.4 TMDB: `TMDB_API_KEY`
1. In your TMDB **account settings**, open **API** from a desktop browser, accept the terms and fill in the form.
2. Copy the API key or the longer API Read Access Token. The app accepts either.

### 5.5 Supabase: four values
Open the `story-teller` project.

| Variable | Where |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL, `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | **Settings → API Keys**, `sb_publishable_...` |
| `SUPABASE_SECRET_KEY` | **Settings → API Keys**, `sb_secret_...`. Server only: it bypasses RLS |
| `DATABASE_URL` | **Connect → Transaction pooler** (port 6543) |

For `DATABASE_URL`:
- Replace the password placeholder. If you don't know the database password, reset it in the database settings. URL-encode special characters (`@` becomes `%40`).
- **Add `?sslmode=require` at the end.** The database library does not encrypt the connection by default.
- Don't add other parameters such as `workaround=` or `pgbouncer=true`. This library forwards unknown ones to the server, which may reject them.

```
postgresql://postgres.<project-ref>:<password>@<pooler-host>:6543/postgres?sslmode=require
```

### 5.6 Cookie secret: `COOKIE_SECRET`
Generate one for local use and a **different one** for Vercel:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 5.7 Host password: `HOST_PASSWORD`
Hosts type it to open and control rooms. Players never need it. Use a random one, because login attempts are not limited. It needs **at least 16 characters** when the database is real, or hosting is refused:

```powershell
node -e "console.log(require('crypto').randomBytes(15).toString('base64url'))"
```

Use a different one for local tests. Changing it and redeploying logs every host out.

### 5.8 Inngest: `INNGEST_EVENT_KEY`, `INNGEST_SIGNING_KEY`
Don't copy these now. The Vercel integration adds both in §10. Keep them FAKE in `.env.local`: Inngest's cloud cannot call `localhost`, so `pnpm dev` ignores them. The app uses Inngest only when **both** are real.

`INNGEST_CONCURRENCY` is optional and not a secret. Leave it empty on the free plan.

---

## 6. Prepare Supabase

1. **Authentication → Sign In / Providers → Allow anonymous sign-ins: on.** If sign-in fails, the app falls back to a signed cookie.
2. **Anonymous rate limit:** the default is 30 sign-ins per hour per IP. Raise it if many people will join from one Wi-Fi.
3. **Realtime → Settings → Allow public access: on** (the default). The app uses public channels that carry only a version number. If Realtime fails, browsers still refresh every 5 seconds.
4. **Storage:** confirm that `media` exists and is public.
5. **Tables:** nothing to run. Don't run `pnpm db:push` yet (see below).
6. **Advisors:** "RLS enabled, no policy" notices are expected. Browsers must not read tables.

<details>
<summary>Before the first new migration: repair the migration history</summary>

The migrations were applied through a connector, so Supabase stored other version numbers than the files have. `db:push` would try to apply them again. Run once:

```powershell
pnpm exec supabase login
pnpm exec supabase link --project-ref <project-ref>
pnpm exec supabase migration repair --status reverted 20261124050201 20261124050202 20261124050203
pnpm exec supabase migration repair --status applied 20261124000001 20261124000002 20261124000003
pnpm exec supabase migration list
```

`repair` edits only the history. The last command must show the same three versions locally and remotely. If it doesn't, stop. These commands were not run for this guide, and the CLI may ask you to run `supabase init` first.
</details>

---

## 7. Test locally with the real services

Find problems here, before Vercel adds more. Back up `.env.local` first.

### 7.1 AI only
1. In `.env.local` set `STORY_MODE=auto`, `ANTHROPIC_API_KEY` and `GEMINI_API_KEY`. Leave the Supabase values FAKE, so test images stay on your computer.
2. Run one short session with bots (**costs real money**):

```powershell
pnpm exec tsx --env-file=.env.local tools/simulator/src/cli.ts --sessions 1 --n 3 --players 2
```

`pnpm simulate` does not load `.env.local`, so use this command.

**Pass:** the line starts with `ok`, the cost is above $0 and it does not end in `built-in`.

If something fails, the reason is printed above that line:

| Line | Meaning |
|---|---|
| `[ai] title.extract failed (..., 0.1 s): HTTP 401: invalid x-api-key` | Wrong Claude key. Other HTTP codes come from Anthropic as well: credits, limits, overload |
| `[ai] universe.create: answer format too large for native structured output, using plain JSON` | Not an error. Appears once per server start; the story continues with the AI |
| `[ai] ... failed (...): HTTP 400: The compiled grammar is too large` | An old version of the code is running. Restart or redeploy |
| `[ai] ... failed (...): timed out after N s` | Too slow (§4, what you may need to adjust) |
| `[ai] ... failed (...): invalid answer: ...` or `rejected by N content check(s)` | Two answers in a row broke the rules |
| `[ai] session ... continues with the built-in story from dilemma k: ...` | The result of one of the above. `no themes could be read from the titles` means: look at the `title.extract` lines |
| `Image generation with ... failed` or `skipped: no time left` | Gemini problem, or the text took too long |

One `[ai]` line does not always end the AI story: moderation, the dilemma review, profiles and the final story each have their own replacement.

### 7.2 Supabase, then everything
1. Add the four Supabase values, `COOKIE_SECRET` and `HOST_PASSWORD`. Leave Inngest FAKE.
2. Run `pnpm dev`, create a room, and join from a second browser and a phone (see README).
3. First play with the **built-in story** on, then with it off.
4. Add the TMDB and Google Books keys and search for a movie and a book.

**Pass:**
- Supabase shows rows in `sessions`.
- **Authentication → Users** shows anonymous users.
- AI images appear in the `media` bucket.
- Another player's screen updates quickly.
- The story finishes and the PDF contains its pictures.

Check the AI in the Supabase **SQL Editor**:

```sql
select created_at, task, model, status, error, cost_usd, latency_ms
from ai_calls order by created_at desc limit 50;
```

`fallback` means the AI failed at that step, and `error` says why. Rows with task `session` say why a session left the AI story. Look at `latency_ms` of `universe.create` and `story.write`: it must stay well below 215000 (§4).

To go back to the local database, restore your backup.

---

## 8. Push to GitHub

1. Create an **empty private** repository (no README or license).
2. Commit any code changes, then check that nothing secret is tracked:

```powershell
git status
git ls-files | Select-String "env"     # must show only .env.example
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
git push -u origin build/v1
```

3. Open a pull request from `build/v1` to `main`. CI (`.github/workflows/ci.yml`) runs lint, types, tests, build and browser tests. It has never run on GitHub, so fix anything it finds.
4. When it is green, **merge**. Vercel deploys `main`.

CI needs no secrets.

---

## 9. Create the Vercel project

### 9.1 Import
**Add New → Project**, choose the repository, and set:

| Setting | Value |
|---|---|
| Framework | Next.js |
| Root Directory | `apps/web` |
| Include files outside the root directory | On |
| Build Command | `pnpm run build` |
| Install Command | Default |

### 9.2 Environment variables
Add these **before the first deploy**, for **Production** only. `NEXT_PUBLIC_` values are built into the app, so changing one needs a redeploy.

| Variable | First deploy |
|---|---|
| `STORY_MODE` | `default` (no AI yet) |
| `DATABASE_URL` | Real, with `?sslmode=require` |
| `NEXT_PUBLIC_SUPABASE_URL` | Real |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Real |
| `SUPABASE_SECRET_KEY` | Real |
| `COOKIE_SECRET` | The production one |
| `HOST_PASSWORD` | The production one |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Real (unused while `STORY_MODE=default`) |
| `TMDB_API_KEY`, `GOOGLE_BOOKS_API_KEY` | Real |
| `SESSION_BUDGET_USD` | `3`, or lower |

**Do not set** `INNGEST_DEV`, `DEV_ORIGINS`, `OFFLINE_SEARCH` or `PGLITE_DIR`, and don't add the Inngest keys yet.

Preview deployments get no values this way, so rooms won't work reliably there. Giving Preview the production values would mix test data with real data.

### 9.3 Deploy
1. Deploy. If the log shows the wrong pnpm version (the repository pins 12.23.0), add `ENABLE_EXPERIMENTAL_COREPACK=1` and redeploy.
2. **Settings → General → Node.js Version: 24.x**, as in CI.
3. **Settings → Functions → Region: Cleveland (`cle1`)**, next to the database in Ohio. The default is Washington, D.C.
4. **Settings → Deployment Protection:** the production domain must be public, or players can't join.
5. Redeploy so the settings apply.

### 9.4 First check, without AI or Inngest
Play a short session on the production URL with a computer and a phone. This separates Vercel and Supabase problems from AI problems. Don't continue until it works.

---

## 10. Connect Inngest

**AI stories on Vercel need Inngest.** With it, every job gets its own 300 seconds. Without it, a job and the jobs it starts share the 300 seconds of one request, so a slow universe leaves no time for the first dilemma. The built-in story works without it.

From the moment the event key is set, jobs go to Inngest. If the app isn't synced, jobs are accepted but **never run, and sessions stay on "generating"**.

1. In Inngest, open the **Vercel integration**, connect the project, and use the path `/api/inngest`.
2. In Vercel confirm that **both** `INNGEST_EVENT_KEY` and `INNGEST_SIGNING_KEY` exist for Production.
3. **Redeploy**, so the app gets the keys and Inngest syncs.
4. In Inngest, under **Apps**, confirm that `collective-story` is synced with two functions: `run-job` and `cleanup` (daily at 04:00 UTC).
5. If the sync fails with a message about **concurrency limits**, `INNGEST_CONCURRENCY` is above your plan: lower it and redeploy. Otherwise check Deployment Protection. Either make the production URL reachable, or enable Vercel's **Protection Bypass for Automation** and give the secret to the Inngest integration (depends on your Vercel plan).
6. Play a built-in session again and watch `run-job` in Inngest.

**Undo:** set `STORY_MODE=default`, delete both Inngest keys and redeploy. Jobs then run inside the web server, without the daily cleanup.

---

## 11. Verify the deployment

Set `STORY_MODE=auto` and **redeploy**. Then play one full AI session (3 dilemmas, 2 or 3 people).

- [ ] A private window cannot create a room without the host password
- [ ] The host logs in and creates a room; the QR code opens the production address
- [ ] A phone, a tablet and a laptop join, including a real iPhone
- [ ] The Stage works on a second screen
- [ ] Book and movie search shows TMDB and Google Books results, and the TMDB logo is visible
- [ ] The universe is AI-made, with images, not the built-in story
- [ ] Votes, discussion and decision stay in sync
- [ ] Refreshing a phone keeps the seat
- [ ] Profiles, the story, the public page and the PDF work
- [ ] `ai_calls` has no unexpected `fallback` rows (query in §7.2)
- [ ] Vercel logs have no `[ai]` lines, errors or timeouts; Inngest has no failed runs
- [ ] Claude and Gemini usage matches what you expected

Cost per session:

```sql
select s.code, s.content_source, s.fallback_from_k,
  (select coalesce(sum(cost_usd), 0) from ai_calls where session_id = s.id) as text_usd,
  (select coalesce(sum(cost_usd), 0) from assets where session_id = s.id) as image_usd
from sessions s order by s.created_at desc limit 20;
```

---

## 12. Open it to players

**Cost risk: anyone who has the host password can create rooms and spend your AI budget.** The per-session budget does not limit the number of sessions, there is no rate limiting, and all hosts share one password. Before sharing:

- [ ] Claude workspace spend limit and Gemini cap are set (§5)
- [ ] `HOST_PASSWORD` is random, and only your hosts have it. Change it if it leaks
- [ ] `SESSION_BUDGET_USD` is as low as you can accept
- [ ] You know the off switch: `STORY_MODE=default` and redeploy
- [ ] Optional: keep `STORY_MODE=default` and switch to `auto` only for planned sessions

Also:
- [ ] Optional domain: **Vercel → Settings → Domains**
- [ ] If the use is commercial: Vercel Pro and a TMDB agreement
- [ ] Supabase: choose a paid plan, or accept pausing
- [ ] Have native speakers review the translations, and run a larger session

**Rollback:** in Vercel **Deployments**, promote the previous one. This does not undo database changes.

**Updates:** branch → pull request → CI → merge. Apply new Supabase migrations **before** merging code that needs them.

---

## 13. Environment variable reference

| Variable | Secret | Local | Vercel | If missing or FAKE |
|---|---|---|---|---|
| `STORY_MODE` | No | `auto` | `default`, then `auto` | Acts as `auto` |
| `DATABASE_URL` | **Yes** | FAKE or real | Real | Embedded database: **does not work on Vercel** |
| `NEXT_PUBLIC_SUPABASE_URL` | No | FAKE or real | Real | Cookie identity, no Realtime, no cloud storage |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | No | FAKE or real | Real | Cookie identity, no Realtime |
| `SUPABASE_SECRET_KEY` | **Yes** | FAKE or real | Real | Images can't be saved on Vercel, but Gemini still charges |
| `COOKIE_SECRET` | **Yes** | Any | Real, different | Error when the database is real |
| `HOST_PASSWORD` | **Yes** | FAKE or real | Real, 16 characters or more | Embedded database: no login. Real database: nobody can host |
| `ANTHROPIC_API_KEY` | **Yes** | FAKE or real | Real | Built-in story, **and no AI images** |
| `GEMINI_API_KEY` | **Yes** | FAKE or real | Real | Placeholder images |
| `TMDB_API_KEY` | **Yes** | FAKE or real | Real | No TMDB results |
| `GOOGLE_BOOKS_API_KEY` | **Yes** | FAKE or real | Real | No Google Books results |
| `INNGEST_EVENT_KEY` | **Yes** | FAKE | From the integration | Jobs run in the web server |
| `INNGEST_SIGNING_KEY` | **Yes** | FAKE | From the integration | `/api/inngest` returns 404 |
| `INNGEST_CONCURRENCY` | No | Empty | Empty, or within your plan | 5 |
| `SESSION_BUDGET_USD` | No | `3` | `3` or lower | 3 |
| `GEMINI_IMAGE_MODEL`, `GEMINI_FALLBACK_IMAGE_MODEL` | No | Empty | Empty | Defaults in the code |
| `INNGEST_DEV` | No | `1` only with `pnpm dev:inngest` | **Don't set** | |

The app treats any value containing `FAKE` as missing.

---

## 14. Troubleshooting

| Symptom | Likely cause |
|---|---|
| Rooms disappear, or players see different data | `DATABASE_URL` missing for Production |
| Error about `COOKIE_SECRET` | Missing or still FAKE |
| "Hosting is not available" | `HOST_PASSWORD` missing, FAKE or under 16 characters |
| The host page asks for the password again | The login lasts 7 days, or the password changed. Logging in continues the same room |
| Database authentication error | Wrong password, or special characters not URL-encoded |
| Database suddenly unreachable | Supabase free project paused |
| `getaddrinfo ENOTFOUND db.<ref>.supabase.co` | `DATABASE_URL` is the direct connection (IPv6 only). Use the transaction pooler (§5.5) |
| `QUERY_TIMEOUT` | The pooler did not answer within 30 s. Try again; if it repeats, check Supabase's status |
| `[jobs] ... did not start in N s, running it in this process` | Inngest took the event but did not call the app: it is not synced or not reachable (§10), or many rooms are waiting for the 5 job slots. The game continues, without Inngest's own time limit per job. Portraits, write-ins and regenerated images still need Inngest |
| Inngest sync fails with a concurrency message | `INNGEST_CONCURRENCY` is above the plan |
| Built-in story although `STORY_MODE=auto` | Search the Vercel logs for `[ai]`, or read `ai_calls.error` where the task is `session` (§7). Also check the room's built-in option |
| `timed out after` or `no time left in this job` | The AI was too slow for the job's 215 s (§4) |
| Built-in story after about 5 minutes | The job was killed from outside, for example by a redeploy, or it ran without Inngest (§10) |
| Text is AI but images are placeholders | Gemini key, billing or cap; or `SUPABASE_SECRET_KEY`; or the budget is spent |
| Updates take about 5 seconds | Realtime not connected: check both `NEXT_PUBLIC_` values and Realtime settings, then redeploy |
| A changed variable has no effect | Redeploy |

---

## 15. Design components: what is deployed and what is not

| Component (design §8) | Deployed with this guide |
|---|---|
| Next.js, React, Tailwind, Motion, next-intl | Yes, Vercel |
| Supabase Postgres, Storage | Yes |
| Supabase Auth | Anonymous only. Hosts use one shared password; accounts (magic link, OAuth) are not built |
| Supabase Realtime | Broadcast only. Presence uses heartbeats (`docs/status.md`) |
| Inngest | Yes |
| Claude through the Vercel AI SDK | Yes. It calls Anthropic directly: no Vercel AI Gateway account needed |
| Gemini images | Yes |
| Open Library, Google Books, TMDB | Yes |
| Moderation | Word list plus Claude Haiku. The image vision check is not built |
| React-PDF storybook, QR codes | Yes, inside the app |
| GitHub Actions, Vitest, Playwright | Yes, CI |
| BrowserStack (real devices) | Optional account, not connected. Testing on your own devices is enough to start |
| promptfoo evals | Not built |
| shadcn/ui, TanStack Query, Zustand | Replaced by small own code |
| Narration, music, video, rate limiting, telemetry | Out of scope for v1. No accounts needed |

## Sources

- Vercel: [function limits](https://vercel.com/docs/functions/limitations), [regions](https://vercel.com/docs/functions/configuring-functions/region), [builds](https://vercel.com/docs/builds/configure-a-build), [package managers](https://vercel.com/docs/package-managers), [Node.js versions](https://vercel.com/docs/functions/runtimes/node-js/node-js-versions), [fair use](https://vercel.com/docs/limits/fair-use-guidelines), [deployment protection](https://vercel.com/docs/deployment-protection)
- Supabase: [connecting](https://supabase.com/docs/guides/database/connecting-to-postgres), [API keys](https://supabase.com/docs/guides/getting-started/api-keys), [anonymous sign-ins](https://supabase.com/docs/guides/auth/auth-anonymous), [Realtime settings](https://supabase.com/docs/guides/realtime/settings), [pausing](https://supabase.com/docs/guides/platform/free-project-pausing)
- Inngest: [deploy to Vercel](https://www.inngest.com/docs/deploy/vercel), [usage limits](https://www.inngest.com/docs/usage-limits/inngest), [concurrency](https://www.inngest.com/docs/functions/concurrency). Sync rejected above the plan limit: reports such as [this one](https://github.com/derekcoleman/aeo-platform/pull/31), not Inngest's own documentation
- Next.js and Vercel: [`after`](https://nextjs.org/docs/app/api-reference/functions/after), [background work shares the limit](https://vercel.com/kb/guide/background-workers-on-vercel)
- Claude: [workspaces](https://platform.claude.com/docs/en/manage-claude/workspaces), [rate limits](https://platform.claude.com/docs/en/api/rate-limits)
- Gemini: [billing](https://ai.google.dev/gemini-api/docs/billing), [pricing](https://aistudio.google.com/docs/pricing), [models](https://aistudio.google.com/docs/models)
- [Google Books](https://developers.google.com/books/docs/v1/using), TMDB [API key](https://developer.themoviedb.org/docs/authentication-application), [FAQ](https://developer.themoviedb.org/docs/faq), [logos](https://www.themoviedb.org/about/logos-attribution), [terms](https://themoviedb.org/api-terms-of-use)
