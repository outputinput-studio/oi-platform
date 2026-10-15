import { test, expect, type Page } from "@playwright/test";

/**
 * The admin shell and the team page, in a real browser on a phone-sized
 * viewport: sign in, navigate, add a person, change their role, remove them.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 390, height: 760 } });

async function signInAsOwner(page: Page) {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  const code = await page.getByTestId("dev-code").textContent();
  await page.getByLabel("Code").fill(code!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Demo site" }).click();
  await expect(page).toHaveURL(admin + "/");
}

test("the shell has navigation and shows the site", async ({ page }) => {
  await signInAsOwner(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav).toBeVisible();
  await expect(nav.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Settings" })).toBeVisible();
  await expect(page.getByTestId("site-name")).toHaveText("Demo site");
});

test("team: add, change role, remove", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Team" }).click();
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByText("owner@example.com")).toBeVisible();

  // Add
  await page.getByLabel("Email").fill("newstaff@example.com");
  await page.getByRole("button", { name: "Add to team" }).click();
  const row = page.getByTestId("member-newstaff@example.com");
  await expect(row).toBeVisible();
  await expect(row).toContainText("staff");

  // Promote
  await row.getByRole("button", { name: "Make owner" }).click();
  await expect(row).toContainText("owner");

  // Demote back and remove
  await row.getByRole("button", { name: "Make staff" }).click();
  await expect(row).toContainText("staff");
  await row.getByRole("button", { name: "Remove" }).click();
  await expect(row).toHaveCount(0);
});

test("the last owner cannot remove themselves", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/team");
  const me = page.getByTestId("member-owner@example.com");
  await expect(me.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(me.getByText("You")).toBeVisible();
});

test("settings: rename the site", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/settings");
  const name = page.getByLabel("Site name");
  await name.fill("Demo site (renamed)");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(page.getByTestId("site-name")).toHaveText("Demo site (renamed)");
  // Put it back so other tests keep their footing.
  await name.fill("Demo site");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
