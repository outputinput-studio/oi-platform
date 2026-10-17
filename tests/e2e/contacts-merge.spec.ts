import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * Merge contacts and Activity (design/admin.html), on the seeded
 * output/input site so the demo site's contact counts are left alone:
 * two people sharing a phone number are spotted, merged keeping what's
 * picked, and the merge shows in Activity; a same-name pair can be told
 * apart instead.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 390, height: 760 } });

async function signIn(page: Page) {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill((await page.getByTestId("dev-code").textContent())!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "output/input" }).click();
  await expect(page).toHaveURL(admin + "/");
}

async function add(page: Page, name: string, email: string, phone: string) {
  await page.goto(admin + "/contacts");
  await page.getByRole("button", { name: "Add someone" }).click();
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Phone").fill(phone);
  await page.getByRole("button", { name: "Add contact" }).click();
  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
}

test("the same phone twice: spotted, merged keeping what's picked, and it's in Activity", async ({
  page,
}) => {
  await signIn(page);
  await add(page, "Amelia Frost", "amelia.frost@gmail.com", "0425 779 122");
  await add(page, "A. Frost", "a.frost@work.com.au", "+61 425 779 122");

  await page.goto(admin + "/contacts");
  await expect(page.getByTestId("duplicates-banner")).toContainText("1 possible duplicate");
  await page.getByTestId("duplicates-banner").click();
  const merge = page.getByTestId("merge");
  await expect(merge).toContainText("These two share a phone number.");
  // The phone is the same number written two ways, so it isn't asked about.
  await expect(page.getByRole("radiogroup")).toHaveCount(2);
  await page
    .getByRole("radiogroup", { name: "Name" })
    .getByRole("radio", { name: "Amelia Frost" })
    .click();
  await page
    .getByRole("radiogroup", { name: "Email" })
    .getByRole("radio", { name: "a.frost@work.com.au" })
    .click();
  await page.getByRole("button", { name: "Merge these two" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet).toContainText("This cannot be undone.");
  await sheet.getByRole("button", { name: "Merge them" }).click();

  await expect(page).toHaveURL(/\/contacts\/[0-9a-f-]+$/);
  await expect(page.getByLabel("Name")).toHaveValue("Amelia Frost");
  await expect(page.getByLabel("Email")).toHaveValue("a.frost@work.com.au");
  await page.goto(admin + "/contacts");
  await expect(page.getByTestId("contact")).toHaveCount(1);
  await expect(page.getByTestId("duplicates-banner")).toHaveCount(0);

  await goTo(page, "Activity");
  await expect(page.getByRole("heading", { name: "Activity" })).toBeVisible();
  const first = page.getByTestId("activity-line").first();
  await expect(first).toContainText(
    /^Demo merged (A\. Frost and Amelia Frost|Amelia Frost and A\. Frost)$/,
  );
  await expect(page.getByTestId("activity-line").nth(1)).toContainText(
    "Demo added A. Frost to contacts",
  );
});

test("the same name, different people: said once, never suggested again; or merged by choice", async ({
  page,
}) => {
  await signIn(page);
  await add(page, "Jo Bloggs", "jo@bloggs.test", "");
  await add(page, "Jo Bloggs", "jo.b@elsewhere.test", "");

  await page.goto(admin + "/contacts");
  await page.getByTestId("duplicates-banner").click();
  await expect(page.getByTestId("merge")).toContainText("These two have the same name.");
  await page.getByRole("button", { name: "They are different people" }).click();
  await expect(page).toHaveURL(admin + "/contacts");
  await expect(page.getByTestId("duplicates-banner")).toHaveCount(0);

  // From someone's own page: pick who else they are.
  await page.getByTestId("contact").filter({ hasText: "jo@bloggs.test" }).click();
  await page.getByRole("link", { name: "Merge with someone else" }).click();
  await page.getByLabel("Search contacts").fill("elsewhere");
  await expect(page.getByTestId("merge-candidate")).toHaveCount(1);
  await page.getByTestId("merge-candidate").click();
  await expect(page.getByTestId("merge")).toContainText("Contact one");
  await expect(page.getByRole("radiogroup", { name: "Email" })).toBeVisible();
});
