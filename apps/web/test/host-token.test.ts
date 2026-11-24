import { createHmac, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { createToken, LOGIN_DAYS, passwordMatches, verifyToken } from "../lib/host-token.ts";

const SECRET = "test-secret";
const PASSWORD = "correct horse battery";
const NOW = Date.UTC(2026, 10, 24);
const DAY = 86_400_000;

describe("host login token", () => {
  it("compares passwords exactly", () => {
    expect(passwordMatches(PASSWORD, PASSWORD)).toBe(true);
    for (const wrong of ["", "correct horse", `${PASSWORD} `, PASSWORD.toUpperCase()]) expect(passwordMatches(wrong, PASSWORD)).toBe(false);
  });

  it("is valid until it expires", () => {
    const token = createToken(SECRET, PASSWORD, NOW);
    expect(verifyToken(SECRET, PASSWORD, token, NOW)).toBe(true);
    expect(verifyToken(SECRET, PASSWORD, token, NOW + LOGIN_DAYS * DAY - 1)).toBe(true);
    expect(verifyToken(SECRET, PASSWORD, token, NOW + LOGIN_DAYS * DAY)).toBe(false);
  });

  it("ends when the password or the secret changes", () => {
    const token = createToken(SECRET, PASSWORD, NOW);
    expect(verifyToken(SECRET, "another password", token, NOW)).toBe(false);
    expect(verifyToken("another secret", PASSWORD, token, NOW)).toBe(false);
  });

  it("rejects anything that was changed or made up", () => {
    const [expires, mac] = createToken(SECRET, PASSWORD, NOW).split(".") as [string, string];
    const later = String(Number(expires) + DAY);
    for (const bad of [undefined, "", ".", expires, `${expires}.`, `${later}.${mac}`, `${expires}.${mac}.x`, `${expires}.AAAA`, `x.${mac}`, `1e99.${mac}`])
      expect(verifyToken(SECRET, PASSWORD, bad, NOW)).toBe(false);
  });

  it("does not accept the identity cookie, even for an id that looks like a date", () => {
    const identity = (id: string) => `${id}.${createHmac("sha256", SECRET).update(id).digest("base64url")}`;
    expect(verifyToken(SECRET, PASSWORD, identity(randomUUID()), NOW)).toBe(false);
    expect(verifyToken(SECRET, PASSWORD, identity(String(NOW + DAY)), NOW)).toBe(false);
  });
});
