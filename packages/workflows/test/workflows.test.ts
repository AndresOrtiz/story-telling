import { randomUUID } from "node:crypto";
import { MockLanguageModelV4 } from "ai/test";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setModelFactory } from "@cs/ai";
import { createEmbeddedDb, getDb, setDb } from "@cs/db";
import * as builtin from "@cs/default-story";
import { setImageClient } from "@cs/media";
import { playSession } from "../../../tools/simulator/src/run.ts";
import { aiContext } from "../src/jobs.ts";
import { concurrencyLimit, eventId, inngest, inngestEnabled, JOB_MS, jobTime, registerHandlers, runJob, TEXT_MS } from "../src/dispatch.ts";
import * as game from "../src/index.ts";
import type { Snapshot } from "../src/index.ts";

beforeAll(async () => setDb(await createEmbeddedDb()));
afterAll(async () => (await getDb()).close());
afterEach(() => {
  setModelFactory(null);
  setImageClient(null);
});

/** A model that answers every task with valid built-in content, except where `fail` says so. */
function mockAi(n: number, fail: (task: string, k: number) => boolean = () => false) {
  const calls: string[] = [];
  const answer = (text: string): [string, number, unknown] => {
    const k = Number(/dilemma (\d+) of/.exec(text)?.[1] ?? 0);
    if (text.includes("You analyse a published")) {
      return ["title", 0, { themes: ["courage"], moral_conflicts: [], motivations: [], decision_types: [], relationships: [], atmosphere: "x", ethical_questions: [], signature_tension: "x", rating: "teen", tone: { hopefulDark: 1, groundedFantastical: 1 }, forbidden_terms: ["Zorblax"] }];
    }
    if (text.includes("Find the themes")) return ["synthesis", 0, builtin.defaultSynthesis()];
    if (text.includes("Create one original universe")) return ["universe", 0, builtin.defaultUniverse(n)];
    if (text.includes("You review a dilemma")) return ["validate", k, { problems: [] }];
    if (text.includes("Write dilemma")) return ["dilemma", k, builtin.defaultDilemma(k, n, null)];
    if (text.includes("The group decided dilemma")) {
      const dilemma = builtin.defaultDilemma(k, n, null);
      return ["consequence", k, { ...builtin.defaultConsequence({ k, n, dilemma, chosen: [{ key: "A", label: "x", origin: "ai" }], minorityLabels: [], byFate: false }), narrative: `AI consequence ${k}` }];
    }
    if (text.includes("A player proposes")) return ["writein", k, builtin.defaultWriteIn("AI rewrote this")];
    if (text.includes("You interpret the choices")) return ["profile", 0, { explanation: "AI profile", turning_point: "t", legacy: "l", cited_dilemmas: [1] }];
    if (text.includes("You describe how the group")) return ["group", 0, { title: "AI group", summary: "s", shared_values: [], hard_moments: "h" }];
    if (text.includes("Write the finished story")) {
      const scenes = Array.from({ length: 9 }, (_, i) => ({ headline: `Scene ${i}`, text: "t", source_k: i % 3, image: builtin.DEFAULT_UNIVERSE.key_art, transition: "cut" }));
      return ["story", 0, { title: "AI story", logline: "l", scenes, epilogue: [] }];
    }
    return ["moderate", 0, { acceptable: true, reason: "" }];
  };
  setModelFactory(
    () =>
      new MockLanguageModelV4({
        doGenerate: async (o) => {
          const [task, k, value] = answer(JSON.stringify(o.prompt));
          calls.push(`${task}${k || ""}`);
          if (fail(task, k)) throw new Error("injected failure");
          return {
            content: [{ type: "text", text: JSON.stringify(value) }],
            finishReason: { unified: "stop", raw: undefined },
            usage: { inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 5, text: 5, reasoning: 0 } },
            warnings: [],
          };
        },
      }) as never,
  );
  return calls;
}

const row = async (code: string) =>
  (
    await (await getDb()).query<{ id: string; content_source: string; fallback_from_k: number | null; content_rating: string }>(
      "select id, content_source, fallback_from_k, content_rating from sessions where code = $1",
      [code],
    )
  )[0]!;
const sources = async (id: string) =>
  (await (await getDb()).query<{ source: string }>("select source from dilemmas where session_id = $1 order by k", [id])).map((x) => x.source);

describe("content sources", () => {
  it("plays entirely on AI content when the AI works", async () => {
    mockAi(4);
    const r = await playSession({ n: 4, players: 3 });
    expect(r).toMatchObject({ completed: true, builtIn: false, dilemmas: 4, ungrounded: 0, scenes: 9 });
    const s = await row(r.code);
    expect([s.content_source, s.fallback_from_k]).toEqual(["ai", null]);
    expect(await sources(s.id)).toEqual(["ai", "ai", "ai", "ai"]);
  });

  it("plays on the built-in story with fake keys", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE-replace-me";
    const r = await playSession({ n: 3, players: 3, writeIns: true });
    expect(r).toMatchObject({ completed: true, builtIn: true, dilemmas: 3 });
    expect((await row(r.code)).fallback_from_k).toBe(0);
  });

  const cases: [string, (task: string, k: number) => boolean, number | null, string[]][] = [
    ["theme extraction", (t) => t === "title", 0, ["default", "default", "default"]],
    ["universe", (t) => t === "universe", 0, ["default", "default", "default"]],
    ["dilemma 2", (t, k) => t === "dilemma" && k === 2, 2, ["ai", "default", "default"]],
    ["the last dilemma", (t, k) => t === "dilemma" && k === 3, 3, ["ai", "ai", "default"]],
    ["consequence 1", (t, k) => t === "consequence" && k === 1, 1, ["ai", "default", "default"]],
    ["the dilemma reviewer", (t) => t === "validate", null, ["ai", "ai", "ai"]],
    ["analysis", (t) => t === "profile" || t === "group", null, ["ai", "ai", "ai"]],
    ["the final story", (t) => t === "story", null, ["ai", "ai", "ai"]],
    ["moderation", (t) => t === "moderate", null, ["ai", "ai", "ai"]],
  ];
  for (const [name, fail, fromK, expected] of cases) {
    it(`finishes the session when ${name} fails`, async () => {
      mockAi(3, fail);
      // Unique titles, so that a cached extraction cannot hide the failure.
      const db = await getDb();
      await db.query("update title_catalog set themes = null");
      const r = await playSession({ n: 3, players: 3 });
      const s = await row(r.code);
      expect([r.completed, r.dilemmas, r.ungrounded]).toEqual([true, 3, 0]);
      expect(r.scenes).toBeGreaterThanOrEqual(8);
      expect([s.fallback_from_k, await sources(s.id)]).toEqual([fromK, expected]);
    });
  }

  it("stops calling the AI once the budget is spent", async () => {
    const calls = mockAi(3);
    process.env.SESSION_BUDGET_USD = "0.0000001";
    const r = await playSession({ n: 3, players: 2 });
    delete process.env.SESSION_BUDGET_USD;
    expect([r.completed, r.builtIn]).toEqual([true, true]);
    expect(calls.filter((c) => c.startsWith("dilemma"))).toEqual([]);
  });

  it("never calls the AI with the built-in story toggle", async () => {
    const calls = mockAi(3);
    await playSession({ n: 3, players: 2, config: { builtInStory: true } });
    expect(calls).toEqual([]);
  });
});

async function room(config: object = {}, names = ["Ana", "Leo", "Maya"]) {
  const host = randomUUID() as string;
  const { code } = await game.createSession(host, { dilemmas: 3, builtInStory: true, votingSeconds: 0, ...config });
  const users: string[] = names.map(() => randomUUID());
  for (const [i, u] of users.entries()) await game.join(code, u, { nickname: names[i]! });
  const view = async (u: string, token?: string) => (await game.snapshot(code, u, token)) as Snapshot;
  const act = async (a: game.HostAction) => {
    await game.runHostAction(code, host, a);
    await game.drainJobs();
  };
  const toVoting = async () => {
    await act("start");
    for (const u of users) await game.saveSelections(code, u, [{ title: "The Hobbit", kind: "book" }]);
    await act("continue_selection");
    await act("begin_story");
    await act("open_voting");
  };
  return { code, host, users, view, act, toVoting };
}

describe("jobs", () => {
  const job = { kind: "dilemma" as const, sessionId: randomUUID() as string, k: 2 };

  it("asks Inngest for no more than the plan allows", () => {
    expect([undefined, "", "0", "-1", "2.5", "many"].map((v) => concurrencyLimit(v ?? ""))).toEqual([5, 5, 5, 5, 5, 5]);
    expect(["1", "5", "100"].map((v) => concurrencyLimit(v))).toEqual([1, 5, 100]);
  });

  it("sends the same event id within a minute, and a new one later or for another job", () => {
    const now = Date.UTC(2026, 10, 24, 10, 0, 5);
    const id = eventId(job, now);
    expect(eventId({ ...job, attempt: 0 }, now + 50_000)).toBe(id);
    const others = [
      eventId(job, now + 60_000),
      eventId({ ...job, attempt: 1 }, now),
      eventId({ ...job, k: 3 }, now),
      eventId({ ...job, ref: "x" }, now),
      eventId({ ...job, kind: "image" }, now),
      eventId({ ...job, sessionId: randomUUID() }, now),
    ];
    expect(new Set([id, ...others]).size).toBe(7);
  });

  it("uses Inngest's cloud only with both keys, and never from pnpm dev", () => {
    const keys = { INNGEST_EVENT_KEY: "real", INNGEST_SIGNING_KEY: "real" };
    expect(inngestEnabled({ NODE_ENV: "production", ...keys })).toBe(true);
    expect(inngestEnabled({ NODE_ENV: "development", ...keys })).toBe(false);
    expect(inngestEnabled({ NODE_ENV: "production", ...keys, INNGEST_SIGNING_KEY: "FAKE" })).toBe(false);
    expect(inngestEnabled({ NODE_ENV: "production", ...keys, INNGEST_EVENT_KEY: undefined })).toBe(false);
    expect(inngestEnabled({ NODE_ENV: "development", INNGEST_DEV: "1" })).toBe(true);
    expect(inngestEnabled({ NODE_ENV: "production", INNGEST_DEV: "0", INNGEST_EVENT_KEY: "FAKE" })).toBe(false);
  });

  it("runs a job here, with the AI, when Inngest takes the event but never starts it", async () => {
    mockAi(3);
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const send = vi.spyOn(inngest, "send").mockResolvedValue({ ids: [] } as never);
    process.env.INNGEST_DEV = "1";
    try {
      const { code, host, users, view, act } = await room({ builtInStory: false }, ["Ana", "Leo"]);
      const { id } = await row(code);
      const db = await getDb();
      const later = (seconds: number) => db.query("update sessions set updated_at = now() - $2::int * interval '1 second' where id = $1", [id, seconds]);
      await act("start");
      for (const u of users) await game.saveSelections(code, u, [{ title: "The Hobbit", kind: "book" }]);
      await act("continue_selection");
      const universe = () => send.mock.calls.filter(([e]) => (e as { data: { kind: string } }).data.kind === "universe").length;
      expect(universe()).toBe(1);
      await later(20);
      for (let i = 0; i < 5; i++) await view(host);
      await game.drainJobs();
      // Not sent again and again by every screen that asks.
      expect(universe()).toBeLessThanOrEqual(2);
      expect((await view(host)).phase).toBe("universe_generating");
      await later(60);
      await Promise.all([view(host), view(users[0]!), view(users[1]!)]);
      await game.drainJobs();
      expect((await view(host)).phase).toBe("universe_reveal");
      expect((await row(code)).content_source).toBe("ai");
      const jobs = await db.query("select 1 from jobs where session_id = $1 and kind = 'universe'", [id]);
      expect(jobs).toHaveLength(1);
    } finally {
      delete process.env.INNGEST_DEV;
      vi.restoreAllMocks();
    }
  });

  it("gives every job deadlines that end before the server function is stopped", async () => {
    expect(TEXT_MS).toBeLessThan(JOB_MS);
    expect(JOB_MS).toBeLessThan(300_000);
    expect(jobTime()).toBeUndefined();
    expect((await aiContext(null)).deadline).toBeUndefined();
    const { code } = await room();
    const registry = globalThis as unknown as { __csHandlers: Parameters<typeof registerHandlers>[0] };
    const real = registry.__csHandlers;
    let seen: { time: ReturnType<typeof jobTime>; text?: number } | undefined;
    registerHandlers({ ...real, portraits: async () => void (seen = { time: jobTime(), text: (await aiContext(null)).deadline }) });
    const started = Date.now();
    try {
      await runJob({ kind: "portraits", sessionId: (await row(code)).id, k: 99 });
    } finally {
      registerHandlers(real);
    }
    expect(seen!.time!.end - started).toBeGreaterThanOrEqual(JOB_MS);
    expect(seen!.time!.end - started).toBeLessThan(JOB_MS + 5_000);
    expect(seen!.text).toBe(seen!.time!.text);
    expect(jobTime()).toBeUndefined();
  });
});

describe("reasons for the built-in story", () => {
  let logged: string[] = [];
  beforeEach(() => {
    logged = [];
    vi.spyOn(console, "error").mockImplementation((...x) => void logged.push(x.map(String).join(" ")));
  });
  afterEach(() => void vi.restoreAllMocks());
  const reasonOf = async (id: string) =>
    (await (await getDb()).query<{ error: string }>("select error from ai_calls where session_id = $1 and task = 'session'", [id])).map((x) => x.error);

  it("stores and prints why a session left the AI story", async () => {
    mockAi(3, (t, k) => t === "dilemma" && k === 2);
    const { id } = await row((await playSession({ n: 3, players: 2 })).code);
    expect(await reasonOf(id)).toEqual(["Error: injected failure"]);
    expect(logged).toContain(`[ai] session ${id} continues with the built-in story from dilemma 2: Error: injected failure`);
  });

  it("names a spent budget", async () => {
    mockAi(3);
    process.env.SESSION_BUDGET_USD = "0.0000001";
    const { id } = await row((await playSession({ n: 3, players: 2 })).code);
    delete process.env.SESSION_BUDGET_USD;
    expect(await reasonOf(id)).toEqual(["the session budget is spent"]);
  });

  it("stays quiet with fake keys", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE-replace-me";
    const { id } = await row((await playSession({ n: 3, players: 2 })).code);
    expect(await reasonOf(id)).toEqual(["no Anthropic key is configured"]);
    expect(logged.filter((l) => l.includes("[ai]"))).toEqual([]);
  });
});

describe("host login", () => {
  const loggedOut = async (code: string, user: string) => game.snapshot(code, user, null, undefined, false);

  it("gives a host who is not logged in nothing but the request to log in", async () => {
    const { code, host } = await room();
    expect(await loggedOut(code, host)).toMatchObject({ limited: true, loginRequired: true });
    expect(await game.snapshot(code, host)).toMatchObject({ me: { isHost: true, userIsHost: true, loginRequired: false } });
    await expect(game.exportSession(code, host, false)).rejects.toThrow("forbidden");
    expect(await game.exportSession(code, host)).toMatchObject({ code });
  });

  it("lets a host with a seat keep playing without host data", async () => {
    const { code, host } = await room();
    await game.join(code, host, { nickname: "Hosty" });
    const snap = (await loggedOut(code, host)) as Snapshot;
    expect(snap.me).toMatchObject({ nickname: "Hosty", isHost: false, userIsHost: false, loginRequired: true });
    expect(snap.host).toBeUndefined();
  });

  it("does not let a host around the login by being their own co-host", async () => {
    const { code, host } = await room();
    const seat = await game.join(code, host, { nickname: "Hosty" });
    await game.roomAction(code, host, { type: "cohost", participantId: seat.id });
    expect(((await loggedOut(code, host)) as Snapshot).me.isHost).toBe(false);
  });

  it("never asks players, co-hosts, strangers or the stage to log in", async () => {
    const { code, host, users, view } = await room();
    const leo = (await view(users[1]!)).me.participantId!;
    await game.roomAction(code, host, { type: "cohost", participantId: leo });
    expect((await loggedOut(code, users[0]!)) as Snapshot).toMatchObject({ me: { isHost: false, loginRequired: false } });
    expect((await loggedOut(code, users[1]!)) as Snapshot).toMatchObject({ me: { isHost: true, userIsHost: false, loginRequired: false } });
    expect(await loggedOut(code, randomUUID())).toMatchObject({ limited: true, loginRequired: false });
    const token = (await view(host)).host!.stageToken;
    expect(await game.snapshot(code, randomUUID(), token, undefined, false)).toMatchObject({ phase: "lobby", me: { loginRequired: false } });
    expect(await Promise.all([host, users[1]!].map((u) => game.isOwner(code, u)))).toEqual([true, false]);
  });
});

describe("snapshots", () => {
  it("never mixes two phases, even when the vote closes while it is being read", async () => {
    const { code, users, view, act, toVoting } = await room();
    await toVoting();
    for (const [i, u] of users.entries()) await game.castVote(code, u, { optionKeys: [i ? "B" : "A"] });
    await act("close_voting");
    await act("start_discussion");
    await act("open_final_vote");
    const { candidates } = (await view(users[0]!)).round!;
    for (const u of users) await game.castVote(code, u, { optionKeys: [candidates[0]!.id] });
    const real = await getDb();
    let closed = false;
    try {
      setDb({
        ...real,
        query: async (text, params) => {
          if (!closed && text.includes("from vote_rounds")) {
            closed = true;
            setDb(real);
            await act("close_final_vote");
          }
          return real.query(text, params);
        },
      });
      const snap = await view(users[0]!);
      expect(closed).toBe(true);
      expect(snap.phase).toBe("consequence");
      expect(snap.round).toBeUndefined();
      expect(snap.decision).toBeDefined();
    } finally {
      setDb(real);
    }
  });
});

describe("settings", () => {
  it("keeps every change when saves overlap, and none after the start", async () => {
    const host = randomUUID();
    const { code } = await game.createSession(host, {});
    const changes = { dilemmas: 3, maxPlayers: 4, votingSeconds: 0, discussionSeconds: 10, predictions: true, personas: false };
    await Promise.all(Object.entries(changes).map(([k, v]) => game.updateConfig(code, host, { [k]: v })));
    const s = (await game.snapshot(code, host)) as Snapshot;
    expect(s.config).toMatchObject(changes);
    expect(s.n).toBe(3);
    for (const name of ["Ana", "Leo"]) await game.join(code, randomUUID(), { nickname: name });
    await game.runHostAction(code, host, "start", { phase: "lobby", k: 0 });
    await expect(game.updateConfig(code, host, { dilemmas: 9 })).rejects.toThrow("started");
  });
});

describe("privacy", () => {
  it("shows strangers nothing, and the stage everything public", async () => {
    const { code, host, view, toVoting } = await room();
    await toVoting();
    expect(await game.snapshot(code, randomUUID())).toMatchObject({ limited: true, reason: "join" });
    expect(await game.snapshot(code, randomUUID(), "wrong-token")).toMatchObject({ limited: true });
    const token = (await view(host)).host!.stageToken;
    const stage = await view(randomUUID(), token);
    expect(stage.dilemma!.title).toBeTruthy();
    expect([stage.host, stage.me.seatCode, stage.me.isHost]).toEqual([undefined, null, false]);
  });

  it("keeps votes, hidden consequences and tags secret until they are revealed", async () => {
    const { code, host, users, view, act, toVoting } = await room();
    await toVoting();
    const hidden = builtin.DEFAULT_DILEMMAS[0]!.dilemma.options[0]!.hidden_consequence;
    await game.castVote(code, users[0]!, { optionKeys: ["A"] });
    for (const u of [host, ...users]) {
      const text = JSON.stringify(await view(u));
      expect(text).not.toContain(hidden);
      expect(text).not.toContain("value_tags");
      expect((await view(u)).results).toBeUndefined();
    }
    expect((await view(users[0]!)).round).toMatchObject({ submitted: 1, eligible: 3, myVote: ["A"] });
    expect((await view(users[1]!)).round!.myVote).toBeNull();
    await game.castVote(code, users[1]!, { optionKeys: ["A"] });
    await act("close_voting");
    expect(JSON.stringify(await view(users[1]!))).not.toContain(hidden);
    expect((await view(users[1]!)).results).toMatchObject({ counts: { A: 2, B: 0, C: 0, D: 0 }, abstentions: 1, unanimous: true, voterNames: { A: ["Ana", "Leo"] } });
    await act("confirm_unanimous");
    expect((await view(users[1]!)).consequence!.hidden[0]!.text).toBe(hidden);
  });

  it("hides names in anonymous mode", async () => {
    const { code, users, view, act, toVoting } = await room({ reveal: "anonymous" });
    await toVoting();
    for (const [i, u] of users.entries()) await game.castVote(code, u, { optionKeys: [i ? "A" : "B"] });
    await act("close_voting");
    expect((await view(users[0]!)).results).toMatchObject({ voterNames: null, pair: null });
  });

  it("keeps profiles private until their owner shares them, and deletes them on request", async () => {
    const { code, host, users, view, act, toVoting } = await room();
    await toVoting();
    for (let k = 1; k <= 3; k++) {
      for (const u of users) {
        const d = (await view(u)).dilemma!;
        await game.castVote(code, u, { optionKeys: d.options.slice(0, d.min).map((o) => o.key) });
      }
      await act("close_voting");
      await act("confirm_unanimous");
      await act("next");
      if (k < 3) await act("open_voting");
    }
    expect((await view(users[0]!)).analysis!.mine!.nickname).toBe("Ana");
    expect((await view(host)).analysis).toMatchObject({ mine: null, shared: [] });
    await game.setProfileShared(code, users[0]!, true);
    expect((await view(users[1]!)).analysis!.shared.map((x) => x.nickname)).toEqual(["Ana"]);

    await act("show_story");
    expect(await game.setShared(code, host, false)).toBeNull();
    const slug = (await game.setShared(code, host, true))!;
    const page = (await game.sharedStory(slug))!;
    expect(page.profiles.map((x) => x.nickname)).toEqual(["Ana"]);
    await game.deleteMe(code, users[0]!);
    expect((await game.sharedStory(slug))!.profiles).toEqual([]);
    expect(JSON.stringify(await game.sharedStory(slug))).not.toContain('"Ana"');
    await game.setShared(code, host, false);
    expect(await game.sharedStory(slug)).toBeNull();
  });
});

describe("rules", () => {
  it("only lets the host run host actions, and ignores double clicks", async () => {
    const { code, host, users, view, act } = await room();
    await expect(game.runHostAction(code, users[0]!, "start")).rejects.toThrow("forbidden");
    await expect(game.roomAction(code, users[0]!, { type: "lock", locked: true })).rejects.toThrow("forbidden");
    await act("start");
    await expect(game.runHostAction(code, host, "start", { phase: "lobby", k: 0 })).rejects.toThrow("conflict");
    // By name: players who join in the same millisecond have no fixed order.
    const id = (await view(host)).players.find((p) => p.nickname === "Ana")!.id;
    await game.roomAction(code, host, { type: "cohost", participantId: id });
    expect((await view(users[0]!)).me.isHost).toBe(true);
    await expect(game.roomAction(code, users[0]!, { type: "cohost", participantId: id })).rejects.toThrow("forbidden");
  });

  it("needs two players, kicks for good and recovers seats", async () => {
    const { code, host, users, view } = await room({}, ["Ana"]);
    await expect(game.runHostAction(code, host, "start")).rejects.toThrow("need_players");
    const seat = (await view(users[0]!)).me.seatCode!;
    const phone = randomUUID();
    await expect(game.recoverSeat(code, phone, "WRONG")).rejects.toThrow("bad_seat");
    await game.recoverSeat(code, phone, seat);
    expect((await view(phone)).me.nickname).toBe("Ana");
    expect(await game.snapshot(code, users[0]!)).toMatchObject({ limited: true });
    await game.roomAction(code, host, { type: "kick", participantId: (await view(phone)).me.participantId! });
    await expect(game.join(code, phone, { nickname: "Ana" })).rejects.toThrow("kicked");
  });

  it("makes late joiners wait for approval and leaves them out of earlier votes", async () => {
    const { code, host, view, toVoting } = await room({ lateJoin: "host" });
    await toVoting();
    const late = randomUUID();
    await game.join(code, late, { nickname: "Zoe" });
    expect(await game.snapshot(code, late)).toMatchObject({ limited: true, reason: "waiting_approval" });
    await expect(game.castVote(code, late, { optionKeys: ["A"] })).rejects.toThrow("forbidden");
    await game.roomAction(code, host, { type: "approve", participantId: (await view(host)).host!.pending[0]!.id });
    await game.castVote(code, late, { optionKeys: ["A"] });
  });

  it("closes voting when the time is up, even if the host is gone", async () => {
    const { code, users, view, toVoting } = await room({ votingSeconds: 60 });
    await toVoting();
    const db = await getDb();
    await db.query("update sessions set ends_at = now() - interval '1 second' where code = $1", [code]);
    expect((await view(users[0]!)).phase).toBe("results");
  });

  it("pauses the clock and resumes with the time that was left", async () => {
    const { code, users, host, view, act, toVoting } = await room({ votingSeconds: 60 });
    await toVoting();
    await act("pause");
    expect(await view(users[0]!)).toMatchObject({ phase: "paused", pausedFrom: "voting", endsAt: null });
    await expect(game.castVote(code, users[0]!, { optionKeys: ["A"] })).rejects.toThrow("round_closed");
    await act("resume");
    const s = await view(host);
    expect(s.phase).toBe("voting");
    expect(s.endsAt! - s.now).toBeGreaterThan(50_000);
    await game.castVote(code, users[0]!, { optionKeys: ["A"] });
  });

  it("revotes from scratch", async () => {
    const { code, users, view, act, toVoting } = await room();
    await toVoting();
    for (const u of users) await game.castVote(code, u, { optionKeys: ["A"] });
    await act("close_voting");
    await act("revote");
    expect((await view(users[0]!)).round!.myVote).toBeNull();
    for (const u of users) await game.castVote(code, u, { optionKeys: ["B"] });
    await act("close_voting");
    expect((await view(users[0]!)).results!.counts).toMatchObject({ A: 0, B: 3 });
  });

  it("runs a write-in from proposal to consequence", async () => {
    const { code, users, host, view, act, toVoting } = await room({ writeInEndorsements: 1 });
    await toVoting();
    for (const u of users) await game.castVote(code, u, { optionKeys: ["A"] });
    await expect(game.proposeWriteIn(code, users[0]!, "fuck the gate")).rejects.toThrow("bad_write_in");
    await game.proposeWriteIn(code, users[0]!, "Dig a tunnel under the wall");
    await expect(game.proposeWriteIn(code, users[0]!, "Another idea")).rejects.toThrow("already_proposed");
    await game.drainJobs();
    const w = (await view(users[1]!)).writeIns![0]!;
    await expect(game.endorseWriteIn(code, users[0]!, w.id)).rejects.toThrow("own_write_in");
    await game.endorseWriteIn(code, users[1]!, w.id);
    await act("close_voting");
    expect((await view(host)).results).toMatchObject({ unanimous: false });
    await act("start_discussion");
    await act("open_final_vote");
    expect((await view(users[0]!)).round!.candidates.map((c) => c.id)).toEqual(["A", "W1"]);
    for (const u of users) await game.castVote(code, u, { optionKeys: ["W1"] });
    await act("close_final_vote");
    const s = await view(users[0]!);
    expect(s.decision).toMatchObject({ labels: ["Dig a tunnel under the wall"], resolvedBy: "final_vote", persuaded: 3 });
    expect(s.consequence!.narrative).toContain("Dig a tunnel");
  });

  it("derives rating and tone from the selections, and only lowers the rating once", async () => {
    const { code, host, users, view, act } = await room();
    await act("start");
    await game.saveSelections(code, users[0]!, [{ title: "Knives Out", kind: "movie" }]);
    await game.saveSelections(code, users[1]!, [{ title: "Alien", kind: "movie" }]);
    await game.saveSelections(code, users[2]!, [{ title: "Alien", kind: "movie" }]);
    await act("continue_selection");
    expect((await view(host)).universe).toMatchObject({ rating: "teen", tone: { hopefulDark: 1 } });
    await act("lower_rating");
    expect((await view(host)).universe!.rating).toBe("family");
    await expect(game.runHostAction(code, host, "lower_rating")).rejects.toThrow("already_lowered");
  });

  it("recovers when a job died with its server", async () => {
    const { code, host, view, act } = await room();
    await act("start");
    const db = await getDb();
    const s = await row(code);
    await db.query("insert into jobs (session_id, kind, k, attempt, started_at) values ($1, 'universe', 0, 0, now() - interval '10 minutes')", [s.id]);
    await act("continue_selection");
    expect((await view(host)).phase).toBe("universe_generating");
    await game.drainJobs();
    expect((await view(host)).phase).toBe("universe_reveal");
  });

  it("rejects bad names and titles", async () => {
    const { code, users, act } = await room();
    await expect(game.join(code, randomUUID(), { nickname: "<script>" })).rejects.toThrow("bad_nickname");
    await expect(game.join(code, randomUUID(), { nickname: "Sh1t" })).rejects.toThrow("bad_nickname");
    await act("start");
    await expect(game.saveSelections(code, users[0]!, [{ title: "fuck", kind: "book" }])).rejects.toThrow("bad_title");
    await expect(game.saveSelections(code, users[0]!, [{ titleId: randomUUID() }])).rejects.toThrow("unknown_title");
  });

  it("deletes old sessions", async () => {
    const { code } = await room();
    const db = await getDb();
    await db.query("update sessions set created_at = now() - interval '31 days' where code = $1", [code]);
    expect(await game.cleanup()).toBe(1);
    await expect(game.snapshot(code, randomUUID())).rejects.toThrow("not_found");
  });
});
