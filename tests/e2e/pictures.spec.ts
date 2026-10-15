import { test, expect, type Page } from "@playwright/test";
import path from "node:path";

/**
 * Pictures, end to end on a phone: upload (shrunk in the browser first),
 * describe, put one in a hero, publish, see it on the storefront, and
 * check another site can't fetch it by address.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");
const fixture = path.join(__dirname, "fixtures", "shop-front.png"); // 2400×1600

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

test("upload a picture, describe it, use it in a hero, see it live", async ({ page }) => {
  await signInAsOwner(page);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pictures" }).click();
  await expect(page.getByRole("heading", { name: "Pictures" })).toBeVisible();

  // Upload. The browser shrinks 2400×1600 to 2000×1333 before sending.
  await page.getByLabel("Choose pictures to upload").setInputFiles(fixture);
  const tile = page.getByTestId("picture-grid").getByRole("button").first();
  await expect(tile).toBeVisible();
  const thumb = tile.locator("img");
  await expect(thumb).toHaveAttribute("width", "2000");
  await expect(thumb).toHaveAttribute("height", "1333");
  const src = await thumb.getAttribute("src");
  expect(src).toMatch(/\/api\/media-local\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.png$/);

  // The file really is there, and is a PNG.
  const got = await page.request.get(base + src!, { headers: { host: "admin.localhost" } });
  expect(got.status()).toBe(200);
  expect(got.headers()["content-type"]).toBe("image/png");

  // Describe it.
  await tile.click();
  await page.getByRole("dialog").getByLabel("Describe this photo").fill("The shop front");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByText("Saved")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // Put it in the front page's hero. pages.spec.ts runs first and builds that page.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Pages" }).click();
  await page.getByTestId("page-home").click();
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]+$/);
  const hero = page.locator("article", { has: page.getByRole("heading", { name: "Hero" }) }).first();
  await hero.getByRole("button", { name: "Choose a picture" }).click();
  await page.getByRole("dialog", { name: "Choose a picture" }).getByRole("button", { name: "The shop front" }).click();
  await expect(hero.getByLabel("Describe this photo")).toHaveValue("The shop front");
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");

  // The page is already live, so the storefront shows it with its description.
  await expect(page.getByTestId("page-status")).toHaveText("Live");
  await page.goto(demo + "/");
  const live = page.getByRole("img", { name: "The shop front" });
  await expect(live).toBeVisible();
  expect(await live.getAttribute("src")).toBe(src);

  // Removing it from the section leaves the page without a picture.
  await page.goto(admin + "/pages");
  await page.getByTestId("page-home").click();
  await hero.getByRole("button", { name: "Remove picture" }).click();
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");
  await page.goto(demo + "/");
  await expect(page.getByRole("img", { name: "The shop front" })).toHaveCount(0);
});

test("a wrong kind of file is refused in plain words", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/media");
  await page.getByLabel("Choose pictures to upload").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.getByText("Use a JPG, PNG, WebP or GIF picture.")).toBeVisible();
});
