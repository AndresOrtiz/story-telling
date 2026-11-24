"use client";
import { decode } from "blurhash";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from "react";
import type { ImageView, Snapshot } from "@cs/workflows";
import { useCountdown, type Session } from "@/lib/client";

type Kind = "primary" | "secondary" | "ghost" | "danger";
const KINDS: Record<Kind, string> = {
  primary: "bg-amber text-ground hover:bg-[#ffc95f]",
  secondary: "bg-raised text-ink border border-line hover:border-amber",
  ghost: "text-muted hover:text-ink underline underline-offset-4",
  danger: "bg-raised text-danger border border-line hover:border-danger",
};

export function Button({
  kind = "secondary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { kind?: Kind }) {
  return (
    <button
      type="button"
      {...props}
      className={`min-h-12 rounded-xl px-5 py-2.5 font-semibold transition-colors disabled:opacity-45 ${KINDS[kind]} ${className}`}
    />
  );
}

/** Disables itself while the action runs. */
export function ActionButton({
  run,
  children,
  ...props
}: Omit<Parameters<typeof Button>[0], "onClick"> & { run: () => Promise<unknown> | void }) {
  const [busy, setBusy] = useState(false);
  return (
    <Button
      {...props}
      disabled={busy || props.disabled}
      aria-busy={busy}
      onClick={async () => {
        setBusy(true);
        try {
          await run();
        } finally {
          setBusy(false);
        }
      }}
    >
      {children}
    </Button>
  );
}

export function Panel({
  className = "",
  children,
  label,
  scrolls,
}: {
  className?: string;
  children: ReactNode;
  label?: string;
  /** Scrollable panels must be reachable with the keyboard. */
  scrolls?: boolean;
}) {
  return (
    <section tabIndex={scrolls ? 0 : undefined} aria-label={label} className={`rounded-2xl border border-line/60 bg-panel p-4 sm:p-5 ${className}`}>
      {children}
    </section>
  );
}

export const Eyebrow = ({ children }: { children: ReactNode }) => (
  <p className="text-sm font-semibold tracking-wide text-amber">{children}</p>
);

export const inputClass =
  "min-h-12 w-full rounded-xl border border-line bg-ground px-4 py-2 text-base text-ink placeholder:text-muted/70";

export function Blur({ hash }: { hash: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const ctx = ref.current?.getContext("2d");
    if (!ctx) return;
    try {
      const data = ctx.createImageData(32, 18);
      data.data.set(decode(hash, 32, 18));
      ctx.putImageData(data, 0, 0);
    } catch {
      // An invalid hash just means no placeholder.
    }
  }, [hash]);
  return <canvas ref={ref} width={32} height={18} aria-hidden className="absolute inset-0 h-full w-full" />;
}

export function Art({
  image,
  className = "",
  moving = false,
}: {
  image: ImageView | { url: string; alt: string } | null | undefined;
  className?: string;
  moving?: boolean;
}) {
  const [broken, setBroken] = useState<string | null>(null);
  const url = image?.url ?? "/placeholders/scene.svg";
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-raised ${className}`}>
      {image && "blurhash" in image && image.blurhash ? <Blur hash={image.blurhash} /> : null}
      <img
        src={broken === url ? "/placeholders/unavailable.svg" : url}
        alt={image?.alt ?? ""}
        onError={() => setBroken(url)}
        className={`relative h-full w-full object-cover ${moving ? "drift" : ""}`}
      />
    </div>
  );
}

export function Countdown({ snap, skew, big = false }: { snap: Snapshot; skew: number; big?: boolean }) {
  const t = useTranslations("common");
  const left = useCountdown(snap.endsAt, skew);
  if (left === null) return null;
  const text = `${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")}`;
  return (
    <span
      role="timer"
      aria-label={t("timeLeft")}
      className={`font-semibold tabular-nums ${left <= 10 ? "text-danger" : "text-ink"} ${big ? "text-4xl" : "text-xl"}`}
    >
      {text}
    </span>
  );
}

/** Text that appears gradually. Screen readers and reduced motion get it at once. */
export function Typewriter({ text, className = "" }: { text: string; className?: string }) {
  const [shown, setShown] = useState(0);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(text.length);
      return;
    }
    setShown(0);
    const start = performance.now();
    let frame = requestAnimationFrame(function step(now) {
      const n = Math.floor((now - start) / 14);
      setShown(n);
      if (n < text.length) frame = requestAnimationFrame(step);
    });
    return () => cancelAnimationFrame(frame);
  }, [text]);
  return (
    <p className={className}>
      <span className="sr-only">{text}</span>
      <span aria-hidden>
        {text.slice(0, shown)}
        <span className="opacity-0">{text.slice(shown)}</span>
      </span>
    </p>
  );
}

const ERROR_KEYS = [
  "room_full",
  "locked",
  "started",
  "kicked",
  "ended",
  "not_found",
  "no_spectators",
  "bad_nickname",
  "bad_title",
  "bad_write_in",
  "already_proposed",
  "already_voted",
  "round_closed",
  "need_players",
  "bad_seat",
  "already_joined",
  "nickname_taken",
  "bad_text",
] as const;

export function useErrorText() {
  const t = useTranslations("errors");
  return (code: string) => {
    const key = ERROR_KEYS.find((k) => k === code);
    return key ? t(key) : t("generic");
  };
}

/** Connection state, error notices and the pause banner. Shown on every screen. */
export function Banners({ session }: { session: Session }) {
  const t = useTranslations("common");
  const errorText = useErrorText();
  const { snap, offline, notice, clearNotice } = session;
  return (
    <div aria-live="polite" className="fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 p-3 empty:hidden">
      {offline ? <Banner>{t("reconnecting")}</Banner> : null}
      {snap?.phase === "paused" ? <Banner>{t("paused")}</Banner> : null}
      {snap && !snap.hostOnline && !snap.me.isHost && snap.status === "in_progress" ? <Banner>{t("hostAway")}</Banner> : null}
      {notice ? (
        <div role="alert" className="flex items-center gap-3 rounded-xl border border-danger bg-panel px-4 py-2 shadow-lg">
          <span>{errorText(notice)}</span>
          <button type="button" onClick={clearNotice} className="min-h-12 px-2 underline">
            {t("dismiss")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

const Banner = ({ children }: { children: ReactNode }) => (
  <p className="rounded-xl border border-amber bg-panel px-4 py-2 shadow-lg">{children}</p>
);

export function SettingsMenu() {
  const t = useTranslations("settings");
  const [size, setSize] = useState("normal");
  useEffect(() => {
    try {
      setSize(localStorage.getItem("text-size") ?? "normal");
    } catch {
      // Storage can be blocked; the default size is fine.
    }
  }, []);
  const apply = (value: string) => {
    setSize(value);
    document.documentElement.dataset.text = value;
    try {
      localStorage.setItem("text-size", value);
    } catch {
      // Only this visit then.
    }
  };
  return (
    <details className="relative">
      <summary className="flex min-h-12 cursor-pointer list-none items-center rounded-xl px-3 text-muted hover:text-ink">
        {t("title")}
      </summary>
      <div className="absolute right-0 z-40 w-64 space-y-4 rounded-xl border border-line bg-panel p-4 shadow-xl">
        <label className="block space-y-1 text-sm">
          <span className="text-muted">{t("textSize")}</span>
          <select className={inputClass} value={size} onChange={(e) => apply(e.target.value)}>
            <option value="normal">{t("sizeNormal")}</option>
            <option value="large">{t("sizeLarge")}</option>
            <option value="larger">{t("sizeLarger")}</option>
          </select>
        </label>
        <label className="block space-y-1 text-sm">
          <span className="text-muted">{t("language")}</span>
          <select
            className={inputClass}
            defaultValue=""
            onChange={(e) => {
              document.cookie = `locale=${e.target.value}; path=/; max-age=31536000; samesite=lax`;
              location.reload();
            }}
          >
            <option value="" disabled>
              {t("choose")}
            </option>
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="pt">Português</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </label>
      </div>
    </details>
  );
}

/** A server-backed checkbox that reacts immediately and reverts if the server says no. */
export function Check({
  checked,
  save,
  children,
  name,
}: {
  checked: boolean;
  save: (value: boolean) => Promise<boolean> | void;
  children: ReactNode;
  name?: string;
}) {
  const [value, setValue] = useState(checked);
  useEffect(() => setValue(checked), [checked]);
  return (
    <label className="flex min-h-12 items-center gap-3">
      <input
        type="checkbox"
        name={name}
        className="h-5 w-5 accent-amber"
        checked={value}
        onChange={async (e) => {
          const next = e.target.checked;
          setValue(next);
          if ((await save(next)) === false) setValue(!next);
        }}
      />
      {children}
    </label>
  );
}
