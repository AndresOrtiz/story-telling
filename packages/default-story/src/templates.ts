import {
  actOf,
  ARCHETYPES,
  sceneCount,
  type Archetype,
  type GroupMetrics,
  type PlayerScores,
} from "@cs/engine";
import {
  AXES,
  type Axis,
  type Consequence,
  type Dilemma,
  type FinalStory,
  type GroupNarrative,
  type ProfileNarrative,
  type Spine,
  type ThemeSynthesis,
  type UniverseWithSpine,
  type ValueTags,
  type WriteInCheck,
} from "@cs/schemas";
import { DEFAULT_DILEMMAS, defaultIndex } from "./dilemmas.ts";
import { DEFAULT_ENDINGS, DEFAULT_UNIVERSE, ENDING_TEXT, t } from "./universe.ts";

const BEATS = [
  "First responsibility for strangers",
  "Scarcity forces priorities",
  "Trust in one person",
  "Acting under doubt",
  "The right to know",
  "What to save first",
  "Accountability",
  "Dissent",
  "Hope from outside",
  "Today against tomorrow",
  "Power and fear",
  "Telling the truth",
  "A friend breaks the law",
  "Who carries the risk",
  "The final choice",
];

export function defaultSpine(n: number): Spine {
  return {
    beats: Array.from({ length: n }, (_, i) => {
      const k = i + 1;
      return { id: `beat-${k}`, act: actOf(k, n), purpose: BEATS[defaultIndex(k, n) - 1]! };
    }),
    endings: DEFAULT_ENDINGS,
  };
}

export const defaultUniverse = (n: number): UniverseWithSpine => ({ universe: DEFAULT_UNIVERSE, spine: defaultSpine(n) });

export const defaultSynthesis = (): ThemeSynthesis => ({
  shared_themes: ["survival", "loyalty", "truth", "responsibility"],
  tensions: ["safety against freedom", "the few against the many"],
  mood: "tense but hopeful",
});

export function defaultDilemma(k: number, n: number, previous: { title: string; labels: string[] } | null): Dilemma {
  const { dilemma } = DEFAULT_DILEMMAS[defaultIndex(k, n) - 1]!;
  if (!previous) return dilemma;
  const echo = `After "${previous.title}", the city still talks about your decision: ${previous.labels.join("; ")}.`;
  return { ...dilemma, narrative_connection: `${echo} ${dilemma.narrative_connection}`.slice(0, 400) };
}

export function defaultConsequence(input: {
  k: number;
  n: number;
  dilemma: Dilemma;
  chosen: { key: string; label: string; origin: "ai" | "write_in"; visible?: string; hidden?: string }[];
  minorityLabels: string[];
  byFate: boolean;
}): Consequence {
  const outcomes = DEFAULT_DILEMMAS[defaultIndex(input.k, input.n) - 1]!.outcomes;
  const builtIn = DEFAULT_DILEMMAS.some((d) => d.dilemma.title === input.dilemma.title);
  const parts = input.chosen.map((c) =>
    builtIn && c.origin === "ai" && outcomes[c.key]
      ? outcomes[c.key]!
      : `You chose: ${c.label}. ${[c.visible, c.hidden].filter(Boolean).join(" ")} Not everything went as planned, but people remembered who made the choice and why.`,
  );
  const fate = input.byFate ? "The Council could not agree, so fate decided for it. " : "";
  const echo = input.minorityLabels.length
    ? `Not everyone agreed. Some of you would rather have chosen: ${input.minorityLabels.slice(0, 2).join("; ")}. That doubt lingers in the hall.`
    : "";
  const labels = input.chosen.map((c) => c.label).join("; ");
  return {
    narrative: `${fate}${parts.join(" ")}`.slice(0, 1800),
    minority_echo: echo.slice(0, 400),
    summary: `In "${input.dilemma.title}" the group decided: ${labels}.`.slice(0, 400),
    diff: [
      { op: "add_event", summary: `${input.dilemma.title}: ${labels}`, impact: input.dilemma.stakes },
      ...(input.minorityLabels.length
        ? [{ op: "add_minority_echo" as const, position: input.minorityLabels[0]!, potential_return: "It may prove right later." }]
        : []),
    ],
    image: input.dilemma.image,
  };
}

/** Without AI a write-in is accepted as a neutral option after the local moderation check. */
export const defaultWriteIn = (text: string): WriteInCheck => ({
  allowed: true,
  reason: "",
  option: {
    label: text.slice(0, 90),
    description: "A path proposed by one of the players.",
    visible_consequence: "Nobody knows where this path leads.",
    hidden_consequence: "The city learns that the Council can surprise it.",
    rationale: "None of the given options felt right.",
    value_tags: t({ risk: 1, authority: -1 }),
  },
});

/* ---------- Analysis ---------- */
export const ARCHETYPE_TEXT: Record<Archetype, { name: string; text: string; legacy: string }> = {
  strategist: { name: "The Strategist", text: "You looked past the moment and weighed what each choice would mean later.", legacy: "Plans drawn in your hand were still in use years later." },
  protector: { name: "The Protector", text: "You put the safety of others first, even when it cost you.", legacy: "People remember that you stood between them and the cold." },
  idealist: { name: "The Idealist", text: "You held on to what you believed was right, even when it was not the easy way.", legacy: "Your words were painted above a door, and nobody painted over them." },
  rebel: { name: "The Rebel", text: "You questioned the rules and looked for options nobody had offered.", legacy: "Every time someone asked why, they asked it a little like you." },
  pragmatist: { name: "The Pragmatist", text: "You chose what could work, not what sounded best.", legacy: "Things you fixed stayed fixed." },
  diplomat: { name: "The Diplomat", text: "You looked for common ground and gave people the benefit of the doubt.", legacy: "Old rivals still share a table you once set for them." },
  gambler: { name: "The Gambler", text: "You were willing to bet on a better outcome.", legacy: "They tell your story whenever someone needs courage." },
  guardian: { name: "The Guardian of Order", text: "You valued stability and the rules that keep people together.", legacy: "The city slept well on the nights you kept watch." },
  lone_wolf: { name: "The Lone Wolf", text: "You trusted your own judgment and did not follow the crowd.", legacy: "Your path was not the crowd's, and some are still following it." },
  wildcard: { name: "The Wildcard", text: "You kept changing perspective, and nobody could predict your next choice.", legacy: "Nobody agrees on what you stood for, and everyone claims you." },
};
if (Object.keys(ARCHETYPE_TEXT).length !== ARCHETYPES.length) throw new Error("Missing archetype text");

const AXIS_TEXT: Record<Axis, [string, string]> = {
  risk: ["caution", "boldness"],
  trust: ["suspicion", "trust"],
  collective: ["the individual", "the common good"],
  authority: ["questioning authority", "upholding the rules"],
  sacrifice: ["self-preservation", "sacrifice"],
  conflict: ["confrontation", "reconciliation"],
  pragmatism: ["ideals", "pragmatism"],
  time: ["the present", "the long term"],
};

export type PlayerDecision = { k: number; title: string; labels: string[]; withGroup: boolean };

export function defaultProfile(scores: PlayerScores, decisions: PlayerDecision[]): ProfileNarrative {
  const a = ARCHETYPE_TEXT[scores.archetype];
  const cited = decisions.slice(0, 2);
  const quotes = cited.map((d) => `in "${d.title}" you chose: ${d.labels.join("; ")}`).join(", and ");
  const turning = scores.turningAxis;
  const last = decisions.at(-1);
  return {
    explanation: quotes ? `${a.text} For example, ${quotes}.` : "You watched more than you voted, so your story stays open.",
    turning_point:
      turning && last
        ? `Over time you moved from ${AXIS_TEXT[turning][scores.drift[turning] > 0 ? 0 : 1]} toward ${AXIS_TEXT[turning][scores.drift[turning] > 0 ? 1 : 0]}. By "${last.title}" you were choosing: ${last.labels.join("; ")}.`.slice(0, 500)
        : "Your choices stayed remarkably consistent from beginning to end.",
    legacy: a.legacy,
    cited_dilemmas: [...new Set([...cited.map((d) => d.k), ...(turning && last ? [last.k] : [])])],
  };
}

export function strongestValues(values: ValueTags, count = 3): string[] {
  return [...AXES]
    .sort((x, y) => Math.abs(values[y]) - Math.abs(values[x]))
    .slice(0, count)
    .filter((a) => Math.abs(values[a]) >= 0.15)
    .map((a) => AXIS_TEXT[a][values[a] > 0 ? 1 : 0]);
}

export function defaultGroup(metrics: GroupMetrics, titles: Record<number, string>): GroupNarrative {
  const values = strongestValues(metrics.values);
  const trend = {
    united: "You became more united as the story went on.",
    divided: "You grew more divided as the choices became harder.",
    steady: "Your level of agreement stayed steady throughout.",
  }[metrics.trend];
  const hard = metrics.mostControversial ? titles[metrics.mostControversial] : null;
  const easy = metrics.mostUnanimous ? titles[metrics.mostUnanimous] : null;
  return {
    title: values.length ? `A council guided by ${values[0]}` : "A balanced council",
    summary: [
      values.length ? `Your decisions leaned toward ${values.join(", ")}.` : "Your decisions balanced each other out.",
      trend,
      easy && easy !== hard ? `You agreed most in "${easy}".` : "",
    ]
      .filter(Boolean)
      .join(" "),
    shared_values: values,
    hard_moments: hard ? `The decision that divided you most was "${hard}".` : "No decision truly divided you.",
  };
}

/* ---------- Final story ---------- */
export type StoryTurn = { k: number; title: string; labels: string[]; narrative: string; dilemma: Dilemma };

export function defaultStory(input: {
  universe: { name: string; logline: string; opening: string[]; key_art: Dilemma["image"]; central_conflict: string };
  endingId: string;
  endingPremise: string;
  turns: StoryTurn[];
  personas: { player: string; persona: string; legacy: string }[];
}): FinalStory {
  const { universe, turns } = input;
  const n = turns.length;
  const ending = ENDING_TEXT[input.endingId] ?? { headline: "The ending you chose", text: input.endingPremise };
  const trim = (s: string) => (s.length > 880 ? `${s.slice(0, 877).replace(/\s+\S*$/, "")}...` : s);
  const scene = (headline: string, text: string, source_k: number, image = universe.key_art) => ({
    headline: headline.slice(0, 140),
    text: trim(text),
    source_k,
    image,
    transition: "crossfade" as const,
  });

  const intro = [
    scene(universe.name, universe.opening[0] ?? universe.logline, 0),
    scene("The choice of the ten", universe.opening.slice(1).join(" ") || universe.central_conflict, 0),
  ];
  const outro = [
    scene(ending.headline, ending.text, n),
    scene(
      "What the city remembers",
      `They say the future was not determined by the world they inherited, but by the choices they made together. ${input.personas
        .slice(0, 10)
        .map((p) => `${p.player}, ${p.persona}.`)
        .join(" ")}`,
      0,
    ),
  ];
  const target = sceneCount(n);
  const room = 15 - intro.length - outro.length;
  // Turns that do not fit are dropped from the middle; the first and the climax always stay.
  const kept = n <= room ? turns : [...turns.slice(0, room - 1), turns[n - 1]!];
  const body = kept.map((turn) => scene(turn.title, turn.narrative, turn.k, turn.dilemma.image));
  // Short sessions show the moment of decision before the first consequences.
  for (let i = 0; intro.length + body.length + outro.length < Math.max(8, Math.min(target, 8)) && i < kept.length; i++) {
    const turn = kept[i]!;
    const at = body.findIndex((b) => b.headline === turn.title && b.source_k === turn.k);
    body.splice(at, 0, scene(`The question: ${turn.title}`, `${turn.dilemma.context} The group decided: ${turn.labels.join("; ")}.`, turn.k, turn.dilemma.image));
  }
  const scenes = [...intro, ...body, ...outro];
  while (scenes.length < 8) scenes.splice(1, 0, scene("The world they inherited", universe.central_conflict, 0));
  return {
    title: universe.name,
    logline: universe.logline,
    scenes,
    epilogue: input.personas.map((p) => ({ name: `${p.player}, ${p.persona}`.slice(0, 120), fate: p.legacy })),
  };
}
