"use client";
import { AnimatePresence, motion } from "motion/react";
import { useTranslations } from "next-intl";
import QRCode from "qrcode";
import { useEffect, useState, type ReactNode } from "react";
import type { ProfileView, Snapshot } from "@cs/workflows";
import type { Session } from "@/lib/client";
import { SplitChart, TraitBars, VoteBars } from "./charts";
import { Art, Countdown, Eyebrow, Panel, Typewriter } from "./ui";

export const shownPhase = (s: Snapshot) => (s.phase === "paused" ? s.pausedFrom! : s.phase);

export function JoinCard({ code, large = false }: { code: string; large?: boolean }) {
  const t = useTranslations("lobby");
  const [qr, setQr] = useState("");
  const [url, setUrl] = useState("");
  useEffect(() => {
    const link = `${location.origin}/j/${code}`;
    setUrl(link);
    void QRCode.toString(link, { type: "svg", margin: 1, errorCorrectionLevel: "M" }).then(setQr);
  }, [code]);
  return (
    <div className="flex flex-col items-center gap-3 text-center">
      <div
        role="img"
        aria-label={t("qrAlt")}
        className={`overflow-hidden rounded-2xl bg-white ${large ? "w-64 lg:w-80" : "w-44"} aspect-square [&>svg]:h-full [&>svg]:w-full`}
        dangerouslySetInnerHTML={{ __html: qr }}
      />
      <p className={`font-semibold tracking-[0.12em] ${large ? "text-5xl lg:text-6xl" : "text-3xl"}`} data-testid="room-code">
        {code.slice(0, 3)}-{code.slice(3)}
      </p>
      <p className="break-all text-sm text-muted">{url}</p>
    </div>
  );
}

export function PlayerChips({ snap, voted }: { snap: Snapshot; voted?: string[] }) {
  const t = useTranslations("lobby");
  return (
    <ul className="flex flex-wrap gap-2">
      {snap.players
        .filter((p) => p.role === "player")
        .map((p) => {
          const lit = voted ? voted.includes(p.id) : p.online;
          return (
            <li
              key={p.id}
              className={`flex items-center gap-2 rounded-full border px-3 py-1.5 ${lit ? "border-amber bg-raised" : "border-line text-muted"}`}
            >
              <span aria-hidden>{p.avatar}</span>
              <span>{p.nickname}</span>
              {voted ? <span className="sr-only">{lit ? t("voted") : t("notVoted")}</span> : null}
              {!voted && !p.online ? <span className="text-sm">({t("away")})</span> : null}
            </li>
          );
        })}
    </ul>
  );
}

const Title = ({ children }: { children: ReactNode }) => (
  <h1 className="font-serif text-3xl leading-tight sm:text-4xl xl:text-5xl">{children}</h1>
);

function Waiting({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="mx-auto flex min-h-[60vh] max-w-3xl flex-col items-center justify-center gap-5 text-center" aria-live="polite">
      <motion.div
        aria-hidden
        className="h-16 w-16 rounded-full bg-amber/80 blur-md"
        animate={{ scale: [1, 1.5, 1], opacity: [0.5, 1, 0.5] }}
        transition={{ repeat: Infinity, duration: 2.6 }}
      />
      <Title>{title}</Title>
      {children}
    </div>
  );
}

function Lobby({ snap }: { snap: Snapshot }) {
  const t = useTranslations("lobby");
  return (
    <div className="mx-auto grid max-w-6xl items-center gap-10 py-6 @2xl:grid-cols-2">
      <JoinCard code={snap.code} large />
      <div className="space-y-5">
        <Title>{t("title")}</Title>
        <p className="text-lg text-muted">{t("scan")}</p>
        <p>{t("count", { count: snap.players.filter((p) => p.role === "player").length, max: snap.config.maxPlayers })}</p>
        <PlayerChips snap={snap} />
      </div>
    </div>
  );
}

function CoverWall({ snap }: { snap: Snapshot }) {
  return (
    <ul className="flex flex-wrap justify-center gap-3">
      {snap.selection!.wall.map((x) => (
        <li key={x.title} className="rise flex h-40 w-28 flex-col justify-end overflow-hidden rounded-lg border border-line bg-raised text-left">
          {x.coverUrl ? (
            <img src={x.coverUrl} alt={x.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
          ) : (
            <span className="p-2 font-serif text-base leading-tight">{x.title}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Selection({ snap }: { snap: Snapshot }) {
  const t = useTranslations("selection");
  const s = snap.selection!;
  return (
    <div className="mx-auto max-w-5xl space-y-6 text-center">
      <Title>{t("stageTitle")}</Title>
      <p className="text-xl text-muted">{t("progress", { ready: s.ready, total: s.total })}</p>
      <CoverWall snap={snap} />
      <p className="text-sm text-muted">{t("attribution")}</p>
    </div>
  );
}

function Forming({ snap }: { snap: Snapshot }) {
  const t = useTranslations("universe");
  return (
    <Waiting title={t("forming")}>
      <CoverWall snap={snap} />
      <ul className="flex flex-wrap justify-center gap-2">
        {snap.selection!.themes.map((x, i) => (
          <li key={x} className="rise rounded-full border border-line px-3 py-1" style={{ animationDelay: `${i * 0.4}s` }}>
            {x}
          </li>
        ))}
      </ul>
    </Waiting>
  );
}

export function RatingLine({ snap }: { snap: Snapshot }) {
  const t = useTranslations("universe");
  const u = snap.universe!;
  const dark = t(`dark${u.tone.hopefulDark + 2}` as "dark0");
  const fantastical = t(`fan${u.tone.groundedFantastical + 2}` as "fan0");
  return (
    <p className="text-lg" data-testid="rating-line">
      {t("rated", { rating: t(`rating_${u.rating}`), tone: `${dark}, ${fantastical}` })}
    </p>
  );
}

function UniverseReveal({ snap }: { snap: Snapshot }) {
  const t = useTranslations("universe");
  const u = snap.universe!;
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <div className="grid gap-6 @4xl:grid-cols-[3fr_2fr]">
        <Art image={u.keyArt} className="aspect-video" moving />
        <div className="space-y-4">
          <Title>{u.name}</Title>
          <p className="font-serif text-xl text-muted">{u.logline}</p>
          <RatingLine snap={snap} />
        </div>
      </div>
      <div className="max-w-3xl space-y-4 font-serif text-xl leading-relaxed">
        {u.opening.map((p, i) => (
          <p key={i} className="rise" style={{ animationDelay: `${i * 2.5}s` }}>
            {p}
          </p>
        ))}
      </div>
      <div className="grid gap-6 @4xl:grid-cols-2">
        <Panel label={t("inspired")}>
          <h2 className="mb-3 text-lg font-semibold">{t("inspired")}</h2>
          <ul className="space-y-2">
            {u.inspiration.map((x, i) => (
              <li key={i}>
                <span className="font-semibold">{x.source}:</span> <span className="text-muted">{x.became}</span>
              </li>
            ))}
          </ul>
        </Panel>
        <Panel label={t("people")}>
          <h2 className="mb-3 text-lg font-semibold">{t("people")}</h2>
          <ul className="grid gap-3 @xl:grid-cols-2">
            {u.characters.map((c) => (
              <li key={c.id} className="flex items-center gap-3">
                <Art image={c.portrait} className="h-14 w-14 shrink-0" />
                <span>
                  <span className="block font-semibold">{c.name}</span>
                  <span className="text-sm text-muted">{c.role}</span>
                </span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>
    </div>
  );
}

export function BuiltInNote({ snap }: { snap: Snapshot }) {
  const t = useTranslations("common");
  if (!snap.builtIn || !snap.fallbackFromK || shownPhase(snap) === "universe_reveal") return null;
  return <p className="rounded-xl border border-line px-3 py-1.5 text-sm text-muted">{t("builtInNow")}</p>;
}

function DilemmaHead({ snap, compact = false }: { snap: Snapshot; compact?: boolean }) {
  const t = useTranslations("dilemma");
  const d = snap.dilemma!;
  return (
    <div className="space-y-3">
      <Eyebrow>{t("number", { k: d.k, n: snap.n })}</Eyebrow>
      <Title>{d.title}</Title>
      {compact ? null : <p className="text-lg text-muted">{d.connection}</p>}
      {compact ? null : <p className="font-serif text-xl leading-relaxed">{d.context}</p>}
    </div>
  );
}

function OptionList({ snap }: { snap: Snapshot }) {
  return (
    <ol className="grid gap-3 @xl:grid-cols-2">
      {snap
        .dilemma!.options.filter((o) => !o.writeIn)
        .map((o) => (
          <li key={o.key} className="flex gap-3 rounded-xl border border-line bg-panel p-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-raised font-semibold">{o.key}</span>
            <span>
              <span className="block font-semibold">{o.label}</span>
              <span className="block text-muted">{o.description}</span>
            </span>
          </li>
        ))}
    </ol>
  );
}

function DilemmaPresent({ snap, skew, voting }: { snap: Snapshot; skew: number; voting: boolean }) {
  const t = useTranslations("dilemma");
  const d = snap.dilemma!;
  return (
    <div className="mx-auto grid max-w-7xl gap-6 @4xl:grid-cols-2">
      <div className="space-y-4">
        <Art image={d.image} className="aspect-video" moving />
        {voting && snap.round ? (
          <Panel>
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="text-2xl font-semibold" data-testid="submitted">
                {t("submitted", { count: snap.round.submitted, total: snap.round.eligible })}
              </p>
              <Countdown snap={snap} skew={skew} big />
            </div>
            <PlayerChips snap={snap} voted={snap.round.votedIds} />
          </Panel>
        ) : (
          <Panel>
            <p className="text-muted">{d.conflict}</p>
            <p className="mt-2">
              <span className="font-semibold">{t("stakes")}</span> {d.stakes}
            </p>
          </Panel>
        )}
      </div>
      <div className="space-y-5">
        <DilemmaHead snap={snap} compact={voting} />
        <p className="text-2xl font-semibold">{d.question}</p>
        {d.format === "multiple" ? <p className="text-muted">{t("chooseRange", { min: d.min, max: d.max })}</p> : null}
        <OptionList snap={snap} />
      </div>
    </div>
  );
}

export function Results({ snap }: { snap: Snapshot }) {
  const t = useTranslations("results");
  const d = snap.dilemma!;
  const r = snap.results!;
  const label = (key: string) => d.options.find((o) => o.key === key)?.label ?? key;
  return (
    <div className="space-y-4">
      <VoteBars
        rows={d.options
          .filter((o) => !o.writeIn)
          .map((o) => ({
            key: o.key,
            label: `${o.key}. ${o.label}`,
            count: r.counts[o.key] ?? 0,
            percent: r.percentages[o.key] ?? 0,
            names: r.voterNames?.[o.key],
            top: r.top.includes(o.key),
          }))}
      />
      {d.format === "multiple" ? <p className="text-sm text-muted">{t("multiNote")}</p> : null}
      <ul className="space-y-1 text-muted">
        <li>{t("split", { percent: Math.round(r.split * 100) })}</li>
        {r.abstentions ? <li>{t("abstained", { count: r.abstentions })}</li> : null}
        {r.minority.length ? <li>{t("minority", { options: r.minority.map(label).join("; ") })}</li> : null}
        {r.unanimous ? <li className="text-ink">{t("unanimous")}</li> : null}
        {r.pair ? <li>{t("pair", r.pair)}</li> : null}
      </ul>
    </div>
  );
}

function Discussion({ snap, skew }: { snap: Snapshot; skew: number }) {
  const t = useTranslations("discussion");
  const label = (key: string) => snap.dilemma!.options.find((o) => o.key === key)?.label ?? key;
  return (
    <div className="mx-auto grid max-w-6xl gap-8 @4xl:grid-cols-2">
      <div className="space-y-5">
        <Title>{t("title")}</Title>
        <Countdown snap={snap} skew={skew} big />
        <p className="text-muted">{t("hint")}</p>
        <ul className="space-y-3">
          {snap.results!.candidates.map((c) => (
            <li key={c.id} className="rounded-xl border border-amber bg-panel p-3 text-lg font-semibold">
              {c.optionKeys.map(label).join(" + ")}
            </li>
          ))}
        </ul>
        <WriteInList snap={snap} />
      </div>
      <Panel>
        <Results snap={snap} />
      </Panel>
    </div>
  );
}

export function WriteInList({ snap }: { snap: Snapshot }) {
  const t = useTranslations("writein");
  const list = (snap.writeIns ?? []).filter((w) => w.status === "open" || w.status === "approved");
  if (!list.length) return null;
  return (
    <div className="space-y-2">
      <h2 className="font-semibold">{t("proposals")}</h2>
      <ul className="space-y-2">
        {list.map((w) => (
          <li key={w.id} className="rounded-xl border border-line p-3">
            {w.label}{" "}
            <span className="text-sm text-muted">
              {w.status === "approved" ? t("approved") : t("endorsements", { count: w.endorsements, need: snap.config.writeInEndorsements })}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function FinalVote({ snap, skew }: { snap: Snapshot; skew: number }) {
  const t = useTranslations("final");
  const label = (key: string) => snap.dilemma!.options.find((o) => o.key === key)?.label ?? key;
  const round = snap.round!;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Title>{round.kind === "revote" ? t("tie") : t("title")}</Title>
      <p className="text-xl">{snap.dilemma!.question}</p>
      <ul className="grid gap-4 @xl:grid-cols-2 @4xl:grid-cols-3">
        {round.candidates.map((c) => (
          <li key={c.id} className="rounded-2xl border border-line bg-panel p-5 text-xl font-semibold">
            {c.optionKeys.map(label).join(" + ")}
          </li>
        ))}
      </ul>
      <div className="flex items-center gap-6">
        <p className="text-xl">{t("submitted", { count: round.submitted, total: round.eligible })}</p>
        <Countdown snap={snap} skew={skew} big />
      </div>
      <PlayerChips snap={snap} voted={round.votedIds} />
    </div>
  );
}

export function DecisionLine({ snap }: { snap: Snapshot }) {
  const t = useTranslations("decision");
  const d = snap.decision!;
  return (
    <div className="space-y-2">
      <Eyebrow>{t(`by_${d.resolvedBy}`)}</Eyebrow>
      <p className="text-2xl font-semibold" data-testid="decision">
        {d.labels.join(" + ")}
      </p>
      <ul className="text-sm text-muted">
        {d.persuaded ? <li>{t("persuaded", { count: d.persuaded })}</li> : null}
        {d.heldFirm ? <li>{t("heldFirm", { count: d.heldFirm })}</li> : null}
        {d.readers?.length ? <li>{t("readers", { names: d.readers.join(", ") })}</li> : null}
      </ul>
    </div>
  );
}

function Consequence({ snap }: { snap: Snapshot }) {
  const t = useTranslations("consequence");
  const c = snap.consequence!;
  return (
    <div className="mx-auto grid max-w-7xl gap-8 @4xl:grid-cols-2">
      <Art image={c.image} className="aspect-video" moving />
      <div className="space-y-5">
        <DecisionLine snap={snap} />
        <Typewriter text={c.narrative} className="font-serif text-xl leading-relaxed" />
        {c.hidden.length ? (
          <Panel label={t("hidden")}>
            <h2 className="font-semibold">{t("hidden")}</h2>
            <ul className="mt-1 space-y-1">
              {c.hidden.map((h, i) => (
                <li key={i}>{h.text}</li>
              ))}
            </ul>
          </Panel>
        ) : null}
        {c.minorityEcho ? <p className="text-muted italic">{c.minorityEcho}</p> : null}
      </div>
    </div>
  );
}

export function ProfileCard({ profile }: { profile: ProfileView }) {
  const t = useTranslations("analysis");
  const s = profile.scores;
  return (
    <Panel className="space-y-4" label={profile.nickname}>
      <div>
        <p className="text-muted">
          <span aria-hidden>{profile.avatar}</span> {profile.nickname}
        </p>
        <h2 className="font-serif text-3xl">{profile.archetypeName}</h2>
        <p className="text-sm text-muted">{t("secondary", { name: profile.secondaryName })}</p>
      </div>
      <p>{profile.narrative.explanation}</p>
      <p>
        <span className="font-semibold">{t("turning")}</span> {profile.narrative.turning_point}
      </p>
      <p className="font-serif text-lg italic">{profile.narrative.legacy}</p>
      <TraitBars values={s.tags} />
      <ul className="text-sm text-muted">
        <li>{t("conformity", { percent: Math.round(s.conformity * 100) })}</li>
        {s.persuaded ? <li>{t("persuaded", { count: s.persuaded })}</li> : null}
        {s.heldFirm ? <li>{t("heldFirm", { count: s.heldFirm })}</li> : null}
        {s.readTheRoom !== null ? <li>{t("readRoom", { percent: Math.round(s.readTheRoom * 100) })}</li> : null}
      </ul>
      <p className="text-sm text-muted">{t("disclaimer")}</p>
    </Panel>
  );
}

export function GroupReport({ snap }: { snap: Snapshot }) {
  const t = useTranslations("analysis");
  const a = snap.analysis!;
  const m = a.metrics;
  const name = (id: string) => a.names[id] ?? "?";
  return (
    <div className="space-y-5">
      <Title>{a.group.title}</Title>
      <p className="max-w-3xl text-xl">{a.group.summary}</p>
      <p className="max-w-3xl text-muted">{a.group.hard_moments}</p>
      <div className="grid gap-6 @4xl:grid-cols-2">
        <Panel>
          <SplitChart data={m.splitByDilemma} titles={a.titles} />
        </Panel>
        <Panel className="space-y-4">
          <h2 className="font-semibold">{t("groupValues")}</h2>
          <TraitBars values={m.values} />
        </Panel>
      </div>
      <ul className="space-y-1 text-muted">
        {m.mostControversial ? <li>{t("controversial", { title: a.titles[m.mostControversial] ?? "" })}</li> : null}
        {m.mostUnanimous ? <li>{t("unanimous", { title: a.titles[m.mostUnanimous] ?? "" })}</li> : null}
        {Object.keys(a.names).length > 2 && m.alliances[0] && m.alliances[0].agreement >= 0.5 ? (
          <li>{t("alliance", { a: name(m.alliances[0].a), b: name(m.alliances[0].b), percent: Math.round(m.alliances[0].agreement * 100) })}</li>
        ) : null}
        {m.independentVoices.length ? (
          <li>{t("independent", { names: m.independentVoices.map((v) => name(v.participantId)).join(", ") })}</li>
        ) : null}
      </ul>
      <p className="text-sm text-muted">{t("disclaimer")}</p>
    </div>
  );
}

function Analysis({ snap }: { snap: Snapshot }) {
  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <GroupReport snap={snap} />
      <div className="grid gap-6 @4xl:grid-cols-2">
        {snap.analysis!.shared.map((p) => (
          <ProfileCard key={p.participantId} profile={p} />
        ))}
      </div>
    </div>
  );
}

/** Reading time: about 250 words per minute plus 3 seconds. */
export const readingMs = (text: string) => 3000 + (text.split(/\s+/).length / 250) * 60_000;

const SLIDES = {
  crossfade: { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 }, transition: { duration: 0.9 } },
  fade_black: { initial: { opacity: 0 }, animate: { opacity: 1, transition: { delay: 0.5, duration: 0.7 } }, exit: { opacity: 0, transition: { duration: 0.4 } } },
  wipe: { initial: { clipPath: "inset(0 100% 0 0)" }, animate: { clipPath: "inset(0 0% 0 0)" }, exit: { opacity: 0 }, transition: { duration: 0.8 } },
  cut: { initial: { opacity: 1 }, animate: { opacity: 1 }, exit: { opacity: 0, transition: { duration: 0 } } },
} as const;

export function StorySlides({ story, index }: { story: NonNullable<Snapshot["story"]>; index: number }) {
  const t = useTranslations("story");
  const scene = story.scenes[index];
  const slide = SLIDES[(scene?.transition ?? "crossfade") as keyof typeof SLIDES] ?? SLIDES.crossfade;
  return (
    <div className="relative mx-auto max-w-6xl" aria-live="polite">
      <AnimatePresence mode="wait" initial={false}>
        <motion.div key={index} {...slide}>
          {scene ? (
            <div className="space-y-5" data-testid="scene">
              <Art image={scene} className="aspect-video max-h-[58vh] w-full" moving />
              <h1 className="font-serif text-3xl sm:text-4xl">
                {index === 0 ? story.title : scene.headline}
              </h1>
              <p className="max-w-3xl font-serif text-xl leading-relaxed sm:text-2xl">{scene.text}</p>
              <p className="text-sm text-muted">{t("scene", { index: index + 1, total: story.scenes.length })}</p>
            </div>
          ) : (
            <Credits story={story} />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

export function Credits({ story }: { story: Omit<NonNullable<Snapshot["story"]>, "index" | "autoAdvance"> }) {
  const t = useTranslations("story");
  return (
    <div className="mx-auto max-w-3xl space-y-6 py-8 text-center" data-testid="credits">
      <Title>{story.title}</Title>
      <p className="text-xl">{t("by", { names: story.credits.players.join(", ") })}</p>
      {story.credits.inspiredBy.length ? <p className="text-muted">{t("inspiredBy", { titles: story.credits.inspiredBy.join(", ") })}</p> : null}
      <ul className="space-y-2 text-left">
        {story.epilogue.map((e, i) => (
          <li key={i}>
            <span className="font-semibold">{e.name}.</span> <span className="text-muted">{e.fate}</span>
          </li>
        ))}
      </ul>
      <p className="text-sm text-muted">{t("aiNotice")}</p>
    </div>
  );
}

/** What everyone can see. Used by the Stage, spectators, the host preview and the players' Story view. */
export function StageView({ session }: { session: Session }) {
  const t = useTranslations("common");
  const snap = session.snap!;
  const { skew } = session;
  const phase = shownPhase(snap);
  const body = () => {
    switch (phase) {
      case "lobby":
        return <Lobby snap={snap} />;
      case "selection":
        return <Selection snap={snap} />;
      case "universe_generating":
        return <Forming snap={snap} />;
      case "universe_reveal":
        return <UniverseReveal snap={snap} />;
      case "dilemma_preparing":
        return <Waiting title={t("preparingDilemma")} />;
      case "dilemma_presenting":
        return <DilemmaPresent snap={snap} skew={skew} voting={false} />;
      case "voting":
        return <DilemmaPresent snap={snap} skew={skew} voting />;
      case "results":
        return (
          <div className="mx-auto max-w-5xl space-y-6">
            <DilemmaHead snap={snap} compact />
            <p className="text-xl">{snap.dilemma!.question}</p>
            <Panel>
              <Results snap={snap} />
            </Panel>
            <WriteInList snap={snap} />
          </div>
        );
      case "discussion":
        return <Discussion snap={snap} skew={skew} />;
      case "final_vote":
        return <FinalVote snap={snap} skew={skew} />;
      case "decision_confirmed":
        return (
          <Waiting title={t("decided")}>
            <DecisionLine snap={snap} />
          </Waiting>
        );
      case "consequence":
        return <Consequence snap={snap} />;
      case "analysis_generating":
        return <Waiting title={t("preparingAnalysis")} />;
      case "analysis_reveal":
        return <Analysis snap={snap} />;
      case "story_generating":
        return <Waiting title={t("preparingStory")} />;
      case "story_playback":
      case "completed":
        return snap.story ? <StorySlides story={snap.story} index={snap.story.index} /> : null;
      default:
        return <Waiting title={t("aborted")} />;
    }
  };
  return (
    <div className="@container space-y-4" data-phase={snap.phase}>
      <BuiltInNote snap={snap} />
      {body()}
    </div>
  );
}
