"use client";
import { createBrowserClient } from "@supabase/ssr";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Limited, Snapshot } from "@cs/workflows";

const supabase = () =>
  createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "", process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "");

let mode: "supabase" | "cookie" = "cookie";
let identity: Promise<void> | null = null;

/** Every browser gets an anonymous identity before its first request. */
export function ensureIdentity(): Promise<void> {
  identity ??= (async () => {
    const res = await fetch("/api/identity").then((r) => r.json() as Promise<{ mode: typeof mode; known: boolean }>);
    mode = res.mode;
    if (res.known) return;
    if (mode === "supabase") {
      const { error } = await supabase().auth.signInAnonymously();
      if (!error) return;
    }
    await fetch("/api/identity", { method: "POST" });
  })().catch((e) => {
    identity = null;
    throw e;
  });
  return identity;
}

export class ApiError extends Error {}

export async function api<T = { ok: true }>(path: string, body?: unknown): Promise<T> {
  await ensureIdentity();
  const init: RequestInit =
    body === undefined
      ? {}
      : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) };
  const res = await fetch(path, init);
  const data = await res.json().catch(() => ({ error: "internal" }));
  if (!res.ok) throw new ApiError(data.error ?? "internal");
  return data as T;
}

export type Send = (command: { type: string } & Record<string, unknown>) => Promise<boolean>;
type State = { snap: Snapshot | null; limited: Limited | null; error: string | null; offline: boolean };
export type Session = State & {
  send: Send;
  notice: string | null;
  clearNotice: () => void;
  /** Server clock minus browser clock, in milliseconds. */
  skew: number;
  refresh: () => void;
};

export function useSession(code: string, stageToken?: string | null): Session {
  const [state, setState] = useState<State>({ snap: null, limited: null, error: null, offline: false });
  const [skew, setSkew] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const version = useRef(0);
  const polls = useRef(0);
  const busy = useRef(false);
  const again = useRef(false);
  const saving = useRef<Promise<unknown>>(Promise.resolve());

  const refresh = useCallback(async () => {
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        again.current = false;
        const q = new URLSearchParams();
        if (stageToken) q.set("t", stageToken);
        // Presence is not part of the version, so every tenth poll fetches everything.
        if (version.current && ++polls.current % 10) q.set("v", String(version.current));
        type Answer = (Snapshot | Limited) & { unchanged?: boolean; now?: number };
        const data = await api<Answer>(`/api/session/${code}/snapshot?${q}`);
        if (data.now) setSkew(data.now - Date.now());
        if (data.unchanged) setState((s) => (s.offline ? { ...s, offline: false } : s));
        else if ("limited" in data) {
          version.current = 0;
          setState({ snap: null, limited: data, error: null, offline: false });
        } else if (data.version >= version.current) {
          version.current = data.version;
          setState({ snap: data, limited: null, error: null, offline: false });
        }
      } while (again.current);
    } catch (e) {
      const known = e instanceof ApiError && e.message !== "internal";
      setState((s) => (known && !s.snap ? { ...s, error: e.message } : { ...s, offline: true }));
    } finally {
      busy.current = false;
    }
  }, [code, stageToken]);

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    const loop = async () => {
      await refresh();
      if (alive) timer = setTimeout(loop, mode === "supabase" ? 5000 : 1000);
    };
    void loop();
    const beat = () => void api(`/api/session/${code}/command`, { type: "heartbeat" }).catch(() => {});
    beat();
    const beats = setInterval(beat, 15_000);
    const wake = () => {
      if (document.visibilityState !== "visible") return;
      beat();
      void refresh();
    };
    document.addEventListener("visibilitychange", wake);
    window.addEventListener("online", wake);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(beats);
      document.removeEventListener("visibilitychange", wake);
      window.removeEventListener("online", wake);
    };
  }, [code, refresh]);

  // Cloud: the database announces every new version on the session's channel.
  const sessionId = state.snap?.sessionId;
  useEffect(() => {
    if (!sessionId || mode !== "supabase") return;
    const client = supabase();
    const channel = client
      .channel(`session:${sessionId}`)
      .on("broadcast", { event: "changed" }, () => void refresh())
      .subscribe();
    return () => void client.removeChannel(channel);
  }, [sessionId, refresh]);

  const send: Send = useCallback(
    async (command) => {
      // Settings are saved one after the other, and nothing overtakes them: not another setting and not the start.
      const sent = saving.current.then(() => api(`/api/session/${code}/command`, command));
      if (command.type === "config") saving.current = sent.catch(() => {});
      try {
        await sent;
        setNotice(null);
        return true;
      } catch (e) {
        // "conflict" means someone else was faster; the refresh shows the result.
        const codeName = e instanceof ApiError ? e.message : "internal";
        if (codeName !== "conflict") setNotice(codeName);
        return false;
      } finally {
        void refresh();
      }
    },
    [code, refresh],
  );

  return { ...state, send, notice, clearNotice: () => setNotice(null), skew, refresh };
}

/* ---------- Browser capabilities with fallbacks (§3.5) ---------- */
export function useWakeLock(): void {
  useEffect(() => {
    let lock: WakeLockSentinel | null = null;
    const ask = async () => {
      try {
        if (document.visibilityState === "visible") lock = await navigator.wakeLock?.request("screen");
      } catch {
        // Not supported or refused: reconnecting restores the state anyway.
      }
    };
    void ask();
    document.addEventListener("visibilitychange", ask);
    return () => {
      document.removeEventListener("visibilitychange", ask);
      void lock?.release().catch(() => {});
    };
  }, []);
}

export async function toggleFullscreen(): Promise<void> {
  try {
    if (document.fullscreenElement) await document.exitFullscreen();
    else await document.documentElement.requestFullscreen?.();
  } catch {
    // iPhone Safari has no page fullscreen; the layout already fills the window.
  }
}

export const vibrate = () => navigator.vibrate?.([120, 80, 120]);

export async function shareLink(data: { title: string; url: string }): Promise<"shared" | "copied" | "failed"> {
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share(data);
      return "shared";
    }
    await navigator.clipboard.writeText(data.url);
    return "copied";
  } catch {
    return "failed";
  }
}

export function useCountdown(endsAt: number | null, skew: number): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!endsAt) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [endsAt]);
  return endsAt ? Math.max(0, Math.ceil((endsAt - now - skew) / 1000)) : null;
}
