import { z } from "zod";
import { Language } from "./core.ts";

export const PHASES = [
  "lobby",
  "selection",
  "universe_generating",
  "universe_reveal",
  "dilemma_preparing",
  "dilemma_presenting",
  "voting",
  "results",
  "discussion",
  "final_vote",
  "decision_confirmed",
  "consequence",
  "analysis_generating",
  "analysis_reveal",
  "story_generating",
  "story_playback",
  "completed",
  "paused",
  "aborted",
] as const;
export const Phase = z.enum(PHASES);
export type Phase = z.infer<typeof Phase>;

export const SessionConfig = z.object({
  dilemmas: z.number().int().min(3).max(15).default(5),
  maxPlayers: z.number().int().min(2).max(10).default(10),
  language: Language.default("en"),
  votingSeconds: z.number().int().min(0).max(600).default(60),
  discussionSeconds: z.number().int().min(10).max(1800).default(120),
  reveal: z.enum(["named", "anonymous"]).default("named"),
  personas: z.boolean().default(true),
  writeIns: z.boolean().default(true),
  writeInEndorsements: z.number().int().min(1).max(10).default(2),
  predictions: z.boolean().default(false),
  spectators: z.boolean().default(false),
  lateJoin: z.enum(["locked", "host"]).default("locked"),
  builtInStory: z.boolean().default(false),
});
export type SessionConfig = z.infer<typeof SessionConfig>;

export const Nickname = z
  .string()
  .trim()
  .min(2)
  .max(20)
  .regex(/^[\p{L}\p{N} ._'-]+$/u);

export const ROOM_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
export const RoomCode = z
  .string()
  .transform((s) => s.toUpperCase().replace(/[^A-Z0-9]/g, ""))
  .pipe(z.string().length(6));

export const LOVE_TAGS = ["characters", "world", "moral", "action", "romance", "mystery"] as const;
export const SelectionInput = z.object({
  source: z.enum(["openlibrary", "google", "tmdb", "builtin", "manual"]),
  externalId: z.string().max(120).default(""),
  title: z.string().trim().min(1).max(120),
  year: z.number().int().nullable().default(null),
  kind: z.enum(["book", "movie", "series"]),
  coverUrl: z.url().nullable().default(null),
  favorite: z.boolean().default(false),
  loveTags: z.array(z.enum(LOVE_TAGS)).max(6).default([]),
});
export type SelectionInput = z.infer<typeof SelectionInput>;

export const VoteInput = z.object({
  optionKeys: z.array(z.string().max(20)).min(1).max(6),
  confidence: z.number().int().min(1).max(3).nullable().default(null),
  prediction: z.string().max(20).nullable().default(null),
});
export type VoteInput = z.infer<typeof VoteInput>;
