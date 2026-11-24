import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const LOGIN_DAYS = 7;

const digest = (text: string) => createHash("sha256").update(text).digest();

export const passwordMatches = (input: string, expected: string): boolean => timingSafeEqual(digest(input), digest(expected));

/** The password is part of the key, so changing it ends every login. */
function mac(secret: string, password: string, expires: string): Buffer {
  const key = createHmac("sha256", secret).update(`host-login:${password}`).digest();
  return createHmac("sha256", key).update(expires).digest();
}

export function createToken(secret: string, password: string, now: number): string {
  const expires = String(now + LOGIN_DAYS * 86_400_000);
  return `${expires}.${mac(secret, password, expires).toString("base64url")}`;
}

export function verifyToken(secret: string, password: string, token: string | undefined, now: number): boolean {
  const [expires, given, ...rest] = (token ?? "").split(".");
  if (!expires || !given || rest.length || !/^\d+$/.test(expires) || Number(expires) <= now) return false;
  const a = Buffer.from(given, "base64url");
  const b = mac(secret, password, expires);
  return a.length === b.length && timingSafeEqual(a, b);
}
