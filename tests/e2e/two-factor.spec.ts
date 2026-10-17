import { test, expect, type Browser, type Page } from "@playwright/test";
import { base32Decode, hotp } from "../../src/modules/auth/totp";
import { currentStep } from "./app-code";
import { SIGNED_OUT } from "./state";

/**
 * The authenticator app for someone who isn't an Owner (Owners are made to
 * set it up: the setup project does that for the demo owner). A Manager
 * turns it on from Your account, keeps the recovery codes, signs in on a
 * second device with one, signs that device out from the first, and an
 * Owner resets it for them when the phone is lost.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");
const WHO = "twofa@example.com";

test.use({ viewport: { width: 1200, height: 900 } });

/** A fresh browser, signed in with the emailed code only. */
async function emailSignIn(browser: Browser): Promise<Page> {
  const p = await (await browser.newContext({ viewport: { width: 1200, height: 900 }, storageState: SIGNED_OUT })).newPage();
  await p.goto(admin + "/sign-in");
  await p.getByLabel("Email").fill(WHO);
  await p.getByRole("button", { name: "Send code" }).click();
  await p.getByLabel("Code").fill((await p.getByTestId("dev-code").textContent())!);
  await p.getByRole("button", { name: "Sign in" }).click();
  return p;
}

test("a manager turns it on, signs in elsewhere with a recovery code, and an owner resets it", async ({ page, browser }) => {
  // The owner adds them as a Manager.
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await page.goto(admin + "/team");
  await page.getByRole("button", { name: "Add someone" }).click();
  await page.getByLabel("Email").fill(WHO);
  await page.getByRole("dialog").getByRole("radio", { name: /^Manager/ }).check();
  await page.getByRole("button", { name: "Add to team" }).click();
  const row = page.getByTestId(`member-${WHO}`);
  await expect(row).toBeVisible();
  await expect(row.getByTestId("member-two-factor")).toHaveCount(0);

  // Managers aren't made to: straight in.
  const laptop = await emailSignIn(browser);
  await laptop.getByRole("button", { name: "Demo site" }).click();
  await expect(laptop).toHaveURL(admin + "/");

  // Your account → Set it up.
  await laptop.goto(admin + "/account");
  const card = laptop.getByTestId("two-factor-card");
  await expect(card).toContainText("Off");
  await card.getByRole("link", { name: "Set it up" }).click();
  await expect(laptop).toHaveURL(/\/two-factor\?next=\/account$/);
  await expect(laptop.getByRole("heading", { name: "Set up your authenticator app" })).toBeVisible();
  const key = (await laptop.getByTestId("two-factor-key").textContent())!.replace(/\s/g, "");
  await laptop.getByLabel("Code from your app").fill("123456" === hotp(base32Decode(key), currentStep()) ? "654321" : "123456");
  await laptop.getByRole("button", { name: "Turn it on" }).click();
  await expect(laptop.getByText(/That code didn't work/)).toBeVisible();
  await laptop.getByLabel("Code from your app").fill(hotp(base32Decode(key), currentStep()));
  await laptop.getByRole("button", { name: "Turn it on" }).click();
  await expect(laptop.getByTestId("two-factor-on")).toBeVisible();
  const codes = await laptop.getByTestId("recovery-code").allTextContents();
  expect(codes).toHaveLength(10);
  await laptop.getByRole("link", { name: "I've saved them" }).click();
  await expect(laptop).toHaveURL(admin + "/account");
  await expect(card).toContainText("On");
  await expect(laptop.getByTestId("recovery-left")).toHaveText("10 recovery codes left");

  // A second device: the emailed code, then a recovery code instead of the app.
  const phone = await emailSignIn(browser);
  await expect(phone).toHaveURL(/\/sign-in\/app$/);
  await phone.getByRole("button", { name: "Use a recovery code instead" }).click();
  await phone.getByLabel("Recovery code").fill(codes[0].toUpperCase());
  await phone.getByRole("button", { name: "Sign in" }).click();
  await phone.getByRole("button", { name: "Demo site" }).click();
  await expect(phone).toHaveURL(admin + "/");

  // Where you're signed in: both; sign out everywhere else.
  await laptop.reload();
  await expect(laptop.getByTestId("recovery-left")).toHaveText("9 recovery codes left");
  await expect(laptop.getByTestId("session")).toHaveCount(2);
  await expect(laptop.getByTestId("session").first()).toContainText("This device, right now");
  await laptop.getByRole("button", { name: "Sign out everywhere else" }).click();
  await expect(laptop.getByTestId("session")).toHaveCount(1);
  await phone.reload();
  await expect(phone).toHaveURL(/\/sign-in$/);

  // Lost phone: the owner resets it, and they're signed out everywhere.
  await page.reload();
  await expect(row.getByTestId("member-two-factor")).toBeVisible();
  await row.getByRole("button", { name: "Reset two-factor" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Reset it" }).click();
  await expect(row.getByTestId("member-two-factor")).toHaveCount(0);
  await laptop.reload();
  await expect(laptop).toHaveURL(/\/sign-in$/);

  // Tidy up.
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove them" }).click();
  await expect(row).toHaveCount(0);
});

test("Better Auth's own endpoints are closed, except the few a browser needs", async ({ request }) => {
  const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
  const h = { host: "admin.localhost" };
  expect((await request.post(base + "/api/auth/update-user", { headers: h, data: { name: "x" } })).status()).toBe(404);
  expect((await request.get(base + "/api/auth/list-sessions", { headers: h })).status()).toBe(404);
  expect((await request.post(base + "/api/auth/revoke-other-sessions", { headers: h, data: {} })).status()).toBe(404);
  expect((await request.post(base + "/api/auth/sign-in/email-otp", { headers: h, data: { email: "owner@example.com", otp: "000000" } })).status()).toBe(404);
  expect((await request.get(base + "/api/auth/get-session", { headers: h })).status()).toBe(200);
});
