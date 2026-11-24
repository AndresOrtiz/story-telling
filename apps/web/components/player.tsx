"use client";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState } from "react";
import { LOVE_TAGS } from "@cs/schemas";
import type { Snapshot } from "@cs/workflows";
import { api, useSession, useWakeLock, vibrate, type Session } from "@/lib/client";
import { DecisionLine, GroupReport, PlayerChips, ProfileCard, RatingLine, Results, shownPhase, StageView, WriteInList } from "./stage";
import { ActionButton, Art, Attribution, Banners, Button, Check, Countdown, Eyebrow, inputClass, Panel, SettingsMenu, useErrorText } from "./ui";

const AVATARS = ["🙂", "🦊", "🐙", "🦉", "🐝", "🌵", "🌙", "🔥", "🍄", "🪁", "🎲", "🧭"];

export function JoinForm({ session, code, spectator = false }: { session: Session; code: string; spectator?: boolean }) {
  const t = useTranslations("join");
  const [nickname, setNickname] = useState("");
  const [avatar, setAvatar] = useState(AVATARS[0]!);
  const [seat, setSeat] = useState("");
  const limited = session.limited;
  return (
    <div className="mx-auto max-w-md space-y-6 p-4">
      <h1 className="font-serif text-3xl">{spectator ? t("watchTitle") : t("title", { code: `${code.slice(0, 3)}-${code.slice(3)}` })}</h1>
      {limited && limited.phase !== "lobby" && limited.phase !== "selection" && !spectator ? (
        <p className="text-muted">{limited.lateJoin ? t("late") : t("started")}</p>
      ) : null}
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void session.send({ type: "join", nickname, avatar, role: spectator ? "spectator" : "player" });
        }}
      >
        <label className="block space-y-1">
          <span>{t("nickname")}</span>
          <input
            className={inputClass}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            minLength={2}
            maxLength={20}
            required
            autoComplete="nickname"
            name="nickname"
          />
        </label>
        {spectator ? null : (
          <fieldset>
            <legend className="mb-1">{t("avatar")}</legend>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a) => (
                <label
                  key={a}
                  className={`flex min-h-12 items-center justify-center rounded-xl border text-2xl has-focus-visible:outline-3 has-focus-visible:outline-amber ${a === avatar ? "border-amber bg-raised" : "border-line"}`}
                >
                  <input type="radio" name="avatar" className="sr-only" checked={a === avatar} onChange={() => setAvatar(a)} aria-label={a} />
                  {a}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Button kind="primary" type="submit" className="w-full">
          {t("submit")}
        </Button>
      </form>
      {spectator ? null : (
        <details>
          <summary className="min-h-12 py-3 text-muted">{t("haveSeat")}</summary>
          <form
            className="flex gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void session.send({ type: "recover", seat });
            }}
          >
            <input aria-label={t("seat")} className={inputClass} value={seat} onChange={(e) => setSeat(e.target.value)} maxLength={12} required />
            <Button type="submit">{t("recover")}</Button>
          </form>
        </details>
      )}
      <p className="text-sm text-muted">{t("privacy")}</p>
    </div>
  );
}

type Pick = { titleId?: string; title: string; year: number | null; kind: string; favorite: boolean; loveTags: string[] };

function SelectionForm({ session }: { session: Session }) {
  const t = useTranslations("selection");
  const snap = session.snap!;
  const [picks, setPicks] = useState<Pick[]>(() => snap.selection?.mine ?? []);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState("book");
  const [results, setResults] = useState<{ id: string; title: string; year: number | null; kind: string; coverUrl: string | null }[]>([]);
  const [editing, setEditing] = useState(!snap.me.ready);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults([]);
      return;
    }
    let live = true;
    const timer = setTimeout(() => {
      api<{ results: typeof results }>(`/api/search?q=${encodeURIComponent(q)}`)
        .then((r) => live && setResults(r.results))
        .catch(() => live && setResults([]));
    }, 300);
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [q]);

  const add = (p: Pick) => {
    setPicks((x) => (x.length >= 3 || x.some((y) => y.title === p.title && y.kind === p.kind) ? x : [...x, { ...p, favorite: x.length === 0 }]));
    setQ("");
    setResults([]);
  };
  const update = (i: number, patch: Partial<Pick>) =>
    setPicks((x) => x.map((p, j) => (j === i ? { ...p, ...patch } : patch.favorite ? { ...p, favorite: false } : p)));

  if (!editing) {
    return (
      <div className="space-y-4">
        <h1 className="font-serif text-3xl">{t("doneTitle")}</h1>
        <ul className="space-y-1">
          {picks.map((p) => (
            <li key={p.title}>{p.title}</li>
          ))}
        </ul>
        <p className="text-muted">{t("progress", { ready: snap.selection!.ready, total: snap.selection!.total })}</p>
        <Button onClick={() => setEditing(true)}>{t("change")}</Button>
      </div>
    );
  }
  return (
    <div className="space-y-5">
      <h1 className="font-serif text-3xl">{t("title")}</h1>
      <p className="text-muted">{t("hint")}</p>
      {picks.length < 3 ? (
        <div className="space-y-2">
          <label className="block space-y-1">
            <span>{t("search")}</span>
            <input className={inputClass} value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} name="search" autoComplete="off" />
          </label>
          <ul className="space-y-2" aria-label={t("resultsLabel")}>
            {results.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  className="flex min-h-14 w-full items-center gap-3 rounded-xl border border-line bg-panel px-3 py-2 text-left hover:border-amber"
                  onClick={() => add({ titleId: r.id, title: r.title, year: r.year, kind: r.kind, favorite: false, loveTags: [] })}
                >
                  {r.coverUrl ? (
                    <img src={r.coverUrl} alt="" className="h-14 w-10 rounded object-cover" referrerPolicy="no-referrer" />
                  ) : null}
                  <span>
                    {r.title}
                    <span className="block text-sm text-muted">
                      {t(`kind_${r.kind}` as "kind_book")}
                      {r.year ? ` · ${r.year}` : ""}
                    </span>
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {q.trim().length >= 2 ? (
            <div className="flex gap-2">
              <select aria-label={t("kindLabel")} className={`${inputClass} w-auto`} value={kind} onChange={(e) => setKind(e.target.value)}>
                <option value="book">{t("kind_book")}</option>
                <option value="movie">{t("kind_movie")}</option>
                <option value="series">{t("kind_series")}</option>
              </select>
              <Button onClick={() => add({ title: q.trim(), year: null, kind, favorite: false, loveTags: [] })}>{t("addManual")}</Button>
            </div>
          ) : null}
        </div>
      ) : null}
      <ul className="space-y-3">
        {picks.map((p, i) => (
          <li key={`${p.kind}${p.title}`}>
            <Panel className="space-y-3">
              <div className="flex items-start justify-between gap-3">
                <p className="font-semibold">{p.title}</p>
                <button type="button" className="min-h-12 px-2 text-muted underline" onClick={() => setPicks((x) => x.filter((_, j) => j !== i))}>
                  {t("remove")}
                </button>
              </div>
              <label className="flex min-h-12 items-center gap-3">
                <input type="checkbox" className="h-5 w-5 accent-amber" checked={p.favorite} onChange={(e) => update(i, { favorite: e.target.checked })} />
                {t("favorite")}
              </label>
              <fieldset>
                <legend className="mb-1 text-sm text-muted">{t("love")}</legend>
                <div className="flex flex-wrap gap-2">
                  {LOVE_TAGS.map((tag) => (
                    <label
                      key={tag}
                      className={`flex min-h-12 items-center rounded-full border px-4 has-focus-visible:outline-3 has-focus-visible:outline-amber ${p.loveTags.includes(tag) ? "border-amber bg-raised" : "border-line"}`}
                    >
                      <input
                        type="checkbox"
                        className="sr-only"
                        checked={p.loveTags.includes(tag)}
                        onChange={(e) => update(i, { loveTags: e.target.checked ? [...p.loveTags, tag] : p.loveTags.filter((x) => x !== tag) })}
                      />
                      {t(`love_${tag}`)}
                    </label>
                  ))}
                </div>
              </fieldset>
            </Panel>
          </li>
        ))}
      </ul>
      <ActionButton
        kind="primary"
        className="w-full"
        disabled={picks.length === 0}
        run={async () => {
          const selections = picks.map((p) => ({
            ...(p.titleId ? { titleId: p.titleId } : { title: p.title }),
            kind: p.kind,
            favorite: p.favorite,
            loveTags: p.loveTags,
          }));
          if (await session.send({ type: "select", selections })) setEditing(false);
        }}
      >
        {t("confirm")}
      </ActionButton>
      <Attribution />
    </div>
  );
}

const optionClass = (on: boolean, off: boolean) =>
  `flex min-h-14 gap-3 rounded-xl border p-4 has-focus-visible:outline-3 has-focus-visible:outline-amber ${on ? "border-amber bg-raised" : "border-line bg-panel"} ${off ? "opacity-45" : ""}`;

function VoteForm({ session }: { session: Session }) {
  const t = useTranslations("vote");
  const td = useTranslations("dilemma");
  const snap = session.snap!;
  const d = snap.dilemma!;
  const [picked, setPicked] = useState<string[]>([]);
  const [confidence, setConfidence] = useState<number | null>(null);
  const [prediction, setPrediction] = useState<string | null>(null);
  const single = d.format === "single";
  const blocked = (key: string) => d.exclusive.some((p) => p.includes(key) && p.some((x) => x !== key && picked.includes(x)));
  const toggle = (key: string) =>
    setPicked((x) => (single ? [key] : x.includes(key) ? x.filter((y) => y !== key) : x.length < d.max ? [...x, key] : x));
  const options = d.options.filter((o) => !o.writeIn);
  const ready = single ? picked.length === 1 : picked.length >= d.min && picked.length <= d.max;
  return (
    <form
      className="space-y-5 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        if (ready) void session.send({ type: "vote", vote: { optionKeys: picked, confidence, prediction } });
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{d.question}</legend>
        {single ? null : (
          <p className="text-muted" aria-live="polite">
            {td("chooseRange", { min: d.min, max: d.max })} · {t("selected", { count: picked.length })}
          </p>
        )}
        {options.map((o) => {
          const off = !picked.includes(o.key) && blocked(o.key);
          return (
            <label key={o.key} className={optionClass(picked.includes(o.key), off)} data-testid={`option-${o.key}`}>
              <input
                type={single ? "radio" : "checkbox"}
                name="option"
                className="mt-1 h-5 w-5 shrink-0 accent-amber"
                checked={picked.includes(o.key)}
                disabled={off}
                onChange={() => toggle(o.key)}
              />
              <span>
                <span className="block font-semibold">{o.label}</span>
                <span className="block text-muted">{o.description}</span>
                <span className="mt-1 block text-sm">{o.visible}</span>
                {off ? <span className="block text-sm text-muted">{t("incompatible")}</span> : null}
              </span>
            </label>
          );
        })}
      </fieldset>
      <fieldset>
        <legend className="mb-1 text-sm text-muted">{t("confidence")}</legend>
        <div className="grid grid-cols-3 gap-2">
          {[1, 2, 3].map((c) => (
            <label key={c} className={`flex min-h-12 items-center justify-center rounded-xl border text-center has-focus-visible:outline-3 has-focus-visible:outline-amber ${confidence === c ? "border-amber bg-raised" : "border-line"}`}>
              <input type="radio" name="confidence" className="sr-only" checked={confidence === c} onChange={() => setConfidence(c)} />
              {t(`confidence_${c}` as "confidence_1")}
            </label>
          ))}
        </div>
      </fieldset>
      {snap.config.predictions ? (
        <label className="block space-y-1">
          <span className="text-sm text-muted">{t("prediction")}</span>
          <select className={inputClass} value={prediction ?? ""} onChange={(e) => setPrediction(e.target.value || null)}>
            <option value="">{t("noPrediction")}</option>
            {options.map((o) => (
              <option key={o.key} value={o.key}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 p-3">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Countdown snap={snap} skew={session.skew} />
          <Button kind="primary" type="submit" className="flex-1" disabled={!ready}>
            {t("submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function FinalForm({ session }: { session: Session }) {
  const t = useTranslations("final");
  const tv = useTranslations("vote");
  const snap = session.snap!;
  const [picked, setPicked] = useState<string | null>(null);
  const label = (key: string) => snap.dilemma!.options.find((o) => o.key === key)?.label ?? key;
  return (
    <form
      className="space-y-5 pb-28"
      onSubmit={(e) => {
        e.preventDefault();
        if (picked) void session.send({ type: "vote", vote: { optionKeys: [picked] } });
      }}
    >
      <fieldset className="space-y-3">
        <legend className="mb-2 text-xl font-semibold">{snap.round!.kind === "revote" ? t("tie") : t("title")}</legend>
        {snap.round!.candidates.map((c) => (
          <label key={c.id} className={optionClass(picked === c.id, false)} data-testid={`candidate-${c.id}`}>
            <input type="radio" name="candidate" className="mt-1 h-5 w-5 shrink-0 accent-amber" checked={picked === c.id} onChange={() => setPicked(c.id)} />
            <span className="font-semibold">{c.optionKeys.map(label).join(" + ")}</span>
          </label>
        ))}
      </fieldset>
      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-ground/95 p-3">
        <div className="mx-auto flex max-w-4xl items-center gap-4">
          <Countdown snap={snap} skew={session.skew} />
          <Button kind="primary" type="submit" className="flex-1" disabled={!picked}>
            {tv("submit")}
          </Button>
        </div>
      </div>
    </form>
  );
}

function Voted({ snap }: { snap: Snapshot }) {
  const t = useTranslations("vote");
  const r = snap.round!;
  return (
    <div className="space-y-4" data-testid="voted" aria-live="polite">
      <h1 className="font-serif text-3xl">{t("sent")}</h1>
      <p className="text-muted">{t("waiting", { count: r.submitted, total: r.eligible })}</p>
      <PlayerChips snap={snap} voted={r.votedIds} />
      {snap.me.persona ? (
        <Panel>
          <p className="font-serif text-xl italic">{snap.me.persona.monologue}</p>
          <p className="mt-2 text-sm text-muted">{snap.me.persona.name}</p>
        </Panel>
      ) : null}
    </div>
  );
}

function WriteIns({ session }: { session: Session }) {
  const t = useTranslations("writein");
  const snap = session.snap!;
  const [text, setText] = useState("");
  if (!snap.config.writeIns || !snap.writeIns) return null;
  const mine = snap.writeIns.find((w) => w.mine);
  const others = snap.writeIns.filter((w) => !w.mine && w.status === "open");
  return (
    <details className="rounded-2xl border border-line bg-panel p-4" open={others.length > 0 || undefined}>
      <summary className="min-h-10 font-semibold">{t("title")}</summary>
      <div className="mt-3 space-y-3">
        {mine ? (
          <p aria-live="polite">
            {mine.label}{" "}
            <span className="text-sm text-muted">
              {mine.status === "checking" ? t("checking") : null}
              {mine.status === "open" ? t("endorsements", { count: mine.endorsements, need: snap.config.writeInEndorsements }) : null}
              {mine.status === "approved" ? t("approved") : null}
              {mine.status === "rejected" ? t("rejected") : null}
            </span>
          </p>
        ) : (
          <form
            className="space-y-2"
            onSubmit={async (e) => {
              e.preventDefault();
              if (await session.send({ type: "writein", text })) setText("");
            }}
          >
            <input aria-label={t("title")} className={inputClass} value={text} onChange={(e) => setText(e.target.value)} minLength={3} maxLength={140} required name="writein" />
            <Button type="submit">{t("propose")}</Button>
          </form>
        )}
        {others.map((w) => (
          <div key={w.id} className="flex items-center justify-between gap-3 rounded-xl border border-line p-3">
            <span>
              {w.label} <span className="text-sm text-muted">{t("endorsements", { count: w.endorsements, need: snap.config.writeInEndorsements })}</span>
            </span>
            <ActionButton disabled={w.endorsed} run={() => session.send({ type: "endorse", id: w.id })}>
              {w.endorsed ? t("endorsed") : t("endorse")}
            </ActionButton>
          </div>
        ))}
      </div>
    </details>
  );
}

function DilemmaIntro({ snap, open }: { snap: Snapshot; open: boolean }) {
  const t = useTranslations("dilemma");
  const d = snap.dilemma!;
  const [image, setImage] = useState(true);
  return (
    <div className="space-y-3">
      <Eyebrow>{t("number", { k: d.k, n: snap.n })}</Eyebrow>
      <h1 className="font-serif text-3xl">{d.title}</h1>
      {image ? <Art image={d.image} className="aspect-video" /> : null}
      <button type="button" className="min-h-10 text-sm text-muted underline" onClick={() => setImage((x) => !x)}>
        {image ? t("hideImage") : t("showImage")}
      </button>
      <details open={open}>
        <summary className="min-h-10 text-muted">{t("context")}</summary>
        <p className="mt-2 text-muted">{d.connection}</p>
        <p className="mt-2 font-serif text-lg leading-relaxed">{d.context}</p>
        <p className="mt-2">{d.conflict}</p>
      </details>
    </div>
  );
}

function Persona({ snap }: { snap: Snapshot }) {
  const t = useTranslations("universe");
  const p = snap.me.persona;
  if (!p) return null;
  return (
    <Panel className="flex items-center gap-4" label={t("you")}>
      <Art image={p.portrait} className="h-24 w-24 shrink-0" />
      <div>
        <p className="text-sm text-muted">{t("you")}</p>
        <p className="text-xl font-semibold">{p.name}</p>
        <p className="text-muted">{p.role}</p>
        <p className="mt-1 font-serif italic">{p.monologue}</p>
      </div>
    </Panel>
  );
}

export function PlayBody({ session }: { session: Session }) {
  const t = useTranslations("play");
  const ta = useTranslations("analysis");
  const snap = session.snap!;
  const phase = shownPhase(snap);
  switch (phase) {
    case "lobby":
      return (
        <div className="space-y-5">
          <h1 className="font-serif text-3xl">{t("welcome", { name: snap.me.nickname ?? "" })}</h1>
          <p className="text-muted">{t("waitStart")}</p>
          <PlayerChips snap={snap} />
        </div>
      );
    case "selection":
      return <SelectionForm session={session} />;
    case "universe_reveal":
      return (
        <div className="space-y-5">
          <h1 className="font-serif text-3xl">{snap.universe!.name}</h1>
          <RatingLine snap={snap} />
          <Persona snap={snap} />
          <StageView session={session} />
        </div>
      );
    case "dilemma_presenting":
      return (
        <div className="space-y-5">
          <DilemmaIntro snap={snap} open />
          <p className="text-muted">{t("waitVote")}</p>
        </div>
      );
    case "voting":
      return (
        <div className="grid gap-6 md:grid-cols-2">
          <div className="space-y-4">
            <DilemmaIntro snap={snap} open={false} />
          </div>
          <div className="space-y-6">
            {snap.round?.myVote ? <Voted snap={snap} /> : <VoteForm key={snap.dilemma!.k} session={session} />}
            <div className={snap.round?.myVote ? "" : "pb-28"}>
              <WriteIns session={session} />
            </div>
          </div>
        </div>
      );
    case "results":
    case "discussion":
      return (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <h1 className="font-serif text-3xl">{phase === "results" ? t("results") : t("discuss")}</h1>
            <Countdown snap={snap} skew={session.skew} />
          </div>
          <Panel>
            <Results snap={snap} />
          </Panel>
          <WriteIns session={session} />
          <WriteInList snap={snap} />
        </div>
      );
    case "final_vote":
      if (!snap.round) return null;
      return snap.round.myVote ? <Voted snap={snap} /> : <FinalForm key={snap.round.candidates.map((c) => c.id).join()} session={session} />;
    case "analysis_reveal":
    case "story_generating": {
      const mine = snap.analysis?.mine;
      return (
        <div className="space-y-6">
          {mine ? (
            <>
              <ProfileCard profile={mine} />
              <Check checked={snap.me.shareProfile} save={(shared) => session.send({ type: "share_profile", shared })}>
                {ta("shareMine")}
              </Check>
              {snap.me.shareProfile ? (
                <a className="underline" href={`/api/session/${snap.code}/card/${mine.participantId}`} target="_blank" rel="noreferrer">
                  {ta("card")}
                </a>
              ) : null}
            </>
          ) : null}
          {snap.analysis ? <GroupReport snap={snap} /> : null}
        </div>
      );
    }
    case "decision_confirmed":
      return snap.decision ? <DecisionLine snap={snap} /> : null;
    default:
      return <StageView session={session} />;
  }
}

function SeatMenu({ session }: { session: Session }) {
  const t = useTranslations("play");
  const snap = session.snap!;
  return (
    <details className="relative">
      <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl px-3 text-muted hover:text-ink">{t("menu")}</summary>
      <div className="absolute right-0 z-40 w-72 space-y-3 rounded-xl border border-line bg-panel p-4 shadow-xl">
        {snap.me.seatCode ? (
          <p>
            <span className="text-sm text-muted">{t("seat")}</span>
            <span className="block text-xl font-semibold tracking-widest" data-testid="seat-code">
              {snap.me.seatCode}
            </span>
          </p>
        ) : null}
        <a className="block min-h-10 underline" href={`/watch/${snap.code}`}>
          {t("openStory")}
        </a>
        <ActionButton
          kind="danger"
          className="w-full"
          run={async () => {
            if (confirm(t("deleteConfirm"))) await session.send({ type: "delete_me" });
          }}
        >
          {t("delete")}
        </ActionButton>
      </div>
    </details>
  );
}

export function PlayerApp({ code }: { code: string }) {
  const t = useTranslations("play");
  const session = useSession(code);
  const errorText = useErrorText();
  const [tab, setTab] = useState<"play" | "story">("play");
  const { snap, limited, error } = session;
  useWakeLock();

  const nudged = snap?.me.nudgedAt ?? null;
  const seen = useRef<number | null | undefined>(undefined);
  const [nudge, setNudge] = useState(false);
  useEffect(() => {
    if (!snap) return;
    if (seen.current !== undefined && nudged && nudged !== seen.current) {
      vibrate();
      setNudge(true);
      const timer = setTimeout(() => setNudge(false), 8000);
      seen.current = nudged;
      return () => clearTimeout(timer);
    }
    seen.current = nudged;
  }, [nudged, snap]);

  if (error) return <p className="p-6 text-xl">{errorText(error)}</p>;
  if (limited?.reason === "waiting_approval") return <p className="p-6 text-xl">{t("waitApproval")}</p>;
  // A host who is not a player, or a newcomer, joins here.
  if (limited || (snap && !snap.me.participantId)) {
    return (
      <>
        <JoinForm session={session} code={code} />
        <Banners session={session} />
      </>
    );
  }
  if (!snap) return <p className="p-6 text-muted">{t("loading")}</p>;
  return (
    <div className={`mx-auto max-w-5xl p-4 ${nudge ? "nudge" : ""}`}>
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-2" role="tablist">
          {(["play", "story"] as const).map((x) => (
            <button
              key={x}
              type="button"
              role="tab"
              aria-selected={tab === x}
              onClick={() => setTab(x)}
              className={`min-h-12 rounded-xl px-4 font-semibold ${tab === x ? "bg-raised text-ink" : "text-muted"}`}
            >
              {t(`tab_${x}`)}
            </button>
          ))}
        </div>
        <div className="flex items-center">
          <SettingsMenu />
          <SeatMenu session={session} />
        </div>
      </header>
      {nudge ? (
        <p role="alert" className="mb-4 rounded-xl border border-amber bg-raised p-3 font-semibold">
          {t("nudged")}
        </p>
      ) : null}
      <main className="@container">{tab === "play" ? <PlayBody session={session} /> : <StageView session={session} />}</main>
      <Banners session={session} />
    </div>
  );
}

export function WatchApp({ code, stageToken }: { code: string; stageToken?: string | null }) {
  const t = useTranslations("play");
  const session = useSession(code, stageToken);
  const errorText = useErrorText();
  useWakeLock();
  if (session.error) return <p className="p-6 text-xl">{errorText(session.error)}</p>;
  if (session.limited) {
    return stageToken !== undefined ? (
      <p className="p-6 text-xl">{t("stageDenied")}</p>
    ) : (
      <>
        {session.limited.spectators ? <JoinForm session={session} code={code} spectator /> : <p className="p-6 text-xl">{t("noSpectators")}</p>}
        <Banners session={session} />
      </>
    );
  }
  if (!session.snap) return <p className="p-6 text-muted">{t("loading")}</p>;
  return (
    <main className="min-h-dvh p-4 sm:p-8 xl:text-lg">
      <StageView session={session} />
      <Banners session={session} />
    </main>
  );
}
