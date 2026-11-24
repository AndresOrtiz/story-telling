import { getLocale } from "next-intl/server";
import { Home } from "@/components/home";
import { hostLogin } from "@/lib/host-login";

export default async function Page() {
  return <Home locale={await getLocale()} login={await hostLogin()} />;
}
