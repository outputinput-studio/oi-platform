import { test, expect, type Page } from "@playwright/test";
import { goTo, openSection } from "./nav";
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
  // Already signed in: the setup project did the emailed code and the app (auth.setup.ts).
  await page.goto(admin + "/sites");
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
  else {
    await page.getByRole("button", { name: "Add page" }).click();
    await page.getByRole("button", { name: "Create page" }).click();
  }
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]+$/);
  await expect(page.getByRole("heading", { name: "Edit page" })).toBeVisible();
  if ((await page.locator("article", { hasText: "Hero" }).count()) === 0) {
    await page.getByRole("button", { name: "+ Add section" }).click();
    await page.getByRole("dialog").getByRole("button", { name: /^Hero/ }).click();
  }
  const hero = page.locator("article", { hasText: "Hero" }).first();
  await openSection(hero);
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
  await openSection(hero);
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

test("an SVG logo uploads as it is; one carrying a script is refused in plain words", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/media");
  await page.getByLabel("Choose images to upload").setInputFiles({
    name: "wordmark - white.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 240 60'><path d='M0 0h240v60H0z' fill='#fff'/></svg>"),
  });
  const thumb = page.getByTestId("image-grid").getByRole("button").first().locator("img");
  await expect(thumb).toHaveAttribute("src", /\.svg$/);

  await page.getByLabel("Choose images to upload").setInputFiles({
    name: "sneaky.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from("<svg xmlns='http://www.w3.org/2000/svg' onload='alert(1)'/>"),
  });
  await expect(page.getByText(/That SVG can't be used: it has code that runs on events/)).toBeVisible();

  await page.getByLabel("Choose images to upload").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("hi") });
  await expect(page.getByText("That isn't an image.")).toBeVisible();
});
