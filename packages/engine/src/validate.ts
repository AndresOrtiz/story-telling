import { AXES, type Bible, type Dilemma, type ProfileNarrative } from "@cs/schemas";

/** Deterministic checks on a generated dilemma. Returns readable problems (empty = valid). */
export function dilemmaProblems(d: Dilemma, bible: Bible): string[] {
  const p: string[] = [];
  const keys = d.options.map((o) => o.key);
  if (new Set(keys).size !== keys.length) p.push("Option keys must be unique.");
  if (keys.some((k) => !/^[A-F]$/.test(k))) p.push("Option keys must be A to F.");
  if (d.format === "single" && (d.min_select !== 1 || d.max_select !== 1)) {
    p.push("Single selection needs min_select and max_select of 1.");
  }
  if (d.format === "multiple") {
    if (d.min_select > d.max_select) p.push("min_select must not exceed max_select.");
    if (d.max_select < 2) p.push("Multiple selection needs max_select of at least 2.");
    if (d.max_select > keys.length) p.push("max_select must not exceed the number of options.");
  }
  for (const [a, b] of d.exclusive) {
    if (a === b || !keys.includes(a!) || !keys.includes(b!)) p.push(`Invalid exclusive pair ${a}/${b}.`);
  }
  for (let i = 0; i < d.options.length; i++)
    for (let j = i + 1; j < d.options.length; j++)
      if (AXES.every((a) => d.options[i]!.value_tags[a] === d.options[j]!.value_tags[a])) {
        p.push(`Options ${keys[i]} and ${keys[j]} have identical value tags.`);
      }
  for (const id of d.featured_character_ids) {
    const c = bible.characters.find((x) => x.id === id);
    if (!c) p.push(`Unknown character id ${id}.`);
    else if (c.status === "dead") p.push(`${c.name} is dead and cannot appear.`);
  }
  if (!bible.locations.some((l) => l.id === d.location_id)) p.push(`Unknown location id ${d.location_id}.`);
  return p;
}

/** Every cited dilemma must be one this player voted on (design rule 10). */
export function groundingProblems(n: ProfileNarrative, votedOn: number[]): string[] {
  if (n.cited_dilemmas.length === 0) return ["Cite at least one decision."];
  return n.cited_dilemmas.filter((k) => !votedOn.includes(k)).map((k) => `The player did not vote on dilemma ${k}.`);
}

const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Terms from the selected titles that leaked into generated content (design §14.2). */
export function leakedTerms(content: unknown, denyList: string[]): string[] {
  const text = typeof content === "string" ? content : JSON.stringify(content);
  return [...new Set(denyList.map((t) => t.trim()).filter((t) => t.length >= 4))].filter((t) =>
    new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegex(t)}(?![\\p{L}\\p{N}])`, "iu").test(text),
  );
}
