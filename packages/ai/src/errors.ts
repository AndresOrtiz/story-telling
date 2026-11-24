import { APICallError, NoObjectGeneratedError, RetryError } from "ai";

const MAX_PROBLEMS = 10;

type Issue = { path: PropertyKey[]; message: string };

/** Zod problems, wherever the SDK put them in the chain of causes. */
function issuesOf(e: unknown): Issue[] | null {
  for (let x: unknown = e, depth = 0; x && depth < 5; x = (x as { cause?: unknown }).cause, depth++) {
    const issues = (x as { issues?: unknown }).issues;
    if (Array.isArray(issues)) return issues as Issue[];
  }
  return null;
}

const cutOff = (e: unknown) => NoObjectGeneratedError.isInstance(e) && e.finishReason === "length";

/**
 * What is wrong with an answer, in words that the model can act on. Null when the answer is not the problem
 * (network, key, quota, timeout), because then a retry with corrections would be pointless.
 */
export function answerProblems(e: unknown): string[] | null {
  if (cutOff(e)) return ["The answer was cut off because it was too long. Write a shorter one."];
  const issues = issuesOf(e);
  if (issues) return issues.slice(0, MAX_PROBLEMS).map((i) => `${i.path.map(String).join(".") || "answer"}: ${i.message}`);
  if (NoObjectGeneratedError.isInstance(e)) return ["The answer was not valid JSON."];
  return null;
}

/** Anthropic compiles the answer format into a grammar, and refuses formats above an unpublished size. */
export function grammarTooLarge(e: unknown): boolean {
  if (RetryError.isInstance(e)) return grammarTooLarge(e.lastError);
  return APICallError.isInstance(e) && e.statusCode === 400 && /grammar is too large|schema is too complex/i.test(e.message);
}

/**
 * One line for logs. Never contains prompts, answers or player text: the SDK's own validation message
 * includes the whole answer, so it is not used.
 */
export function describeError(e: unknown): string {
  if (RetryError.isInstance(e)) return describeError(e.lastError);
  if (APICallError.isInstance(e)) return `HTTP ${e.statusCode ?? "error"}: ${e.message}`.slice(0, 300);
  const problems = answerProblems(e);
  if (problems) return `invalid answer: ${problems.join("; ")}`.slice(0, 500);
  if (e instanceof Error) {
    if (e.name === "TimeoutError" || e.name === "AbortError") return "timed out";
    return `${e.name}: ${e.message}`.slice(0, 300);
  }
  return "unknown error";
}
