import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * Articles, end to end on a phone: write one, publish it, read it on
 * the journal; Journal joins the storefront menu.
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

test("write an article, publish it, read it", async ({ page }) => {
  await signInAsOwner(page);
  await goTo(page, "Content");
  await page.getByRole("navigation", { name: "Content" }).getByRole("link", { name: "Articles" }).click();
  await page.getByRole("button", { name: "Add article" }).click();
  await page.getByLabel("Title").fill("Our first delivery to Krabi");
  await page.getByRole("button", { name: "Create article" }).click();
  await expect(page).toHaveURL(/\/articles\/[0-9a-f-]+$/);
  await expect(page.getByLabel("Web address")).toHaveValue("our-first-delivery-to-krabi");

  await page.getByLabel("Body").fill("Two tubs and a chiller, four hours down the coast.\n\nThe resort opens next month.");
  await page.getByLabel("Excerpt").fill("Four hours down the coast.");
  await page.getByLabel("Written by").fill("Carl");
  await expect(page.getByTestId("article-save-status")).toHaveText("✓ Saved");

  // Not live yet: no Journal on the site.
  const res = await page.request.get(base + "/journal/our-first-delivery-to-krabi", { headers: { host: "demo.localhost" } });
  expect(res.status()).toBe(404);

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("article-status")).toHaveText("Live");

  await page.goto(demo + "/");
  await page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Journal" }).click();
  await expect(page).toHaveURL(demo + "/journal");
  await expect(page.getByText("Four hours down the coast.")).toBeVisible();
  await page.getByRole("link", { name: /Our first delivery to Krabi/ }).click();
  await expect(page).toHaveURL(demo + "/journal/our-first-delivery-to-krabi");
  await expect(page.getByRole("heading", { name: "Our first delivery to Krabi" })).toBeVisible();
  await expect(page.getByText("By Carl")).toBeVisible();
  await expect(page.getByText("The resort opens next month.")).toBeVisible();
});
