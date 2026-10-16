import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * The site's theme, end to end: an owner switches to light with a brand
 * colour, and the storefront (built by pages.spec.ts before this) shows
 * it, with the published pages in its menu.
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

test("light with a brand colour, seen on the storefront with its menu", async ({ page }) => {
  await page.goto(demo + "/");
  await expect(page.locator("[data-surface=site]")).toHaveAttribute("data-theme", "dark");

  await signInAsOwner(page);
  await goTo(page, "Settings");
  await page.getByRole("link", { name: /^Branding/ }).click();
  const save = page.getByRole("button", { name: "Saved" });
  await expect(save).toBeDisabled();
  await page.getByRole("button", { name: "Start from light" }).click();
  await page.getByLabel("Accent", { exact: true }).fill("#CC3333");
  await expect(page.getByTestId("brand-sample")).toBeVisible();
  await page.getByRole("button", { name: "Save branding" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeDisabled();

  // Old links to Theme land on Branding.
  await page.goto(admin + "/settings/theme");
  await expect(page).toHaveURL(admin + "/settings/branding");

  await page.goto(demo + "/");
  const root = page.locator("[data-surface=site]");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveCSS("--accent", "#cc3333");
  await expect(root).toHaveCSS("--bg", "#faf9f5");
  const menu = page.getByRole("navigation", { name: "Pages" });
  await expect(menu.getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about-us");
  await expect(menu.getByRole("link", { name: "Home" })).toHaveCount(0);
});

test("hard-to-read colours are flagged before they're saved", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/settings/branding");
  await page.getByLabel("Text", { exact: true }).fill("#eeeeee");
  await expect(page.getByText("The text may be hard to read")).toBeVisible();
  await page.getByLabel("Text", { exact: true }).fill("#1b1a17");
  await expect(page.getByText("The text may be hard to read")).toHaveCount(0);
});

test("the footer: a newsletter form and social links on every page", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /^Footer/ }).click();
  await page.getByRole("radio", { name: /^Enquiry/ }).click(); // made by site-forms.spec
  await page.getByLabel("Heading above it").fill("Join the list");
  await page.getByLabel("Instagram").fill("https://www.instagram.com/demosite");
  await page.getByRole("button", { name: "Save footer" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto(demo + "/about-us");
  const footer = page.locator("footer");
  await expect(footer.getByTestId("footer-form")).toContainText("Join the list");
  await expect(footer.getByRole("navigation", { name: "Social" }).getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://www.instagram.com/demosite");

  // None takes it out again.
  await page.goto(admin + "/settings/footer");
  await page.getByRole("radio", { name: /^None/ }).click();
  await page.getByRole("button", { name: "Save footer" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();
  await page.goto(demo + "/about-us");
  await expect(page.getByTestId("footer-form")).toHaveCount(0);
});
