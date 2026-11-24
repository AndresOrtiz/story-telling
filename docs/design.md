# The Collective Story — Final Design

**AI-powered group storytelling: up to 10 players build one story by making moral decisions together.**

| | |
|---|---|
| Document | Final product and technical design (v1.1, simplified first version) |
| Based on | `collective-story-project-initial.md` |
| Date | 2026-11-23 |
| Status | Ready for implementation |

---

## Table of Contents

1. [Product Summary](#1-product-summary)
2. [What Changed from the Initial Design](#2-what-changed-from-the-initial-design)
3. [Web App Platform, Roles and Screens](#3-web-app-platform-roles-and-screens)
4. [Session Flow and State Machine](#4-session-flow-and-state-machine)
5. [Stage-by-Stage Functional Design](#5-stage-by-stage-functional-design)
6. [The Narrative Engine](#6-the-narrative-engine)
7. [Visual Pipeline](#7-visual-pipeline)
8. [Technology Stack](#8-technology-stack)
9. [System Architecture](#9-system-architecture)
10. [Data Model](#10-data-model)
11. [Structured Output Schemas](#11-structured-output-schemas)
12. [Real-Time Design](#12-real-time-design)
13. [Latency Strategy](#13-latency-strategy)
14. [Safety, Copyright and Privacy](#14-safety-copyright-and-privacy)
15. [Cost Control](#15-cost-control)
16. [Accessibility and Internationalization](#16-accessibility-and-internationalization)
17. [Quality and Testing](#17-quality-and-testing)
18. [Project Structure](#18-project-structure)
19. [Delivery Roadmap](#19-delivery-roadmap)
20. [Definition of Done](#20-definition-of-done)
21. [Product Rules](#21-product-rules)
22. [Future Iterations](#22-future-iterations)
23. [Open Questions](#23-open-questions)

---

## 1. Product Summary

The Collective Story is a live, in-room (or remote) experience for **1 host and up to 10 players**. It is a **web app**: everyone (host, players, the shared screen and spectators) takes part from a web browser on a laptop, tablet or phone, with nothing to install. Players join from their own device, choose books and movies they love, and the AI turns those choices into an **original fictional universe**. The group then works through a host-configured number of **connected moral dilemmas** (3–15, default 5). Each dilemma comes with its own illustration. Every decision changes the world, and the next dilemma grows out of the consequences.

At the end the platform produces:

1. **An original story** inspired by the group's favorites but not copying them.
2. **A chain of connected dilemmas** with their decisions and consequences.
3. **A personal voting history** for each player.
4. **Individual "decision profiles" and a group analysis.** These are interpretations of game choices, not psychological diagnoses.
5. **An illustrated story slideshow** of the group's story (images + text), which can be shared as a web page.

> **Scope of this version:** narration (text-to-speech), background music and sound, and video export are **left out** of the first version to keep it simple. They are listed in [§22 Future Iterations](#22-future-iterations).

> **Design principle:** players are not answering a survey. They are making decisions inside a world that remembers what they did.

---

## 2. What Changed from the Initial Design

### 2.1 Technology changes

| Area | Initial | Final | Why |
|---|---|---|---|
| AI text engine | OpenAI API | **Anthropic Claude** (Opus 5.5 / Sonnet 5.5 / Haiku 5.5) behind a provider-agnostic layer (Vercel AI SDK) | Strong long-form narrative coherence, reliable structured outputs and tool use, and prompt caching for the growing story bible. The abstraction keeps providers swappable. |
| AI orchestration | "Backend functions" (unspecified) | **Inngest** durable workflows | Generation chains are multi-step and slow (text → image prompt → image → storage). Durable steps give retries, idempotency, concurrency limits and resume-after-crash without custom queue code. |
| Image generation | "Image generation API" | **Google Gemini image generation** ("Nano Banana 2"-class Gemini image model) through the Gemini API, with **Imagen 4 Fast** as fallback | Gemini accepts several reference images per request, which keeps characters and art style consistent across 20–30 images (the hardest visual requirement). It is also among the cheapest production options (~$0.013 per image at 2K, as reported by a third party). |
| Narration, music, video export | TTS API, background music, FFmpeg | **Removed from the first version** (see §22) | Keeps v1 smaller, cheaper and faster to build. The slideshow is visual + text only. |
| Real-time | Supabase Realtime | Supabase Realtime **Presence + Broadcast + Postgres Changes**, with server-authoritative state | Presence handles "who's online", Broadcast handles low-latency events, and Postgres Changes keeps state durable. |
| State management | Implicit | **Explicit session state machine** (typed, server-side) | Prevents impossible states, enables resuming after a refresh, and keeps every screen in sync. |

Kept from the initial design: Next.js + React, Tailwind CSS, Supabase (Postgres, Auth, Storage, Realtime), Open Library / Google Books, TMDB.

### 2.2 Functional upgrades

| # | Upgrade | Value |
|---|---|---|
| U1 | **Story Spine.** The AI plans the whole arc (act structure scaled to the dilemma count) when it creates the universe. | The story builds to a real climax and ending instead of drifting. |
| U2 | **Story Bible + state diffs.** Persistent canon with character sheets, locations and world rules. Each turn emits a validated *diff*, not a rewritten world. | Prevents contradictions and keeps prompts small and cacheable. |
| U3 | **Value tagging of every option.** Each answer option is scored on decision dimensions when it is generated. | Profiles are computed deterministically from real votes. The AI only explains them, so it cannot invent traits. |
| U4 | **Write-in proposals.** Players can propose their own action. The AI checks it against canon and can add it to the final vote. | Directly measures the original "willingness to challenge existing options" dimension. |
| U5 | **Prediction mini-game.** Players optionally guess what the group will choose. | More engagement, and a "reads the room" stat for profiles. |
| U6 | **Discussion + final vote.** Individual votes are revealed, the group discusses, and then a final vote between the leading options decides. | The most popular first vote is not automatically the decision, which matches the original design and makes room for persuasion. It is the only decision mode in v1. |
| U7 | **Separate Stage display and Host console**, both in the browser. | The host controls the session from any browser while another browser (e.g., a laptop on a projector or TV) shows a clean stage. Optional: every device also has a Story view. |
| U8 | **Player personas (optional).** Each player gets an original in-world character with a portrait. | More immersion. Players appear in the final story. |
| U9 | **Spectator mode.** Unlimited view-only audience. | Parties, classrooms and streams beyond the 10-player cap. |
| U10 | **Content rating (Family / Teen / Mature) and tone are derived from the selected books and movies** instead of being set by the host. | The story's maturity and mood match what the group actually likes, and the host has fewer settings to configure. |
| U11 | **Host editorial controls**: regenerate image, regenerate dilemma before it is shown, edit text, pause, skip timer. | The host stays in control of quality and pacing. |
| U12 | **Shareables**: public story page, PDF storybook, per-player profile cards. | Organic growth and a lasting keepsake. |
| U13 | **Demo / Offline mode** with a prebuilt universe and no AI calls. | Sales demos, development without spend, and a fallback if a provider is down. |
| U14 | **Resilience**: reconnect anywhere, co-host promotion, provider fallbacks, resume from any phase. | A live event must never die mid-session. |

---

## 3. Web App Platform, Roles and Screens

### 3.1 Web-only principle

The Collective Story is a **web application**. **Every role uses a web browser**, and nothing else is needed:

- **No native apps, no installs, no app stores, no plugins.** Opening a URL (or scanning a QR code with the phone's normal camera) is the only step to join.
- Every role works on **laptop/desktop, tablet and phone**. Any role can use any device class. Each screen has a responsive layout for each one.
- One codebase (Next.js) serves all roles. The role is decided by the URL and the user's session, not by the device.
- Optional **"Add to Home Screen"** (web app manifest) for hosts who run sessions often. This is a convenience only, and the app is fully usable without it.

### 3.2 Roles

| Role | Runs in | Route | Count |
|---|---|---|---|
| **Host** | Browser on laptop, tablet or phone | `/host/[code]` (Host console) | 1 (+ optional co-host) |
| **Stage** | Browser on laptop, tablet or phone. Usually a laptop connected to a projector/TV, or a tablet on a stand. Can also be a second tab on the host's laptop. | `/stage/[code]` | 0..n (opened by host, read-only) |
| **Player** | Browser on phone, tablet or laptop | `/play/[code]` | 1–10 |
| **Spectator** | Browser on any device | `/watch/[code]` | Unlimited (optional) |

- **The Stage is optional.** Without a shared screen (a small group around a table, or a remote session), every player and host view has a built-in **"Story view"** that shows the current scene, image, results and slideshow on their own device. The game is fully playable with phones only.
- **Remote sessions:** the host shares the Stage browser tab in a video call, or each participant opens the Story view.
- **The Host can also play.** A toggle adds the host as a player who counts toward the 10. On a phone, the host switches between "Control" and "Play" tabs.

### 3.3 Responsive layouts per device

| Screen | Phone (< 640 px) | Tablet (640–1024 px) | Laptop / desktop (> 1024 px) |
|---|---|---|---|
| **Player** | Single column, large tap cards, sticky bottom "Submit" bar, image collapsible | Two columns: image + context left, options right | Same as tablet, wider reading width |
| **Host console** | Tabbed: *Now* (phase + main action button) · *Players* · *Settings*. One big primary action at a time. | Split view: live preview of the Stage + controls | Three panels: Stage preview · controls · players and generation status |
| **Stage** | Portrait or landscape, text below the image | Landscape recommended (prompt shown in portrait) | 16:9 full screen, made for projectors and TVs (large type, high contrast) |
| **Spectator** | Same as Stage, read-only | Same as Stage | Same as Stage |

Design rules for all screens: mobile-first CSS, touch and mouse/keyboard both supported, tap targets ≥ 48 px, no hover-only interactions, layouts tested in both orientations.

### 3.4 Supported browsers

| Browser | Minimum |
|---|---|
| Chrome / Edge (desktop, Android) | Last 2 major versions |
| Safari (macOS, iOS, iPadOS) | Last 2 major versions |
| Firefox (desktop, Android) | Last 2 major versions |
| Samsung Internet | Last 2 major versions |

Unsupported or very old browsers get a clear "please update your browser" page, not a broken session.

### 3.5 Browser capabilities used (all with fallbacks)

| Capability | Used for | Fallback when unavailable |
|---|---|---|
| WebSockets (Supabase Realtime) | Live sync of phase, votes, presence | Automatic reconnect + snapshot fetch (§12) |
| **Screen Wake Lock API** | Keeps phone/tablet screens on during the session and Stage playback | A gentle "tap to stay connected" prompt. Reconnection restores state either way. |
| **Fullscreen API** | Stage and slideshow full screen | Browser-maximized layout (iPhone Safari has limited fullscreen support) |
| **Vibration API** | Nudges for players who haven't voted (Android) | Visual pulse + banner (iOS Safari doesn't support vibration) |
| **Web Share API** | Share the join link and story page | Copy-link button |
| **Page Visibility API** | Detects when a phone sleeps or the tab is hidden, and resyncs on return | Periodic heartbeat |
| `localStorage` | Remembers the player's seat and session token | Seat recovery code (§3.6) |

The camera is **not** used by the app. QR codes are scanned with the device's own camera app, which opens the link in the browser.

### 3.6 Identity

- **Players and spectators:** Supabase **anonymous auth**. No account needed. The session JWT is kept in local storage, so a refresh or reconnect restores the same seat.
- **Hosts:** anonymous by default (session-scoped host token). Optional **magic-link / OAuth** account to save session history, templates and exports.
- A **seat recovery code** (4 characters, shown in the player menu) lets a player move to another device.

---

## 4. Session Flow and State Machine

### 4.1 High-level journey

```
LOBBY → SELECTION → UNIVERSE → [ DILEMMA LOOP × N ] → ANALYSIS → STORY → COMPLETED
```

### 4.2 Authoritative phases

The session phase lives in `sessions.phase` and changes **only on the server** through validated transitions. Every client renders from it.

```
lobby
  └─▶ selection
        └─▶ universe_generating ──▶ universe_reveal
                                       └─▶ dilemma_preparing (k)
                                             └─▶ dilemma_presenting (k)
                                                   └─▶ voting (k)
                                                         └─▶ results (k)
                                                               └─▶ discussion (k)
                                                                     └─▶ final_vote (k)   (repeats once on a tie → revote)
                                                                           └─▶ decision_confirmed (k)
                                                                     └─▶ consequence (k)
                                                                           ├─▶ dilemma_preparing (k+1)   if k < N
                                                                           └─▶ analysis_generating       if k = N
analysis_generating ──▶ analysis_reveal
                          └─▶ story_generating ──▶ story_playback ──▶ completed

(any) ──▶ paused ──▶ (previous)
(any) ──▶ aborted
```

- Each transition has a **guard** (who may trigger it, and preconditions such as "all generation for k is ready") and **side effects** (emit Inngest events, broadcast to clients).
- `sessions.state_version` increments on every transition. Clients drop stale events by version. Conflicting host commands are rejected with optimistic concurrency.
- Generation phases (`*_generating`, `dilemma_preparing`) advance **automatically** when their workflow finishes. All other phases are advanced by the host or by a timer.

---

## 5. Stage-by-Stage Functional Design

### Stage 1 — Room Creation and Lobby

**Host creates a session** and configures it (settings can be changed until the experience starts):

| Setting | Options | Default |
|---|---|---|
| Number of dilemmas | 3–15 | 5 |
| Max players | 2–10 | 10 |
| Language | Any supported (see §16) | Browser language |
| Voting timer | Off / 30s / 60s / 90s / 120s / custom | 60s |
| Vote reveal | Anonymous / Named | Named |
| Personas | On / Off | On |
| Write-ins | On / Off | On |
| Predictions | On / Off | Off |
| Spectators | On / Off | Off |
| Late join | Locked / Host-approved | Locked |

**Room code and join**

- A 6-character code without ambiguous characters (no `0/O/1/I`), for example `KX7-QM4`.
- Join URL `https://<domain>/j/KX7QM4`, and a **QR code** rendered on the Stage and Host console (`qrcode` library, rendered as SVG).
- The player enters a **nickname** (2–20 characters). It is moderated, and a duplicate gets a suffix. The player can pick an emoji or color avatar.

**Lobby**

- A live participant grid driven by Presence, with online/away indicators.
- The host can **kick**, **rename** or **lock** the room, and promote a **co-host**.
- Room status: `waiting → in_progress → completed` (plus `aborted`).
- After the start, new joins are rejected unless the host approves a late join. A late joiner inherits a "joined at dilemma k" flag, and their profile only covers what they voted on.

**Start condition:** at least 2 players (1 when the host plays), and the host presses **Begin**.

---

### Stage 2 — Book and Movie Selection

**Player screen**

- A unified **search box** with typeahead that searches books (Open Library + Google Books) and movies/series (TMDB) together. Results show cover art, year and type.
- Players pick **1 to 3 titles** in total and can mark one as their **favorite** (it gets more weight).
- **Manual entry** is allowed when search can't find a title (it is moderated and flagged as unverified).
- Optional single-tap prompt: *"What do you love about it?"* with chips such as Characters, World, Moral questions, Action, Romance and Mystery. This gives the theme extractor a strong signal.
- Players press **Confirm**. The Stage shows a cover wall filling up in real time (titles are shown, not who picked them, until the reveal).

**Host:** sees progress (`7/9 ready`) and can **force-continue**. Players who haven't chosen get a "Surprise me" pick from genre-balanced defaults.

**Theme extraction (AI)**

- Runs per title, **cached globally** by `(source, external_id)`, so a famous title is analyzed once across all sessions.
- Extracts: main themes, moral conflicts, character motivation archetypes, types of hard decisions, relationship dynamics, atmosphere, ethical questions, and "signature tension" (one sentence).
- A group-level **theme synthesis** then finds overlaps (e.g., *sacrifice, survival, loyalty, power, responsibility*) and productive tensions between selections.
- **Copyright guard:** titles are used only for thematic inspiration. The extractor outputs abstractions, never plots, names or quotes (see §14.2).

**Content rating and tone (derived from the selections)**

The host does not set the rating or the tone. Both come from the titles the group picked.

1. **Per-title signals** (cached with the themes in `title_catalog`):
   - **Rating level** (`family` / `teen` / `mature`). It comes from catalog metadata when available (TMDB certification such as G/PG/PG-13/R, Google Books `maturityRating`). The AI estimates it for titles without metadata and for manual entries.
   - **Tone scores** from −2 to +2 on two axes: **Hopeful ↔ Dark** and **Grounded ↔ Fantastical**. The AI estimates them during theme extraction.
2. **Session content rating** = the **most conservative** rating among all selections. If anyone picked a family title, the story stays family-friendly, so it suits everyone in the room.
3. **Session tone** = the weighted average of the title tone scores (a favorite counts double), rounded to the nearest step. The rating limits it: a Family story can't use the darkest tone step.
4. Both values are stored on the session (`content_rating`, `tone`, plus `derived_from` with each title's contribution) and passed to every generation as fixed settings.
5. **Shown at the universe reveal**, e.g., *"Rated Teen · Dark and fantastical, based on your selections"*. The host gets one safety option: **make it more family-friendly** (lower the rating by one level) before the first dilemma. The rating can never be raised above what the selections produced.

Fixed limits apply at every rating (§14.1).

---

### Stage 3 — The Original Universe

Generated once, before the first dilemma, and then **frozen as canon** (it can only be extended, never rewritten).

**The AI generates:**

| Field | Description |
|---|---|
| Name | A memorable title, e.g., *The Last Civilization* |
| Logline | One-sentence premise |
| Setting | Geography, era, technology, society |
| Inciting situation | The crisis that starts the story |
| Central conflict | The problem the group must resolve |
| Factions | 2–4 groups with goals and tensions |
| Characters | 3–6 original NPCs: role, motivation, secret, relationships, **visual descriptor** |
| World rules | Constraints, resources, risks, what is impossible |
| Atmosphere | Genre + tone (e.g., dystopian sci-fi, hopeful undertone) |
| Visual identity | Art style, palette, lighting, lens, recurring motifs |
| **Story Spine** (U1) | N beats mapped to acts (see §6.3) |
| **Player personas** (U8) | One original role per player (e.g., "the archivist who remembers the old world") |
| Inspiration map | Which theme came from which selection (shown at the reveal) |

**Universe reveal (Stage display)**

- Key art (16:9) + title card + opening text revealed paragraph by paragraph (≈45–60 s).
- An "Inspired by" panel showing how each player's selections shaped the world (e.g., *"Maya's love of survival stories → resource scarcity"*).
- Persona cards with portraits appear on each player's phone.

The host can **regenerate the universe once** before the first dilemma (the team-default limit; configurable).

---

### Stage 4 — Connected Dilemmas

Dilemmas are generated **one at a time, just in time**, because each depends on the previous decision. The **Story Spine** still guarantees an arc and that exactly **N** dilemmas happen.

**Generation inputs:** Story Bible (universe + canon), Story Spine and the current beat, narrative state, theme synthesis, compressed history of prior dilemmas, decisions, consequences and **minority positions**, content rating and tone, and the dilemma index `k` of `N`.

**Each dilemma contains**

| Element | Notes |
|---|---|
| Title | Short and evocative |
| Narrative connection | 1–2 sentences linking to the previous consequence ("Because you sealed the gates…") |
| Story context | 80–150 words |
| Moral conflict | The value tension made explicit (e.g., *loyalty vs. justice*) |
| Voting question | Second-person and concrete |
| Format | `single` or `multiple`, **chosen by the AI based on the situation**, with a written justification |
| Selection rules (multiple) | `min_select`, `max_select`, compatibility notes, mutually exclusive pairs |
| Options | 3–5 options (2–6 allowed). Each has a label, a short description, **foreseeable** consequences (shown) and **hidden** consequences (kept secret), and **value tags** (U3) |
| Stakes | What is at risk (people, resources, relationships) |
| Featured characters | Bible IDs, which drives image composition |
| Image | A unique illustration of this specific moment |
| Spine beat | Which beat it fulfills |

**Quality rules enforced by a validator pass** (a cheap model checks, and the dilemma is regenerated if a check fails):

- No obviously correct option. Each option must have a defensible rationale and a real cost.
- The options must differ in value tags (not four flavors of the same choice).
- The dilemma references at least one prior consequence (for k > 1).
- No contradiction with canon (dead characters stay dead, spent resources stay spent).
- Multiple-select rules are consistent (no mutually exclusive options allowed together).
- It fits the content rating.

**Option value dimensions (U3).** Every option gets a score from −2 to +2 on each axis:

| Axis | − pole | + pole |
|---|---|---|
| `risk` | Cautious | Bold |
| `trust` | Suspicious | Trusting / loyal |
| `collective` | Individual | Collective good |
| `authority` | Challenges rules | Upholds rules |
| `sacrifice` | Self-preserving | Self-sacrificing |
| `conflict` | Confrontational | Conciliatory |
| `pragmatism` | Idealistic | Pragmatic |
| `time` | Short-term | Long-term |

Write-ins and abstentions are tracked separately and feed the `challenge_options` trait.

---

### Stage 5 — Real-Time Individual Voting

**Player screen (in the browser; designed mobile-first, adapts to tablet and laptop — §3.3)**

- Dilemma image (tap to view full screen), context (collapsible), question, and options as large tap cards.
- Multiple-select cards show a live counter such as *"Choose 1–3 · 2 selected"*. Mutually exclusive options grey each other out.
- An optional **confidence** toggle (Unsure / Sure / Certain), lightweight and used in the analysis.
- **Write-in** (U4): "Propose another action" (max 140 characters). The AI checks it against canon and rewrites it into an option card. If enough players endorse it (host-configurable, default 2) or the host approves it, it enters the final vote.
- **Prediction** (U5): "What will the group choose?" (one tap, optional).
- **Submit**, then a confirmation screen with "Waiting for others (6/9)". While waiting, the player sees their own persona's inner monologue (one line, pre-generated), which keeps them in the story.

**Rules**

- Votes are **private until reveal**. Row-level security prevents reading other players' votes. Clients only receive aggregate counts (`submitted: 6/9`).
- **One valid submission per player per dilemma round**. This is enforced by a unique constraint and a server RPC that validates selection rules.
- A vote is final unless the host opens a **revote**, which creates a new round and keeps the old one in history.
- The **timer** is server-side (`voting_ends_at`), so all clients count down to the same moment. When it expires the round closes automatically and non-voters are recorded as `abstained`.
- **Nudges**: the host can ping non-voters (highlight + banner on their device, plus vibration on browsers that support it).

**Stage display:** the image is large, with the question and options and a submission ring ("6 of 9 have decided") plus avatars that light up as they vote. Choices are never shown.

---

### Stage 6 — Group Decision and Consequences

**Results reveal** (animated on Stage, mirrored on phones):

- Votes and percentage per option. Multiple-select bars are labeled *"% of players who selected"* with a note that the totals can exceed 100%.
- Most popular option, **minority positions**, the **split index** (how divided the group was), and named or anonymous voter chips depending on the setting.
- Interesting pairs, such as "Ana and Leo agreed on every dilemma so far" (from dilemma 3 on).
- Prediction results: who read the room correctly.

**Group decision: Discussion + final vote (U6, the only mode in v1)**

1. **Reveal**: the individual vote results are shown (above).
2. **Discussion**: a timed discussion period (default 2 min). The host can extend it or end it early. Players talk in the room or on the call. The app shows a countdown and the options being discussed.
3. **Final vote candidates**: the **top 2–3 options** from the first vote (every option within 1 vote of second place is included), plus any approved write-ins. If one option got **every** vote in the first round, the final vote is skipped and that option is confirmed.
4. **Final vote**: every player votes once more, privately, with the same rules as Stage 5. **The option with the most final votes becomes the official story decision.**
5. **Multiple-select dilemmas**: the final vote is between **compatible combinations**. The server builds up to 3 candidate sets from the most-selected compatible options, and the group picks one.
6. **Ties in the final vote**: one **revote** between only the tied options. If it is still tied, **"Let fate decide"**: the AI picks one and writes the group's indecision into the consequence.
7. The confirmed decision is stored in `group_decisions` with the full round history (first vote, final vote, any revote) and the final tally. Changes of heart between the first and final vote are recorded for the analysis ("persuaded" / "held firm").

**Consequence generation**

The AI returns:

1. A **consequence narrative** (100–180 words), revealed on the Stage with a typewriter effect.
2. **Revealed hidden consequences** of the chosen option(s).
3. A **minority echo**. The story acknowledges what the minority wanted ("Not everyone agreed. Three of you would have opened the gates, and that doubt lingers among the guards…"). The minority view can come back later as a plot thread.
4. A **state diff** (§6.2): changed characters, resources, faction attitudes, new or resolved threads.
5. An optional **consequence image** (on by default when N ≤ 8, otherwise every other consequence to manage cost and latency).

The diff is validated against the Bible (for example, you can't kill a character who is already dead) before it is committed. The next dilemma's generation starts **immediately** after the commit, while the group is still reading the consequence (§13).

---

### Stage 7 — Decision Profiles and Group Analysis

**Step 1 — Deterministic scoring (no AI).** For each player, across the dilemmas they voted on:

- Average of the value-tag vectors of their selections (weighted by confidence when provided).
- `challenge_options` = write-ins proposed or endorsed + revote requests.
- `conformity` = how often they voted with the eventual group decision.
- `minority_loyalty` = how often they stayed with a losing position in the final vote.
- `read_the_room` = prediction accuracy (if enabled).
- **Drift**: the change in each axis between the first and second half of the session.
- **Archetype assignment**: nearest centroid across defined archetypes, with a secondary archetype.

**Archetypes** (each defined as a centroid in value space):

| Archetype | Signature |
|---|---|
| The Strategist | High `time`, high `pragmatism` |
| The Protector | High `collective`, high `sacrifice`, low `risk` |
| The Idealist | Low `pragmatism`, consistent across dilemmas |
| The Rebel | Low `authority`, high `challenge_options` |
| The Pragmatist | High `pragmatism`, adaptive |
| The Diplomat | High `conflict` (conciliatory), high `trust` |
| The Gambler | High `risk`, short-term |
| The Guardian of Order | High `authority`, low `risk` |
| The Lone Wolf | Low `collective`, low `conformity` |
| The Wildcard | High drift / low consistency |

**Step 2 — AI interpretation.** The AI receives the computed scores **and** the player's actual choices (dilemma titles, option labels and context) and writes:

- An archetype explanation that **cites specific decisions** ("In *The Sealed Gate* you chose…").
- A "**turning point**": the biggest change or contradiction, framed with curiosity, not judgment.
- Their **in-story legacy**: how their persona is remembered in the world.
- Trait bars (from Step 1) and a radar chart.

The AI may not claim any trait that is not supported by the scores. A validator rejects claims that reference decisions the player didn't make.

**Group analysis**

- Dominant shared values and the group archetype ("A Council of Cautious Idealists").
- **Most controversial decision** (highest split index) and **most unanimous decision**.
- Cohesion over time: a chart of split index per dilemma ("You became more united after *The Flood*").
- Alliances (vote similarity clusters) and **independent voices** (players with the most minority positions).
- How the group handled ties, discussions and write-ins.

**Presentation**

- On Stage: a group report with animated charts, then a carousel of individual profile cards (only if every player agreed, or anonymous; see below).
- On phones: the player's own full profile + the group report. **Private by default.** Each player can tap "Show mine on screen".
- A shareable **profile card image** (OG image) for each player who opts in.
- A permanent disclaimer: *"A playful interpretation of choices you made in a fictional story — not a psychological assessment."*

---

### Stage 8 — The Illustrated Story Slideshow

**Story script generation.** The AI receives the full Bible, the spine and the decision history, and writes:

- A title and logline for the finished story.
- **8–15 scenes** (scaled to N): beginning → each pivotal decision and its consequence → climax built on the highest-impact decisions → an **ending determined by the group's cumulative values** (the spine defines 3 possible ending families in advance; the actual decisions pick and shape one).
- For each scene: story text (40–90 words), a short headline, an image (new, or **reused** from that dilemma when it fits) and a transition type.
- Player personas appear by name in scenes that reflect their own decisions.
- An epilogue: *"What became of…"* for each persona and major NPC.

**Image pipeline:** missing scene images are generated in parallel (concurrency-limited). Images already made for dilemmas and consequences are reused where they fit, which keeps the step fast and cheap.

**Slideshow player (plain React + Motion, no video engine)**

- Full screen on the Stage: image with a slow pan/zoom (CSS), headline and story text, and a crossfade to the next scene.
- **The host advances scenes** (next/previous, keyboard arrows). An optional **auto-advance** mode times each scene by reading length (~250 words per minute + 3 s).
- Every player's browser mirrors the current scene in the Story view, so players can read along on their own device, and sessions without a Stage still get the full slideshow.
- Ends with credits: "A story by Ana, Leo, Maya… · Inspired by …".

**Sharing and export (U12)**

| Output | How |
|---|---|
| Public story page | `/s/[slug]`, opt-in by the host. Interactive scenes, choices and results. Unlisted by default. |
| PDF storybook | Server-rendered (React-PDF): an illustrated page per scene + a decision appendix |
| Profile cards | PNG images per player (opt-in) |
| Session archive | JSON export of the full history (host account) |

---

## 6. The Narrative Engine

The main technical challenge is **continuity**, not individual creativity. The engine treats the story as **structured state + generated prose**, not prose alone.

### 6.1 The Story Bible (canon)

A versioned JSON document per session:

```
StoryBible
├── universe        (frozen after reveal: setting, rules, atmosphere, visual identity)
├── characters[]    (id, name, role, motivation, secret, status, relationships, visual_descriptor, ref_image_url)
├── factions[]      (id, name, goal, attitude_to_group: -3..+3, strength)
├── locations[]     (id, name, description, status, visual_descriptor)
├── resources{}     (named quantities, e.g. food_supply: "critical")
├── threads[]       (id, description, status: open|escalating|resolved, introduced_at_k)
├── events[]        (k, summary, impact)
├── minority_echoes[] (k, position, potential_return)
└── spine           (beats, current_beat, ending_families)
```

### 6.2 Turn loop with state diffs

```
           ┌────────────────────────────────────────────────────┐
           │ Context assembly                                    │
           │  • Bible (cached prefix)  • Spine + current beat    │
           │  • Last 2 turns in full   • Earlier turns as summary│
           └──────────────┬─────────────────────────────────────┘
                          ▼
   generate_dilemma(k) ──▶ validate ──▶ image pipeline ──▶ present
                          ▼
                    votes / decision
                          ▼
   generate_consequence(k) ──▶ { narrative, diff } ──▶ validate diff ──▶ commit Bible v+1
                          ▼
                     summarize turn k (compact, for future context)
```

- **Diffs, not rewrites.** The model returns operations (`update_character`, `add_thread`, `resolve_thread`, `set_resource`, `add_location`, `add_event`, `add_minority_echo`). The server applies them, which makes contradictions structurally hard.
- **Diff validator rules:** referenced IDs must exist; dead characters cannot act; new characters are limited to 1 per turn and require a narrative reason; `universe.*` is read-only.
- **Prompt caching:** the Bible prefix is ordered from most stable to least stable, so successive calls reuse the cached prefix. This cuts cost and latency substantially in long sessions.

### 6.3 Story Spine

Generated with the universe. It maps N dilemmas to acts:

| N | Act I (setup) | Act II (escalation) | Act III (climax/resolution) |
|---|---|---|---|
| 3 | 1 | 1 | 1 |
| 5 | 1 | 3 | 1 |
| 10 | 2 | 6 | 2 |
| 15 | 3 | 9 | 3 |

Each beat has a **purpose** (e.g., "test trust in authority", "personal cost", "point of no return"), not a fixed plot, so decisions still steer the story. The last dilemma is always a **climax dilemma** that brings back the most important open threads. The spine also defines **3 ending families** (e.g., *Restoration*, *Transformation*, *Collapse with hope*). The cumulative value vector of group decisions picks one.

### 6.4 Model routing

| Task | Model tier | Notes |
|---|---|---|
| Title theme extraction | Haiku 5.5 | Globally cached per title |
| Theme synthesis, universe + spine | **Opus 5.5** | Once per session. Quality matters most. |
| Dilemma generation | Sonnet 5.5 | Structured output |
| Dilemma / diff / profile validators | Haiku 5.5 | Fast pass/fail with reasons |
| Consequence + diff | Sonnet 5.5 | |
| Turn summaries | Haiku 5.5 | |
| Image prompt writing | Sonnet 5.5 | Has to compose characters, setting and mood well |
| Write-in canonization, moderation | Haiku 5.5 | |
| Profiles + group analysis | Sonnet 5.5 | |
| Final story script | **Opus 5.5** | Once per session |

All calls go through an internal `ai/` module (Vercel AI SDK). Model IDs are set in configuration, so routing can change without code changes. Every call has a **schema**, a **timeout**, **one automatic repair retry** (re-asking with the validation errors), and then a fallback model.

### 6.5 Prompt-injection hardening

User text (nicknames, manual titles, write-ins) is **always** placed inside clearly delimited data blocks, length-limited, moderated, and never concatenated into instructions. The system prompt tells the model to treat it as content only. Write-ins pass a classifier before they are canonized.

---

## 7. Visual Pipeline

### 7.1 Visual consistency strategy

1. **Style lock**: the universe's `visual_identity` becomes a fixed **style preamble** (medium, palette, lighting, lens, texture) added to every image prompt, along with a negative-style list.
2. **Character reference sheets**: after the universe is created, each NPC and persona gets a portrait. That portrait is the **reference image** for every later scene featuring the character (Gemini accepts the portraits as input images alongside the text prompt).
3. **Location anchors**: key locations get an establishing image that can be used as a reference.
4. **Seed and aspect discipline**: 16:9 for the Stage (1920×1080 target), with a 4:5 crop-safe composition for phones. A fixed model version for the whole session.

### 7.2 Per-image pipeline (Inngest workflow)

```
dilemma JSON
  → image-prompt writer (scene, featured characters + refs, emotion, composition, style preamble)
  → safety check on prompt
  → generate with Gemini (prompt + up to 3 character/location reference images, 16:9; 2 candidates when budget allows)
  → automatic pick (vision check: matches scene? text artifacts? rating-safe?)
  → upload to Supabase Storage (WebP + blurhash placeholder)
  → update DB row → Realtime pushes URL to clients
  fallback: Imagen 4 Fast (text prompt only, no references) → universe key art with a tinted overlay + caption (never block the session)
```

The host can **regenerate** any image, and the new one replaces the old one live.

### 7.3 Gemini integration notes

- **API:** the Gemini API (Google AI Studio key) through the official `@google/genai` SDK, called only from Inngest workflows on the server. The key is never sent to the browser.
- **Paid tier in production:** use a billing-enabled project. Free-tier availability for image models is unclear and changes often, and on Gemini's free tier Google may use the data to improve its products. Free-tier keys are acceptable only for local development with demo content.
- **Requests:** text prompt + reference images (portraits, location anchors) as inline image parts, with the aspect ratio set to 16:9. The response returns the image as base64, which the workflow converts to WebP and uploads to Supabase Storage.
- **Character consistency:** the most important images (key art and portraits) are generated first, at the highest quality. Every later scene passes in the relevant portraits. If a scene features more than 3 characters, the 3 most central characters are passed as references.
- **Rate limits:** Inngest concurrency limits per session and globally keep requests within the project's Gemini quota. On HTTP 429 the workflow retries with backoff and then falls back.
- **Safety:** Gemini's built-in safety filters run in addition to the app's own moderation (§14.1). A blocked generation retries once with a softened prompt, then falls back.
- **Watermark:** Gemini images include an invisible SynthID watermark. This is acceptable, and the public story page notes that the images are AI-generated.
- **Development cost:** demo mode uses prebuilt images and makes no Gemini calls.

> v1 has **no audio** (no narration, music or sound effects). See §22.

---

## 8. Technology Stack

| Layer | Technology | Responsibility |
|---|---|---|
| Language | **TypeScript** (strict) everywhere | One language and shared types across UI, server and workflows |
| Web framework | **Next.js (App Router)** + **React** | Host, Stage, Player, Spectator and share pages. Route handlers and Server Actions. |
| UI | **Tailwind CSS** + **shadcn/ui** (Radix primitives) | Accessible components |
| Motion | **Motion** (Framer Motion) | Reveals, transitions, vote animations |
| Client state | **TanStack Query** + small **Zustand** store | Server cache + ephemeral UI state |
| Validation / schemas | **Zod** | Shared between API, AI structured outputs and DB writes |
| Database | **Supabase Postgres** | All durable data, RLS, RPC functions |
| Auth | **Supabase Auth** (anonymous + magic link/OAuth for hosts) | Seat identity, host accounts |
| Real-time | **Supabase Realtime** (Presence, Broadcast, Postgres Changes) | Lobby, phase sync, vote counters |
| Storage | **Supabase Storage** (+ CDN) | Images, PDF exports |
| Orchestration | **Inngest** | Durable AI workflows, retries, concurrency, scheduled cleanups |
| AI text | **Anthropic Claude** (Opus 5.5 / Sonnet 5.5 / Haiku 5.5) via **Vercel AI SDK** | Universe, dilemmas, consequences, analysis, script |
| Images | **Google Gemini image model** ("Nano Banana 2" class) via the Gemini API (`@google/genai` SDK), with **Imagen 4 Fast** as fallback | All illustrations. Model IDs are set in configuration. |
| Slideshow | React + **Motion** (no video engine) | Scene playback on the Stage |
| PDF | **React-PDF** | Storybook export |
| Books | **Open Library** (primary) + **Google Books** (fallback) | Book search |
| Movies/TV | **TMDB** | Movie and series search |
| Moderation | Claude Haiku classifier + provider-side safety filters | Nicknames, titles, write-ins, image prompts |
| Hosting | **Vercel** (web), **Supabase Cloud**, **Inngest Cloud** | Managed, autoscaling |
| Testing | **Vitest**, **Playwright** (multi-client, Chromium/WebKit/Firefox, phone/tablet/desktop viewports), real-device cloud testing (e.g., BrowserStack), **promptfoo** evals | Unit, cross-browser E2E, narrative quality |
| Client platform | **Responsive web app** (web app manifest for optional Add to Home Screen) | One app for every role and device. No native apps. |
| Tooling | **pnpm** + **Turborepo**, ESLint, Prettier, GitHub Actions | Monorepo and CI/CD |

**Why not a custom WebSocket server?** At 10 players per room, Supabase Realtime is enough, it removes a whole service, and Postgres stays the single source of truth. If the product later needs very large audiences (thousands of spectators per room), the Stage/Spectator fan-out can move to a dedicated broadcast layer (e.g., Cloudflare Durable Objects / PartyKit) without changing the data model.

---

## 9. System Architecture

```
┌──────────────────────────────────────────────────────────────────────────┐
│                               CLIENTS                                    │
│   Host console      Stage display      Player (phone)      Spectator     │
└───────┬───────────────────┬──────────────────┬──────────────────┬────────┘
        │ HTTPS (commands)  │ Realtime (subscribe: phase, counts, media)  │
        ▼                   ▼                  ▼                  ▼
┌─────────────────────────────────┐     ┌──────────────────────────────────┐
│ Next.js on Vercel               │     │ Supabase                          │
│  • Server Actions / Route hdlrs │────▶│  • Postgres (RLS, RPC: cast_vote, │
│  • Session state machine        │     │    transition_phase)              │
│  • Search proxy (books/movies)  │     │  • Realtime (Presence/Broadcast/  │
│  • Inngest event emitter        │     │    Postgres Changes)              │
│                                 │     │  • Storage (images/PDF exports)   │
└───────────────┬─────────────────┘     │  • Auth (anonymous + host)        │
                │ events                └──────────────▲───────────────────┘
                ▼                                      │ writes results
┌────────────────────────────────────────────────────┐ │
│ Inngest workflows (run as Vercel functions)        │─┘
│  universe.create · dilemma.prepare · write-in.check│
│  consequence.generate · analysis.generate          │
│  story.generate · story.export · session.cleanup   │
└───────┬───────────────┬────────────────────────────┘
        ▼               ▼
  Anthropic API     Gemini API
  (Claude)          (images)
```

**Request principles**

1. **Clients never call AI providers** and never hold provider keys.
2. **Commands** (start, close voting, confirm decision) go to Server Actions, which check host authority, run the state transition in a Postgres transaction, and emit Inngest events.
3. **Workflows** write results to Postgres. Clients learn about them through Realtime. There is no polling.
4. **Idempotency**: every workflow is keyed by `(session_id, kind, k, attempt)`, so double-clicks and retries never duplicate dilemmas or charges.

---

## 10. Data Model

Postgres, all tables with `id uuid pk`, `created_at`, `updated_at`. RLS is enabled on every table.

| Table | Key columns | Notes |
|---|---|---|
| `sessions` | `code` (unique), `host_user_id`, `status`, `phase`, `state_version`, `config jsonb`, `current_k`, `dilemma_count`, `voting_ends_at`, `paused_from`, `share_slug`, `content_rating`, `tone jsonb`, `derived_from jsonb` | `config` holds every Stage 1 setting. Rating and tone are derived from the selections (Stage 2). |
| `participants` | `session_id`, `user_id`, `nickname`, `avatar`, `role` (`player`/`cohost`/`spectator`), `seat_code`, `joined_at_k`, `kicked_at`, `persona_id` | unique (`session_id`, `user_id`) |
| `title_catalog` | `source`, `external_id`, `title`, `year`, `kind`, `cover_url`, `themes jsonb`, `rating_level`, `rating_source` (`metadata`/`ai`), `tone jsonb`, `themes_model_version` | Global cache across sessions |
| `selections` | `session_id`, `participant_id`, `title_catalog_id` (nullable), `manual_title`, `is_favorite`, `love_tags text[]` | max 3 per participant (constraint trigger) |
| `story_bibles` | `session_id`, `version`, `bible jsonb`, `spine jsonb` | Append-only versions. Latest = canon. |
| `characters` | `session_id`, `bible_key`, `name`, `kind` (`npc`/`persona`), `participant_id` (nullable), `portrait_asset_id` | Kept denormalized from the Bible for querying and reference images |
| `dilemmas` | `session_id`, `k`, `status` (`generating`/`ready`/`presented`/`closed`), `payload jsonb`, `format`, `min_select`, `max_select`, `image_asset_id`, `spine_beat` | unique (`session_id`, `k`) |
| `dilemma_options` | `dilemma_id`, `key` (`A`..`F`), `label`, `description`, `visible_consequence`, `hidden_consequence`, `value_tags jsonb`, `origin` (`ai`/`write_in`), `proposed_by` | Hidden consequence is never sent to clients before the decision |
| `vote_rounds` | `dilemma_id`, `round_no`, `kind` (`initial`/`final`/`revote`), `opens_at`, `closes_at`, `candidate_option_keys text[]` | |
| `votes` | `round_id`, `participant_id`, `option_keys text[]`, `confidence`, `prediction_key`, `abstained bool` | unique (`round_id`, `participant_id`). Inserted only through the `cast_vote` RPC. |
| `write_ins` | `dilemma_id`, `participant_id`, `raw_text`, `status`, `canonized_option_id`, `endorsements uuid[]` | |
| `group_decisions` | `dilemma_id`, `option_keys text[]`, `tally jsonb`, `split_index`, `resolved_by` (`final_vote`/`unanimous`/`revote`/`fate`) | unique (`dilemma_id`) |
| `consequences` | `dilemma_id`, `narrative`, `revealed_hidden jsonb`, `minority_echo`, `diff jsonb`, `image_asset_id`, `bible_version_after` | |
| `turn_summaries` | `session_id`, `k`, `summary` | Compact context for later turns |
| `player_profiles` | `session_id`, `participant_id`, `scores jsonb`, `archetype`, `secondary_archetype`, `narrative jsonb`, `share_opt_in` | |
| `group_analyses` | `session_id`, `metrics jsonb`, `narrative jsonb` | |
| `final_stories` | `session_id`, `title`, `logline`, `ending_family`, `scenes jsonb`, `status` | |
| `assets` | `session_id`, `kind` (`image`/`pdf`), `storage_path`, `blurhash`, `width`, `height`, `provider`, `prompt`, `cost_usd` | |
| `ai_calls` | `session_id`, `task`, `model`, `input_tokens`, `output_tokens`, `cached_tokens`, `latency_ms`, `cost_usd`, `status` | Cost tracking and budget enforcement |
| `events_log` | `session_id`, `state_version`, `type`, `actor`, `payload` | Audit trail and resume/debug |

**Key RPCs (security definer, validated):**

- `join_session(code, nickname, avatar)` checks the lock state, capacity and moderated nickname.
- `cast_vote(round_id, option_keys, confidence, prediction_key)` checks that the round is open and the player is eligible, and validates option keys against the candidates and `min/max_select` and exclusivity rules. Then it inserts and broadcasts the new count.
- `transition_phase(session_id, expected_version, to_phase, payload)` is guarded by the state machine, is host-only (or system-only for workflow completions), and increments the version.

**RLS highlights**

- A participant can read `votes` only for their own rows **until** the round's `closes_at` has passed or the round is revealed. After that, the tally is readable (named or anonymous by config, served through a view).
- `dilemma_options.hidden_consequence` is excluded from client views until a decision exists.
- `player_profiles` can be read by the owner. Others can read it only when `share_opt_in = true`.

---

## 11. Structured Output Schemas

Defined once in Zod (`packages/schemas`) and used for AI structured outputs, API validation and UI types. Abridged:

```ts
const ValueTags = z.object({
  risk: z.number().int().min(-2).max(2),
  trust: z.number().int().min(-2).max(2),
  collective: z.number().int().min(-2).max(2),
  authority: z.number().int().min(-2).max(2),
  sacrifice: z.number().int().min(-2).max(2),
  conflict: z.number().int().min(-2).max(2),
  pragmatism: z.number().int().min(-2).max(2),
  time: z.number().int().min(-2).max(2),
});

const DilemmaOption = z.object({
  key: z.enum(["A", "B", "C", "D", "E", "F"]),
  label: z.string().max(80),
  description: z.string().max(240),
  visible_consequence: z.string().max(200),
  hidden_consequence: z.string().max(300),
  value_tags: ValueTags,
  rationale: z.string().max(200), // why a reasonable person would choose it
});

const Dilemma = z.object({
  k: z.number().int().min(1),
  title: z.string().max(60),
  narrative_connection: z.string().max(300),
  context: z.string().max(1000),
  moral_conflict: z.object({ value_a: z.string(), value_b: z.string(), summary: z.string() }),
  question: z.string().max(200),
  format: z.enum(["single", "multiple"]),
  format_reason: z.string().max(200),
  selection: z.object({
    min: z.number().int().min(1),
    max: z.number().int().min(1),
    mutually_exclusive: z.array(z.tuple([z.string(), z.string()])),
  }),
  options: z.array(DilemmaOption).min(2).max(6),
  stakes: z.string().max(300),
  featured_character_ids: z.array(z.string()),
  location_id: z.string(),
  spine_beat: z.string(),
  image_brief: z.object({
    moment: z.string(),        // the single frozen instant to depict
    emotion: z.string(),
    composition: z.string(),
  }),
});

const BibleDiffOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("update_character"), id: z.string(), changes: z.record(z.unknown()), reason: z.string() }),
  z.object({ op: z.literal("add_character"), character: CharacterSchema, reason: z.string() }),
  z.object({ op: z.literal("set_resource"), key: z.string(), value: z.string(), reason: z.string() }),
  z.object({ op: z.literal("update_faction"), id: z.string(), attitude_delta: z.number().int().min(-2).max(2), reason: z.string() }),
  z.object({ op: z.literal("add_thread"), thread: ThreadSchema }),
  z.object({ op: z.literal("resolve_thread"), id: z.string(), resolution: z.string() }),
  z.object({ op: z.literal("add_location"), location: LocationSchema, reason: z.string() }),
  z.object({ op: z.literal("add_event"), summary: z.string(), impact: z.string() }),
  z.object({ op: z.literal("add_minority_echo"), position: z.string(), potential_return: z.string() }),
]);

const Consequence = z.object({
  narrative: z.string().max(1400),
  revealed_hidden: z.array(z.object({ option_key: z.string(), text: z.string() })),
  minority_echo: z.string().max(400).nullable(),
  diff: z.array(BibleDiffOp).max(12),
  image_brief: z.object({ moment: z.string(), emotion: z.string(), composition: z.string() }).nullable(),
});

const StoryScene = z.object({
  index: z.number().int(),
  title: z.string(),
  text: z.string().max(700),
  headline: z.string().max(140),
  image: z.union([z.object({ reuse_asset_id: z.string() }), z.object({ new_brief: ImageBrief })]),
  transition: z.enum(["crossfade", "fade_black", "wipe", "cut"]),
  featured_participant_ids: z.array(z.string()),
});
```

The server **re-validates** every AI response with the same Zod schema, plus semantic validators (IDs exist, `selection.max ≤ options.length`, exclusivity pairs refer to real keys, and so on).

---

## 12. Real-Time Design

**One channel per session:** `session:{id}`.

| Mechanism | Used for |
|---|---|
| **Presence** | Who is connected, typing/voting status, host online |
| **Postgres Changes** (on `sessions`, `dilemmas`, `consequences`, `assets`) | Phase changes, generated content ready, image URL arrival |
| **Broadcast** (server-sent only) | `vote_count {round, submitted, eligible}`, `nudge {participant}`, `reveal`, `timer_sync`, `host_cue` (e.g., "next scene") |

**Rules**

- Clients never broadcast authoritative events. They send commands over HTTPS, and the server broadcasts.
- On (re)connect, the client **fetches a snapshot** (`GET /api/session/[code]/snapshot`, scoped to the role) and then applies events with `state_version` > snapshot. Refreshes and phone sleep are handled without special cases.
- Timers use server timestamps (`voting_ends_at`). Clients correct for clock skew with one `timer_sync` at round start.
- **Host disconnect**: the session keeps its phase. If the host is away for more than 60 s, the co-host (if any) gets the controls. Otherwise the Stage shows "Waiting for host…". Nothing is lost.

---

## 13. Latency Strategy

Target: **no dead air longer than ~8 seconds** at any transition.

| Moment | Raw work | Strategy | Perceived wait |
|---|---|---|---|
| Selection → Universe | Synthesis + universe + spine + key art + portraits (~45–90 s) | Starts when **the first player confirms** (incremental synthesis) and finalizes when the last confirms. Meanwhile the Stage plays the **"World is forming" interlude**: an animated cover wall, themes appearing one by one as extracted (real data, streamed). | Feels like part of the show |
| Decision → next dilemma | Consequence (~8 s) + next dilemma (~10 s) + image (~10–20 s) | **Pipelining**: the consequence streams onto the Stage and the group reads and reacts (~30–45 s of stage time). The next dilemma starts generating **as soon as the diff commits**, and the image starts as soon as the dilemma JSON validates. | ~0–5 s |
| Optional: speculative branching | — | During discussion, **pre-generate the consequence for the 2 leading options** (budget permitting). Discard the unused one. | Instant consequence |
| Final vote → analysis | Scoring (ms) + AI narratives (~10 s, parallel per player) | Generated **in parallel with the last consequence**, since all votes are known once the final decision is confirmed. | ~0 s |
| Analysis → story | Script (~20 s) + new images (~20–40 s) | Starts at the **last decision**. The analysis reveal (~3–5 min of stage time) covers it fully. | ~0 s |

Text that is shown while it is being generated **streams** with a typewriter effect. Images arrive with **blurhash placeholders** and a fade-in. The host has a **"Ready" indicator** for every upcoming asset, so they never advance into a loading screen by surprise.

---

## 14. Safety, Copyright and Privacy

### 14.1 Content safety

- The **content rating** (derived from the selections, §5 Stage 2) goes into every system prompt and every image style preamble. Mature still excludes sexual content, graphic gore and real-world hate.
- **Moderation gates**: nicknames, manual titles and write-ins (classifier), image prompts (before generation), and generated images (provider filter + vision check).
- Dilemmas stay within **fictional moral tension**. There are no real-world political figures, real tragedies or self-harm instructions. Sensitive themes are handled at the level the rating allows.
- Host **report & regenerate** button on any content. Reports are logged for prompt improvement.

### 14.2 Copyright

- Selected titles are **inspiration only**. The theme extractor outputs abstract themes, never plot summaries, character names, quotes or iconic visual elements.
- A **name/term filter** blocks generated text that contains character names, places or trademarked terms from the selected titles (the deny-list is built from catalog metadata plus an AI-extracted list per title).
- Image prompts never reference titles, franchises or living artists. Styles are described in neutral visual terms.
- TMDB / Open Library / Google Books attributions are shown where cover art appears, and their terms are followed (cover art only in the selection UI and the "Inspired by" panel, never in exports).

### 14.3 Privacy

- No account is required for players. The only data collected is a nickname, choices and votes.
- Profiles are **private by default** and shared only by explicit opt-in.
- Analysis wording follows the "playful interpretation" guidelines: no clinical language, no inferences about protected characteristics, no "you are a bad person" framing.
- **Retention**: anonymous sessions are deleted (including assets) after **30 days**, unless the host saves the session to an account. Public story pages exclude individual profiles unless each player opted in. A scheduled Inngest job handles cleanup.
- GDPR/CCPA: data export and deletion for host accounts. Players can delete their own data from the session menu.
- Not intended for children under 13 without a supervising host. The Family rating is designed for classroom use with a teacher as host.

---

## 15. Cost Control

**Calls per session (N = 5, 8 players, defaults):**

| Item | Count |
|---|---|
| Large-model calls (universe + spine, final script) | 2 |
| Mid-model calls (5 dilemmas, 5 consequences, image prompts, 8 profiles + 1 group analysis) | ~25 |
| Small-model calls (validators, summaries, moderation, extraction of uncached titles) | ~30–50 |
| Images with Gemini (key art, ~6 portraits, 5 dilemmas, ~5 consequences, ~4 new story scenes) | ~21 (≈ $0.27–0.55 per session at ~$0.013 per image, more if 2 candidates are generated. The price is a third-party figure; confirm it on Google's pricing page.) |

**Controls**

- A **per-session budget** (configurable, enforced via `ai_calls.cost_usd`). As spend approaches the limit, the system degrades gracefully: it skips consequence images, reuses images in the story, uses single image candidates and turns off speculative branching.
- **Global title-theme cache** and **prompt caching** of the Bible prefix.
- Model routing (§6.4). Small models do everything that doesn't need prose quality.
- **Demo mode** (U13) costs nothing.
- Cost per session, per phase and per model can be queried from the `ai_calls` table.

**Monetization hooks (future):** free tier (N ≤ 5, watermark on export), paid host plans (N up to 15, PDF exports, saved templates, custom branding for events and education).

---

## 16. Accessibility and Internationalization

**Accessibility (WCAG 2.2 AA)**

- Large tap targets (≥ 48 px) and full keyboard navigation on the host console.
- All story content is text-first, and the current Stage scene is mirrored on phones for players who can't see the screen well.
- AI-generated **alt text** for every image (comes free from the image brief).
- Color-blind-safe chart palettes. Never color-only encoding (labels + patterns).
- Reduced-motion mode respects `prefers-reduced-motion`.
- Adjustable text size on phones. Screen-reader-friendly voting (radio/checkbox semantics).

**Internationalization**

- UI strings via `next-intl`. Launch languages: **English, Spanish, Portuguese, French, German** (more later).
- The **session language** drives all generated text. Players' UI may use their own language, but story content stays in the session language so the shared experience stays consistent.
- Right-to-left support planned (Arabic, Hebrew) after launch.

---

## 17. Quality and Testing

**Narrative quality evals** (run in CI on prompt changes and nightly on sampled sessions):

| Eval | Method |
|---|---|
| Schema validity rate | Automated |
| Continuity: no contradictions with Bible | LLM judge + deterministic ID checks |
| "No obvious answer": balanced option appeal | LLM judge + historical vote distributions (target: winning option < 75% on average) |
| Callback rate: dilemma k references earlier events | LLM judge |
| Minority echo pays off at least once per session | Deterministic (threads referencing echoes) |
| Copyright leak: source names in output | Deny-list scan |
| Profile grounding: every claim cites a real decision | Deterministic cross-check |
| Ending coherence with group values | LLM judge |

**Simulation harness:** a CLI that runs full sessions with **synthetic players** (bots with configured value profiles) end to end. It is used for evals, load tests and regression checks without humans.

**Testing**

- Unit: vote tallying (single, multi, final-vote candidate selection, ties, revote, "let fate decide"), rating and tone derivation from selections, split index, scoring and archetypes, state machine guards, diff application.
- E2E (Playwright): 1 host + 10 player browser contexts + Stage running a full N=3 session in demo mode. Reconnect and kill-tab scenarios.
- Cross-device matrix: every role tested on phone, tablet and desktop viewports in Chromium, WebKit (Safari) and Firefox. A smoke test on real iOS and Android devices before each release, covering phone sleep/wake, rotation and switching between tabs.
- A "phones only" session (no Stage) runs end to end.
- Load: 200 concurrent sessions with simulated clients against staging.

---

## 18. Project Structure

```
collective-story/
├── apps/
│   └── web/                         # Next.js app
│       ├── app/
│       │   ├── (marketing)/         # landing, pricing
│       │   ├── host/[code]/         # host console
│       │   ├── stage/[code]/        # presentation display
│       │   ├── play/[code]/         # player UI
│       │   ├── watch/[code]/        # spectator
│       │   ├── j/[code]/            # join shortlink → play
│       │   ├── s/[slug]/            # public story page
│       │   └── api/
│       │       ├── inngest/         # Inngest handler
│       │       ├── session/[code]/snapshot/
│       │       └── search/          # books/movies proxy
│       ├── components/              # ui, voting, results, player, charts
│       └── lib/                     # supabase clients, realtime hooks
├── packages/
│   ├── schemas/                     # Zod schemas (shared)
│   ├── engine/                      # state machine, tallying, scoring, diff apply (pure TS)
│   ├── ai/                          # prompts, model routing, validators, context assembly
│   ├── media/                       # image pipeline
│   ├── workflows/                   # Inngest functions
│   └── ui/                          # shared design system
├── supabase/
│   ├── migrations/                  # SQL, RLS policies, RPCs
│   └── seed/                        # demo universe
├── tools/
│   └── simulator/                   # synthetic-player session runner
└── turbo.json
```

`packages/engine` is **pure and framework-free**. It holds the rules of the game (state machine, tallying, scoring, Bible diffs), which makes them fully unit-testable and reusable by the simulator.

---

## 19. Delivery Roadmap

Each milestone ends with a playable build and passes its tests before the next one starts.

| # | Milestone | Scope | Exit criteria |
|---|---|---|---|
| **M0** | Foundations | Monorepo, Supabase project, auth, CI, design system, schemas package | Deploys to staging |
| **M1** | Rooms & lobby | Create/join, QR, presence, kick/lock, co-host, state machine skeleton, Stage/Host/Player routes, responsive layouts for phone/tablet/laptop | 10 browsers on mixed devices join and stay in sync through refresh |
| **M2** | Demo-mode game loop | Full loop with a **prebuilt universe and dilemmas**: voting (single/multi), timer, reveal, discussion + final vote, ties, revote | Complete N=5 session with no AI. Tally tests pass. |
| **M3** | Selection & universe | Search, selections, theme cache, synthesis, universe + spine, key art, reveal interlude | Universe generated in < 90 s, covered by the interlude |
| **M4** | Live narrative engine | Dilemma generation, validators, consequences, Bible diffs, summaries, pipelining, per-dilemma images with character references | Continuity evals ≥ target on 50 simulated sessions |
| **M5** | Player agency upgrades | Write-ins, predictions, personas, confidence, minority echoes | Write-in → canonized option flow works end to end |
| **M6** | Analysis | Deterministic scoring, archetypes, AI interpretations, group report, charts, privacy controls | Profile grounding check passes 100% |
| **M7** | Story & slideshow | Script, scene images (with reuse), React slideshow player, Story view mirroring | Plays 8–15 scenes on Stage, in sync with every participant's browser |
| **M8** | Share & export | Public page, PDF, profile cards | PDF ready in < 1 min |
| **M9** | Hardening | Budgets & degradation, provider fallbacks, moderation, i18n (5 languages), accessibility audit, load test, retention jobs | Launch checklist complete |

**Critical path:** M2 → M4. Building the full game loop in demo mode first separates real-time and UX problems from AI problems. The narrative engine (M4) is the main product risk and gets the most eval effort.

---

## 20. Definition of Done

The finished v1 lets a host:

- [ ] Run every role (host, Stage, players, spectators) in a web browser on a laptop, tablet or phone, with nothing to install.
- [ ] Create a room for up to 10 players (+ optional spectators) and share it with a QR code or link.
- [ ] Configure the number of dilemmas (3–15), language, timer and feature toggles.
- [ ] Get the content rating and tone automatically from the group's book and movie selections.
- [ ] Run the session from a host console while a separate Stage browser presents it, or with no Stage at all using each device's Story view.
- [ ] Collect each player's 1–3 favorite books, movies or series through search or manual entry.
- [ ] Generate an original universe with a story spine, characters, personas and consistent visual identity.
- [ ] Present **exactly N** connected dilemmas, each with its **own** scene-specific illustration.
- [ ] Support single- and multiple-selection questions with AI-defined selection rules.
- [ ] Collect private votes in real time, with live counts, timers, nudges and revotes.
- [ ] Reveal results (including multi-select percentages and minority positions) and confirm the group decision through discussion + a final vote, with tie handling.
- [ ] Accept write-in proposals and add canonized ones to the final vote.
- [ ] Generate consequences that update the persistent Story Bible and visibly shape the next dilemma.
- [ ] Show grounded individual decision profiles (private by default) and a group analysis.
- [ ] Play an illustrated slideshow of 8–15 scenes (images + text) reflecting the actual decisions.
- [ ] Share a public story page and export a PDF storybook.
- [ ] Recover from refreshes, disconnects and provider failures without losing the session.

---

## 21. Product Rules

These rules apply to every AI generation and are enforced by prompts **and** validators:

1. Generate **exactly** the number of dilemmas the host configured, following the Story Spine.
2. Every dilemma connects to the universe and to **previous group decisions and consequences**.
3. Canon is append-only: the universe never changes randomly. New characters, places and events appear only with a narrative reason.
4. Every dilemma has its **own** image showing its specific moment, characters and tension, in the session's locked visual style.
5. Question format (single/multiple) follows from the situation and is justified, never random.
6. Options are meaningful, value-distinct and defensible. No obvious right answer.
7. **Minority opinions are remembered** and can come back in the story.
8. Every group decision has narrative consequences, including hidden ones.
9. The final story reflects the actual decisions made, and its ending is chosen by the group's cumulative values.
10. Profiles are computed from recorded votes, and every interpretation cites real decisions.
11. Analysis is a playful interpretation, never a psychological diagnosis.
12. Selected titles are inspiration only. No copyrighted characters, names, plots or quotes.
13. User-provided text is data, never instructions.
14. Content always respects the session's rating and tone, which come from the group's selections.
15. A live session must never block on a failed generation. A graceful fallback always exists.

---

## 22. Future Iterations

Left out of v1 on purpose. The v1 design leaves room for each of these, so they can be added without reworking the core.

| Feature | Notes for later |
|---|---|
| **Narration (text-to-speech)** | A narrator voice per universe (e.g., ElevenLabs) for the universe reveal, consequences and story scenes. Word timestamps would drive synchronized captions. Add a `narration` field to story scenes and an `audio` asset kind. |
| **Background music and sound effects** | A royalty-free track library tagged by mood, mixed on the client (Web Audio API), plus small sound effects (vote reveal, timer). Add a `music_mood` field to scenes. |
| **Video export (MP4)** | Render the slideshow to video (e.g., Remotion, which can share React components with the in-app player). Add a `video` asset kind and an export workflow. |

## 23. Open Questions

| # | Question | Default assumption until decided |
|---|---|---|
| 1 | Should series (TV) and games count as selections? | Yes for TV series (TMDB supports them). Games later. |
| 2 | Who pays for AI usage in the free tier? | Free tier capped at N ≤ 5 with a per-session budget |
| 3 | Does Gemini keep characters consistent enough across a full session? | Test during M4 on 20 fixed scenes. If consistency falls short, compare with FLUX Kontext (via fal.ai or Replicate). The image module is provider-agnostic, so switching is a config change. |
| 4 | Should named vote reveal be the default? | Named for friends/teams. Templates for classrooms default to anonymous. |
| 5 | Should players be able to replay a universe with a new group ("sequel mode")? | Out of scope for v1. The Bible format supports it later. |
| 6 | Should there be a host-only "Director mode" for fully manual dilemma editing? | Out of scope for v1. Basic edit and regenerate are included. |
| 7 | Should the session rating be the most conservative selection, or the group median? | Most conservative (safest when the group is mixed). Revisit after playtests if groups find stories too mild. |
| 8 | Should other decision modes (majority, approval, consensus, tiebreaker roles) come back later? | Not in v1. The `vote_rounds` model can support them later. |

---

*End of document.*
