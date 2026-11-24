import { z } from "zod";
import { generate, withFallback, type CallContext } from "./generate.ts";
import { RULES, untrusted } from "./prompts.ts";

const fold = (s: string) =>
  s
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[@4]/g, "a")
    .replace(/[3€]/g, "e")
    .replace(/[1!|]/g, "i")
    .replace(/0/g, "o")
    .replace(/[$5]/g, "s")
    .replace(/7/g, "t");

/** Small offline list (en, es, pt, fr, de). Whole words, or stems that have no innocent use. */
const STEMS = ["fuck", "nigg", "faggot", "motherf", "hijodeputa", "hijo de puta", "gilipoll", "maricon", "arschloch", "hurensohn", "encule", "caralho", "viado"];
const WORDS = ["shit", "cunt", "bitch", "whore", "slut", "rape", "nazi", "hitler", "puta", "mierda", "cabron", "merda", "porra", "merde", "pute", "salope", "connard", "scheisse", "fotze", "porn", "kill yourself", "kys"];

/** Instant check that needs no network. Returns true when the text is acceptable. */
export function locallyAcceptable(text: string): boolean {
  const f = fold(text);
  const squeezed = f.replace(/[^a-z]/g, "");
  if (STEMS.some((s) => squeezed.includes(s.replace(/ /g, "")))) return false;
  return !WORDS.some((w) => new RegExp(`(?<![a-z])${w}(?![a-z])`).test(f));
}

const Verdict = z.object({ acceptable: z.boolean(), reason: z.string() });

/** Local list first, then the classifier when it is available. */
export async function acceptable(ctx: CallContext, kind: "nickname" | "title" | "image prompt", text: string): Promise<boolean> {
  if (!locallyAcceptable(text)) return false;
  const { value } = await withFallback(
    () =>
      generate(ctx, "moderate", Verdict, {
        system: `You moderate short texts for a storytelling game played by friends, schools and companies. Reject slurs, sexual content, harassment, real-world hate and self-harm. Titles of real published books, films and series are acceptable. ${RULES}`,
        user: `Kind: ${kind}\n${untrusted("text", text)}`,
      }),
    () => ({ acceptable: true, reason: "" }),
  );
  return value.acceptable;
}
