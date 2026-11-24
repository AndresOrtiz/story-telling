import { expect, test } from "@playwright/test";
import { act, createRoom, DEVICES, joinRoom, LAPTOP, noSidewaysScroll, open, phaseIs, PHONE, playDilemma, toFirstDilemma, vote } from "./helpers";

test("10 players on mixed devices join, stay in sync and survive a refresh", async ({ browser }) => {
  const { host, code } = await createRoom(browser);
  const stage = await open(browser, LAPTOP, (await host.getByTestId("stage-link").first().getAttribute("href"))!);
  await expect(stage.getByTestId("room-code")).toContainText(`${code.slice(0, 3)}-${code.slice(3)}`);
  const players = [];
  for (let i = 0; i < 10; i++) players.push(await joinRoom(browser, DEVICES[i % 3]!, code, `Player ${i + 1}`));
  await expect(stage.getByText("10 of 10 players")).toBeVisible();

  const extra = await open(browser, PHONE, `/j/${code}`);
  await extra.locator('input[name="nickname"]').fill("Late");
  await extra.getByRole("button", { name: "Join" }).click();
  await expect(extra.getByText("This room is full.")).toBeVisible();

  await players[0]!.reload();
  await expect(players[0]!.getByText("You're in, Player 1")).toBeVisible();
  await host.reload();
  await phaseIs(host, "lobby");
  for (const p of [players[0]!, players[1]!, host, stage]) await noSidewaysScroll(p);

  await act(host, "start");
  for (const p of players) await expect(p.getByText("Choose 1 to 3 books, films or series")).toBeVisible();
});

test("a full session with stage, from lobby to story, PDF and public page", async ({ browser }) => {
  const { host, code } = await createRoom(browser, LAPTOP, async (h) => {
    await h.locator('input[name="dilemmas"]').fill("3");
    await h.locator('input[name="dilemmas"]').blur();
  });
  const stage = await open(browser, LAPTOP, (await host.getByTestId("stage-link").first().getAttribute("href"))!);
  const players = [await joinRoom(browser, PHONE, code, "Ana"), await joinRoom(browser, DEVICES[1]!, code, "Leo"), await joinRoom(browser, LAPTOP, code, "Maya")];
  await act(host, "start");
  await expect(players[0]!.locator('input[name="search"]')).toBeVisible();
  const { selectTitle } = await import("./helpers");
  await selectTitle(players[0]!, "The Hobbit");
  await selectTitle(players[1]!, "Interstellar");
  await expect(stage.getByText("2 of 3 ready")).toBeVisible();
  await act(host, "continue_selection");
  await phaseIs(host, "universe_reveal");
  await expect(stage.getByTestId("rating-line")).toContainText("based on your selections");
  await expect(stage.getByTestId("rating-line")).toContainText("Rated Family");
  await act(host, "begin_story");
  await phaseIs(host, "dilemma_presenting");
  await expect(stage.getByRole("heading", { level: 1 })).toHaveText("The Sealed Gate");

  // Privacy while voting: the stage shows how many voted, never what.
  await act(host, "open_voting");
  await vote(players[0]!, 0);
  await expect(stage.getByTestId("submitted")).toHaveText("1 of 3 have decided");
  await expect(stage.getByText("1 vote")).toHaveCount(0);
  // A closed tab comes back to the same seat with its vote counted.
  const context = players[0]!.context();
  await players[0]!.close();
  players[0] = await context.newPage();
  await players[0]!.goto(`/play/${code}`);
  await expect(players[0]!.getByTestId("voted")).toBeVisible();
  // The host reminds a player who has not voted.
  await host.getByRole("button", { name: "Remind" }).first().click();
  await expect(players[1]!.getByText("The group is waiting for your vote.")).toBeVisible();
  await vote(players[1]!, 1);
  await vote(players[2]!, 1);
  await act(host, "close_voting");
  await expect(stage.getByText("2 votes · 67%")).toBeVisible();
  await act(host, "start_discussion");
  await act(host, "open_final_vote");
  const { finalVote } = await import("./helpers");
  for (const p of players) await finalVote(p, 0);
  await act(host, "close_final_vote");
  await phaseIs(host, "consequence");
  await expect(stage.getByTestId("decision")).toBeVisible();

  await act(host, "next");
  await playDilemma(host, players, 2);
  await act(host, "next");
  await playDilemma(host, players, 3);
  await act(host, "next");
  await phaseIs(host, "analysis_reveal");
  await expect(players[0]!.getByText("Show my profile to everyone")).toBeVisible();
  await expect(stage.getByRole("region", { name: "Ana" })).toHaveCount(0);
  await players[0]!.getByLabel("Show my profile to everyone").check();
  await expect(stage.getByRole("region", { name: "Ana" })).toBeVisible();
  const card = await players[0]!.request.get((await players[0]!.getByText("Open my profile card").getAttribute("href"))!);
  expect([card.status(), card.headers()["content-type"]]).toEqual([200, "image/png"]);

  await act(host, "show_story");
  await phaseIs(host, "story_playback");
  await expect(stage.getByText("Scene 1 of")).toBeVisible();
  await host.getByTestId("next-scene").click();
  await expect(stage.getByText("Scene 2 of")).toBeVisible();
  await expect(players[0]!.getByText("Scene 2 of")).toBeVisible();
  await host.locator("body").press("ArrowLeft");
  await expect(stage.getByText("Scene 1 of")).toBeVisible();

  const pdf = await host.request.get(`/api/session/${code}/pdf`, { timeout: 60_000 });
  expect(pdf.status()).toBe(200);
  expect((await pdf.body()).subarray(0, 5).toString()).toBe("%PDF-");
  expect((await players[0]!.request.get(`/api/session/${code}/pdf`)).status()).toBe(403);

  await host.getByLabel("Public page (unlisted)").check();
  const link = (await host.getByTestId("public-link").getAttribute("href"))!;
  const visitor = await open(browser, PHONE, link);
  await expect(visitor.getByTestId("credits")).toContainText("A story by Ana, Leo, Maya");
  await expect(visitor.getByText("Ana:")).toBeVisible();
  await noSidewaysScroll(visitor);
  await act(host, "finish");
  await phaseIs(host, "completed");
});

test("phones only, without a stage", async ({ browser }) => {
  const { host, code } = await createRoom(browser, PHONE, async (h) => {
    await h.locator('input[name="dilemmas"]').fill("3");
    await h.locator('input[name="dilemmas"]').blur();
  });
  const players = [await joinRoom(browser, PHONE, code, "Ana"), await joinRoom(browser, PHONE, code, "Leo")];
  await toFirstDilemma(host, players);
  await players[0]!.getByRole("tab", { name: "Story view" }).click();
  await expect(players[0]!.getByRole("heading", { level: 1 })).toHaveText("The Sealed Gate");
  await noSidewaysScroll(players[0]!);
  await players[0]!.getByRole("tab", { name: "Play" }).click();
  for (let k = 1; k <= 3; k++) {
    await playDilemma(host, players, k);
    await noSidewaysScroll(players[0]!);
    await noSidewaysScroll(host);
    await act(host, "next");
  }
  await phaseIs(host, "analysis_reveal");
  await act(host, "show_story");
  await expect(players[1]!.getByText("Scene 1 of")).toBeVisible();
});

test("write-in, pause, host who plays, late join and seat recovery", async ({ browser }) => {
  const { host, code } = await createRoom(browser, LAPTOP, async (h) => {
    await h.locator('select[name="lateJoin"]').selectOption("host");
    await h.locator('input[name="predictions"]').check();
  });
  const ana = await joinRoom(browser, PHONE, code, "Ana");
  await host.getByRole("tab", { name: "Play too" }).click();
  await host.locator('input[name="nickname"]').fill("Hosty");
  await host.getByRole("button", { name: "Join" }).click();
  await expect(host.getByText("You're in, Hosty")).toBeVisible();
  await host.getByRole("tab", { name: "Now" }).click();
  await act(host, "start");
  const { selectTitle } = await import("./helpers");
  await selectTitle(ana, "Up");
  await act(host, "continue_selection");
  await phaseIs(host, "universe_reveal");
  await act(host, "begin_story");
  await phaseIs(host, "dilemma_presenting");
  await act(host, "open_voting");

  await host.getByRole("button", { name: "Pause" }).click();
  await expect(ana.getByText("The host paused the story.")).toBeVisible();
  await act(host, "resume");
  await phaseIs(host, "voting");

  await vote(ana, 0);
  await ana.getByText("Propose another action").click();
  await ana.locator('input[name="writein"]').fill("Dig a tunnel under the wall");
  await ana.getByRole("button", { name: "Propose" }).click();
  await host.getByRole("button", { name: "Add to the final vote" }).click();
  await expect(ana.getByText("In the final vote").first()).toBeVisible();

  const late = await open(browser, PHONE, `/j/${code}`);
  await late.locator('input[name="nickname"]').fill("Zoe");
  await late.getByRole("button", { name: "Join" }).click();
  await expect(late.getByText("Waiting for the host to let you in")).toBeVisible();
  await host.getByRole("button", { name: "Let in" }).click();
  await vote(late, 0);

  await late.getByText("Menu").click();
  const seat = (await late.getByTestId("seat-code").textContent())!.trim();
  const tablet = await open(browser, DEVICES[1]!, `/play/${code}`);
  await tablet.getByText("I was already in this room").click();
  await tablet.getByLabel("Seat code").fill(seat);
  await tablet.getByRole("button", { name: "Take my seat" }).click();
  await expect(tablet.getByTestId("voted")).toBeVisible();

  await act(host, "close_voting");
  await act(host, "start_discussion");
  await act(host, "open_final_vote");
  await expect(ana.getByTestId("candidate-W1")).toContainText("Dig a tunnel under the wall");
});

test("strangers cannot read a session", async ({ browser, request }) => {
  const { code } = await createRoom(browser);
  expect((await request.get(`/api/session/${code}/snapshot`)).status()).toBe(401);
  const stranger = await open(browser, LAPTOP, `/host/${code}`);
  await expect(stranger.getByText("Only the host can open this page.")).toBeVisible();
  await stranger.goto(`/stage/${code}?t=wrong`);
  await expect(stranger.getByText("This stage link is not valid.")).toBeVisible();
  await stranger.goto("/play/ZZZZZZ");
  await expect(stranger.getByText("We can't find that room.")).toBeVisible();
  expect((await request.post("/api/inngest", { data: {} })).status()).toBe(404);
  expect((await request.get("/api/media/..%2F..%2F.env.local")).status()).toBe(404);
});
