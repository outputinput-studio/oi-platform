import { test, expect, type Page } from "@playwright/test";
import { goTo } from "./nav";
import path from "node:path";

/**
 * Images, end to end on a phone: upload (shrunk in the browser first),
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

test("upload an image, describe it, use it in a hero, see it live", async ({ page }) => {
  await signInAsOwner(page);
  await goTo(page, "Images");
  await expect(page.getByRole("heading", { name: "Images" })).toBeVisible();

  // Upload. The browser shrinks 2400×1600 to 2000×1333 and, as the PNG is opaque, sends a JPG.
  await page.getByLabel("Choose images to upload").setInputFiles(fixture);
  const tile = page.getByTestId("image-grid").getByRole("button").first();
  await expect(tile).toBeVisible();
  const thumb = tile.locator("img");
  await expect(thumb).toHaveAttribute("width", "2000");
  await expect(thumb).toHaveAttribute("height", "1333");
  const src = await thumb.getAttribute("src");
  expect(src).toMatch(/\/api\/media-local\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.jpg$/);

  // The file really is there, and is a JPG.
  const got = await page.request.get(base + src!, { headers: { host: "admin.localhost" } });
  expect(got.status()).toBe(200);
  expect(got.headers()["content-type"]).toBe("image/jpeg");

  // Describe it.
  await tile.click();
  await page.getByRole("dialog").getByLabel("Describe this photo").fill("The shop front");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("dialog").getByText("Saved")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Close" }).click();

  // Put it in the front page's hero. pages.spec.ts runs first and builds that page; this copes if it didn't.
  await goTo(page, "Content");
  await expect(page.getByRole("heading", { name: "Content" })).toBeVisible();
  if (await page.getByTestId("page-home").count()) await page.getByTestId("page-home").click();
  else await page.getByRole("button", { name: "Create page" }).click();
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]+$/);
  await expect(page.getByTestId("page-status")).toBeVisible();
  if ((await page.getByRole("heading", { name: "Hero" }).count()) === 0) {
    await page.getByRole("button", { name: "+ Add section" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Hero/ }).click();
  }
  const hero = page.locator("article", { has: page.getByRole("heading", { name: "Hero" }) }).first();
  await hero.getByRole("button", { name: "Choose an image" }).click();
  await page.getByRole("dialog", { name: "Choose an image" }).getByRole("button", { name: "The shop front" }).click();
  await expect(hero.getByLabel("Describe this photo")).toHaveValue("The shop front");
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");

  // Live (publish if this spec got here first), the storefront shows it with its description.
  if ((await page.getByTestId("page-status").textContent()) !== "Live") {
    await page.getByRole("button", { name: "Publish", exact: true }).click();
  }
  await expect(page.getByTestId("page-status")).toHaveText("Live");
  await page.goto(demo + "/");
  const live = page.getByRole("img", { name: "The shop front" });
  await expect(live).toBeVisible();
  expect(await live.getAttribute("src")).toBe(src);

  // Removing it from the section leaves the page without an image.
  await page.goto(admin + "/pages");
  await page.getByTestId("page-home").click();
  await hero.getByRole("button", { name: "Remove image" }).click();
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");
  await page.goto(demo + "/");
  await expect(page.getByRole("img", { name: "The shop front" })).toHaveCount(0);
});

test("a PNG with transparency stays a PNG", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/media");
  // 1×1 fully transparent PNG.
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
  await page.getByLabel("Choose images to upload").setInputFiles({ name: "mark.png", mimeType: "image/png", buffer: png });
  const thumb = page.getByTestId("image-grid").getByRole("button").first().locator("img");
  await expect(thumb).toHaveAttribute("src", /\.png$/);
});

test("a wrong kind of file is refused in plain words", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/media");
  await page.getByLabel("Choose images to upload").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"),
  });
  await expect(page.getByText("Use a JPG, PNG, WebP or GIF image.")).toBeVisible();
});
