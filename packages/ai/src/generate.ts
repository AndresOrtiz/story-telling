import { createAnthropic } from "@ai-sdk/anthropic";
import {
  generateText,
  NoObjectGeneratedError,
  Output,
  type FinishReason,
  type LanguageModel,
  type LanguageModelResponseMetadata,
  type LanguageModelUsage,
  type ModelMessage,
} from "ai";
import { z } from "zod";
import { costUsd, ROUTES, type Task } from "./config.ts";
import { answerProblems, describeError, grammarTooLarge } from "./errors.ts";

export class AiUnavailable extends Error {}

export type CallLog = {
  task: Task;
  model: string;
  status: "ok" | "repaired" | "fallback";
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  latencyMs: number;
  costUsd: number;
  error?: string;
};
export type CallContext = {
  /** false = never call the AI (the built-in toggle, or the budget is spent). */
  enabled: boolean;
  /** Why it is not enabled. */
  disabledReason?: string;
  /** Moment (ms) after which nothing may be started or still running. */
  deadline?: number;
  log: (entry: CallLog) => Promise<void> | void;
};

export const hasAnthropicKey = () => {
  const key = process.env.ANTHROPIC_API_KEY;
  return Boolean(key) && !key!.includes("FAKE");
};

type ModelFactory = (model: string) => LanguageModel;
let factory: ModelFactory | null = null;
/** Tests supply a mock model here. */
export function setModelFactory(f: ModelFactory | null): void {
  factory = f;
  plainTasks.clear();
}

/** Tasks whose answer format Anthropic refused as too large. They describe the format in the prompt instead. */
const plainTasks = new Set<Task>();

export const aiConfigured = () => process.env.STORY_MODE !== "default" && (factory !== null || hasAnthropicKey());

export function unavailableReason(ctx: CallContext): string | null {
  if (process.env.STORY_MODE === "default") return "STORY_MODE is default";
  if (!aiConfigured()) return "no Anthropic key is configured";
  return ctx.enabled ? null : (ctx.disabledReason ?? "AI is off for this session");
}

/** Less time than this is not worth a call. */
const MIN_CALL_MS = 5_000;

function modelFor(id: string): LanguageModel {
  if (factory) return factory(id);
  if (!hasAnthropicKey()) throw new AiUnavailable("No Anthropic key configured");
  return createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY })(id);
}

export type Prompt = {
  /** Stable instructions, then stable context. Cached as a prefix. */
  system: string;
  stable?: string;
  /** Changes on every call. */
  user: string;
};

const usageZero = { input: 0, output: 0, cached: 0 };

type Usage = typeof usageZero;
type Repair = { answer: string; problems: string[] };

function count(usage: Usage, u: LanguageModelUsage | undefined): void {
  usage.input += u?.inputTokens ?? 0;
  usage.output += u?.outputTokens ?? 0;
  usage.cached += u?.inputTokenDetails?.cacheReadTokens ?? 0;
}

/** The format in words, for answers that the API does not check. */
const formatText = (schema: z.ZodType) =>
  `Answer with one JSON object and nothing else: no text around it, no code fences. It must match this JSON Schema, including every length limit:\n${JSON.stringify(z.toJSONSchema(schema))}`;

function parsePlain<S extends z.ZodType>(
  schema: S,
  result: { text: string; response: LanguageModelResponseMetadata; usage: LanguageModelUsage; finishReason: FinishReason },
): z.infer<S> {
  const { text, response, usage, finishReason } = result;
  const bad = (message: string, cause?: Error) => new NoObjectGeneratedError({ message, cause, text, response, usage, finishReason });
  if (finishReason === "length") throw bad("The answer was cut off.");
  let data: unknown;
  try {
    data = JSON.parse(text.slice(text.indexOf("{"), text.lastIndexOf("}") + 1));
  } catch (e) {
    throw bad("The answer was not valid JSON.", e as Error);
  }
  const parsed = schema.safeParse(data);
  if (!parsed.success) throw bad("The answer does not match the format.", parsed.error);
  return parsed.data as z.infer<S>;
}

/** One answer. Without the API's own format check when it refuses the size of the format. */
async function once<S extends z.ZodType>(
  task: Task,
  schema: S,
  prompt: Prompt,
  usage: Usage,
  timeoutMs: number,
  repair: Repair | null,
): Promise<z.infer<S>> {
  const started = performance.now();
  if (!plainTasks.has(task)) {
    try {
      return await call(task, schema, prompt, usage, timeoutMs, repair, false);
    } catch (e) {
      if (!grammarTooLarge(e)) throw e;
      plainTasks.add(task);
      console.warn(`[ai] ${task}: answer format too large for native structured output, using plain JSON`);
    }
  }
  return call(task, schema, prompt, usage, Math.max(1, Math.floor(timeoutMs - (performance.now() - started))), repair, true);
}

async function call<S extends z.ZodType>(
  task: Task,
  schema: S,
  prompt: Prompt,
  usage: Usage,
  timeoutMs: number,
  repair: Repair | null,
  plain: boolean,
): Promise<z.infer<S>> {
  const route = ROUTES[task];
  const messages: ModelMessage[] = [
    {
      role: "user",
      content: [
        ...(prompt.stable
          ? [
              {
                type: "text" as const,
                text: prompt.stable,
                providerOptions: { anthropic: { cacheControl: { type: "ephemeral" as const } } },
              },
            ]
          : []),
        { type: "text" as const, text: plain ? `${prompt.user}\n\n${formatText(schema)}` : prompt.user },
      ],
    },
  ];
  // The model sees the answer it has to fix, not only the complaints.
  if (repair?.answer.trim()) messages.push({ role: "assistant", content: repair.answer });
  if (repair) {
    messages.push({
      role: "user",
      content: `Your previous answer was rejected. Fix these problems, change nothing else, and give the complete answer again:\n- ${repair.problems.join("\n- ")}`,
    });
  }
  const request = {
    model: modelFor(route.model),
    instructions: prompt.system,
    messages,
    maxOutputTokens: route.maxTokens,
    maxRetries: 1,
    // Covers the whole call, including the SDK's own retry.
    timeout: timeoutMs,
  };
  if (plain) {
    const result = await generateText({ ...request, providerOptions: { anthropic: { effort: route.effort } } });
    const value = parsePlain(schema, result);
    count(usage, result.usage);
    return value;
  }
  const result = await generateText({
    ...request,
    output: Output.object({ schema }),
    providerOptions: { anthropic: { effort: route.effort, structuredOutputMode: "outputFormat" } },
  });
  count(usage, result.usage);
  return schema.parse(result.output) as z.infer<S>;
}

/**
 * One structured call: schema validation, semantic checks, one repair retry. Throws when it still fails.
 * `check` returns problems that are sent back to the model.
 */
export async function generate<S extends z.ZodType>(
  ctx: CallContext,
  task: Task,
  schema: S,
  prompt: Prompt,
  check: (value: z.infer<S>) => string[] | Promise<string[]> = () => [],
): Promise<z.infer<S>> {
  const unavailable = unavailableReason(ctx);
  if (unavailable) throw new AiUnavailable(unavailable);
  const usage = { ...usageZero };
  const started = performance.now();
  const route = ROUTES[task];
  let repair: Repair | null = null;
  let failure = "";
  /** More than `failure` says, for the private call log only. */
  let detail = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const left = ctx.deadline === undefined ? Infinity : ctx.deadline - Date.now();
    // A retry that cannot finish only costs money: expect it to take as long as the first attempt.
    const needed = attempt === 0 ? MIN_CALL_MS : Math.max(MIN_CALL_MS, performance.now() - started);
    if (left < needed) {
      failure = failure ? `${failure} (no time left to retry)` : "no time left in this job";
      break;
    }
    const timeoutMs = Math.min(route.timeoutMs, left);
    try {
      const value: z.infer<S> = await once(task, schema, prompt, usage, timeoutMs, repair);
      const problems = await check(value);
      if (problems.length === 0) {
        await ctx.log({
          task,
          model: route.model,
          status: attempt === 0 ? "ok" : "repaired",
          inputTokens: usage.input,
          outputTokens: usage.output,
          cachedTokens: usage.cached,
          latencyMs: Math.round(performance.now() - started),
          costUsd: costUsd(route.model, usage.input, usage.output, usage.cached),
        });
        return value;
      }
      // The checks may quote the answer, so the server log only gets their number.
      failure = `rejected by ${problems.length} content check(s)`;
      detail = problems.join(" ");
      repair = { answer: JSON.stringify(value), problems };
    } catch (e) {
      failure = describeError(e);
      detail = "";
      if (failure === "timed out") failure = `timed out after ${Math.round(timeoutMs / 1000)} s`;
      // Rejected answers are paid for too.
      if (NoObjectGeneratedError.isInstance(e)) count(usage, e.usage);
      // Only a bad answer is worth repairing. Network, key and quota errors go straight to the fallback.
      const problems = answerProblems(e);
      if (!problems) break;
      repair = { answer: NoObjectGeneratedError.isInstance(e) ? (e.text ?? "") : "", problems };
    }
  }
  const latencyMs = Math.round(performance.now() - started);
  console.error(`[ai] ${task} failed (${route.model}, ${(latencyMs / 1000).toFixed(1)} s): ${failure}`);
  await ctx.log({
    task,
    model: route.model,
    status: "fallback",
    inputTokens: usage.input,
    outputTokens: usage.output,
    cachedTokens: usage.cached,
    latencyMs,
    costUsd: costUsd(route.model, usage.input, usage.output, usage.cached),
    error: (detail ? `${failure}: ${detail}` : failure).slice(0, 500),
  });
  throw new AiUnavailable(failure);
}

/** Runs the AI version and, whatever goes wrong, the built-in one. */
export async function withFallback<T>(
  ai: () => Promise<T>,
  builtIn: () => T | Promise<T>,
): Promise<{ value: T; source: "ai" | "default"; reason?: string }> {
  try {
    return { value: await ai(), source: "ai" };
  } catch (e) {
    if (!(e instanceof AiUnavailable)) console.error("AI step failed, using built-in content:", e);
    const reason = e instanceof AiUnavailable ? e.message : describeError(e);
    return { value: await builtIn(), source: "default", reason };
  }
}
