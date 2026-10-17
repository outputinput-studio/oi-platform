import { test, expect, type Browser, type Page } from "@playwright/test";

/**
 * Settings · Analytics, Cookie notice and Custom code, end to end on the
 * seeded output/input site (live, so analytics count): IDs not code, a
 * notice that holds analytics back until Accept, and owner code on every
 * page with earlier versions to put back. Google and Meta are never
 * reached: their addresses answer with an empty script.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const site = base.replace("127.0.0.1", "outputinput.localhost");
const GA = 'script[src*="googletagmanager.com/gtag/js?id=G-AB12CD34EF"]';

test.use({ viewport: { width: 1200, height: 900 } });

async function signIn(page: Page) {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill((await page.getByTestId("dev-code").textContent())!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "output/input" }).click();
  await expect(page).toHaveURL(admin + "/");
}

async function visitor(browser: Browser) {
  const p = await (await browser.newContext()).newPage();
  await p.route(/googletagmanager\.com|connect\.facebook\.net/, (r) => r.fulfill({ status: 200, contentType: "text/javascript", body: "" }));
  return p;
}

test("analytics by their IDs, held back by the cookie notice until Accept", async ({ page, browser }) => {
  await signIn(page);
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /^Analytics/ }).click();
  // The whole snippet pasted: the ID is picked out of it.
  await page.getByLabel("Google Analytics").fill(`<script>gtag('config', 'G-AB12CD34EF');</script>`);
  await page.getByLabel("Meta pixel").fill("pixel");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/A Meta pixel ID is a long number/)).toBeVisible();
  await expect(page.getByLabel("Meta pixel")).toHaveAttribute("aria-invalid", "true");
  await page.getByLabel("Meta pixel").fill("1234567890123456");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByLabel("Google Analytics")).toHaveValue("G-AB12CD34EF");
  await expect(page.getByTestId("analytics-consent")).toContainText("no cookie notice");

  // No notice: every visitor gets them.
  const anyone = await visitor(browser);
  await anyone.goto(site + "/");
  await expect(anyone.locator(GA)).toHaveCount(1);
  await expect(anyone.locator("#oi-pixel")).toHaveCount(1);
  await expect(anyone.getByTestId("cookie-notice")).toHaveCount(0);

  // The notice on: nothing loads until Accept.
  await page.goto(admin + "/settings/cookies");
  await page.getByRole("switch", { name: /Show a cookie notice/ }).click();
  await page.getByLabel("Message").fill("We count visits. Say yes or no.");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await expect(page.getByTestId("cookie-preview")).toContainText("We count visits.");

  const yes = await visitor(browser);
  await yes.goto(site + "/");
  await expect(yes.getByTestId("cookie-notice")).toContainText("We count visits. Say yes or no.");
  await expect(yes.locator(GA)).toHaveCount(0);
  await yes.getByRole("button", { name: "Accept" }).click();
  await expect(yes.getByTestId("cookie-notice")).toHaveCount(0);
  await expect(yes.locator(GA)).toHaveCount(1);
  await yes.reload();
  await expect(yes.getByTestId("cookie-notice")).toHaveCount(0);
  await expect(yes.locator(GA)).toHaveCount(1);

  const no = await visitor(browser);
  await no.goto(site + "/");
  await no.getByRole("button", { name: "Decline" }).click();
  await expect(no.getByTestId("cookie-notice")).toHaveCount(0);
  await no.reload();
  await expect(no.getByTestId("cookie-notice")).toHaveCount(0);
  await expect(no.locator(GA)).toHaveCount(0);
  await expect(no.locator("#oi-pixel")).toHaveCount(0);
});

test("custom code on every page; an earlier version put back", async ({ page, browser }) => {
  await signIn(page);
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /^Custom code/ }).click();
  await expect(page.getByTestId("code-warning")).toContainText("runs on every page of your site");
  const start = page.getByLabel("At the start of every page");
  await start.fill(`<script>document.documentElement.dataset.custom = "one"</script>`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("button", { name: "Save" })).toBeDisabled();
  await start.fill(`<script>document.documentElement.dataset.custom = "two"</script>`);
  await page.getByLabel("At the end of every page").fill(`<p data-testid="custom-end">Made with care</p>`);
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("code-version")).toHaveCount(1);

  const v = await visitor(browser);
  await v.goto(site + "/");
  await expect(v.locator("html")).toHaveAttribute("data-custom", "two");
  await expect(v.getByTestId("custom-end")).toHaveText("Made with care");

  await page.getByRole("button", { name: "Put this back" }).click();
  await expect(start).toHaveValue(`<script>document.documentElement.dataset.custom = "one"</script>`);
  await expect(page.getByTestId("code-version")).toHaveCount(2);
  await v.reload();
  await expect(v.locator("html")).toHaveAttribute("data-custom", "one");
  await expect(v.getByTestId("custom-end")).toHaveCount(0);

  await page.goto(admin + "/settings");
  await expect(page.getByRole("link", { name: /^Custom code/ })).toContainText("Added to every page");
  await expect(page.getByRole("link", { name: /^Cookie notice/ })).toContainText("On");
});
