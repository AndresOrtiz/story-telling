import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";
import { notFound } from "next/navigation";
import { sharedStory } from "@cs/workflows";
import { Credits } from "@/components/stage";
import { Art, Panel } from "@/components/ui";

export const dynamic = "force-dynamic";
type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const story = await sharedStory((await params).slug);
  return { title: story?.title, description: story?.logline, robots: { index: false } };
}

export default async function Page({ params }: Props) {
  const story = await sharedStory((await params).slug);
  if (!story) notFound();
  const t = await getTranslations("story");
  return (
    <main className="mx-auto max-w-4xl space-y-12 p-4 py-10">
      <header className="space-y-3">
        <h1 className="font-serif text-5xl">{story.title}</h1>
        <p className="text-xl text-muted">{story.logline}</p>
      </header>
      {story.scenes.map((s, i) => (
        <section key={i} className="space-y-4">
          <Art image={s} className="aspect-video" />
          {i > 0 ? <h2 className="font-serif text-3xl">{s.headline}</h2> : null}
          <p className="font-serif text-xl leading-relaxed">{s.text}</p>
        </section>
      ))}
      <section className="space-y-4">
        <h2 className="text-2xl font-semibold">{t("decisions")}</h2>
        {story.decisions.map((d) => (
          <Panel key={d.k}>
            <h3 className="font-semibold">
              {d.k}. {d.title}
            </h3>
            <p className="text-muted">{d.question}</p>
            <ul className="mt-2 space-y-1">
              {d.options.map((o) => (
                <li key={o.key} className={d.chosen.includes(o.key) ? "font-semibold text-amber" : "text-muted"}>
                  {d.chosen.includes(o.key) ? "✓ " : ""}
                  {o.label} <span className="tabular-nums">({d.counts[o.key] ?? 0})</span>
                </li>
              ))}
            </ul>
          </Panel>
        ))}
      </section>
      {story.profiles.length ? (
        <section className="space-y-4">
          <h2 className="text-2xl font-semibold">{t("people")}</h2>
          {story.profiles.map((p) => (
            <Panel key={p.nickname}>
              <h3 className="font-semibold">
                {p.avatar} {p.nickname}: {p.archetypeName}
              </h3>
              <p className="text-muted">{p.explanation}</p>
            </Panel>
          ))}
        </section>
      ) : null}
      <Credits story={story} />
    </main>
  );
}
