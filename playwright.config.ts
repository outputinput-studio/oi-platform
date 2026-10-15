import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  reporter: "list",
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000" },
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : { command: "pnpm start", url: "http://127.0.0.1:3000/api/health", reuseExistingServer: true, timeout: 60_000 },
});
