import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { Document, Image, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import sharp from "sharp";
import { localMediaPath, type exportSession } from "@cs/workflows";

type Exported = Awaited<ReturnType<typeof exportSession>>;

/** PDF images must be raster files, so SVG placeholders and WebP images become JPEG. */
async function jpeg(url: string): Promise<Buffer | null> {
  try {
    let raw: Buffer;
    if (url.startsWith("/placeholders/") && /^\/placeholders\/[\w-]+\.svg$/.test(url)) {
      raw = await readFile(join(process.cwd(), "public", url));
    } else if (url.startsWith("/api/media/")) {
      raw = await readFile(/* turbopackIgnore: true */ localMediaPath(url.slice("/api/media/".length)) ?? "");
    } else if (process.env.NEXT_PUBLIC_SUPABASE_URL && url.startsWith(process.env.NEXT_PUBLIC_SUPABASE_URL)) {
      raw = Buffer.from(await (await fetch(url, { signal: AbortSignal.timeout(10_000) })).arrayBuffer());
    } else return null;
    return await sharp(raw).resize(1200, 675, { fit: "cover" }).jpeg({ quality: 78 }).toBuffer();
  } catch {
    return null;
  }
}

const s = StyleSheet.create({
  page: { padding: 40, backgroundColor: "#fbf8f0", color: "#1a2224", fontFamily: "Times-Roman" },
  cover: { padding: 40, backgroundColor: "#0b1214", color: "#f2efe6", fontFamily: "Times-Roman", justifyContent: "center" },
  image: { width: "100%", height: 300, objectFit: "cover", borderRadius: 6, marginBottom: 18 },
  title: { fontSize: 38, marginBottom: 10 },
  h: { fontSize: 22, marginBottom: 8 },
  p: { fontSize: 13, lineHeight: 1.5 },
  small: { fontSize: 10, color: "#5b676a", marginTop: 6 },
  decision: { marginBottom: 12 },
});

/** The built-in PDF font covers Western European letters; anything else (like emoji) is dropped. */
const clean = (text: string) => text.replace(/[^ -~ -ÿ–—‘’“”…\n]/g, "");

export async function renderStorybook(data: Exported, labels: { by: string; inspiredBy: string; decisions: string; aiNotice: string }): Promise<Buffer> {
  const story = data.story!;
  const unique = [...new Set(story.scenes.map((x) => x.url))];
  const images = new Map(await Promise.all(unique.map(async (u) => [u, await jpeg(u)] as const)));
  const cover = images.get(story.scenes[0]!.url);
  return renderToBuffer(
    <Document title={clean(story.title)}>
      <Page size="A4" orientation="landscape" style={s.cover}>
        {cover ? <Image src={cover} style={s.image} /> : null}
        <Text style={s.title}>{clean(story.title)}</Text>
        <Text style={s.p}>{clean(story.logline)}</Text>
        <Text style={s.small}>{clean(labels.by)}</Text>
      </Page>
      {story.scenes.map((scene, i) => {
        const image = images.get(scene.url);
        return (
          <Page key={i} size="A4" orientation="landscape" style={s.page}>
            {image ? <Image src={image} style={s.image} /> : null}
            <Text style={s.h}>{clean(scene.headline)}</Text>
            <Text style={s.p}>{clean(scene.text)}</Text>
          </Page>
        );
      })}
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.h}>{clean(labels.decisions)}</Text>
        {data.turns.map((turn) => (
          <View key={turn.k} style={s.decision} wrap={false}>
            <Text style={s.p}>
              {turn.k}. {clean(turn.dilemma.title)}: {clean(turn.dilemma.question)}
            </Text>
            <Text style={s.small}>
              {clean(turn.decision.map((key) => turn.dilemma.options.find((o) => o.key === key)?.label ?? key).join("; "))}
            </Text>
          </View>
        ))}
        <Text style={s.small}>{clean(labels.inspiredBy)}</Text>
        <Text style={s.small}>{clean(labels.aiNotice)}</Text>
      </Page>
    </Document>,
  );
}
