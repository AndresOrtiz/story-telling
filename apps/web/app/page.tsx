import { getLocale } from "next-intl/server";
import { Home } from "@/components/home";

export default async function Page() {
  return <Home locale={await getLocale()} />;
}
