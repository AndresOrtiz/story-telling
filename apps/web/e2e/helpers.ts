import { devices, expect, type Browser, type BrowserContextOptions, type Page } from "@playwright/test";

/** Browser-specific options that a mixed-device run must not carry over to other engines. */
const shape = (name: string): BrowserContextOptions => {
  const { defaultBrowserType: _, userAgent: _ua, ...rest } = devices[name]!;
  return rest;
};
export const PHONE = { ...shape("Pixel 7"), isMobile: undefined };
export const TABLET = { viewport: { width: 834, height: 1112 }, hasTouch: true };
export const LAPTOP = { viewport: { width: 1366, height: 800 } };
export const DEVICES = [PHONE, TABLET, LAPTOP];

export async function open(browser: Browser, device: BrowserContextOptions, path: string): Promise<Page> {
  const context = await browser.newContext({ ...device, locale: "en-US" });
  const page = await context.newPage();
  await page.goto(path);
  return page;
}

export async function createRoom(browser: Browser, device: BrowserContextOptions = LAPTOP, setup?: (host: Page) => Promise<void>) {
  const host = await open(browser, device, "/");
  if (setup) {
    await host.getByText("Options").click();
    await setup(host);
  }
  await host.getByTestId("create").click();
  await host.waitForURL(/\/host\/[A-Z0-9]{6}$/);
  const code = host.url().split("/").pop()!;
  await expect(host.getByTestId("host-phase")).toHaveAttribute("data-phase", "lobby");
  return { host, code };
}

export async function joinRoom(browser: Browser, device: BrowserContextOptions, code: string, name: string): Promise<Page> {
  const page = await open(browser, device, `/j/${code}`);
  await page.locator('input[name="nickname"]').fill(name);
  await page.getByRole("button", { name: "Join" }).click();
  await expect(page.getByText(`You're in, ${name}`)).toBeVisible();
  return page;
}

export const phaseIs = (host: Page, phase: string) =>
  expect(host.getByTestId("host-phase")).toHaveAttribute("data-phase", phase, { timeout: 30_000 });

export async function act(host: Page, action: string) {
  await host.getByTestId(`host-${action}`).click();
}

export async function selectTitle(page: Page, title: string) {
  await page.locator('input[name="search"]').fill(title);
  await page.getByRole("list", { name: "Results" }).getByRole("button").first().click();
  await page.getByRole("button", { name: "Confirm" }).click();
  await expect(page.getByText("Your choices are in")).toBeVisible();
}

/** Picks valid options, starting at `offset` so that players disagree. */
export async function vote(page: Page, offset: number) {
  const submit = page.getByRole("button", { name: "Send my vote" });
  await expect(submit).toBeVisible();
  const inputs = page.locator('input[name="option"]');
  const count = await inputs.count();
  const single = (await inputs.first().getAttribute("type")) === "radio";
  for (let i = 0; i < count && !(await submit.isEnabled()); i++) {
    const input = inputs.nth((i + (single ? offset : 0)) % count);
    if (await input.isEnabled()) await input.check();
  }
  await submit.click();
  await expect(page.getByTestId("voted")).toBeVisible();
}

export async function finalVote(page: Page, index: number) {
  const candidates = page.locator('input[name="candidate"]');
  await expect(candidates.first()).toBeVisible();
  await candidates.nth(index % (await candidates.count())).check();
  await page.getByRole("button", { name: "Send my vote" }).click();
  await expect(page.getByTestId("voted")).toBeVisible();
}

/** Plays from the dilemma presentation to the consequence. */
export async function playDilemma(host: Page, players: Page[], k: number) {
  await phaseIs(host, "dilemma_presenting");
  await act(host, "open_voting");
  for (const [i, p] of players.entries()) await vote(p, i + k);
  await expect(host.getByTestId("host-submitted")).toHaveText("Everyone has voted");
  await act(host, "close_voting");
  await phaseIs(host, "results");
  const unanimous = host.getByTestId("host-confirm_unanimous");
  if (await unanimous.isVisible()) await unanimous.click();
  else {
    await act(host, "start_discussion");
    await act(host, "open_final_vote");
    for (const p of players) await finalVote(p, 0);
    await act(host, "close_final_vote");
  }
  await phaseIs(host, "consequence");
}

export async function toFirstDilemma(host: Page, players: Page[]) {
  await act(host, "start");
  for (const [i, p] of players.entries()) await selectTitle(p, ["The Hobbit", "Interstellar", "The Hunger Games"][i % 3]!);
  await act(host, "continue_selection");
  await phaseIs(host, "universe_reveal");
  await act(host, "begin_story");
  await phaseIs(host, "dilemma_presenting");
}

export async function noSidewaysScroll(page: Page) {
  const extra = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(extra).toBeLessThanOrEqual(1);
}
