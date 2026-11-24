import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
/** Everything fake: the run must work without any credential or network service. */
const env = {
  DATABASE_URL: "postgresql://FAKE",
  PGLITE_DIR: join(tmpdir(), `cs-e2e-${Date.now()}`),
  ANTHROPIC_API_KEY: "sk-ant-FAKE",
  GEMINI_API_KEY: "FAKE",
  TMDB_API_KEY: "FAKE",
  GOOGLE_BOOKS_API_KEY: "FAKE",
  INNGEST_EVENT_KEY: "FAKE",
  INNGEST_SIGNING_KEY: "FAKE",
  INNGEST_DEV: "",
  SUPABASE_SECRET_KEY: "FAKE",
  COOKIE_SECRET: "FAKE-e2e",
  STORY_MODE: "auto",
  OFFLINE_SEARCH: "1",
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", locale: "en-US", actionTimeout: 20_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] } },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /browsers\.spec/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /browsers\.spec/ },
  ],
  webServer: { command: `pnpm exec next start -p ${port}`, url: `http://localhost:${port}`, env, timeout: 120_000, stdout: "pipe" },
});
