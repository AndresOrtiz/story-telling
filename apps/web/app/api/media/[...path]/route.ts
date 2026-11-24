import { readFile } from "node:fs/promises";
import { localMediaPath } from "@cs/workflows";

/** Serves locally stored images (embedded mode only; the cloud uses Supabase Storage). */
export async function GET(_req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const path = (await params).path.join("/");
  const full = /^[\w-]+\/[\w.-]+\.webp$/.test(path) ? localMediaPath(path) : null;
  try {
    if (full) {
      return new Response(new Uint8Array(await readFile(/* turbopackIgnore: true */ full)), {
        headers: { "Content-Type": "image/webp", "Cache-Control": "public, max-age=31536000, immutable" },
      });
    }
  } catch {
    // Falls through to 404.
  }
  return new Response("Not found", { status: 404 });
}
