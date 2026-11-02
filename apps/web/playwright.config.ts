import { defineConfig, devices } from "@playwright/test";

const PORT = 3100;
export const E2E_DATABASE_URL = "postgres://estrada:estrada@localhost:5432/estrada_e2e";

/**
 * End-to-end journeys against a throwaway database (estrada_e2e, reset on every run) and a dev server
 * of its own on :3100, so they never touch your local data or the server you work in.
 * Needs Postgres running: docker compose up -d db
 */
export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["github"], ["html", { open: "never" }]] : [["list"], ["html", { open: "never" }]],
  globalSetup: "./e2e/global-setup.ts",
  // The dev server compiles each page on its first visit.
  timeout: 60_000,
  expect: { timeout: 20_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "id-ID",
    timezoneId: "Asia/Jakarta",
    trace: "retain-on-failure",
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "journeys", testMatch: /\.spec\.ts/, dependencies: ["setup"], use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    command: `next dev --port ${PORT}`,
    url: `http://localhost:${PORT}/login`,
    // A fresh server each run also resets the in-memory login rate limit.
    reuseExistingServer: false,
    timeout: 120_000,
    env: { DATABASE_URL: E2E_DATABASE_URL, NEXT_DIST_DIR: ".next-e2e", APP_URL: `http://localhost:${PORT}`, RKA_LOCK_ROLE: "finance" },
  },
});
