import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";
import { invite, join } from "./invite";

/**
 * The admin shell and the team page, in a real browser on a phone-sized
 * viewport: sign in, navigate, add a person, change their role, remove them,
 * and what Staff get to see.
 */
const admin = (process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000").replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 390, height: 760 } });

async function signInAsOwner(page: Page) {
  // Already signed in: the setup project did the emailed code and the app (auth.setup.ts).
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await expect(page).toHaveURL(admin + "/");
}

test("the shell has navigation and shows the site", async ({ page }) => {
  await signInAsOwner(page);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Products" })).toBeVisible();
  // On a phone, Content, Images, Team and Settings sit behind More, which opens a sheet.
  await nav.getByRole("button", { name: "More" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByRole("link", { name: "Content" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Images" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Team" })).toBeVisible();
  await expect(sheet.getByRole("link", { name: "Settings" })).toBeVisible();
  await sheet.getByRole("button", { name: "Close" }).click();
  await expect(page.getByTestId("site-name")).toHaveText("Demo site");
});

test("team: invite, join from the link, change role, remove", async ({ page, browser }) => {
  await signInAsOwner(page);
  await goTo(page, "Team");
  await expect(page).toHaveURL(/\/team$/);
  await expect(page.getByTestId("roles-intro")).toContainText("a Manager runs the shop and the site");
  const me = page.getByTestId("member-owner@example.com");
  await expect(me).toContainText("Owner");
  await expect(me).toContainText(/Signed in (just now|\d+ min ago)/);

  // Invite (a sheet from the header): Staff unless chosen otherwise. Not on the team until they join.
  const link = await invite(page, "newstaff@example.com");
  const pending = page.getByTestId("invite-newstaff@example.com").first();
  await expect(pending).toContainText("Not opened yet");
  await expect(pending.getByTestId("invite-role")).toHaveText("Staff");
  await expect(page.getByTestId("member-newstaff@example.com")).toHaveCount(0);
  // Change the role before they've joined.
  await pending.getByRole("button", { name: "Change role" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /^Manager/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(pending.getByTestId("invite-role")).toHaveText("Manager");

  // They open the link, join, and sign in.
  const them = await join(browser, link);
  await them.getByRole("button", { name: "Demo site" }).click();
  await expect(them).toHaveURL(admin + "/");
  await page.reload();
  await expect(page.getByTestId("invite-newstaff@example.com").first()).toContainText("Accepted");
  const row = page.getByTestId("member-newstaff@example.com");
  await expect(row.getByTestId("member-role")).toHaveText("Manager");
  await expect(row).toContainText(/Signed in (just now|\d+ min ago)/);

  // Change role: a sheet with the three roles and what each can do.
  await row.getByRole("button", { name: "Change role" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Runs the shop and the site")).toBeVisible();
  await sheet.getByRole("radio", { name: /^Staff/ }).check();
  await sheet.getByRole("button", { name: "Save" }).click();
  await expect(row.getByTestId("member-role")).toHaveText("Staff");

  await row.getByRole("button", { name: "Change role" }).click();
  await page.getByRole("dialog").getByRole("radio", { name: /^Staff/ }).check();
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(row.getByTestId("member-role")).toHaveText("Staff");
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove them" }).click();
  await expect(row).toHaveCount(0);
});

test("staff see orders, the inbox and contacts, and nothing else", async ({ page, browser }) => {
  await signInAsOwner(page);
  const staff = await join(browser, await invite(page, "counter@example.com"), { width: 390, height: 760 });
  await staff.getByRole("button", { name: "Demo site" }).click();
  await expect(staff).toHaveURL(admin + "/");
  await expect(staff.getByTestId("role")).toHaveText("staff");
  await expect(staff.getByTestId("stat-orders")).toBeVisible();

  const nav = staff.getByRole("navigation", { name: "Main" });
  await expect(nav.getByRole("link", { name: "Orders" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Inbox" })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Products" })).toHaveCount(0);
  await nav.getByRole("button", { name: "More" }).click();
  const more = staff.getByRole("dialog");
  await expect(more.getByRole("link", { name: "Contacts" })).toBeVisible();
  for (const name of ["Content", "Images", "Team", "Activity", "Settings"]) await expect(more.getByRole("link", { name, exact: true })).toHaveCount(0);
  await more.getByRole("button", { name: "Close" }).click();

  // A screen that isn't theirs goes Home; the inbox and contacts open.
  await staff.goto(admin + "/products");
  await expect(staff).toHaveURL(admin + "/");
  await staff.goto(admin + "/settings/shop");
  await expect(staff).toHaveURL(admin + "/");
  await staff.goto(admin + "/inbox");
  await expect(staff.getByRole("heading", { name: "Inbox" })).toBeVisible();
  await staff.goto(admin + "/contacts");
  await expect(staff.getByRole("heading", { name: "Contacts" })).toBeVisible();

  await page.reload();
  const row = page.getByTestId("member-counter@example.com");
  await expect(row).toContainText(/Signed in (just now|\d+ min ago)/);
  await row.getByRole("button", { name: "Remove" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Remove them" }).click();
  await expect(row).toHaveCount(0);
});

test("the last owner cannot remove themselves", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/team");
  const me = page.getByTestId("member-owner@example.com");
  await expect(me.getByRole("button", { name: "Remove" })).toHaveCount(0);
  await expect(me.getByRole("button", { name: "Change role" })).toHaveCount(0);
  await expect(me.getByText("You", { exact: true })).toBeVisible();
  await expect(me).toContainText("Every site needs an Owner. Make someone else an Owner first.");
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

test("a cancelled invitation's link says so", async ({ page }) => {
  await signInAsOwner(page);
  const link = await invite(page, "cancelme@example.com", "Manager");
  const row = page.getByTestId("invite-cancelme@example.com").first();
  await row.getByRole("button", { name: "Cancel" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Cancel it" }).click();
  await expect(page.getByTestId("invite-cancelme@example.com")).toHaveCount(0);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This invitation was cancelled" })).toBeVisible();
});
