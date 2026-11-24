import "server-only";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { isFake } from "@cs/db";

const COOKIE = "cs_id";
const cloud = () => !isFake(process.env.DATABASE_URL);

/** Cloud deployments use Supabase anonymous sign-in; the embedded database uses a signed cookie. */
export const authMode = (): "supabase" | "cookie" =>
  cloud() &&
  !isFake(process.env.NEXT_PUBLIC_SUPABASE_URL) &&
  !isFake(process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
    ? "supabase"
    : "cookie";

function secret(): string {
  const value = process.env.COOKIE_SECRET;
  if (cloud() && isFake(value)) throw new Error("Set COOKIE_SECRET to a real value when using a real database");
  return value ?? "FAKE-cookie-secret-for-local-development-only";
}

const sign = (id: string) => createHmac("sha256", secret()).update(id).digest("base64url");

function verify(value: string | undefined): string | null {
  const [id, mac] = (value ?? "").split(".");
  if (!id || !mac) return null;
  const a = Buffer.from(mac);
  const b = Buffer.from(sign(id));
  return a.length === b.length && timingSafeEqual(a, b) ? id : null;
}

export async function getUserId(): Promise<string | null> {
  const jar = await cookies();
  if (authMode() === "supabase") {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
      {
        cookies: {
          getAll: () => jar.getAll(),
          setAll: (list) => {
            try {
              for (const { name, value, options } of list) jar.set(name, value, options);
            } catch {
              // Server components cannot set cookies; the next API call refreshes the session.
            }
          },
        },
      },
    );
    const { data } = await supabase.auth.getClaims();
    if (data?.claims?.sub) return data.claims.sub;
  }
  return verify(jar.get(COOKIE)?.value);
}

/** Cookie identity. Also used in the cloud while anonymous sign-ins are not enabled in Supabase. */
export async function issueCookieIdentity(): Promise<string> {
  const jar = await cookies();
  const existing = verify(jar.get(COOKIE)?.value);
  if (existing) return existing;
  const id = randomUUID();
  jar.set(COOKIE, `${id}.${sign(id)}`, {
    httpOnly: true,
    sameSite: "lax",
    secure: cloud() && process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 60,
  });
  return id;
}
