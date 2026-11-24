import { existsSync } from "node:fs";
import { join } from "node:path";
import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

// One .env.local at the repository root serves every package.
const env = join(process.cwd(), "..", "..", ".env.local");
if (existsSync(env)) process.loadEnvFile(env);

const config: NextConfig = {
  transpilePackages: ["@cs/schemas", "@cs/engine", "@cs/default-story", "@cs/db", "@cs/ai", "@cs/media", "@cs/workflows"],
  serverExternalPackages: ["@electric-sql/pglite", "postgres", "sharp", "@react-pdf/renderer"],
  outputFileTracingIncludes: { "/**": ["../../supabase/migrations/*.sql"] },
  allowedDevOrigins: (process.env.DEV_ORIGINS ?? "").split(",").filter(Boolean),
  devIndicators: false,
  agentRules: false,
  poweredByHeader: false,
  headers: async () => [
    {
      source: "/:path*",
      headers: [
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Referrer-Policy", value: "same-origin" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
      ],
    },
    { source: "/s/:slug", headers: [{ key: "X-Robots-Tag", value: "noindex" }] },
  ],
};

export default createNextIntlPlugin("./lib/i18n.ts")(config);
