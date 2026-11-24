"use client";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { LANGUAGE_NAMES, LANGUAGES, type SessionConfig } from "@cs/schemas";
import type { HostAction, Snapshot } from "@cs/workflows";
import { shareLink, useSession, useWakeLock, type Session } from "@/lib/client";
import { JoinForm, PlayBody } from "./player";
import { JoinCard, PlayerChips, readingMs, shownPhase, StageView } from "./stage";
import { ActionButton, Banners, Button, Check, Countdown, inputClass, Panel, SettingsMenu, useErrorText } from "./ui";

export function ConfigForm({ value: saved, onChange: save }: { value: SessionConfig; onChange: (patch: Partial<SessionConfig>) => void }) {
  const t = useTranslations("config");
  // Shows changes at once; the saved configuration replaces them when it arrives.
  const [value, setValue] = useState(saved);
  const key = JSON.stringify(saved);
  useEffect(() => setValue(JSON.parse(key) as SessionConfig), [key]);
  const onChange = (patch: Partial<SessionConfig>) => {
    setValue((v) => ({ ...v, ...patch }));
    save(patch);
  };
  const number = (key: "dilemmas" | "maxPlayers" | "discussionSeconds", min: number, max: number) => (
    <label className="block space-y-1">
      <span>{t(key)}</span>
      <input
        type="number"
        name={key}
        className={inputClass}
        min={min}
        max={max}
        defaultValue={value[key]}
        key={value[key]}
        onBlur={(e) => {
          const n = Math.round(Number(e.target.value));
          if (n >= min && n <= max && n !== value[key]) onChange({ [key]: n });
          else e.target.value = String(value[key]);
        }}
      />
    </label>
  );
  const toggle = (key: "personas" | "writeIns" | "predictions" | "spectators" | "builtInStory") => (
    <Check name={key} checked={value[key]} save={(v) => onChange({ [key]: v })}>
      {t(key)}
    </Check>
  );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {number("dilemmas", 3, 15)}
      {number("maxPlayers", 2, 10)}
      <label className="block space-y-1">
        <span>{t("language")}</span>
        <select name="language" className={inputClass} value={value.language} onChange={(e) => onChange({ language: e.target.value as SessionConfig["language"] })}>
          {LANGUAGES.map((l) => (
            <option key={l} value={l}>
              {LANGUAGE_NAMES[l]}
            </option>
          ))}
        </select>
      </label>
      <label className="block space-y-1">
        <span>{t("votingSeconds")}</span>
        <select name="votingSeconds" className={inputClass} value={value.votingSeconds} onChange={(e) => onChange({ votingSeconds: Number(e.target.value) })}>
          {[0, 30, 60, 90, 120, 180, 300].map((s) => (
            <option key={s} value={s}>
              {s ? t("seconds", { s }) : t("off")}
            </option>
          ))}
        </select>
      </label>
      {number("discussionSeconds", 10, 1800)}
      <label className="block space-y-1">
        <span>{t("reveal")}</span>
        <select name="reveal" className={inputClass} value={value.reveal} onChange={(e) => onChange({ reveal: e.target.value as SessionConfig["reveal"] })}>
          <option value="named">{t("named")}</option>
          <option value="anonymous">{t("anonymous")}</option>
        </select>
      </label>
      <label className="block space-y-1">
        <span>{t("lateJoin")}</span>
        <select name="lateJoin" className={inputClass} value={value.lateJoin} onChange={(e) => onChange({ lateJoin: e.target.value as SessionConfig["lateJoin"] })}>
          <option value="locked">{t("lateLocked")}</option>
          <option value="host">{t("lateHost")}</option>
        </select>
      </label>
      <div className="sm:col-span-2 sm:grid sm:grid-cols-2">
        {toggle("personas")}
        {toggle("writeIns")}
        {toggle("predictions")}
        {toggle("spectators")}
        {toggle("builtInStory")}
      </div>
      <p className="text-sm text-muted sm:col-span-2">{t("ratingNote")}</p>
    </div>
  );
}

type Step = { action: HostAction; label: string; primary?: boolean; disabled?: boolean; danger?: boolean };

function useSteps(snap: Snapshot): Step[] {
  const t = useTranslations("host");
  const ready = snap.host?.nextReady ?? false;
  const players = snap.players.filter((p) => p.role === "player").length;
  switch (snap.phase) {
    case "lobby":
      return [{ action: "start", label: t("start"), primary: true, disabled: players < 2 }];
    case "selection":
      return [{ action: "continue_selection", label: t("continueSelection"), primary: true }];
    case "universe_reveal":
      return [
        { action: "begin_story", label: t("beginStory"), primary: true },
        ...(snap.host?.canLowerRating ? [{ action: "lower_rating" as const, label: t("lowerRating") }] : []),
        ...(snap.host?.canRegenerateUniverse ? [{ action: "regenerate_universe" as const, label: t("regenerateUniverse") }] : []),
      ];
    case "dilemma_presenting":
      return [{ action: "open_voting", label: t("openVoting"), primary: true }];
    case "voting":
      return [{ action: "close_voting", label: t("closeVoting"), primary: true }];
    case "results":
      return [
        snap.results?.unanimous
          ? { action: "confirm_unanimous", label: t("confirmUnanimous"), primary: true }
          : { action: "start_discussion", label: t("startDiscussion"), primary: true },
        { action: "revote", label: t("revote") },
      ];
    case "discussion":
      return [
        { action: "open_final_vote", label: t("openFinalVote"), primary: true },
        { action: "extend_discussion", label: t("extend") },
      ];
    case "final_vote":
      return [{ action: "close_final_vote", label: t("closeFinalVote"), primary: true }];
    case "consequence":
      return [
        {
          action: "next",
          label: snap.k < snap.n ? (ready ? t("nextDilemma") : t("nextPreparing")) : t("seeAnalysis"),
          primary: true,
        },
      ];
    case "analysis_reveal":
      return [{ action: "show_story", label: ready ? t("showStory") : t("storyPreparing"), primary: true }];
    case "story_playback":
      return [{ action: "finish", label: t("finish") }];
    case "paused":
      return [{ action: "resume", label: t("resume"), primary: true }];
    default:
      return [];
  }
}

const PAUSABLE = ["selection", "universe_reveal", "dilemma_presenting", "voting", "results", "discussion", "final_vote", "consequence", "analysis_reveal", "story_playback"];

function Controls({ session }: { session: Session }) {
  const t = useTranslations("host");
  const snap = session.snap!;
  const steps = useSteps(snap);
  const run = (action: HostAction) => session.send({ type: "host", action, phase: snap.phase, k: snap.k });
  const r = snap.round;
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-lg font-semibold" data-testid="host-phase" data-phase={snap.phase}>
          {t(`phase_${snap.phase}`)}
          {snap.k > 0 ? <span className="text-muted"> · {t("dilemmaOf", { k: snap.k, n: snap.n })}</span> : null}
        </p>
        <Countdown snap={snap} skew={session.skew} />
      </div>
      {snap.builtIn ? <p className="text-sm text-muted">{t("offlineContent")}</p> : null}
      {snap.selection ? <p>{t("selectionReady", { ready: snap.selection.ready, total: snap.selection.total })}</p> : null}
      {r ? <p data-testid="host-submitted">{r.submitted === r.eligible ? t("allVoted") : t("voted", { count: r.submitted, total: r.eligible })}</p> : null}
      {snap.host?.nextTitle ? <p className="text-sm text-muted">{t("upNext", { title: snap.host.nextTitle })}</p> : null}
      <div className="flex flex-col gap-2">
        {steps.map((s) => (
          <ActionButton key={s.action} kind={s.primary ? "primary" : "secondary"} disabled={s.disabled} run={() => run(s.action)} data-testid={`host-${s.action}`}>
            {s.label}
          </ActionButton>
        ))}
        {snap.phase === "lobby" && steps[0]?.disabled ? <p className="text-sm text-muted">{t("needPlayers")}</p> : null}
      </div>
      <StoryControls session={session} />
      <Editorial session={session} />
      <WriteInReview session={session} />
      <div className="flex flex-wrap gap-2">
        {PAUSABLE.includes(snap.phase) ? <ActionButton run={() => run("pause")}>{t("pause")}</ActionButton> : null}
        {!["completed", "aborted"].includes(snap.phase) ? (
          <ActionButton kind="danger" run={async () => void (confirm(t("abortConfirm")) && (await run("abort")))}>
            {t("abort")}
          </ActionButton>
        ) : null}
      </div>
    </div>
  );
}

function StoryControls({ session }: { session: Session }) {
  const t = useTranslations("host");
  const snap = session.snap!;
  const story = snap.story;
  const index = story?.index ?? 0;
  const last = story?.scenes.length ?? 0;
  const auto = story?.autoAdvance ?? false;
  const { send } = session;
  useEffect(() => {
    if (!story) return;
    const key = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input,select,textarea")) return;
      if (e.key === "ArrowRight") void send({ type: "scene", index: index + 1 });
      if (e.key === "ArrowLeft") void send({ type: "scene", index: index - 1 });
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [story, index, send]);
  const text = story?.scenes[index]?.text ?? "";
  useEffect(() => {
    if (!auto || !text || snap.phase === "paused") return;
    const timer = setTimeout(() => void send({ type: "scene", index: index + 1 }), readingMs(text));
    return () => clearTimeout(timer);
  }, [auto, text, index, send, snap.phase]);
  if (!story) return null;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2">
        <ActionButton disabled={index === 0} run={() => send({ type: "scene", index: index - 1 })}>
          {t("previousScene")}
        </ActionButton>
        <ActionButton kind="primary" disabled={index >= last} run={() => send({ type: "scene", index: index + 1 })} data-testid="next-scene">
          {t("nextScene")}
        </ActionButton>
      </div>
      <Check checked={auto} save={(autoAdvance) => send({ type: "scene", index, autoAdvance })}>
        {t("autoAdvance")}
      </Check>
      <Sharing session={session} />
    </div>
  );
}

function Sharing({ session }: { session: Session }) {
  const t = useTranslations("host");
  const snap = session.snap!;
  const [status, setStatus] = useState<string | null>(null);
  const path = snap.host?.shareSlug ? `/s/${snap.host.shareSlug}` : null;
  return (
    <div className="space-y-2">
      <Check checked={snap.host?.shared ?? false} save={(shared) => session.send({ type: "share", shared })}>
        {t("publicPage")}
      </Check>
      {snap.host?.shared && path ? (
        <div className="flex flex-wrap items-center gap-3">
          <a className="underline" href={path} target="_blank" rel="noreferrer" data-testid="public-link">
            {t("openPublic")}
          </a>
          <ActionButton run={async () => setStatus(await shareLink({ title: snap.story?.title ?? "", url: `${location.origin}${path}` }))}>{t("shareLink")}</ActionButton>
          <span aria-live="polite">{status === "copied" ? t("copied") : null}</span>
        </div>
      ) : null}
      <div className="flex flex-wrap gap-4">
        <a className="underline" href={`/api/session/${snap.code}/pdf`} data-testid="pdf-link">
          {t("pdf")}
        </a>
        <a className="underline" href={`/api/session/${snap.code}/export`}>
          {t("json")}
        </a>
      </div>
    </div>
  );
}

function Editorial({ session }: { session: Session }) {
  const t = useTranslations("host");
  const snap = session.snap!;
  const { send } = session;
  const d = snap.dilemma;
  const [edit, setEdit] = useState<{ title: string; context: string; question: string } | null>(null);
  return (
    <div className="space-y-2">
      {snap.host?.canRegenerateNext ? (
        <ActionButton run={() => send({ type: "regenerate_dilemma" })}>{t("regenerateDilemma")}</ActionButton>
      ) : null}
      {snap.phase === "universe_reveal" && !snap.builtIn ? (
        <ActionButton run={() => send({ type: "regenerate_image", role: "key_art" })}>{t("regenerateImage")}</ActionButton>
      ) : null}
      {snap.phase === "dilemma_presenting" && d ? (
        <div className="flex flex-wrap gap-2">
          {!snap.builtIn ? <ActionButton run={() => send({ type: "regenerate_image", role: "dilemma" })}>{t("regenerateImage")}</ActionButton> : null}
          <Button onClick={() => setEdit({ title: d.title, context: d.context, question: d.question })}>{t("edit")}</Button>
        </div>
      ) : null}
      {edit ? (
        <form
          className="space-y-2"
          onSubmit={async (e) => {
            e.preventDefault();
            if (await send({ type: "edit_dilemma", ...edit })) setEdit(null);
          }}
        >
          <input aria-label={t("editTitle")} className={inputClass} maxLength={70} value={edit.title} onChange={(e) => setEdit({ ...edit, title: e.target.value })} />
          <textarea aria-label={t("editContext")} className={`${inputClass} min-h-32`} maxLength={1200} value={edit.context} onChange={(e) => setEdit({ ...edit, context: e.target.value })} />
          <input aria-label={t("editQuestion")} className={inputClass} maxLength={240} value={edit.question} onChange={(e) => setEdit({ ...edit, question: e.target.value })} />
          <div className="flex gap-2">
            <Button type="submit" kind="primary">
              {t("save")}
            </Button>
            <Button onClick={() => setEdit(null)}>{t("cancel")}</Button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function WriteInReview({ session }: { session: Session }) {
  const t = useTranslations("host");
  const open = (session.snap!.writeIns ?? []).filter((w) => w.status === "open");
  if (!open.length) return null;
  return (
    <ul className="space-y-2">
      {open.map((w) => (
        <li key={w.id} className="space-y-2 rounded-xl border border-line p-3">
          <p>{w.label}</p>
          <div className="flex gap-2">
            <ActionButton run={() => session.send({ type: "review", id: w.id, ok: true })}>{t("approveWriteIn")}</ActionButton>
            <ActionButton run={() => session.send({ type: "review", id: w.id, ok: false })}>{t("rejectWriteIn")}</ActionButton>
          </div>
        </li>
      ))}
    </ul>
  );
}

function Players({ session }: { session: Session }) {
  const t = useTranslations("host");
  const snap = session.snap!;
  const { send } = session;
  return (
    <div className="space-y-4">
      {snap.host?.pending.map((p) => (
        <div key={p.id} className="flex items-center justify-between gap-2 rounded-xl border border-amber p-3">
          <span>{t("wantsIn", { name: p.nickname })}</span>
          <ActionButton run={() => send({ type: "approve", participantId: p.id })}>{t("approve")}</ActionButton>
        </div>
      ))}
      <ul className="space-y-2">
        {snap.players.map((p) => (
          <li key={p.id} className="rounded-xl border border-line p-3">
            <div className="flex items-center justify-between gap-2">
              <span>
                <span aria-hidden>{p.avatar}</span> {p.nickname}
                {p.cohost ? <span className="text-sm text-muted"> · {t("cohost")}</span> : null}
                {p.role === "spectator" ? <span className="text-sm text-muted"> · {t("spectator")}</span> : null}
              </span>
              <span className="text-sm text-muted">{p.online ? t("online") : t("awayLabel")}</span>
            </div>
            <div className="mt-1 flex flex-wrap gap-x-4">
              {snap.round && !snap.round.votedIds.includes(p.id) && p.role === "player" ? (
                <SmallAction label={t("nudge")} run={() => send({ type: "nudge", participantId: p.id })} />
              ) : null}
              <SmallAction
                label={t("rename")}
                run={async () => {
                  const nickname = prompt(t("newName"), p.nickname);
                  if (nickname) await send({ type: "rename", participantId: p.id, nickname });
                }}
              />
              {snap.me.userIsHost && p.id !== snap.me.participantId ? (
                <SmallAction label={p.cohost ? t("removeCohost") : t("makeCohost")} run={() => send({ type: "cohost", participantId: p.id })} />
              ) : null}
              {p.id !== snap.me.participantId ? (
                <SmallAction
                  label={t("kick")}
                  run={async () => {
                    if (confirm(t("kickConfirm", { name: p.nickname }))) await send({ type: "kick", participantId: p.id });
                  }}
                />
              ) : null}
            </div>
          </li>
        ))}
      </ul>
      <Check checked={snap.locked} save={(locked) => send({ type: "lock", locked })}>
        {t("lockRoom")}
      </Check>
    </div>
  );
}

const SmallAction = ({ label, run }: { label: string; run: () => Promise<unknown> }) => (
  <button type="button" className="min-h-12 text-sm text-muted underline hover:text-ink" onClick={() => void run()}>
    {label}
  </button>
);

function Links({ snap }: { snap: Snapshot }) {
  const t = useTranslations("host");
  const stage = `/stage/${snap.code}?t=${snap.host!.stageToken}`;
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3">
      <JoinCard code={snap.code} />
      <div className="flex flex-wrap items-center justify-center gap-4">
        <a className="underline" href={stage} target="_blank" rel="noreferrer" data-testid="stage-link">
          {t("openStage")}
        </a>
        <button
          type="button"
          className="min-h-10 underline"
          onClick={async () => setCopied((await shareLink({ title: "Stage", url: `${location.origin}${stage}` })) === "copied")}
        >
          {copied ? t("copied") : t("copyStage")}
        </button>
      </div>
    </div>
  );
}

const TABS = ["now", "players", "settings", "play"] as const;

export function HostApp({ code }: { code: string }) {
  const t = useTranslations("host");
  const session = useSession(code);
  const errorText = useErrorText();
  const [tab, setTab] = useState<(typeof TABS)[number]>("now");
  useWakeLock();
  const { snap, error, limited } = session;
  if (error) return <p className="p-6 text-xl">{errorText(error)}</p>;
  if (limited || (snap && !snap.me.isHost)) return <p className="p-6 text-xl">{t("notHost")}</p>;
  if (!snap) return <p className="p-6 text-muted">{t("loading")}</p>;

  const lobby = snap.phase === "lobby";
  const settings = (
    <div className="space-y-5">
      <Links snap={snap} />
      {lobby ? <ConfigForm value={snap.config} onChange={(patch) => void session.send({ type: "config", config: patch })} /> : null}
    </div>
  );
  // On phones one tab is visible at a time; larger screens show preview, controls and players side by side.
  const show = (x: (typeof TABS)[number]) => (tab === x ? "" : "hidden");
  return (
    <div className="mx-auto max-w-[1700px] p-4">
      <header className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" className="flex flex-wrap gap-1">
          {TABS.map((x) => (
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
        <SettingsMenu />
      </header>
      {tab === "play" ? (
        <main className="@container mx-auto max-w-5xl">{snap.me.participantId ? <PlayBody session={session} /> : <JoinForm session={session} code={code} />}</main>
      ) : (
        <main className="grid gap-4 md:grid-cols-[1fr_22rem] xl:grid-cols-[1fr_22rem_22rem]">
          <Panel className={`order-2 hidden overflow-auto md:order-1 md:block md:max-h-[85dvh] ${tab === "settings" ? "md:block" : ""}`} label={t("preview")} scrolls>
            {tab === "settings" ? settings : lobby ? settings : <StageView session={session} />}
          </Panel>
          <Panel className={`order-1 md:order-2 md:block ${show("now")} h-fit`} label={t("tab_now")}>
            <Controls session={session} />
            {lobby ? (
              <div className="mt-5 space-y-4 md:hidden">
                <Links snap={snap} />
                <PlayerChips snap={snap} />
              </div>
            ) : null}
          </Panel>
          <Panel className={`order-3 h-fit ${show("players")} md:col-span-2 md:block xl:col-span-1`} label={t("tab_players")}>
            <Players session={session} />
          </Panel>
          <div className={`order-4 md:hidden ${show("settings")}`}>
            <Panel>{settings}</Panel>
          </div>
        </main>
      )}
      <p className="sr-only" aria-live="polite">
        {t(`phase_${shownPhase(snap)}`)}
      </p>
      <Banners session={session} />
    </div>
  );
}
