import { describe, expect, it } from "vitest";
import { createBible, dilemmaProblems, applyDiff, groundingProblems, scorePlayer, scoreGroup } from "@cs/engine";
import { Consequence, Dilemma, FinalStory, GroupNarrative, ProfileNarrative, UniverseWithSpine, WriteInCheck } from "@cs/schemas";
import * as d from "../src/index.ts";

describe("default story", () => {
  it("has a valid universe and spine for every N", () => {
    for (let n = 3; n <= 15; n++) {
      const u = UniverseWithSpine.parse(d.defaultUniverse(n));
      expect(u.spine.beats).toHaveLength(n);
    }
    expect(d.DEFAULT_UNIVERSE.personas).toHaveLength(10);
  });
  it("has 15 valid, distinct dilemmas with a consequence per option", () => {
    const bible = createBible(d.defaultUniverse(15));
    expect(d.DEFAULT_DILEMMAS).toHaveLength(15);
    expect(new Set(d.DEFAULT_DILEMMAS.map((x) => x.dilemma.title)).size).toBe(15);
    for (const { dilemma, outcomes } of d.DEFAULT_DILEMMAS) {
      Dilemma.parse(dilemma);
      const words = (s: string) => s.split(/\s+/).length;
      // The same lengths the AI is asked for.
      expect([dilemma.title, words(dilemma.context) <= 45, words(dilemma.moral_conflict) <= 10]).toEqual([dilemma.title, true, true]);
      for (const o of dilemma.options) expect([o.label, words(o.description) <= 14, words(o.visible_consequence) <= 14]).toEqual([o.label, true, true]);
      expect([dilemma.title, dilemmaProblems(dilemma, bible)]).toEqual([dilemma.title, []]);
      for (const o of dilemma.options) expect(outcomes[o.key]!.length).toBeGreaterThan(40);
    }
    expect(d.DEFAULT_DILEMMAS.filter((x) => x.dilemma.format === "multiple").length).toBeGreaterThanOrEqual(3);
  });
  it("always ends on the climax and never repeats a dilemma", () => {
    for (let n = 3; n <= 15; n++) {
      const idx = Array.from({ length: n }, (_, i) => d.defaultIndex(i + 1, n));
      expect(new Set(idx).size).toBe(n);
      expect(idx.at(-1)).toBe(15);
    }
  });
  it("builds valid consequences for every option, combination and write-in", () => {
    const bible = createBible(d.defaultUniverse(15));
    for (let k = 1; k <= 15; k++) {
      const dilemma = d.defaultDilemma(k, 15, { title: "Before", labels: ["x"] });
      Dilemma.parse(dilemma);
      const chosen = dilemma.options.slice(0, dilemma.max_select).map((o) => ({ key: o.key, label: o.label, origin: "ai" as const }));
      const c = Consequence.parse(d.defaultConsequence({ k, n: 15, dilemma, chosen, minorityLabels: ["Other"], byFate: true }));
      expect(applyDiff(bible, c.diff, k).rejected).toEqual([]);
    }
    const dilemma = d.defaultDilemma(1, 5, null);
    const own = d.defaultConsequence({ k: 1, n: 5, dilemma, chosen: [{ key: "W1", label: "Dig a tunnel", origin: "write_in" }], minorityLabels: [], byFate: false });
    expect(Consequence.parse(own).narrative).toContain("Dig a tunnel");
    WriteInCheck.parse(d.defaultWriteIn("Dig a tunnel"));
  });
  it("writes grounded profiles and a group report", () => {
    const scores = scorePlayer("p", []);
    const p = ProfileNarrative.parse(d.defaultProfile(scores, [{ k: 2, title: "T", labels: ["L"], withGroup: true }]));
    expect(groundingProblems(p, [2])).toEqual([]);
    GroupNarrative.parse(d.defaultGroup(scoreGroup(["p"], []), {}));
  });
  it("tells a story of 8 to 15 scenes that ends on the chosen ending, for every N", () => {
    for (let n = 3; n <= 15; n++)
      for (const e of d.DEFAULT_ENDINGS) {
        const turns = Array.from({ length: n }, (_, i) => {
          const dilemma = d.defaultDilemma(i + 1, n, null);
          return { k: i + 1, title: dilemma.title, labels: ["x"], narrative: "n".repeat(1700), dilemma };
        });
        const s = FinalStory.parse(d.defaultStory({ universe: d.DEFAULT_UNIVERSE, endingId: e.id, endingPremise: e.premise, turns, personas: [{ player: "Ana", persona: "the Scout", legacy: "x" }] }));
        expect(s.scenes.some((x) => x.headline === d.ENDING_TEXT[e.id]!.headline)).toBe(true);
        expect(s.scenes.some((x) => x.source_k === n && x.headline === "The Heart of Meridian")).toBe(true);
      }
  });
  it("searches the catalog", () => {
    expect(d.CATALOG.length).toBeGreaterThanOrEqual(100);
    expect(new Set(d.CATALOG.map((c) => c.id)).size).toBe(d.CATALOG.length);
    expect(d.searchCatalog("hob")[0]!.title).toBe("The Hobbit");
    expect(d.findInCatalog("the hobbit")?.rating).toBe("family");
  });
});
