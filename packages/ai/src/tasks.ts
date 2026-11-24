import { actOf, dilemmaProblems, groundingProblems, leakedTerms, sceneCount, type GroupMetrics, type PlayerScores } from "@cs/engine";
import {
  Consequence,
  Dilemma,
  FinalStory,
  GroupNarrative,
  ProfileNarrative,
  ThemeSynthesis,
  TitleThemes,
  UniverseWithSpine,
  WriteInCheck,
  type Bible,
  type EndingFamily,
} from "@cs/schemas";
import { z } from "zod";
import { generate, type CallContext } from "./generate.ts";
import { bibleBlock, HARD_DILEMMA, RULES, storySystem, untrusted, type StoryFrame } from "./prompts.ts";

const leaks = (value: unknown, deny: string[]) =>
  leakedTerms(value, deny).map((t) => `Remove the term "${t}", it belongs to an existing work.`);

export function extractThemes(ctx: CallContext, title: { title: string; kind: string; year: number | null; rating: string | null }) {
  return generate(ctx, "title.extract", TitleThemes, {
    system: `You analyse a published ${title.kind} and return only abstract themes, so that an original story can be inspired by it. Describe themes without plot summaries, names or quotes. The only exception is forbidden_terms, a deny-list of the work's character names, places and coined terms (no common words). Tone axes: hopefulDark -2 hopeful to 2 dark, groundedFantastical -2 grounded to 2 fantastical. If you do not know the title, infer carefully from its words. ${RULES}`,
    user: `${untrusted("title", title.title)}\nKind: ${title.kind}\nYear: ${title.year ?? "unknown"}\nOfficial rating level: ${title.rating ?? "unknown, estimate it (family, teen or mature)"}`,
  });
}

export function synthesizeThemes(ctx: CallContext, titles: { themes: TitleThemes; favorite: boolean; loveTags: string[] }[]) {
  return generate(ctx, "theme.synthesize", ThemeSynthesis, {
    system: "Find the themes these selections share and the productive tensions between them. Favourites count double.",
    user: JSON.stringify(
      titles.map(({ themes: { forbidden_terms: _, rating: _r, tone: _t, ...rest }, favorite, loveTags }) => ({ ...rest, favorite, loveTags })),
    ),
  });
}

export function createUniverse(
  ctx: CallContext,
  frame: StoryFrame,
  input: { synthesis: ThemeSynthesis; players: number; sources: string[]; deny: string[] },
) {
  return generate(
    ctx,
    "universe.create",
    UniverseWithSpine,
    {
      system: storySystem(frame),
      user: [
        `Create one original universe and a Story Spine of exactly ${frame.n} beats (ids beat-1 to beat-${frame.n}).`,
        `Acts of the beats in order: ${Array.from({ length: frame.n }, (_, i) => actOf(i + 1, frame.n)).join(", ")}. Each beat has a purpose, not a fixed plot, and sets two things against each other that the players will both want to protect. The last beat is the climax.`,
        "Define 3 ending families with different value profiles. Value axes (-2 to 2): risk cautious/bold, trust suspicious/trusting, collective individual/common good, authority challenges/upholds rules, sacrifice self-preserving/self-sacrificing, conflict confrontational/conciliatory, pragmatism idealistic/pragmatic, time short/long term.",
        `Create exactly ${input.players} personas, one per player: original roles inside this world, each with a one-line inner monologue. Use lowercase ids with hyphens everywhere.`,
        "All characters start alive. Every character needs a precise visual_descriptor so that illustrations stay consistent.",
        `In inspiration, explain how each of these sources shaped the world, in abstract terms: ${input.sources.map((s) => untrusted("source", s)).join(" ")}`,
        `Themes: ${JSON.stringify(input.synthesis)}`,
      ].join("\n\n"),
    },
    (v) => [
      ...(v.spine.beats.length === frame.n ? [] : [`The spine must have exactly ${frame.n} beats.`]),
      ...(v.universe.personas.length >= input.players ? [] : [`Create ${input.players} personas.`]),
      ...(v.universe.characters.every((c) => c.status === "alive") ? [] : ["All characters start alive."]),
      ...(new Set(v.universe.characters.map((c) => c.id)).size === v.universe.characters.length ? [] : ["Character ids must be unique."]),
      // Sources may be named in the inspiration panel, nowhere else.
      ...leaks({ ...v.universe, inspiration: v.universe.inspiration.map((i) => i.became), spine: v.spine }, input.deny),
    ],
  );
}

export type TurnMemory = {
  k: number;
  title: string;
  decision: string[];
  minority: string[];
  summary: string;
  /** Present only for the last two turns. */
  full?: string;
};

const DilemmaVerdict = z.object({ problems: z.array(z.string()).max(6) });

export function generateDilemma(
  ctx: CallContext,
  frame: StoryFrame,
  input: { bible: Bible; k: number; history: TurnMemory[]; deny: string[] },
) {
  const beat = input.bible.spine.beats[input.k - 1];
  const system = storySystem(frame);
  let reviewed = false;
  return generate(
    ctx,
    "dilemma.generate",
    Dilemma,
    {
      system,
      stable: bibleBlock(input.bible),
      user: [
        `Write dilemma ${input.k} of ${frame.n} (act ${actOf(input.k, frame.n)}). Beat: ${JSON.stringify(beat)}.`,
        input.k === frame.n
          ? "This is the climax. Bring back the most important open threads."
          : "Leave room for the story to keep growing.",
        input.k > 1
          ? "narrative_connection must link to the consequence of the previous decision. Let a minority position return when it fits."
          : "narrative_connection introduces the first problem.",
        `Make it a very difficult moral situation that people will argue about. ${HARD_DILEMMA} Within the content rating, harm can also be a broken trust, a lost home, a betrayal or a truth that destroys someone. Make it harder than the previous dilemmas.`,
        "Keep it very short. People read it aloud from a screen, so every word must earn its place: plain words, no scenery, no backstory they already know. Word limits: title 5, narrative_connection 15 (one sentence), context 45 (at most 3 sentences: what is happening, what each side loses, why now), moral_conflict 8 (one value against another), question 14, stakes 10, and per option label 7, description 12 (what you do), visible_consequence 12 (the price, as a fact: who loses what for good, by name), hidden_consequence 20, rationale 15. format_reason 12.",
        "Write 2 to 4 options with keys A, B, C... Prefer 2 or 3. Options must differ in values, and none may be obviously right. visible_consequence is shown to players, hidden_consequence stays secret.",
        "Choose single or multiple from the situation and justify it in format_reason. For single, min_select and max_select are 1. For multiple, max_select is at least 2, and exclusive lists pairs that cannot go together.",
        "Use only character ids and a location_id that exist in the Story Bible. image describes the single moment to illustrate. alt_text describes it for a screen reader.",
        `History:\n${JSON.stringify(input.history)}`,
      ].join("\n\n"),
    },
    async (d) => {
      const hard = [...dilemmaProblems(d, input.bible), ...leaks(d, input.deny)];
      if (hard.length) return hard;
      // The judge is advisory: it asks for one better version at most, and if it cannot run, the checks above are enough.
      if (reviewed) return [];
      reviewed = true;
      try {
        const verdict = await generate(ctx, "dilemma.validate", DilemmaVerdict, {
          system:
            "You review a dilemma for a storytelling game. Report a problem only if it clearly breaks a rule: one option is obviously right, an option costs nothing or avoids the choice, two options are the same choice, it contradicts canon, it ignores the previous decision (k > 1), or it exceeds the content rating. Return an empty list when it is fine. What a good dilemma looks like: " + HARD_DILEMMA,
          user: `Rating: ${frame.rating}. Dilemma ${input.k}.\nPrevious turn: ${JSON.stringify(input.history.at(-1) ?? null)}\nCharacters: ${JSON.stringify(input.bible.characters.map((c) => ({ id: c.id, status: c.status })))}\nDilemma: ${JSON.stringify(d)}`,
        });
        return verdict.problems;
      } catch {
        return [];
      }
    },
  );
}

export function generateConsequence(
  ctx: CallContext,
  frame: StoryFrame,
  input: {
    bible: Bible;
    k: number;
    dilemma: Dilemma;
    chosen: { key: string; label: string; hidden: string }[];
    minority: { label: string; votes: number }[];
    byFate: boolean;
    history: TurnMemory[];
    deny: string[];
  },
) {
  return generate(
    ctx,
    "consequence.generate",
    Consequence,
    {
      system: storySystem(frame),
      stable: bibleBlock(input.bible),
      user: [
        `The group decided dilemma ${input.k} of ${frame.n}. Write the consequence in 100 to 180 words, and reveal the hidden consequences inside the narrative.`,
        `Dilemma: ${input.dilemma.title}. ${input.dilemma.context}`,
        `Decision: ${JSON.stringify(input.chosen)}. Labels of write-in options were typed by players: ${RULES}`,
        input.byFate ? "The group tied twice, so fate decided. Tell that indecision as part of the story." : "",
        input.minority.length
          ? `Minority positions to acknowledge in minority_echo, with an add_minority_echo operation: ${JSON.stringify(input.minority)}`
          : "Nobody dissented. minority_echo is an empty string.",
        "diff lists only what changed in canon. Use existing ids, add at most one character and only with a reason, and always include one add_event.",
        `History:\n${JSON.stringify(input.history)}`,
      ]
        .filter(Boolean)
        .join("\n\n"),
    },
    (c) => leaks(c, input.deny),
  );
}

export function checkWriteIn(ctx: CallContext, frame: StoryFrame, input: { bible: Bible; dilemma: Dilemma; text: string }) {
  return generate(ctx, "writein.check", WriteInCheck, {
    system: `${storySystem(frame)}\n\nA player proposes their own answer to a dilemma. Allow it when it is possible under the world rules, fits the content rating and is different from the existing options. Rewrite it as an option. When it is not allowed, give a short, friendly reason.`,
    user: `World rules: ${JSON.stringify(input.bible.universe.world_rules)}\nDilemma: ${JSON.stringify({ ...input.dilemma, image: undefined })}\n${untrusted("proposal", input.text)}`,
  });
}

export function writeProfile(
  ctx: CallContext,
  frame: StoryFrame,
  input: {
    nickname: string;
    persona: string | null;
    archetype: string;
    scores: PlayerScores;
    decisions: { k: number; title: string; labels: string[]; withGroup: boolean }[];
  },
) {
  return generate(
    ctx,
    "profile.write",
    ProfileNarrative,
    {
      system: `${storySystem(frame)}\n\nYou interpret the choices a player made in the game. It is playful, never a psychological assessment: no clinical language, no judgement, no claims about their real life. Only mention traits that the scores support, and cite real decisions by title. Put the number k of every decision you mention in cited_dilemmas. Address the player as "you".`,
      user: `${untrusted("nickname", input.nickname)}\nCharacter in the story: ${input.persona ?? "none"}\nArchetype: ${input.archetype}\nScores: ${JSON.stringify(input.scores)}\nDecisions: ${JSON.stringify(input.decisions)}`,
    },
    (p) => groundingProblems(p, input.decisions.map((d) => d.k)),
  );
}

export function writeGroup(
  ctx: CallContext,
  frame: StoryFrame,
  input: { metrics: GroupMetrics; names: Record<string, string>; turns: { k: number; title: string; decision: string[]; split: number; resolvedBy: string }[] },
) {
  return generate(ctx, "group.write", GroupNarrative, {
    system: `${storySystem(frame)}\n\nYou describe how the group decided, based only on the metrics. Playful, warm and specific. Never a psychological assessment.`,
    user: `Metrics: ${JSON.stringify(input.metrics)}\nPlayers (id to nickname): ${untrusted("players", JSON.stringify(input.names))}\nTurns: ${JSON.stringify(input.turns)}`,
  });
}

export function writeStory(
  ctx: CallContext,
  frame: StoryFrame,
  input: {
    bible: Bible;
    ending: EndingFamily;
    turns: { k: number; title: string; decision: string[]; consequence: string }[];
    players: { nickname: string; persona: string | null; archetype: string }[];
    deny: string[];
  },
) {
  const n = sceneCount(frame.n);
  return generate(
    ctx,
    "story.write",
    FinalStory,
    {
      system: storySystem(frame),
      stable: bibleBlock(input.bible),
      user: [
        `Write the finished story as ${n} illustrated scenes of 40 to 90 words: a beginning, each pivotal decision and its consequence, a climax built on the most important decisions, and an ending.`,
        `The ending family is "${input.ending.name}": ${input.ending.premise}`,
        "Tell only what the group actually decided. Set source_k to the dilemma whose illustration fits the scene, or 0 when a new image is needed (at most 4 scenes).",
        `Personas appear by name. Players:\n${input.players.map((p) => `${untrusted("nickname", p.nickname)} as ${p.persona ?? "a member of the group"} (${p.archetype})`).join("\n")}`,
        "epilogue says what became of each persona and each major character.",
        `Turns: ${JSON.stringify(input.turns)}`,
      ].join("\n\n"),
    },
    (s) => [
      ...s.scenes.filter((x) => x.source_k > frame.n).map((x) => `source_k ${x.source_k} does not exist.`),
      ...leaks(s, input.deny),
    ],
  );
}
