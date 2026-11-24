import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { LANGUAGES } from "@cs/schemas";

type Tree = { [key: string]: string | Tree };
const load = (l: string): Tree => JSON.parse(readFileSync(new URL(`../../../apps/web/messages/${l}.json`, import.meta.url), "utf8"));
const flat = (t: Tree, path = ""): [string, string][] =>
  Object.entries(t).flatMap(([k, v]) => (typeof v === "string" ? [[path + k, v] as [string, string]] : flat(v, `${path}${k}.`)));
const names = (s: string) => [...new Set([...s.matchAll(/\{(\w+)[,}]/g)].map((m) => m[1]))].sort();

describe("translations", () => {
  const en = new Map(flat(load("en")));
  for (const l of LANGUAGES) {
    it(`${l} has every key with the same placeholders`, () => {
      const other = new Map(flat(load(l)));
      expect([...other.keys()].sort()).toEqual([...en.keys()].sort());
      for (const [key, text] of other) expect([key, names(text)]).toEqual([key, names(en.get(key)!)]);
    });
  }
});
