import { test, expect } from "@playwright/test";

/**
 * Sign-in with an emailed code, end to end, against the built app.
 *
 * Outside production, when no email provider is configured, the sign-in
 * page shows the code it would have emailed (data-testid="dev-code"). That
 * is what makes this testable in CI and usable on a fresh staging.
 *
 * Chromium resolves *.localhost to 127.0.0.1, so admin.localhost:3000 goes
 * through the real hostname routing in proxy.ts.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");
const seededOwner = "owner@example.com"; // created by scripts/seed.ts, member of both demo sites

test("the admin asks you to sign in", async ({ page }) => {
  await page.goto(admin + "/");
  await expect(page).toHaveURL(/\/sign-in$/);
  await expect(page.getByRole("heading", { name: "Sign in" })).toBeVisible();
});

test("an email nobody has invited gets no code, and no hint that it is unknown", async ({ page }) => {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("stranger@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  // Same screen as a known email, so the form can't be used to probe addresses…
  await expect(page.getByLabel("Code")).toBeVisible();
  await expect(page.getByText("Ask the site owner to add you")).toBeVisible();
  // …but no code was created, so nothing to reveal.
  await expect(page.getByTestId("dev-code")).toHaveCount(0);
});

test("a wrong code is refused", async ({ page }) => {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill(seededOwner);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill("000000");
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That code didn't work")).toBeVisible();
});

test("email → code → pick a site → signed in → sign out", async ({ page }) => {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill(seededOwner);
  await page.getByRole("button", { name: "Send code" }).click();

  const code = await page.getByTestId("dev-code").textContent();
  expect(code).toMatch(/^\d{6}$/);
  await page.getByLabel("Code").fill(code!);
  await page.getByRole("button", { name: "Sign in" }).click();

  // Two memberships, so the picker shows.
  await expect(page).toHaveURL(/\/sites$/);
  await page.getByRole("button", { name: "Demo site" }).click();

  await expect(page).toHaveURL(admin + "/");
  await expect(page.getByTestId("site-name")).toHaveText("Demo site");
  await expect(page.getByTestId("role")).toHaveText("owner");

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/sign-in$/);

  // The session is gone: the home page bounces again.
  await page.goto(admin + "/");
  await expect(page).toHaveURL(/\/sign-in$/);
});
