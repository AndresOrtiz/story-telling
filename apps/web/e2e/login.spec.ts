import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { HOST_PASSWORD } from "../playwright.config";
import { act, DEVICES, joinRoom, LAPTOP, open, phaseIs, PHONE, toFirstDilemma, vote } from "./helpers";

async function logIn(page: Page, password = HOST_PASSWORD) {
  await page.getByLabel("Host password").fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
}

async function createRoom(host: Page): Promise<string> {
  await host.getByTestId("create").click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  await phaseIs(host, "lobby");
  return host.url().split("/").pop()!;
}

const command = async (page: Page, code: string, data: object) => {
  const res = await page.request.post(`/api/session/${code}/command`, { data });
  return [res.status(), (await res.json()).error];
};
const START = { type: "host", action: "start", phase: "lobby", k: 0 };

test("a room cannot be created without the password", async ({ browser }) => {
  const host = await open(browser, LAPTOP, "/");
  await expect(host.getByTestId("host-login")).toBeVisible();
  await expect(host.getByTestId("create")).toHaveCount(0);
  await expect(host.getByRole("heading", { name: "Join a room" })).toBeVisible();

  // The API refuses too, for a browser that already has an identity.
  await host.request.post("/api/identity");
  const refused = await host.request.post("/api/session", { data: {} });
  expect([refused.status(), (await refused.json()).error]).toEqual([401, "login_required"]);

  await logIn(host, "wrong password");
  await expect(host.getByTestId("host-login").getByRole("alert")).toHaveText("That password is not correct.");
  const { violations } = await new AxeBuilder({ page: host }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  expect(violations.map((v) => v.id)).toEqual([]);
  expect((await host.context().cookies()).some((c) => c.name === "cs_host")).toBe(false);

  await logIn(host);
  await expect(host.getByTestId("create")).toBeVisible();
  const cookie = (await host.context().cookies()).find((c) => c.name === "cs_host")!;
  expect([cookie.httpOnly, cookie.sameSite]).toEqual([true, "Lax"]);
  await createRoom(host);

  await host.goto("/");
  await host.getByTestId("logout").click();
  await expect(host.getByTestId("host-login")).toBeVisible();
  await expect(host.getByTestId("create")).toHaveCount(0);
});

test("players play without logging in, and a logged-out host returns to the same room", async ({ browser }) => {
  const host = await open(browser, LAPTOP, "/");
  await logIn(host);
  const code = await createRoom(host);
  const stageLink = (await host.getByTestId("stage-link").first().getAttribute("href"))!;
  const players = [await joinRoom(browser, PHONE, code, "Ana"), await joinRoom(browser, DEVICES[1]!, code, "Leo")];

  await expect(host.getByTestId("host-start")).toBeEnabled();
  // Without new snapshots, only the refused command can tell the page that the login is gone.
  await host.route("**/snapshot**", (route) => route.abort());
  await host.context().clearCookies({ name: "cs_host" });
  expect(await command(host, code, START)).toEqual([401, "login_required"]);
  expect(await command(host, code, { type: "config", config: { dilemmas: 4 } })).toEqual([401, "login_required"]);
  expect(await command(host, code, { type: "lock", locked: true })).toEqual([401, "login_required"]);
  expect((await host.request.get(`/api/session/${code}/export`)).status()).toBe(403);
  await act(host, "start");
  await expect(host.getByTestId("host-login")).toBeVisible();
  await host.unroute("**/snapshot**");
  await host.reload();
  await expect(host.getByTestId("host-login")).toBeVisible();
  await expect(host.getByTestId("host-phase")).toHaveCount(0);

  // The stage needs no login.
  const stage = await open(browser, LAPTOP, stageLink);
  await expect(stage.getByTestId("room-code")).toBeVisible();

  await logIn(host);
  await phaseIs(host, "lobby");
  await toFirstDilemma(host, players);
  await act(host, "open_voting");
  for (const p of players) await vote(p, 0);
  await act(host, "close_voting");
  await phaseIs(host, "results");
});

test("a co-host takes over without a login, and nobody else gets in", async ({ browser }) => {
  const host = await open(browser, LAPTOP, "/");
  await logIn(host);
  const code = await createRoom(host);
  const ana = await joinRoom(browser, LAPTOP, code, "Ana");
  const leo = await joinRoom(browser, PHONE, code, "Leo");
  expect(await command(leo, code, START)).toEqual([403, "forbidden"]);

  await host.getByRole("button", { name: "Make co-host" }).first().click();
  await expect(host.getByText("co-host", { exact: false }).first()).toBeVisible();
  await host.close();
  await ana.goto(`/host/${code}`);
  await act(ana, "start");
  await phaseIs(ana, "selection");
  expect((await ana.context().cookies()).some((c) => c.name === "cs_host")).toBe(false);

  // Knowing the password does not open somebody else's room.
  const other = await open(browser, LAPTOP, "/");
  await logIn(other);
  await expect(other.getByTestId("create")).toBeVisible();
  await other.goto(`/host/${code}`);
  await expect(other.getByText("Only the host can open this page.")).toBeVisible();
});
