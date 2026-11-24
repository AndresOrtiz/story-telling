import type { Metadata, Viewport } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: "The Collective Story",
  description: "A group story game of moral dilemmas, played in the browser.",
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#0b1214" };

// Plain ES5 on purpose: it must also run in browsers that are too old for the app.
const BOOT = `(function(){try{var s=localStorage.getItem("text-size");if(s)document.documentElement.setAttribute("data-text",s)}catch(e){}
if(!("structuredClone" in window&&"at" in Array.prototype&&window.CSS&&CSS.supports("selector(:has(a))"))&&location.pathname!=="/unsupported")location.replace("/unsupported")})()`;

export default async function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={await getLocale()} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: BOOT }} />
      </head>
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
