import { test, expect, type Page } from "@playwright/test";
import { goTo, openSection } from "./nav";

/**
 * Pages, end to end on a phone: create, add sections, type (autosave),
 * reorder, publish, and read it back on the storefront.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost"); // the seeded site with slug "demo"

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

test("build the front page and publish it", async ({ page }) => {
  await signInAsOwner(page);
  await goTo(page, "Content");

  // "Add page" opens a sheet; the first page is suggested as the front page.
  await page.getByRole("button", { name: "Add page" }).click();
  await expect(page.getByLabel("Address")).toHaveValue("home");
  await page.getByRole("button", { name: "Create page" }).click();
  await expect(page).toHaveURL(/\/pages\/[0-9a-f-]+$/);
  await expect(page.getByTestId("page-status")).toHaveText("Draft");

  // Add a hero and type into it; autosave reports Saved.
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Hero/ }).click();
  const hero = page.getByTestId("section-0");
  await hero.getByLabel("Headline").fill("Welcome to the demo");
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");

  // Add a statement below, then move it above the hero.
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Statement/ }).click();
  const statement = page.getByTestId("section-1");
  await statement.getByLabel("The line").fill("We make small sites feel big.");
  await expect(statement.getByTestId("save-status")).toHaveText("Saved");
  await statement.getByRole("button", { name: "Section menu" }).click();
  await page.getByRole("menuitem", { name: "Move up" }).click();
  await expect(page.getByTestId("section-0")).toContainText("Statement");
  await expect(page.getByTestId("page-save-status")).toHaveText("✓ Saved");

  // Not live yet: the storefront shows "coming soon", not the draft.
  const res = await page.request.get(base + "/", { headers: { host: "demo.localhost" } });
  expect(res.status()).toBe(200);
  expect(await res.text()).not.toContain("Welcome to the demo");

  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("page-status")).toHaveText("Live");

  // Live: the storefront shows both sections, statement first.
  await page.goto(demo + "/");
  await expect(page.getByText("We make small sites feel big.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Welcome to the demo" })).toBeVisible();
  const order = await page.locator("main section").allTextContents();
  expect(order[0]).toContain("We make small sites feel big.");
});

test("a second page at its own address; a wrong address has a way out", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/pages");
  await page.getByRole("button", { name: "Add page" }).click();
  await page.getByLabel("Title").fill("About us");
  await expect(page.getByLabel("Address")).toHaveValue("about-us");
  await page.getByRole("button", { name: "Create page" }).click();
  await page.getByRole("button", { name: "+ Add section" }).click();
  await page.getByRole("dialog").getByRole("button", { name: /^Text/ }).click();
  await page.getByTestId("section-0").getByLabel("Text").fill("Founded in a shed.\n\nStill in the shed.");
  await expect(page.getByTestId("section-0").getByTestId("save-status")).toHaveText("Saved");
  await page.getByRole("button", { name: "Publish" }).click();
  await expect(page.getByTestId("page-status")).toHaveText("Live");

  await page.goto(demo + "/about-us");
  await expect(page.getByText("Still in the shed.")).toBeVisible();

  await page.goto(demo + "/no-such-page");
  await expect(page.getByRole("link", { name: "Go to the front page" })).toBeVisible();

  // Another site can't see it.
  const other = await page.request.get(base + "/about-us", { headers: { host: "outputinput.localhost" } });
  expect(other.status()).toBe(404);
});

test("a wrong save shows Retry, not silence", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/pages");
  await page.getByTestId("page-home").click();
  // Cut the connection for the save call only.
  await page.route("**/pages/**", (route) => (route.request().method() === "POST" ? route.abort() : route.continue()));
  const hero = page.getByTestId("section-1");
  await openSection(hero);
  await hero.getByLabel("Headline").fill("Welcome, again");
  await expect(hero.getByTestId("save-status")).toContainText("Retry");
  await page.unroute("**/pages/**");
  await hero.getByTestId("save-status").getByRole("button").click();
  await expect(hero.getByTestId("save-status")).toHaveText("Saved");
});
