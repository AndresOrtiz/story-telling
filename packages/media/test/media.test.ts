import { afterEach, describe, expect, it } from "vitest";
import sharp from "sharp";
import * as m from "../src/index.ts";

const png = () => sharp({ create: { width: 64, height: 36, channels: 3, background: "#336699" } }).png().toBuffer();
const base = { enabled: true, prompt: "p", path: "s/x", placeholder: "/placeholders/scene.svg", store: async (p: string) => `/media/${p}` };
afterEach(() => m.setImageClient(null));

describe("createImage", () => {
  it("uses the placeholder with a fake key or when disabled", async () => {
    process.env.GEMINI_API_KEY = "FAKE-x";
    expect((await m.createImage(base)).provider).toBe("placeholder");
    m.setImageClient(async () => png());
    expect((await m.createImage({ ...base, enabled: false })).provider).toBe("placeholder");
  });
  it("stores a WebP with a blurhash and caps references at 3", async () => {
    let refs = 0;
    m.setImageClient(async (r) => {
      refs = r.references.length;
      return png();
    });
    const image = await m.createImage({ ...base, references: Array(5).fill({ mimeType: "image/webp", base64: "" }) });
    expect(image).toMatchObject({ url: "/media/s/x.webp", width: 64, height: 36, provider: m.PRIMARY_IMAGE_MODEL() });
    expect(image.blurhash).toBeTruthy();
    expect(refs).toBe(3);
  });
  it("tries the lighter model, then the placeholder", async () => {
    const seen: string[] = [];
    m.setImageClient(async (r) => {
      seen.push(r.model);
      if (seen.length === 1) throw new Error("429");
      return png();
    });
    expect((await m.createImage(base)).provider).toBe(m.FALLBACK_IMAGE_MODEL());
    m.setImageClient(async () => {
      throw new Error("down");
    });
    expect((await m.createImage(base)).url).toBe("/placeholders/scene.svg");
    expect(seen).toEqual([m.PRIMARY_IMAGE_MODEL(), m.FALLBACK_IMAGE_MODEL()]);
  });
});
