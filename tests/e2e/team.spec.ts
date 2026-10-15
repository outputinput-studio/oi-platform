import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

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
  await expect(nav.getByRole("link", { name: "Content" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Images" })).toBeVisible();
  // On a phone, Team and Settings sit behind More, which opens a sheet.
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("site-name")).toHaveText("Demo site");
});

test("team: add, change role, remove", async ({ page }) => {
  await signInAsOwner(page);
  await goTo(page, "Team");
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByText("owner@example.com")).toBeVisible();

  // Add (a sheet from the header)
  await page.getByRole("button", { name: "Add someone" }).click();
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
  await page.goto(admin + "/settings/site");
  const name = page.getByLabel("Site name");
  const save = page.getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled(); // nothing changed yet
  await name.fill("Demo site (renamed)");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Saved")).toBeVisible();
  await expect(save).toBeDisabled(); // saved: nothing to save until the next change
  // The new name shows on Home.
  await goTo(page, "Home");
  await expect(page.getByTestId("site-name")).toHaveText("Demo site (renamed)");
  // Put it back so other tests keep their footing.
  await page.goto(admin + "/settings/site");
  await name.fill("Demo site");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
