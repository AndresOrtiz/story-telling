import { expect, test } from "@playwright/test";
import { createRoom, joinRoom, PHONE } from "./helpers";

test("the host sees a new player within two seconds", async ({ browser }) => {
  const { host, code } = await createRoom(browser, PHONE);
  for (const name of ["Ana", "Leo", "Maya"]) {
    await joinRoom(browser, PHONE, code, name);
    const start = Date.now();
    await expect(host.getByText(name).filter({ visible: true }).first()).toBeVisible();
    expect(Date.now() - start).toBeLessThan(2000);
  }
});
