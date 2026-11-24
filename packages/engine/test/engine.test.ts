import { describe, expect, it } from "vitest";
import type { Bible, Dilemma, ValueTags } from "@cs/schemas";
import * as e from "../src/index.ts";

const tags = (t: Partial<ValueTags> = {}): ValueTags => ({ ...e.zeroTags(), ...t });
const ballots = (...b: (string | null)[]): e.Ballot[] =>
  b.map((v, i) => ({ participantId: `p${i}`, optionKeys: v ? v.split("") : [], abstained: !v }));
const keyed = (...keys: string[]) => keys.map((key) => ({ key }));
const single: e.VotingRules = {
  format: "single",
  min_select: 1,
  max_select: 1,
  exclusive: [],
  options: keyed("A", "B", "C", "D"),
};
const multi: e.VotingRules = {
  format: "multiple",
  min_select: 1,
  max_select: 3,
  exclusive: [["A", "D"]],
  options: keyed("A", "B", "C", "D", "E"),
};

describe("phases", () => {
  it("follows the design flow and guards the end of the loop", () => {
    expect(e.canTransition("lobby", "selection")).toBe(true);
    expect(e.canTransition("lobby", "voting")).toBe(false);
    expect(e.canTransition("consequence", "dilemma_preparing", { k: 2, n: 5 })).toBe(true);
    expect(e.canTransition("consequence", "dilemma_preparing", { k: 5, n: 5 })).toBe(false);
    expect(e.canTransition("consequence", "analysis_generating", { k: 5, n: 5 })).toBe(true);
  });
  it("only resumes to the paused phase", () => {
    expect(e.canTransition("voting", "paused")).toBe(true);
    expect(e.canTransition("dilemma_preparing", "paused")).toBe(false);
    expect(e.canTransition("paused", "voting", { pausedFrom: "voting" })).toBe(true);
    expect(e.canTransition("paused", "results", { pausedFrom: "voting" })).toBe(false);
    expect(e.canTransition("completed", "aborted")).toBe(false);
  });
});

describe("votes", () => {
  it("validates selections", () => {
    expect(e.selectionError(single, ["A"])).toBeNull();
    expect(e.selectionError(single, ["A", "B"])).toBe("select_one");
    expect(e.selectionError(single, ["Z"])).toBe("unknown_option");
    expect(e.selectionError(multi, ["A", "D"])).toBe("incompatible");
    expect(e.selectionError(multi, ["A", "B", "C", "E"])).toBe("too_many");
    expect(e.selectionError(multi, ["A", "A"])).toBe("duplicate_option");
  });
  it("tallies multi-select over 100% and counts abstentions", () => {
    const t = e.tally(["A", "B", "C"], ballots("AB", "AB", "AC", null));
    expect(t.percentages).toEqual({ A: 100, B: 67, C: 33 });
    expect([t.voters, t.abstentions, t.top]).toEqual([3, 1, ["A"]]);
  });
  it("computes the split index", () => {
    expect(e.splitIndex(ballots("A", "A", "A"))).toBe(0);
    expect(e.splitIndex(ballots("A", "B", "C"))).toBe(1);
    expect(e.splitIndex(ballots("A", null))).toBe(0);
  });
  it("picks single-select candidates within one vote of second place", () => {
    const ids = (...b: (string | null)[]) => e.finalCandidates(single, ballots(...b)).candidates.map((c) => c.id);
    expect(ids("A", "A", "A", "B", "B", "C")).toEqual(["A", "B", "C"]);
    expect(ids("A", "A", "A", "A", "B", "B", "B", "C")).toEqual(["A", "B"]);
    expect(ids(null, null)).toHaveLength(3);
  });
  it("skips the final vote only when unanimous and without write-ins", () => {
    expect(e.finalCandidates(single, ballots("B", "B", null)).unanimous?.id).toBe("B");
    const withWriteIn = { ...single, options: [...single.options, { key: "W1" }] };
    const r = e.finalCandidates(withWriteIn, ballots("B", "B"), ["W1"]);
    expect(r.unanimous).toBeNull();
    expect(r.candidates.map((c) => c.id)).toEqual(["B", "W1"]);
  });
  it("builds compatible combinations for multi-select", () => {
    const { candidates } = e.finalCandidates(multi, ballots("AB", "AB", "DB", "DC"));
    expect(candidates).toHaveLength(3);
    for (const c of candidates) expect(e.selectionError(multi, c.optionKeys)).toBeNull();
    expect(candidates[0]!.id).toBe("A+B");
  });
  it("revotes once on a tie, then lets fate decide", () => {
    const c = [
      { id: "A", optionKeys: ["A"] },
      { id: "B", optionKeys: ["B"] },
    ];
    expect(e.resolveFinal(c, ballots("A", "B"), false, Math.random).kind).toBe("revote");
    expect(e.resolveFinal(c, ballots("A", "B"), true, () => 0.99)).toMatchObject({
      winner: { id: "B" },
      resolvedBy: "fate",
    });
    expect(e.resolveFinal(c, ballots("A", "A", "B"), false, Math.random)).toMatchObject({
      winner: { id: "A" },
      resolvedBy: "final_vote",
    });
    expect(e.resolveFinal(c, ballots(null, null), true, () => 0)).toMatchObject({ resolvedBy: "fate" });
  });
});

describe("rating and tone", () => {
  const s = (rating: "family" | "teen" | "mature", d: number, f: number, favorite = false): e.TitleSignal => ({
    title: "x",
    rating,
    favorite,
    tone: { hopefulDark: d, groundedFantastical: f },
  });
  it("uses the most conservative rating", () => {
    expect(e.deriveRating([s("mature", 2, 0), s("family", -1, 0), s("teen", 0, 0)])).toBe("family");
    expect(e.deriveRating([])).toBe("teen");
  });
  it("weights favourites double and caps family tone", () => {
    expect(e.deriveTone([s("teen", 2, 0, true), s("teen", -1, 0)], "teen").hopefulDark).toBe(1);
    expect(e.deriveTone([s("family", 2, 2)], "family")).toEqual({ hopefulDark: 1, groundedFantastical: 2 });
  });
  it("only lowers", () => {
    expect(e.lowerRating("mature")).toBe("teen");
    expect(e.lowerRating("family")).toBe("family");
  });
});

describe("scoring", () => {
  type Pairs = [string, string][];
  const toBallots = (p: Pairs) => p.map(([participantId, v]) => ({ participantId, optionKeys: [v] }));
  const rec = (k: number, votes: Pairs, decision: string[], leaders: string[], final: Pairs = []): e.DilemmaRecord => ({
    k,
    decision,
    leaders,
    splitIndex: k / 10,
    options: [
      { key: "A", tags: tags({ authority: -2, risk: 1 }) },
      { key: "B", tags: tags({ authority: 2, risk: -2 }) },
    ],
    initial: toBallots(votes),
    final: toBallots(final),
  });
  const pqr: Pairs = [
    ["p", "A"],
    ["q", "B"],
    ["r", "B"],
  ];
  it("computes traits from recorded votes", () => {
    const records = [1, 2, 3, 4].map((k) => rec(k, pqr, ["B"], ["B"], pqr));
    const p = e.scorePlayer("p", records, { writeIns: 1, endorsements: 1 });
    expect(p.tags.authority).toBe(-2);
    expect([p.conformity, p.minorityLoyalty, p.heldFirm, p.archetype]).toEqual([0, 1, 4, "rebel"]);
    expect(e.scorePlayer("q", records).archetype).toBe("guardian");
  });
  it("detects drift and ignores dilemmas the player missed", () => {
    const records = [
      rec(1, [["p", "A"]], ["A"], ["A"]),
      rec(2, [["p", "B"]], ["B"], ["B"]),
      rec(3, [["q", "B"]], ["B"], ["B"]),
    ];
    const p = e.scorePlayer("p", records);
    expect([p.votes, p.drift.authority, p.turningAxis]).toEqual([2, 4, "authority"]);
  });
  it("handles a player with no votes", () => {
    const p = e.scorePlayer("nobody", []);
    expect([p.votes, p.conformity, p.readTheRoom]).toEqual([0, 0, null]);
  });
  it("finds group patterns", () => {
    const all: Pairs = [
      ["p", "B"],
      ["q", "B"],
      ["r", "B"],
    ];
    const g = e.scoreGroup(["p", "q", "r"], [rec(1, pqr, ["B"], ["B"]), rec(2, all, ["B"], ["B"])]);
    expect(g.alliances[0]).toMatchObject({ a: "q", b: "r", agreement: 1 });
    expect(g.independentVoices).toEqual([{ participantId: "p", minorityVotes: 1 }]);
    expect(g.mostControversial).toBe(2);
  });
});

describe("spine", () => {
  it("matches the act table", () => {
    expect([3, 5, 10, 15].map(e.actsFor)).toEqual([
      [1, 1, 1],
      [1, 3, 1],
      [2, 6, 2],
      [3, 9, 3],
    ]);
    for (let n = 3; n <= 15; n++) expect(e.actsFor(n).reduce((a, b) => a + b)).toBe(n);
  });
  it("picks the ending by values and bounds scenes", () => {
    const endings = [
      { id: "x", name: "", premise: "", values: tags({ collective: 2 }) },
      { id: "y", name: "", premise: "", values: tags({ risk: 2 }) },
    ];
    expect(e.pickEnding(endings, tags({ risk: 1 })).id).toBe("y");
    expect([3, 15].map(e.sceneCount)).toEqual([8, 15]);
  });
});

describe("bible", () => {
  const ch = (id: string, status: "alive" | "dead" = "alive") => ({
    id,
    name: id,
    role: "",
    motivation: "",
    secret: "",
    status,
    relationships: "",
    visual_descriptor: "",
  });
  const bible = {
    universe: { name: "U" },
    spine: {},
    characters: [ch("a"), ch("z", "dead")],
    factions: [{ id: "f", name: "F", goal: "", attitude: 2 }],
    locations: [{ id: "l", name: "L", description: "", visual_descriptor: "" }],
    resources: {},
    threads: [],
    events: [],
    minority_echoes: [],
  } as unknown as Bible;

  it("applies valid operations without mutating the input", () => {
    const r = e.applyDiff(
      bible,
      [
        { op: "update_faction", id: "f", attitude_delta: 2 },
        { op: "set_resource", key: "food", value: "low" },
        { op: "add_event", summary: "s", impact: "i" },
      ],
      3,
    );
    expect([r.bible.factions[0]!.attitude, r.bible.resources.food, r.bible.events[0]!.k]).toEqual([3, "low", 3]);
    expect(r.rejected).toHaveLength(0);
    expect(bible.factions[0]!.attitude).toBe(2);
  });
  it("rejects contradictions", () => {
    const r = e.applyDiff(
      bible,
      [
        { op: "update_character", id: "z", status: "alive", note: "" },
        { op: "update_character", id: "nope", status: "dead", note: "" },
        { op: "add_character", character: ch("n1"), reason: "r" },
        { op: "add_character", character: ch("n2"), reason: "r" },
        { op: "resolve_thread", id: "t", resolution: "" },
      ],
      1,
    );
    expect(r.rejected.map((x) => x.reason)).toEqual([
      "character_is_dead",
      "unknown_character",
      "one_new_character_per_turn",
      "unknown_thread",
    ]);
    expect(r.bible.universe).toEqual(bible.universe);
  });
  it("validates dilemmas against canon", () => {
    const o = (key: string) => ({ key, value_tags: tags() });
    const d = {
      format: "multiple",
      min_select: 1,
      max_select: 5,
      exclusive: [["A", "Q"]],
      options: [o("A"), o("B")],
      featured_character_ids: ["z"],
      location_id: "x",
    } as unknown as Dilemma;
    expect(e.dilemmaProblems(d, bible)).toHaveLength(5);
  });
  it("finds leaked source terms as whole words only", () => {
    expect(e.leakedTerms({ a: "Meet Frobnar today" }, ["frobnar", "Meeting", "to"])).toEqual(["frobnar"]);
  });
  it("checks grounding", () => {
    const n = { explanation: "", turning_point: "", legacy: "", cited_dilemmas: [1, 4] };
    expect(e.groundingProblems(n, [1, 2])).toHaveLength(1);
  });
});
