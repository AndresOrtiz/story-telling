import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { act, createRoom, joinRoom, LAPTOP, open, phaseIs, PHONE, playDilemma, selectTitle } from "./helpers";

async function audit(page: Page, where: string) {
  // Let entrance animations finish, so contrast is measured on the final colors.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.waitForTimeout(300);
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"]).analyze();
  const found = violations.map((v) => `${where}: ${v.id} ${v.nodes.map((n) => n.target.join(" ")).join(" | ")}`);
  expect.soft(found).toEqual([]);
}

test("WCAG 2.2 AA checks on every phase", async ({ browser }) => {
  const home = await open(browser, LAPTOP, "/");
  await audit(home, "home");
  const { host, code } = await createRoom(browser, LAPTOP, async (h) => {
    await h.locator('input[name="dilemmas"]').fill("3");
    await h.locator('input[name="dilemmas"]').blur();
    await h.locator('input[name="predictions"]').check();
  });
  const stage = await open(browser, LAPTOP, (await host.getByTestId("stage-link").first().getAttribute("href"))!);
  const join = await open(browser, PHONE, `/j/${code}`);
  await expect(join.getByRole("button", { name: "Join" })).toBeVisible();
  await audit(join, "join");
  const players = [await joinRoom(browser, PHONE, code, "Ana"), await joinRoom(browser, PHONE, code, "Leo")];
  const all = async (where: string) => {
    for (const [role, page] of Object.entries({ host, stage, player: players[0]! })) await audit(page, `${where}/${role}`);
  };
  await all("lobby");
  await act(host, "start");
  await players[0]!.locator('input[name="search"]').fill("The Hobbit");
  await expect(players[0]!.getByRole("list", { name: "Results" }).getByRole("button").first()).toBeVisible();
  await all("selection");
  for (const p of players) await selectTitle(p, "The Hobbit");
  await act(host, "continue_selection");
  await phaseIs(host, "universe_reveal");
  await all("universe");
  await act(host, "begin_story");
  await phaseIs(host, "dilemma_presenting");
  await all("dilemma");
  await act(host, "open_voting");
  await expect(players[0]!.getByRole("button", { name: "Send my vote" })).toBeVisible();
  await all("voting");
  await act(host, "close_voting");
  await phaseIs(host, "results");
  await all("results");
  await act(host, "start_discussion");
  await all("discussion");
  await act(host, "open_final_vote");
  await all("final vote");
  await act(host, "close_final_vote");
  // Nobody voted: a tie, a second vote, and then fate decides.
  await expect(stage.getByText("It's a tie. Vote again")).toBeVisible();
  await act(host, "close_final_vote");
  await phaseIs(host, "consequence");
  await expect(stage.getByText("You were tied, so fate decided")).toBeVisible();
  await all("consequence");
  for (let k = 2; k <= 3; k++) {
    await act(host, "next");
    await playDilemma(host, players, k);
  }
  await act(host, "next");
  await phaseIs(host, "analysis_reveal");
  await all("analysis");
  await act(host, "show_story");
  await phaseIs(host, "story_playback");
  await all("story");
});

test("voting works with the keyboard alone", async ({ browser }) => {
  const { host, code } = await createRoom(browser);
  const players = [await joinRoom(browser, LAPTOP, code, "Ana"), await joinRoom(browser, LAPTOP, code, "Leo")];
  await act(host, "start");
  for (const p of players) await selectTitle(p, "Up");
  await act(host, "continue_selection");
  await phaseIs(host, "universe_reveal");
  await act(host, "begin_story");
  await phaseIs(host, "dilemma_presenting");
  await act(host, "open_voting");
  const page = players[0]!;
  await page.locator('input[name="option"]').first().focus();
  await page.keyboard.press("ArrowDown");
  await expect(page.locator('input[name="option"]').nth(1)).toBeChecked();
  await page.keyboard.press("Enter");
  await expect(page.getByTestId("voted")).toBeVisible();
});

test("the interface follows the browser language", async ({ browser }) => {
  for (const [locale, text] of [
    ["es-MX", "Crear una sala"],
    ["pt-BR", "Criar uma sala"],
    ["fr-FR", "Créer une salle"],
    ["de-DE", "Raum erstellen"],
  ] as const) {
    const context = await browser.newContext({ locale });
    const page = await context.newPage();
    await page.goto("/");
    await expect(page.getByRole("button", { name: text })).toBeVisible();
    await context.close();
  }
});
