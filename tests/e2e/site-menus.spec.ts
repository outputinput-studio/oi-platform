import { test, expect, type Page } from "@playwright/test";

/**
 * Menus, end to end: the header starts automatic (the pages built by
 * pages.spec.ts), the team adds a web address, drags it right to tuck it
 * under About us, and the storefront shows it in a drop-down. Then back
 * to automatic, so the specs after this see the site as they expect.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");

test.use({ viewport: { width: 1200, height: 900 } });

async function signInAsOwner(page: Page) {
  // Already signed in: the setup project did the emailed code and the app (auth.setup.ts).
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await expect(page).toHaveURL(admin + "/");
}

test("a menu of your own, with a drop-down, then back to automatic", async ({ page }) => {
  await signInAsOwner(page);
  await page.goto(admin + "/pages");
  await page.getByRole("link", { name: "Menus" }).click();
  await expect(page.getByTestId("menu-header")).toContainText("Always here");
  await expect(page.getByTestId("menu-header")).toContainText("Automatic");
  await page.getByTestId("menu-header").click();
  await expect(page.getByTestId("automatic-note")).toBeVisible();
  await expect(page.getByTestId("item-0")).toContainText("About us");
  await expect(page.getByTestId("item-0")).toContainText("Page · /about-us");

  // Add a web address.
  await page.getByRole("button", { name: "Add item" }).click();
  await page.getByLabel("Web address").fill("instagram.com/demo");
  await page.getByRole("button", { name: "Use this address" }).click();
  await expect(page.getByText(/starting with https/)).toBeVisible(); // not a full address yet
  await page.getByLabel("Web address").fill("https://instagram.com/demo");
  await page.getByRole("button", { name: "Use this address" }).click();
  const last = page.getByTestId(/^item-\d+$/).last();
  await expect(last).toContainText("Web address · https://instagram.com/demo");
  await last.getByLabel("Label").fill("Instagram");
  await expect(page.getByTestId("menu-save-status")).toHaveText("✓ Saved");
  await expect(page.getByTestId("automatic-note")).toHaveCount(0);

  // Move it to just under About us, then drag it right to tuck it under.
  const count = await page.getByTestId(/^item-\d+$/).count();
  for (let k = count - 1; k > 1; k--) {
    const handle = page.getByTestId(`item-${k}`).getByRole("button", { name: "Drag to reorder" });
    const above = page.getByTestId(`item-${k - 1}`).getByRole("button", { name: "Drag to reorder" });
    const from = (await handle.boundingBox())!;
    const to = (await above.boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2 - 10, { steps: 3 });
    await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2 - 6, { steps: 10 });
    await page.mouse.up();
    await expect(page.getByTestId(`item-${k - 1}`)).toContainText("Instagram");
  }
  const handle = page.getByTestId("item-1").getByRole("button", { name: "Drag to reorder" });
  const box = (await handle.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 10, box.y + box.height / 2, { steps: 3 });
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.getByTestId("item-1")).toHaveClass(/ml-7/);
  await expect(page.getByTestId("menu-save-status")).toHaveText("✓ Saved");
  await page.getByTestId("item-1").getByRole("button", { name: /Instagram/ }).click();
  const under = page.getByTestId("item-1").getByRole("switch");
  await expect(under).toContainText("Sits under about us");
  await expect(under).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("menu-save-status")).toHaveText("✓ Saved");

  // On the site: About us opens to show itself and Instagram, which opens in a new tab.
  await page.goto(demo + "/");
  const nav = page.getByRole("navigation", { name: "Pages" });
  await nav.locator("summary", { hasText: "About us" }).click();
  await expect(nav.getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about-us");
  await expect(nav.getByRole("link", { name: "Instagram" })).toHaveAttribute("href", "https://instagram.com/demo");
  await expect(nav.getByRole("link", { name: "Instagram" })).toHaveAttribute("target", "_blank");

  // Back to automatic.
  await page.goto(admin + "/menus/header");
  await page.getByRole("button", { name: "Back to automatic" }).click();
  await expect(page.getByTestId("automatic-note")).toBeVisible();
  await page.goto(demo + "/");
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "About us" })).toHaveAttribute("href", "/about-us");
  await expect(page.getByRole("navigation", { name: "Pages" }).getByRole("link", { name: "Instagram" })).toHaveCount(0);
});
