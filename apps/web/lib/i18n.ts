import { cookies, headers } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { LANGUAGES, type Language } from "@cs/schemas";

/** The interface follows the browser (or the language picker). Story text follows the session language. */
async function resolveLocale(): Promise<Language> {
  const known = (x: string | undefined) => LANGUAGES.find((l) => l === x);
  const picked = known((await cookies()).get("locale")?.value);
  if (picked) return picked;
  for (const part of ((await headers()).get("accept-language") ?? "").split(",")) {
    const match = known(part.trim().slice(0, 2).toLowerCase());
    if (match) return match;
  }
  return "en";
}

export default getRequestConfig(async () => {
  const locale = await resolveLocale();
  return { locale, messages: (await import(`../messages/${locale}.json`)).default, timeZone: "UTC" };
});
