import { test, expect, type Page } from "@playwright/test";

/**
 * The preview pane beside the editor on a laptop: it shows the real
 * storefront, draft included, and reloads after a save. Runs after
 * pages.spec.ts, which builds the demo site's pages.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");

test.use({ viewport: { width: 1280, height: 900 } });

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

test("the preview shows the page and follows each save", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/pages");
  await page.getByTestId("page-home").click();

  const preview = page.frameLocator('[data-testid="preview"]');
  await expect(preview.getByText("We make small sites feel big.")).toBeVisible();
  // The chrome shows the site's address, not the admin's.
  await expect(page.getByRole("complementary", { name: "Preview" })).toContainText("demo.localhost");

  const hero = page.getByTestId("section-1");
  const folded = hero.locator('button[aria-expanded="false"]').first();
  if (await folded.count()) await folded.click();
  await hero.getByLabel("Headline").fill("Previewed live");
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");
  await expect(page.frameLocator('[data-testid="preview"]').getByRole("heading", { name: "Previewed live" })).toBeVisible();
});

test("the preview is for members only", async ({ request }) => {
  const res = await request.get(base + "/preview/00000000-0000-0000-0000-000000000000", { headers: { host: "admin.localhost" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/sign-in");
});
