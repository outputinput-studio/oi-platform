import { defineConfig } from "@playwright/test";

const ci = !!process.env.CI;

export default defineConfig({
  testDir: "tests/e2e",
  // In CI the github reporter turns failures into check annotations, which are readable without the log.
  reporter: ci ? [["list"], ["github"]] : "list",
  // Tests share one database and one server; one worker in CI keeps them from treading on each other.
  workers: ci ? 1 : undefined,
  use: {
    baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000",
    // Point at an existing Chromium instead of downloading one (sandboxes, CI caches).
    launchOptions: process.env.E2E_CHROMIUM ? { executablePath: process.env.E2E_CHROMIUM } : undefined,
  },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: "http://127.0.0.1:3000/api/health", reuseExistingServer: true, timeout: 60_000 },
});
