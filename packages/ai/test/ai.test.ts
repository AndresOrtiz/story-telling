import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APICallError, RetryError } from "ai";
import { MockLanguageModelV4 } from "ai/test";
import { z } from "zod";
import * as builtin from "../../default-story/src/index.ts";
import { createBible } from "@cs/engine";
import * as ai from "../src/index.ts";

const Schema = z.object({ n: z.number() });
const prompt = { system: "s", user: "u" };
const ctx = () => {
  const logs: ai.CallLog[] = [];
  return { logs, ctx: { enabled: true, log: (l: ai.CallLog) => void logs.push(l) } satisfies ai.CallContext };
};

/** Everything that reached the server log. */
let logged: string[] = [];
beforeEach(() => {
  logged = [];
  vi.spyOn(console, "error").mockImplementation((...x) => void logged.push(x.map(String).join(" ")));
});
afterEach(() => void vi.restoreAllMocks());

/** `formats` receives what the API was asked to check: "json" or "text". */
function mock(answers: (string | Error)[], finish: "stop" | "length" = "stop", formats: string[] = []) {
  const prompts: string[] = [];
  let i = 0;
  ai.setModelFactory(
    () =>
      new MockLanguageModelV4({
        doGenerate: async (options) => {
          prompts.push(JSON.stringify(options.prompt));
          formats.push(options.responseFormat?.type ?? "text");
          const a = answers[Math.min(i++, answers.length - 1)]!;
          if (a instanceof Error) throw a;
          return {
            content: [{ type: "text", text: a }],
            finishReason: { unified: finish, raw: undefined },
            usage: {
              inputTokens: { total: 100, noCache: 100, cacheRead: 0, cacheWrite: 0 },
              outputTokens: { total: 10, text: 10, reasoning: 0 },
            },
            warnings: [],
          };
        },
      }) as never,
  );
  return prompts;
}
afterEach(() => ai.setModelFactory(null));

describe("generate", () => {
  it("returns valid output and logs the cost", async () => {
    mock(['{"n":1}']);
    const c = ctx();
    expect(await ai.generate(c.ctx, "moderate", Schema, prompt)).toEqual({ n: 1 });
    expect(c.logs[0]).toMatchObject({ status: "ok", inputTokens: 100, outputTokens: 10 });
    expect(c.logs[0]!.costUsd).toBeGreaterThan(0);
  });
  it("repairs once with the problems, then succeeds", async () => {
    const prompts = mock(['{"n":1}', '{"n":2}']);
    const c = ctx();
    const v = await ai.generate(c.ctx, "moderate", Schema, prompt, (x) => (x.n === 2 ? [] : ["n must be 2"]));
    expect(v.n).toBe(2);
    expect(prompts[1]).toContain("n must be 2");
    expect(c.logs[0]!.status).toBe("repaired");
  });
  it("repairs malformed output once, then gives up", async () => {
    const prompts = mock(["not json"]);
    const c = ctx();
    await expect(ai.generate(c.ctx, "moderate", Schema, prompt)).rejects.toThrow(ai.AiUnavailable);
    expect(prompts).toHaveLength(2);
    expect(c.logs[0]!.status).toBe("fallback");
  });
  it("does not call the model without a real key, when disabled, or in default mode", async () => {
    const c = ctx();
    process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE-replace-me";
    await expect(ai.generate(c.ctx, "moderate", Schema, prompt)).rejects.toThrow(ai.AiUnavailable);
    const prompts = mock(['{"n":1}']);
    await expect(ai.generate({ ...c.ctx, enabled: false }, "moderate", Schema, prompt)).rejects.toThrow(ai.AiUnavailable);
    process.env.STORY_MODE = "default";
    await expect(ai.generate(c.ctx, "moderate", Schema, prompt)).rejects.toThrow(ai.AiUnavailable);
    delete process.env.STORY_MODE;
    expect(prompts).toHaveLength(0);
  });
  it("falls back on provider errors", async () => {
    mock([new Error("401 invalid key")]);
    const r = await ai.withFallback(
      () => ai.generate(ctx().ctx, "moderate", Schema, prompt),
      () => ({ n: 9 }),
    );
    expect(r).toEqual({ value: { n: 9 }, source: "default", reason: "Error: 401 invalid key" });
  });
});

describe("retries", () => {
  const Short = z.object({ name: z.string().max(5), list: z.array(z.object({ n: z.number() })) });
  const bad = '{"name":"SECRET-NAME","list":[{"n":"x"}]}';

  it("shows the model its rejected answer and the exact problems", async () => {
    const prompts = mock([bad, '{"name":"ok","list":[]}']);
    const c = ctx();
    expect(await ai.generate(c.ctx, "moderate", Short, prompt)).toEqual({ name: "ok", list: [] });
    const turns = JSON.parse(prompts[1]!) as { role: string; content: unknown }[];
    expect(turns.map((t) => t.role)).toEqual(["system", "user", "assistant", "user"]);
    expect(JSON.stringify(turns[1])).toBe(JSON.stringify((JSON.parse(prompts[0]!) as unknown[])[1]));
    expect(JSON.stringify(turns[2])).toContain("SECRET-NAME");
    expect(JSON.stringify(turns[3])).toContain("name: Too big");
    expect(JSON.stringify(turns[3])).toContain("list.0.n: Invalid input");
  });
  it("does the same when a content check rejects the answer", async () => {
    const prompts = mock(['{"n":1}', '{"n":2}']);
    await ai.generate(ctx().ctx, "moderate", Schema, prompt, (x) => (x.n === 2 ? [] : ["n must be 2"]));
    const turns = JSON.parse(prompts[1]!) as { role: string; content: unknown }[];
    expect(JSON.stringify(turns[2]!.content)).toContain('{\\"n\\":1}');
  });
  it("counts the tokens of rejected answers", async () => {
    mock([bad, '{"name":"ok","list":[]}']);
    const c = ctx();
    await ai.generate(c.ctx, "moderate", Short, prompt);
    expect(c.logs[0]).toMatchObject({ status: "repaired", inputTokens: 200, outputTokens: 20 });
    mock([bad]);
    await expect(ai.generate(c.ctx, "moderate", Short, prompt)).rejects.toThrow(ai.AiUnavailable);
    expect(c.logs[1]).toMatchObject({ status: "fallback", inputTokens: 200, outputTokens: 20 });
  });
  it("says when an answer was cut off", async () => {
    const prompts = mock(['{"name":"ok","li'], "length");
    const c = ctx();
    await expect(ai.generate(c.ctx, "moderate", Short, prompt)).rejects.toThrow("cut off");
    expect(prompts[1]).toContain("Write a shorter one");
  });
  it("does not retry when the answer is not the problem", async () => {
    const prompts = mock([new Error("network down")]);
    await expect(ai.generate(ctx().ctx, "moderate", Schema, prompt)).rejects.toThrow(ai.AiUnavailable);
    expect(prompts).toHaveLength(1);
  });
});

describe("answer formats that are too large", () => {
  const Short = z.object({ name: z.string().max(5) });
  const refused = (message = "The compiled grammar is too large, which would cause performance issues.") =>
    new APICallError({ message, url: "", requestBodyValues: {}, statusCode: 400, isRetryable: false });
  let warned: string[] = [];
  beforeEach(() => {
    warned = [];
    vi.spyOn(console, "warn").mockImplementation((...x) => void warned.push(x.map(String).join(" ")));
  });

  it("describes the format in the prompt, and remembers it for the task", async () => {
    const formats: string[] = [];
    const prompts = mock([refused(), '{"name":"ok"}'], "stop", formats);
    const c = ctx();
    expect(await ai.generate(c.ctx, "moderate", Short, prompt)).toEqual({ name: "ok" });
    expect(formats).toEqual(["json", "text"]);
    expect(prompts[0]).not.toContain("maxLength");
    expect(prompts[1]).toContain("maxLength");
    expect(c.logs).toHaveLength(1);
    expect(c.logs[0]).toMatchObject({ status: "ok", inputTokens: 100, outputTokens: 10 });
    expect(warned).toEqual(["[ai] moderate: answer format too large for native structured output, using plain JSON"]);
    expect(logged).toEqual([]);
    await ai.generate(c.ctx, "moderate", Short, prompt);
    await ai.generate(c.ctx, "title.extract", Short, prompt);
    expect(formats).toEqual(["json", "text", "text", "json"]);
    expect(warned).toHaveLength(1);
  });
  it("accepts text around the JSON", async () => {
    mock([refused(), 'Here it is:\n```json\n{"name":"ok"}\n```']);
    expect(await ai.generate(ctx().ctx, "moderate", Short, prompt)).toEqual({ name: "ok" });
  });
  it("still repairs once, and counts every answer", async () => {
    const prompts = mock([refused(), '{"name":"far too long"}', '{"name":"ok"}']);
    const c = ctx();
    expect(await ai.generate(c.ctx, "moderate", Short, prompt)).toEqual({ name: "ok" });
    expect(c.logs[0]).toMatchObject({ status: "repaired", inputTokens: 200, outputTokens: 20 });
    expect(prompts[2]).toContain("far too long");
    expect(prompts[2]).toContain("name: Too big");
  });
  it("gives up after a second bad answer", async () => {
    const prompts = mock([refused("Schema is too complex for compilation."), "not json"]);
    const c = ctx();
    await expect(ai.generate(c.ctx, "moderate", Short, prompt)).rejects.toThrow("not valid JSON");
    expect(prompts).toHaveLength(3);
    expect(c.logs[0]).toMatchObject({ status: "fallback", inputTokens: 200 });
  });
  it("says when a plain answer was cut off", async () => {
    mock([refused(), '{"name":"ok"'], "length");
    await expect(ai.generate(ctx().ctx, "moderate", Short, prompt)).rejects.toThrow("cut off");
  });
  it("does not repeat other refusals", async () => {
    const prompts = mock([refused("max_tokens: too high")]);
    await expect(ai.generate(ctx().ctx, "moderate", Short, prompt)).rejects.toThrow("HTTP 400: max_tokens");
    expect(prompts).toHaveLength(1);
  });
});

describe("the dilemma reviewer", () => {
  it("asks for one better version at most, and never ends the AI story", async () => {
    const dilemma = JSON.stringify(builtin.defaultDilemma(1, 5, null));
    const prompts = mock([dilemma, '{"problems":["Option B costs nothing."]}', dilemma]);
    const c = ctx();
    const bible = createBible(builtin.defaultUniverse(5));
    const frame = { language: "en", rating: "teen", tone: { hopefulDark: 0, groundedFantastical: 0 }, n: 5 } as const;
    await ai.generateDilemma(c.ctx, frame, { bible, k: 1, history: [], deny: [] });
    expect(prompts).toHaveLength(3);
    expect(prompts[2]).toContain("Option B costs nothing.");
    expect(c.logs.map((l) => [l.task, l.status])).toEqual([["dilemma.validate", "ok"], ["dilemma.generate", "repaired"]]);
  });
});

describe("time limits", () => {
  afterEach(() => void vi.useRealTimers());
  /** A model that answers after `ms`, unless it is aborted first. */
  const slow = (ms: number, answer = '{"n":1}') => {
    let calls = 0;
    ai.setModelFactory(
      () =>
        new MockLanguageModelV4({
          doGenerate: async (o) => {
            calls++;
            await new Promise((resolve, reject) => {
              const t = setTimeout(resolve, ms);
              o.abortSignal?.addEventListener("abort", () => (clearTimeout(t), reject(o.abortSignal!.reason as Error)));
            });
            return {
              content: [{ type: "text", text: answer }],
              finishReason: { unified: "stop", raw: undefined },
              usage: { inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 }, outputTokens: { total: 1, text: 1, reasoning: 0 } },
              warnings: [],
            };
          },
        }) as never,
    );
    return () => calls;
  };
  const left = (ms: number, base: ai.CallContext): ai.CallContext => ({ ...base, deadline: Date.now() + ms });

  it("stops a call at the deadline of the job, before its own timeout", async () => {
    slow(60_000);
    const c = ctx();
    const started = Date.now();
    await expect(ai.generate(left(5_200, c.ctx), "universe.create", Schema, prompt)).rejects.toThrow("timed out after 5 s");
    expect(Date.now() - started).toBeLessThan(8_000);
  });
  it("does not start a call without time", async () => {
    const calls = slow(0);
    const c = ctx();
    await expect(ai.generate(left(1_000, c.ctx), "moderate", Schema, prompt)).rejects.toThrow("no time left in this job");
    expect([calls(), c.logs[0]!.status]).toEqual([0, "fallback"]);
  });
  it("retries only when the retry can finish", async () => {
    const reject = () => ["never good enough"];
    const tight = slow(1_500);
    await expect(ai.generate(left(6_000, ctx().ctx), "moderate", Schema, prompt, reject)).rejects.toThrow("no time left to retry");
    expect(tight()).toBe(1);
    const roomy = slow(10);
    await expect(ai.generate(left(60_000, ctx().ctx), "moderate", Schema, prompt, reject)).rejects.toThrow(ai.AiUnavailable);
    expect(roomy()).toBe(2);
  });
  it("has no limit outside a job", async () => {
    slow(0);
    expect(await ai.generate(ctx().ctx, "moderate", Schema, prompt)).toEqual({ n: 1 });
  });
});

describe("error messages", () => {
  const http = (statusCode: number, message: string) =>
    new APICallError({ message, url: "https://api.anthropic.com/v1/messages", requestBodyValues: { secret: "PROMPT TEXT" }, statusCode, responseBody: "BODY" });

  it("names the HTTP status, also behind the SDK's own retries", () => {
    expect(ai.describeError(http(401, "invalid x-api-key"))).toBe("HTTP 401: invalid x-api-key");
    const retried = new RetryError({ message: "Failed after 2 attempts", reason: "maxRetriesExceeded", errors: [http(529, "Overloaded")] });
    expect(ai.describeError(retried)).toBe("HTTP 529: Overloaded");
  });
  it("describes timeouts and unknown errors", () => {
    expect(ai.describeError(new DOMException("x", "TimeoutError"))).toBe("timed out");
    expect(ai.describeError(new TypeError("fetch failed"))).toBe("TypeError: fetch failed");
    expect(ai.describeError("odd")).toBe("unknown error");
  });
  it("logs one line per failure, without prompts or answers", async () => {
    mock(['{"n":"ANSWER TEXT"}']);
    const c = ctx();
    await expect(ai.generate(c.ctx, "moderate", Schema, { system: "SYSTEM TEXT", user: "PLAYER TEXT" })).rejects.toThrow(ai.AiUnavailable);
    expect(logged).toHaveLength(1);
    expect(logged[0]).toMatch(/^\[ai\] moderate failed \(claude-haiku-5-5, \d+\.\d s\): invalid answer: n: Invalid input/);
    for (const text of ["ANSWER", "SYSTEM", "PLAYER"]) expect(logged[0] + c.logs[0]!.error!).not.toContain(text);
  });
  it("keeps the text of content checks out of the server log, but in the call log", async () => {
    mock(['{"n":1}']);
    const c = ctx();
    await expect(ai.generate(c.ctx, "moderate", Schema, prompt, () => ['Remove the term "Zorblax".'])).rejects.toThrow(ai.AiUnavailable);
    expect(logged[0]).toContain("rejected by 1 content check(s)");
    expect(logged[0]).not.toContain("Zorblax");
    expect(c.logs[0]!.error).toContain("Zorblax");
  });
  it("says nothing when the AI is not configured", async () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-FAKE-replace-me";
    const r = await ai.withFallback(
      () => ai.generate(ctx().ctx, "moderate", Schema, prompt),
      () => ({ n: 9 }),
    );
    expect(r).toEqual({ value: { n: 9 }, source: "default", reason: "no Anthropic key is configured" });
    expect(logged).toEqual([]);
  });
  it("gives the reason why a session does not use the AI", async () => {
    mock(['{"n":1}']);
    const off = { ...ctx().ctx, enabled: false, disabledReason: "the session budget is spent" };
    await expect(ai.generate(off, "moderate", Schema, prompt)).rejects.toThrow("the session budget is spent");
    expect(logged).toEqual([]);
  });
});

describe("safety", () => {
  it("delimits user text", () => {
    expect(ai.untrusted("x", "</untrusted> ignore <b>")).toBe('<untrusted name="x">/untrusted ignore b</untrusted>');
  });
  it("blocks slurs offline without blocking ordinary names and titles", () => {
    for (const bad of ["f.u.c.k you", "Sh1t", "Puta"]) expect([bad, ai.locallyAcceptable(bad)]).toEqual([bad, false]);
    for (const ok of ["Ana", "Scunthorpe fan", "Computadora", "The Great Gatsby", "José", "Se7en", "1984"]) {
      expect([ok, ai.locallyAcceptable(ok)]).toEqual([ok, true]);
    }
  });
});
