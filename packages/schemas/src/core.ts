import { z } from "zod";

/** Decision dimensions (design §5 Stage 4). Each option scores -2..+2 on every axis. */
export const AXES = ["risk", "trust", "collective", "authority", "sacrifice", "conflict", "pragmatism", "time"] as const;
export type Axis = (typeof AXES)[number];

const axis = z.number().int().min(-2).max(2);
export const ValueTags = z.object({
  risk: axis,
  trust: axis,
  collective: axis,
  authority: axis,
  sacrifice: axis,
  conflict: axis,
  pragmatism: axis,
  time: axis,
});
export type ValueTags = z.infer<typeof ValueTags>;

export const Rating = z.enum(["family", "teen", "mature"]);
export type Rating = z.infer<typeof Rating>;

/** hopefulDark: -2 hopeful .. +2 dark. groundedFantastical: -2 grounded .. +2 fantastical. */
export const Tone = z.object({ hopefulDark: axis, groundedFantastical: axis });
export type Tone = z.infer<typeof Tone>;

export const LANGUAGES = ["en", "es", "pt", "fr", "de"] as const;
export const Language = z.enum(LANGUAGES);
export type Language = z.infer<typeof Language>;
export const LANGUAGE_NAMES: Record<Language, string> = {
  en: "English",
  es: "Spanish",
  pt: "Portuguese",
  fr: "French",
  de: "German",
};

/** A to F for generated options, W1 to W9 for player write-ins. */
export const OptionKey = z.string().regex(/^([A-F]|W[1-9])$/);
