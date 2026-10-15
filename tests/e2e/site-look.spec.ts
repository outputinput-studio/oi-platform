import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * The site's look, end to end: an owner switches to light with a brand
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
  await page.getByRole("link", { name: /^Look/ }).click();
  const save = page.getByTestId("save-bar").getByRole("button", { name: "Save" });
  await expect(save).toBeDisabled();
  await page.getByRole("radio", { name: "light" }).click();
  await page.getByLabel("Colour", { exact: true }).fill("#CC3333");
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByTestId("save-bar")).toContainText("Saved");
  await expect(save).toBeDisabled();

  await page.goto(demo + "/");
  const root = page.locator("[data-surface=site]");
  await expect(root).toHaveAttribute("data-theme", "light");
  await expect(root).toHaveCSS("--accent", "#cc3333");
  const menu = page.getByRole("navigation", { name: "Pages" });
  await expect(menu.getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about-us");
  await expect(menu.getByRole("link", { name: "Home" })).toHaveCount(0);
});
