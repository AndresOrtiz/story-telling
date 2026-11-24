import "server-only";
import { cookies } from "next/headers";
import { isFake } from "@cs/db";
import { GameError } from "@cs/workflows";
import { createToken, LOGIN_DAYS, passwordMatches, verifyToken } from "./host-token";
import { cloud, secret, secureCookies } from "./identity";

const COOKIE = "cs_host";
/** Login attempts are not rate limited, so a public deployment needs a password that cannot be guessed. */
const MIN_LENGTH = 16;

/** open: no login needed | unconfigured: hosting is refused until HOST_PASSWORD is set */
export type LoginState = "open" | "ok" | "needed" | "unconfigured";

function configured(): { password: string } | "open" | "unconfigured" {
  const password = process.env.HOST_PASSWORD;
  if (isFake(password)) return cloud() ? "unconfigured" : "open";
  if (cloud() && password!.length < MIN_LENGTH) return "unconfigured";
  return { password: password! };
}

export async function hostLogin(): Promise<LoginState> {
  const c = configured();
  if (typeof c === "string") return c;
  return verifyToken(secret(), c.password, (await cookies()).get(COOKIE)?.value, Date.now()) ? "ok" : "needed";
}

export async function mayHost(): Promise<boolean> {
  const state = await hostLogin();
  return state === "open" || state === "ok";
}

export async function assertHostLogin(): Promise<void> {
  const state = await hostLogin();
  if (state === "unconfigured") throw new GameError("login_not_configured", 503);
  if (state === "needed") throw new GameError("login_required", 401);
}

export async function logIn(input: string): Promise<void> {
  const c = configured();
  if (c === "unconfigured") throw new GameError("login_not_configured", 503);
  if (c === "open") return;
  if (!passwordMatches(input, c.password)) {
    await new Promise((r) => setTimeout(r, 1000));
    throw new GameError("bad_password", 403);
  }
  (await cookies()).set(COOKIE, createToken(secret(), c.password, Date.now()), {
    httpOnly: true,
    sameSite: "lax",
    secure: secureCookies(),
    path: "/",
    maxAge: 60 * 60 * 24 * LOGIN_DAYS,
  });
}

export async function logOut(): Promise<void> {
  (await cookies()).delete(COOKIE);
}
