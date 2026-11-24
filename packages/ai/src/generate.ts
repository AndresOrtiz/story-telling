import { createAnthropic } from "@ai-sdk/anthropic";
import { generateText, NoObjectGeneratedError, Output, type LanguageModel } from "ai";
import type { z } from "zod";
import { costUsd, ROUTES, type Task } from "./config.ts";

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
  /** false = never call the AI (STORY_MODE=default, the built-in toggle, or the budget is spent). */
  enabled: boolean;
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
}

export const aiConfigured = () => process.env.STORY_MODE !== "default" && (factory !== null || hasAnthropicKey());

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

async function once<S extends z.ZodType>(task: Task, schema: S, prompt: Prompt, usage: typeof usageZero): Promise<z.infer<S>> {
  const route = ROUTES[task];
  const result = await generateText({
    model: modelFor(route.model),
    output: Output.object({ schema }),
    instructions: prompt.system,
    messages: [
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
          { type: "text" as const, text: prompt.user },
        ],
      },
    ],
    maxOutputTokens: route.maxTokens,
    maxRetries: 1,
    timeout: route.timeoutMs,
    providerOptions: { anthropic: { effort: route.effort, structuredOutputMode: "outputFormat" } },
  });
  usage.input += result.usage.inputTokens ?? 0;
  usage.output += result.usage.outputTokens ?? 0;
  usage.cached += result.usage.inputTokenDetails?.cacheReadTokens ?? 0;
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
  if (!ctx.enabled || !aiConfigured()) throw new AiUnavailable("AI is not available for this session");
  const usage = { ...usageZero };
  const started = performance.now();
  const route = ROUTES[task];
  let problems: string[] = [];
  let failure = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    const repair = problems.length
      ? `\n\nYour previous answer was rejected. Fix these problems and answer again:\n- ${problems.join("\n- ")}`
      : "";
    try {
      const value = await once(task, schema, { ...prompt, user: prompt.user + repair }, usage);
      problems = await check(value);
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
      failure = problems.join(" ");
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
      // Only malformed output is worth repairing. Network, auth and quota errors go straight to the fallback.
      const malformed = NoObjectGeneratedError.isInstance(e) || (e instanceof Error && e.name === "ZodError");
      if (!malformed) break;
      problems = ["The answer did not match the required format."];
    }
  }
  await ctx.log({
    task,
    model: route.model,
    status: "fallback",
    inputTokens: usage.input,
    outputTokens: usage.output,
    cachedTokens: usage.cached,
    latencyMs: Math.round(performance.now() - started),
    costUsd: costUsd(route.model, usage.input, usage.output, usage.cached),
    error: failure.slice(0, 500),
  });
  throw new AiUnavailable(failure);
}

/** Runs the AI version and, whatever goes wrong, the built-in one. */
export async function withFallback<T>(
  ai: () => Promise<T>,
  builtIn: () => T | Promise<T>,
): Promise<{ value: T; source: "ai" | "default" }> {
  try {
    return { value: await ai(), source: "ai" };
  } catch (e) {
    if (!(e instanceof AiUnavailable)) console.error("AI step failed, using built-in content:", e);
    return { value: await builtIn(), source: "default" };
  }
}
