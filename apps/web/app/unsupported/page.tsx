import { getTranslations } from "next-intl/server";

export default async function Page() {
  const t = await getTranslations("unsupported");
  return (
    <main style={{ maxWidth: 560, margin: "15vh auto", padding: 16 }}>
      <h1 style={{ fontSize: 32 }}>{t("title")}</h1>
      <p style={{ fontSize: 18 }}>{t("text")}</p>
    </main>
  );
}
