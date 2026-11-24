import { existsSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { dirname, join, normalize, sep } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { isFake } from "@cs/db";
import type { Reference, Store } from "@cs/media";

const cloud = () => !isFake(process.env.SUPABASE_SECRET_KEY) && !isFake(process.env.NEXT_PUBLIC_SUPABASE_URL);
const bucket = () =>
  createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SECRET_KEY!, {
    auth: { persistSession: false },
  }).storage.from("media");

function localRoot(): string {
  let dir = process.cwd();
  while (!existsSync(join(dir, "pnpm-workspace.yaml")) && dirname(dir) !== dir) dir = dirname(dir);
  return join(dir, ".data", "media");
}

/** Resolves a local media path, refusing anything outside the media folder. */
export function localMediaPath(path: string): string | null {
  const root = localRoot();
  const full = normalize(join(root, path));
  return full.startsWith(root + sep) ? full : null;
}

export const store: Store = async (path, body, contentType) => {
  if (cloud()) {
    const { error } = await bucket().upload(path, body, { contentType, upsert: true, cacheControl: "31536000" });
    if (error) throw error;
    return bucket().getPublicUrl(path).data.publicUrl;
  }
  const full = localMediaPath(path);
  if (!full) throw new Error("Invalid media path");
  await mkdir(dirname(full), { recursive: true });
  await writeFile(full, body);
  return `/api/media/${path}`;
};

/** Loads a stored image so it can be used as a reference. Placeholders are not references. */
export async function loadReference(url: string): Promise<Reference | null> {
  try {
    if (url.startsWith("/api/media/")) {
      const full = localMediaPath(url.slice("/api/media/".length));
      return full ? { mimeType: "image/webp", base64: (await readFile(full)).toString("base64") } : null;
    }
    if (cloud() && url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL!)) {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (res.ok) return { mimeType: "image/webp", base64: Buffer.from(await res.arrayBuffer()).toString("base64") };
    }
  } catch {
    // A missing reference only makes the image less consistent.
  }
  return null;
}

export async function deleteMedia(sessionId: string): Promise<void> {
  if (cloud()) {
    const { data } = await bucket().list(sessionId, { limit: 1000 });
    if (data?.length) await bucket().remove(data.map((f) => `${sessionId}/${f.name}`));
    return;
  }
  const full = localMediaPath(sessionId);
  if (full) await rm(full, { recursive: true, force: true });
}
