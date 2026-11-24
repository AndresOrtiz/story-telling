"use client";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { api, ApiError } from "@/lib/client";
import { Button, inputClass, useErrorText } from "./ui";

export function HostLogin({ heading: Heading = "h2", onDone }: { heading?: "h1" | "h2"; onDone: () => void }) {
  const t = useTranslations("login");
  const errorText = useErrorText();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="space-y-4"
      data-testid="host-login"
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError(null);
        try {
          await api("/api/host-login", { password });
          onDone();
        } catch (x) {
          setError(x instanceof ApiError ? x.message : "generic");
        } finally {
          setBusy(false);
        }
      }}
    >
      <Heading className="text-2xl font-semibold">{t("title")}</Heading>
      <p className="text-muted">{t("hint")}</p>
      <label className="block space-y-1">
        <span>{t("password")}</span>
        <input
          type="password"
          name="password"
          autoComplete="current-password"
          required
          maxLength={200}
          className={inputClass}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
      </label>
      {error ? (
        <p role="alert" className="text-danger">
          {errorText(error)}
        </p>
      ) : null}
      <Button type="submit" kind="primary" className="w-full" disabled={busy} aria-busy={busy}>
        {t("submit")}
      </Button>
    </form>
  );
}
