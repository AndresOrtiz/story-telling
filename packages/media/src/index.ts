import { GoogleGenAI } from "@google/genai";
import { encode } from "blurhash";
import sharp from "sharp";
import type { ImageBrief, Universe } from "@cs/schemas";

export const PRIMARY_IMAGE_MODEL = () => process.env.GEMINI_IMAGE_MODEL || "gemini-nano-banana-2.1";
export const FALLBACK_IMAGE_MODEL = () => process.env.GEMINI_FALLBACK_IMAGE_MODEL || "gemini-3.1-flash-lite-image";
/** Official price per 1K image of both models, 2026-11-23. */
const IMAGE_COST_USD = 0.0336;
const TIMEOUT_MS = 60_000;

export const placeholders = {
  keyArt: "/placeholders/key-art.svg",
  scene: "/placeholders/scene.svg",
  unavailable: "/placeholders/unavailable.svg",
  dilemma: (index: number) => `/placeholders/dilemma-${String(index).padStart(2, "0")}.svg`,
  portrait: (index: number) => `/placeholders/portrait-${String((index % 10) + 1).padStart(2, "0")}.svg`,
};

export const hasGeminiKey = () => {
  const key = process.env.GEMINI_API_KEY;
  return Boolean(key) && !key!.includes("FAKE") && process.env.STORY_MODE !== "default";
};

type Aspect = "16:9" | "1:1";
export type Reference = { mimeType: string; base64: string };
export type ImageClient = (req: { model: string; prompt: string; references: Reference[]; aspect: Aspect }) => Promise<Buffer>;

const gemini: ImageClient = async ({ model, prompt, references, aspect }) => {
  const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
  const response = await ai.models.generateContent({
    model,
    contents: [
      {
        role: "user",
        parts: [
          { text: prompt },
          ...references.map((r) => ({ inlineData: { mimeType: r.mimeType, data: r.base64 } })),
        ],
      },
    ],
    config: {
      responseModalities: ["IMAGE"],
      imageConfig: { aspectRatio: aspect },
      abortSignal: AbortSignal.timeout(TIMEOUT_MS),
    },
  });
  const data = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data)?.inlineData?.data;
  if (!data) throw new Error("No image returned");
  return Buffer.from(data, "base64");
};

let client: ImageClient | null = null;
/** Tests supply a fake client here. */
export function setImageClient(c: ImageClient | null): void {
  client = c;
}

/** Where finished images are stored. Supabase Storage in the cloud, local files in embedded mode. */
export type Store = (path: string, body: Buffer, contentType: string) => Promise<string>;

export function imagePrompt(
  universe: Pick<Universe, "visual_identity" | "atmosphere">,
  brief: ImageBrief,
  extra: { characters?: string[]; location?: string; rating: string },
): string {
  const v = universe.visual_identity;
  return [
    `Illustration. Style (keep identical in every image): ${v.medium}. Palette: ${v.palette}. Lighting: ${v.lighting}. Motifs: ${v.motifs}. Atmosphere: ${universe.atmosphere}.`,
    `Moment: ${brief.moment}. Emotion: ${brief.emotion}. Composition: ${brief.composition}.`,
    extra.location ? `Place: ${extra.location}.` : "",
    extra.characters?.length ? `Characters, matching the reference images: ${extra.characters.join("; ")}.` : "",
    `Suitable for a ${extra.rating} audience. No text, letters, logos or watermarks. Original characters only, no existing franchises, no real people.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export type GeneratedImage = {
  url: string;
  blurhash: string | null;
  width: number | null;
  height: number | null;
  provider: string;
  costUsd: number;
};

/** Never throws: a failed generation returns the placeholder (design rule 15). */
export async function createImage(req: {
  enabled: boolean;
  prompt: string;
  references?: Reference[];
  aspect?: Aspect;
  path: string;
  store: Store;
  placeholder: string;
}): Promise<GeneratedImage> {
  const run = client ?? (hasGeminiKey() ? gemini : null);
  const fallback = (costUsd = 0): GeneratedImage => ({
    url: req.placeholder,
    blurhash: null,
    width: null,
    height: null,
    provider: "placeholder",
    costUsd,
  });
  if (!req.enabled || !run) return fallback();
  for (const model of [PRIMARY_IMAGE_MODEL(), FALLBACK_IMAGE_MODEL()]) {
    try {
      const raw = await run({
        model,
        prompt: req.prompt,
        references: (req.references ?? []).slice(0, 3),
        aspect: req.aspect ?? "16:9",
      });
      const { data: webp, info } = await sharp(raw).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
      const tiny = await sharp(raw).resize(32, 32, { fit: "inside" }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
      const blurhash = encode(new Uint8ClampedArray(tiny.data), tiny.info.width, tiny.info.height, 4, 3);
      const url = await req.store(`${req.path}.webp`, webp, "image/webp");
      return { url, blurhash, width: info.width, height: info.height, provider: model, costUsd: IMAGE_COST_USD };
    } catch (e) {
      console.error(`Image generation with ${model} failed:`, e instanceof Error ? e.message : e);
    }
  }
  return fallback();
}
