import { test, expect, type Page } from "@playwright/test";

/**
 * Redirects, end to end: a visitor misses, the team sees it, points it
 * somewhere, and the next visitor is sent on. Runs after pages.spec.ts.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");

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

test("a miss shows up, gets a rule, and the rule works — for any depth of path", async ({ page, request }) => {
  const h = { host: "demo.localhost", referer: "https://www.instagram.com/p/xyz" };
  expect((await request.get(base + "/shop/teal-bikini.html", { headers: h, maxRedirects: 0 })).status()).toBe(404);
  expect((await request.get(base + "/shop/teal-bikini.html", { headers: h, maxRedirects: 0 })).status()).toBe(404);

  await signInAsOwner(page);
  await page.goto(admin + "/settings/redirects");
  const miss = page.getByTestId("not-found").filter({ hasText: "/shop/teal-bikini.html" });
  await expect(miss).toContainText("2 visits");
  await expect(miss).toContainText("from instagram.com");
  await miss.getByRole("button", { name: "Redirect this" }).click();
  await expect(page.getByLabel("From")).toHaveValue("/shop/teal-bikini.html");
  await page.getByLabel("To").fill("/about-us");
  await page.getByRole("button", { name: "Save rule" }).click();
  await expect(page.getByTestId("not-found").filter({ hasText: "/shop/teal-bikini.html" })).toHaveCount(0);

  const res = await request.get(base + "/shop/teal-bikini.html", { headers: h, maxRedirects: 0 });
  expect(res.status()).toBe(308);
  expect(res.headers()["location"]).toBe("/about-us");

  await page.getByRole("navigation", { name: "Redirects" }).getByRole("link", { name: "Rules" }).click();
  const rule = page.getByTestId("rule").filter({ hasText: "/shop/teal-bikini.html" });
  await expect(rule).toContainText("1 person sent on");
  await rule.getByRole("button", { name: "Remove" }).click();
  await expect(page.getByTestId("rule").filter({ hasText: "/shop/teal-bikini.html" })).toHaveCount(0);
});
