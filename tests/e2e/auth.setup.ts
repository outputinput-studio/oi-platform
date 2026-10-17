import { test as setup, expect } from "@playwright/test";
import { base32Decode, hotp } from "../../src/modules/auth/totp";
import { OWNER_STATE } from "./state";
import { appCode, currentStep, hasKey, rememberKey } from "./app-code";

/**
 * Signs the demo owner in once for every other test: the emailed code,
 * then the authenticator app. On a fresh database (CI) the owner hasn't
 * set the app up yet, so this does what an owner does the first time:
 * Owners land on the setup screen, scan the code (here: read the key),
 * type the six digits, keep the recovery codes.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");
const OWNER = "owner@example.com";

setup("the owner signs in, app code and all", async ({ page }) => {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill(OWNER);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill((await page.getByTestId("dev-code").textContent())!);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Redirects pass through /sites on the way, so wait for a screen, not an address.
  const appStep = page.getByRole("heading", { name: "One more code" });
  await appStep.or(page.getByRole("heading", { name: "Your sites" })).waitFor();
  if (await appStep.isVisible()) {
    expect(hasKey(OWNER), "the app is on but its key wasn't kept: clear two_factors in the test database").toBe(true);
    await page.getByLabel("Code from your app").fill(await appCode(OWNER));
    await page.getByRole("button", { name: "Sign in" }).click();
    await expect(page).toHaveURL(/\/sites$/);
  }

  await page.getByRole("button", { name: "Demo site" }).click();
  const setUp = page.getByRole("heading", { name: "Owners use an authenticator app" });
  await setUp.or(page.getByTestId("role")).waitFor();
  if (await setUp.isVisible()) {
    await expect(page.getByTestId("two-factor-qr")).toBeVisible();
    const key = (await page.getByTestId("two-factor-key").textContent())!.replace(/\s/g, "");
    const step = currentStep();
    await page.getByLabel("Code from your app").fill(hotp(base32Decode(key), step));
    await page.getByRole("button", { name: "Turn it on" }).click();
    await expect(page.getByTestId("recovery-code")).toHaveCount(10);
    rememberKey(OWNER, key, step);
    await page.getByRole("link", { name: "I've saved them" }).click();
  }
  await expect(page).toHaveURL(admin + "/");
  await expect(page.getByTestId("role")).toHaveText("owner");
  await page.context().storageState({ path: OWNER_STATE });
});
