"use client";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LANGUAGES, SessionConfig } from "@cs/schemas";
import { api } from "@/lib/client";
import { ConfigForm } from "./host";
import { ActionButton, Button, inputClass, Panel, SettingsMenu, useErrorText } from "./ui";

export function Home({ locale }: { locale: string }) {
  const t = useTranslations("home");
  const errorText = useErrorText();
  const router = useRouter();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState(() => SessionConfig.parse({ language: LANGUAGES.find((l) => l === locale) ?? "en" }));
  return (
    <div className="relative min-h-dvh">
      <img src="/placeholders/scene.svg" alt="" className="absolute inset-x-0 top-0 -z-10 h-[70vh] w-full object-cover opacity-45 [mask-image:linear-gradient(#000,transparent)]" />
      <header className="flex justify-end p-3">
        <SettingsMenu />
      </header>
      <main className="mx-auto max-w-5xl space-y-10 px-4 pb-16">
        <div className="max-w-2xl space-y-4 pt-6 sm:pt-14">
          <h1 className="font-serif text-5xl leading-none sm:text-7xl">{t("title")}</h1>
          <p className="text-xl">{t("lead")}</p>
        </div>
        {error ? (
          <p role="alert" className="text-danger">
            {errorText(error)}
          </p>
        ) : null}
        <div className="grid gap-5 md:grid-cols-2">
          <Panel className="space-y-4">
            <h2 className="text-2xl font-semibold">{t("joinTitle")}</h2>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "");
                if (clean.length === 6) router.push(`/play/${clean}`);
                else setError("not_found");
              }}
            >
              <input aria-label={t("code")} placeholder="KX7-QM4" className={`${inputClass} uppercase`} value={code} onChange={(e) => setCode(e.target.value)} maxLength={9} required name="code" autoComplete="off" />
              <Button type="submit">{t("join")}</Button>
            </form>
            <p className="text-muted">{t("joinHint")}</p>
          </Panel>
          <Panel className="space-y-4">
            <h2 className="text-2xl font-semibold">{t("hostTitle")}</h2>
            <p className="text-muted">{t("hostHint")}</p>
            <ActionButton
              kind="primary"
              className="w-full"
              data-testid="create"
              run={async () => {
                try {
                  const s = await api<{ code: string }>("/api/session", config);
                  router.push(`/host/${s.code}`);
                } catch {
                  setError("generic");
                }
              }}
            >
              {t("create")}
            </ActionButton>
            <details>
              <summary className="min-h-12 py-3 text-muted">{t("options")}</summary>
              <ConfigForm value={config} onChange={(patch) => setConfig((c) => ({ ...c, ...patch }))} />
            </details>
          </Panel>
        </div>
        <p className="text-sm text-muted">{t("disclaimer")}</p>
      </main>
    </div>
  );
}
