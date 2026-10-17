import { test, expect } from "@playwright/test";

/**
 * First run and Get help (Stage 41, design/admin.html): the welcome card on
 * Home, Show me around, gone for good once it's done; Get help knows which
 * screen they came from and points at a mistake.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 1280, height: 900 } });

test("welcome: Show me around, Got it, and it's gone for good", async ({ page }) => {
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  const card = page.getByTestId("welcome");
  await expect(card).toContainText(/Welcome, \w+\./);
  await card.getByRole("button", { name: "Show me around" }).click();
  const sheet = page.getByRole("dialog", { name: "Four things and you're set" });
  await expect(sheet.getByTestId("tour-step")).toHaveCount(4);
  await expect(sheet.getByRole("link", { name: "Get help" })).toBeVisible();
  await sheet.getByRole("button", { name: "Got it" }).click();
  await expect(card).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("site-name")).toBeVisible();
  await expect(page.getByTestId("welcome")).toHaveCount(0);
  // The owner has the app already, so nobody asks about it.
  await expect(page.getByTestId("secure-nudge")).toHaveCount(0);
});

test("Get help: sent with the screen they were on; a mistake points at its box", async ({ page }) => {
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await page.goto(admin + "/orders");
  await page.getByTestId("sidebar").getByRole("link", { name: "Get help" }).click();
  await expect(page.getByRole("heading", { name: "Ask us" })).toBeVisible();
  await expect(page.getByText("Sent with your message")).toBeVisible();
  await expect(page.getByText(/the Orders screen/)).toBeVisible();

  await page.getByLabel("Your message").fill("Where do I change the order email?");
  await page.getByRole("button", { name: "Send it" }).click();
  await expect(page.getByText("Pick what it's about.")).toBeVisible();
  await expect(page.getByLabel("Your message")).toHaveValue("Where do I change the order email?"); // still there

  await page.getByText("A question", { exact: true }).click();
  await page.getByRole("button", { name: "Send it" }).click();
  await expect(page.getByTestId("help-sent")).toContainText("We've got it");
});
