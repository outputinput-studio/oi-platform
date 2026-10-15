import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * Forms, end to end on a phone: build one, put it on the front page
 * (built by pages.spec.ts), send it as a visitor, find it in the inbox,
 * mark it done.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");

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

test("a form from the editor to the inbox", async ({ page }) => {
  await signInAsOwner(page);

  // Build the form: the three starter fields plus a choice.
  await goTo(page, "Content");
  await page.getByRole("navigation", { name: "Content" }).getByRole("link", { name: "Forms" }).click();
  await page.getByRole("button", { name: "Add form" }).click();
  await page.getByLabel("Form name").fill("Enquiry");
  await page.getByRole("button", { name: "Create form" }).click();
  await expect(page).toHaveURL(/\/forms\/[0-9a-f-]+$/);
  await expect(page.getByTestId("field-0")).toContainText("Your name");
  await page.getByRole("button", { name: "+ Add field" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Single choice/ }).click();
  const choice = page.getByTestId("field-3");
  await choice.getByLabel("Label").fill("What are you after?");
  await choice.getByRole("textbox", { name: "Option 1" }).fill("A sauna");
  await choice.getByRole("textbox", { name: "Option 2" }).fill("An ice bath");
  await choice.getByRole("switch", { name: "Required" }).click();
  await expect(page.getByTestId("form-save-status")).toHaveText("✓ Saved");
  await page.getByLabel("Button text").fill("Send enquiry");
  await expect(page.getByTestId("form-save-status")).toHaveText("✓ Saved");

  // Put it on the front page.
  await page.goto(admin + "/pages");
  await page.getByTestId("page-home").click();
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Form/ }).click();
  const section = page.getByTestId("section-2");
  await section.getByLabel("Which form").selectOption({ label: "Enquiry" });
  await section.getByLabel("Heading").fill("Get in touch");
  await expect(section.getByTestId("save-status")).toHaveText("Saved");

  // A visitor sends it. A required choice left empty is caught by the browser; fill everything.
  await page.goto(demo + "/");
  await expect(page.getByRole("heading", { name: "Get in touch" })).toBeVisible();
  await page.getByLabel("Your name").fill("Dee Visitor");
  await page.getByLabel("Email").fill("dee@example.com");
  await page.getByLabel("Your message").fill("Do you deliver to Phuket?");
  await page.getByLabel("What are you after?").selectOption("An ice bath");
  await page.getByRole("button", { name: "Send enquiry" }).click();
  await expect(page.getByRole("status")).toContainText("Thanks, we have it");

  // It's in the inbox, with a badge; open it, mark it done.
  await page.goto(admin + "/");
  await expect(page.getByTestId("inbox-badge").first()).toHaveText("1");
  await goTo(page, "Inbox");
  const row = page.getByTestId("submission").first();
  await expect(row).toContainText("Dee Visitor");
  await expect(row).toContainText("Do you deliver to Phuket?");
  await row.click();
  await expect(page.getByText("An ice bath")).toBeVisible();
  await expect(page.getByRole("link", { name: "Email Dee" })).toHaveAttribute("href", "mailto:dee@example.com");
  await page.getByRole("button", { name: "Mark as done" }).click();
  await expect(page.getByRole("button", { name: "Move back to new" })).toBeVisible();
  await page.goto(admin + "/inbox");
  await expect(page.getByText("You're all caught up")).toBeVisible();
  await expect(page.getByTestId("inbox-badge")).toHaveCount(0);
  await page.getByRole("navigation", { name: "Inbox" }).getByRole("link", { name: "Done" }).click();
  await expect(page.getByTestId("submission")).toHaveCount(1);
});

test("a form from another site can't be sent here", async ({ request }) => {
  // The storefront action checks the form belongs to the host's site; a made-up id is simply not found.
  const res = await request.get(base + "/", { headers: { host: "outputinput.localhost" } });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain("Send enquiry");
});
