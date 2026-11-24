import { z } from "zod";
import { OptionKey, Rating, Tone, ValueTags } from "./core.ts";

export const ImageBrief = z.object({
  moment: z.string().describe("The single frozen instant to depict"),
  emotion: z.string(),
  composition: z.string(),
});
export type ImageBrief = z.infer<typeof ImageBrief>;

/* ---------- Title themes (Stage 2) ---------- */
export const TitleThemes = z.object({
  themes: z.array(z.string()).min(1).max(8),
  moral_conflicts: z.array(z.string()).max(6),
  motivations: z.array(z.string()).max(6),
  decision_types: z.array(z.string()).max(6),
  relationships: z.array(z.string()).max(6),
  atmosphere: z.string(),
  ethical_questions: z.array(z.string()).max(6),
  signature_tension: z.string(),
  rating: Rating,
  tone: Tone,
  forbidden_terms: z
    .array(z.string())
    .max(30)
    .describe("Character names, places and coined terms of the source. Only used as a deny-list."),
});
export type TitleThemes = z.infer<typeof TitleThemes>;

export const ThemeSynthesis = z.object({
  shared_themes: z.array(z.string()).min(1).max(8),
  tensions: z.array(z.string()).max(6),
  mood: z.string(),
});
export type ThemeSynthesis = z.infer<typeof ThemeSynthesis>;

/* ---------- Story Bible (§6.1) ---------- */
export const Character = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  motivation: z.string(),
  secret: z.string(),
  status: z.enum(["alive", "dead", "missing"]),
  relationships: z.string(),
  visual_descriptor: z.string(),
});
export type Character = z.infer<typeof Character>;

export const Faction = z.object({
  id: z.string(),
  name: z.string(),
  goal: z.string(),
  attitude: z.number().int().min(-3).max(3),
});
export type Faction = z.infer<typeof Faction>;

export const Location = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  visual_descriptor: z.string(),
});
export type Location = z.infer<typeof Location>;

export const Thread = z.object({
  id: z.string(),
  description: z.string(),
  status: z.enum(["open", "escalating", "resolved"]),
});
export type Thread = z.infer<typeof Thread>;

export const Persona = z.object({
  id: z.string(),
  name: z.string(),
  role: z.string(),
  bond: z.string(),
  monologue: z.string(),
});
export type Persona = z.infer<typeof Persona>;

export const SpineBeat = z.object({ id: z.string(), act: z.number().int().min(1).max(3), purpose: z.string() });
export type SpineBeat = z.infer<typeof SpineBeat>;

export const EndingFamily = z.object({ id: z.string(), name: z.string(), premise: z.string(), values: ValueTags });
export type EndingFamily = z.infer<typeof EndingFamily>;

export const Spine = z.object({ beats: z.array(SpineBeat).min(3).max(15), endings: z.array(EndingFamily).length(3) });
export type Spine = z.infer<typeof Spine>;

export const Universe = z.object({
  name: z.string().max(80),
  logline: z.string().max(300),
  setting: z.string().max(900),
  inciting_situation: z.string().max(700),
  central_conflict: z.string().max(500),
  opening: z.array(z.string()).min(2).max(5).describe("Opening text, paragraph by paragraph"),
  atmosphere: z.string().max(200),
  world_rules: z.array(z.string()).min(2).max(8),
  factions: z.array(Faction).min(2).max(4),
  characters: z.array(Character).min(3).max(6),
  locations: z.array(Location).min(2).max(6),
  resources: z.array(z.object({ key: z.string(), value: z.string() })).max(6),
  visual_identity: z.object({ medium: z.string(), palette: z.string(), lighting: z.string(), motifs: z.string() }),
  personas: z.array(Persona).min(1).max(10),
  inspiration: z.array(z.object({ source: z.string(), became: z.string() })).max(30),
  key_art: ImageBrief,
});
export type Universe = z.infer<typeof Universe>;

export const UniverseWithSpine = z.object({ universe: Universe, spine: Spine });
export type UniverseWithSpine = z.infer<typeof UniverseWithSpine>;

export const Bible = z.object({
  universe: Universe,
  spine: Spine,
  characters: z.array(Character),
  factions: z.array(Faction),
  locations: z.array(Location),
  resources: z.record(z.string(), z.string()),
  threads: z.array(Thread),
  events: z.array(z.object({ k: z.number().int(), summary: z.string(), impact: z.string() })),
  minority_echoes: z.array(z.object({ k: z.number().int(), position: z.string(), potential_return: z.string() })),
});
export type Bible = z.infer<typeof Bible>;

/* ---------- Dilemmas (§5 Stage 4) ---------- */
/** Hard limits, well above the lengths the prompt asks for: going over them costs a retry. */
export const DILEMMA_LIMITS = { title: 70, context: 420, question: 160 } as const;

export const DilemmaOption = z.object({
  key: OptionKey,
  label: z.string().max(90),
  description: z.string().max(150),
  visible_consequence: z.string().max(150),
  hidden_consequence: z.string().max(220),
  rationale: z.string().max(220),
  value_tags: ValueTags,
});
export type DilemmaOption = z.infer<typeof DilemmaOption>;

export const Dilemma = z.object({
  title: z.string().max(DILEMMA_LIMITS.title),
  narrative_connection: z.string().max(220),
  context: z.string().max(DILEMMA_LIMITS.context),
  moral_conflict: z.string().max(140),
  question: z.string().max(DILEMMA_LIMITS.question),
  format: z.enum(["single", "multiple"]),
  format_reason: z.string().max(200),
  min_select: z.number().int().min(1).max(6),
  max_select: z.number().int().min(1).max(6),
  exclusive: z.array(z.array(OptionKey).length(2)).max(8).describe("Pairs of options that cannot be chosen together"),
  options: z.array(DilemmaOption).min(2).max(6),
  stakes: z.string().max(140),
  featured_character_ids: z.array(z.string()).max(6),
  location_id: z.string(),
  image: ImageBrief,
  alt_text: z.string().max(300),
});
export type Dilemma = z.infer<typeof Dilemma>;

/* ---------- Consequences (§6.2) ---------- */
export const BibleDiffOp = z.discriminatedUnion("op", [
  z.object({
    op: z.literal("update_character"),
    id: z.string(),
    status: z.enum(["alive", "dead", "missing"]),
    note: z.string(),
  }),
  z.object({ op: z.literal("add_character"), character: Character, reason: z.string() }),
  z.object({ op: z.literal("set_resource"), key: z.string(), value: z.string() }),
  z.object({ op: z.literal("update_faction"), id: z.string(), attitude_delta: z.number().int().min(-2).max(2) }),
  z.object({ op: z.literal("add_thread"), id: z.string(), description: z.string() }),
  z.object({ op: z.literal("resolve_thread"), id: z.string(), resolution: z.string() }),
  z.object({ op: z.literal("add_location"), location: Location, reason: z.string() }),
  z.object({ op: z.literal("add_event"), summary: z.string(), impact: z.string() }),
  z.object({ op: z.literal("add_minority_echo"), position: z.string(), potential_return: z.string() }),
]);
export type BibleDiffOp = z.infer<typeof BibleDiffOp>;

export const Consequence = z.object({
  narrative: z.string().max(1800),
  minority_echo: z.string().max(400),
  diff: z.array(BibleDiffOp).max(12),
  summary: z.string().max(400).describe("One or two sentences used as memory for later turns"),
  image: ImageBrief,
});
export type Consequence = z.infer<typeof Consequence>;

export const WriteInCheck = z.object({
  allowed: z.boolean(),
  reason: z.string(),
  option: DilemmaOption.omit({ key: true }),
});
export type WriteInCheck = z.infer<typeof WriteInCheck>;

/* ---------- Analysis (§5 Stage 7) ---------- */
export const ProfileNarrative = z.object({
  explanation: z.string().max(900),
  turning_point: z.string().max(500),
  legacy: z.string().max(400),
  cited_dilemmas: z.array(z.number().int()).max(15),
});
export type ProfileNarrative = z.infer<typeof ProfileNarrative>;

export const GroupNarrative = z.object({
  title: z.string().max(90),
  summary: z.string().max(1200),
  shared_values: z.array(z.string()).max(6),
  hard_moments: z.string().max(600),
});
export type GroupNarrative = z.infer<typeof GroupNarrative>;

/* ---------- Final story (§5 Stage 8) ---------- */
export const StoryScene = z.object({
  headline: z.string().max(140),
  text: z.string().max(900),
  source_k: z.number().int().min(0).max(15).describe("Dilemma whose image is reused, or 0 for a new image"),
  image: ImageBrief,
  transition: z.enum(["crossfade", "fade_black", "wipe", "cut"]),
});
export type StoryScene = z.infer<typeof StoryScene>;

export const FinalStory = z.object({
  title: z.string().max(100),
  logline: z.string().max(300),
  scenes: z.array(StoryScene).min(8).max(15),
  epilogue: z.array(z.object({ name: z.string(), fate: z.string() })).max(20),
});
export type FinalStory = z.infer<typeof FinalStory>;
