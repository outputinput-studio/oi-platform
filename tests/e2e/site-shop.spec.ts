import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";

/**
 * The catalogue, end to end: a category, a product with a photo, a price
 * and a sale price, made to order, made visible; then the shop, its
 * category page and the product page on the storefront, in the site's
 * currency.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");
const fixture = path.join(__dirname, "fixtures", "shop-front.png");

test.use({ viewport: { width: 1200, height: 900 } });

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

test("a product from nothing to the shop", async ({ page, request }) => {
  await signInAsOwner(page);
  await goTo(page, "Products");
  await expect(page.getByText("Your products live here")).toBeVisible();

  // A category first.
  await page.getByRole("link", { name: /^Categories/ }).click();
  await page.getByRole("button", { name: "Add category" }).click();
  await page.getByLabel("Name").fill("Bikinis");
  await expect(page.getByLabel("Address")).toHaveValue("bikinis");
  await page.getByRole("dialog").getByRole("button", { name: "Add category" }).click();
  await expect(page.getByTestId("category-bikinis")).toContainText("0 products");

  // Then the product, in it.
  await page.goto(admin + "/products");
  await page.getByRole("button", { name: "Add product" }).click();
  await page.getByLabel("Product name").fill("Teal crystal bikini");
  await page.getByLabel("Category").selectOption({ label: "Bikinis" });
  await page.getByRole("button", { name: "Create product" }).click();
  await expect(page.getByRole("heading", { name: "Edit product" })).toBeVisible();
  await expect(page.getByLabel("Web address")).toHaveValue("teal-crystal-bikini");

  // A photo, uploaded from here, described.
  await page.getByRole("button", { name: "Add photo" }).click();
  await page.getByRole("dialog").getByLabel("Choose images to upload").setInputFiles(fixture);
  await expect(page.getByTestId("photos").locator("img")).toHaveCount(1);
  await page.getByLabel("Describe photo 1").fill("Teal crystals on stretch mesh");

  // Price, sale, made to order, visible.
  await page.getByLabel("Price", { exact: true }).fill("420");
  await page.getByLabel("Sale price").fill("abc");
  await expect(page.getByText(/A price is a number/)).toBeVisible();
  await page.getByLabel("Sale price").fill("380");
  await page.getByRole("radio", { name: "Made to order" }).click();
  await page.getByLabel("How long does it take to make?").fill("6");
  await page.getByLabel("Description").fill("Hand-set crystals on a teal base.\n\nMade to your measurements.");
  await expect(page.getByTestId("customer-view")).toContainText("$380");
  await expect(page.getByTestId("customer-view")).toContainText("$420");
  await expect(page.getByTestId("customer-view")).toContainText("Made to order — around 6 weeks");
  await expect(page.getByTestId("customer-view")).toContainText("Hidden");
  await page.getByRole("switch", { name: /Visible on site/ }).click();
  await expect(page.getByTestId("product-save-status")).toHaveText("✓ Saved");

  // The list shows it, with the note that nothing can be bought yet.
  await page.goto(admin + "/products");
  await expect(page.getByTestId("no-checkout")).toBeVisible();
  await expect(page.getByTestId("product-teal-crystal-bikini")).toContainText("Made to order · 6 weeks");
  await expect(page.getByTestId("product-teal-crystal-bikini")).not.toContainText("Hidden");

  // The storefront: the shop, its category, the piece.
  await page.goto(demo + "/shop");
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Shop" })).toHaveAttribute("href", "/shop");
  await page.getByRole("navigation", { name: "Categories" }).getByRole("link", { name: "Bikinis" }).click();
  await expect(page).toHaveURL(demo + "/shop/bikinis");
  await page.getByRole("link", { name: /Teal crystal bikini/ }).click();
  await expect(page).toHaveURL(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByRole("heading", { name: "Teal crystal bikini" })).toBeVisible();
  await expect(page.getByTestId("product-price")).toHaveText(/\$380\s*\$420/);
  await expect(page.getByTestId("product-note")).toHaveText("Made to order — around 6 weeks");
  await expect(page.getByRole("img", { name: "Teal crystals on stretch mesh" })).toBeVisible();
  const html = await (await request.get(base + "/shop/teal-crystal-bikini", { headers: { host: "demo.localhost" } })).text();
  expect(html).toContain('"@type":"Product"');
  expect(html).toContain('"priceCurrency":"AUD"');
  expect(html).toContain("https://schema.org/MadeToOrder");
  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "demo.localhost" } })).text();
  expect(sitemap).toContain("/shop/teal-crystal-bikini");

  // Currency is a site setting: switch to baht and the shop follows; then back.
  await page.goto(admin + "/settings/shop");
  await page.getByLabel("Currency").selectOption("THB");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
  await page.goto(demo + "/shop/teal-crystal-bikini");
  await expect(page.getByTestId("product-price")).toContainText("฿380");
  await page.goto(admin + "/settings/shop");
  await page.getByLabel("Currency").selectOption("AUD");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("Saved")).toBeVisible();
});
