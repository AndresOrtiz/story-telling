import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const port = 3100;
/** A second server that asks hosts to log in. */
const loginPort = 3101;
export const HOST_PASSWORD = "e2e-host-password";
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
  HOST_PASSWORD: "",
  STORY_MODE: "auto",
  OFFLINE_SEARCH: "1",
};

const server = (p: number, extra: Record<string, string> = {}) => ({
  command: `pnpm exec next start -p ${p}`,
  url: `http://localhost:${p}`,
  env: { ...env, ...extra },
  timeout: 120_000,
  stdout: "pipe" as const,
});

export default defineConfig({
  testDir: "./e2e",
  timeout: 240_000,
  expect: { timeout: 20_000 },
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: `http://localhost:${port}`, trace: "retain-on-failure", locale: "en-US", actionTimeout: 20_000 },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"] }, testIgnore: /login.spec/ },
    { name: "login", use: { ...devices["Desktop Chrome"], baseURL: `http://localhost:${loginPort}` }, testMatch: /login.spec/ },
    { name: "firefox", use: { ...devices["Desktop Firefox"] }, testMatch: /browsers\.spec/ },
    { name: "webkit", use: { ...devices["Desktop Safari"] }, testMatch: /browsers\.spec/ },
  ],
  webServer: [server(port), server(loginPort, { HOST_PASSWORD, PGLITE_DIR: `${env.PGLITE_DIR}-login` })],
});
