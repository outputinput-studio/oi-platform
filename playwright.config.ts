import { defineConfig } from "@playwright/test";
import { OWNER_STATE } from "./tests/e2e/state";

const ci = !!process.env.CI;

/**
 * Owners sign in with the emailed code and then their authenticator app
 * (Stage 38). A code from the app works once, so the owner signs in once,
 * in the "setup" project (tests/e2e/auth.setup.ts), and every other test
 * starts from that saved session. Tests about signing in itself start
 * signed out (`test.use({ storageState: SIGNED_OUT })`).
 */
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
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    { name: "e2e", dependencies: ["setup"], use: { storageState: OWNER_STATE } },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: "http://127.0.0.1:3000/api/health", reuseExistingServer: true, timeout: 60_000 },
});
