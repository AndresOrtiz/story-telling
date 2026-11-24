import { expect, test, type Page } from "@playwright/test";
import { act, createRoom, joinRoom, LAPTOP, noSidewaysScroll, open, phaseIs, PHONE, playDilemma, TABLET, toFirstDilemma } from "./helpers";

/** Set SHOTS to a folder to keep screenshots. */
const shot = async (page: Page, name: string) => {
  if (process.env.SHOTS) await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
};

// Runs in Chromium, Firefox and WebKit: every role on every device class.
for (const [device, options] of Object.entries({ phone: PHONE, tablet: TABLET, laptop: LAPTOP })) {
  test(`every role works on a ${device}`, async ({ browser, browserName }) => {
    const { host, code } = await createRoom(browser, options, async (h) => {
      await h.locator('input[name="spectators"]').check();
      await h.locator('input[name="dilemmas"]').fill("3");
      await h.locator('input[name="dilemmas"]').blur();
    });
    const href = (await host.getByTestId("stage-link").filter({ visible: true }).first().getAttribute("href"))!;
    const stage = await open(browser, options, href);
    const players = [await joinRoom(browser, options, code, "Ana"), await joinRoom(browser, options, code, "Leo")];
    const watcher = await open(browser, options, `/watch/${code}`);
    await watcher.locator('input[name="nickname"]').fill("Sam");
    await watcher.getByRole("button", { name: "Join" }).click();
    await expect(watcher.getByTestId("room-code")).toBeVisible();
    const all = { host, stage, player: players[0]!, watcher };
    const check = async (step: string) => {
      for (const [role, page] of Object.entries(all)) {
        await noSidewaysScroll(page);
        await shot(page, `${browserName}-${device}-${step}-${role}`);
      }
    };
    await check("lobby");
    await toFirstDilemma(host, players);
    await check("dilemma");
    await playDilemma(host, players, 1);
    await expect(watcher.getByTestId("decision")).toBeVisible();
    await check("consequence");
    for (let k = 2; k <= 3; k++) {
      await act(host, "next");
      await playDilemma(host, players, k);
    }
    await act(host, "next");
    await phaseIs(host, "analysis_reveal");
    await expect(players[0]!.getByText("Show my profile to everyone")).toBeVisible();
    await check("analysis");
    await act(host, "show_story");
    await expect(watcher.getByText("Scene 1 of")).toBeVisible();
    await check("story");
    if (device !== "laptop") {
      const size = players[0]!.viewportSize()!;
      await players[0]!.setViewportSize({ width: size.height, height: size.width });
      await noSidewaysScroll(players[0]!);
    }
  });
}

test("an outdated browser gets a clear page", async ({ browser }) => {
  const page = await browser.newPage();
  await page.addInitScript(() => {
    // @ts-expect-error simulating an old browser
    delete window.structuredClone;
  });
  await page.goto("/");
  await expect(page.getByText("Please update your browser")).toBeVisible();
});
