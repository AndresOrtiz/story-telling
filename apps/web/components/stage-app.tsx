"use client";
import { useEffect } from "react";
import { toggleFullscreen } from "@/lib/client";
import { WatchApp } from "./player";
import { SettingsMenu } from "./ui";

export function StageApp({ code, token }: { code: string; token: string | null }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === "f") void toggleFullscreen();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);
  return (
    <div className="relative">
      <div className="absolute right-2 top-2 z-30 flex opacity-40 focus-within:opacity-100 hover:opacity-100">
        <button type="button" className="min-h-12 px-3 text-muted" onClick={() => void toggleFullscreen()}>
          ⛶<span className="sr-only">Fullscreen</span>
        </button>
        <SettingsMenu />
      </div>
      <WatchApp code={code} stageToken={token} />
    </div>
  );
}
