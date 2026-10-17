import { test, expect, type Browser, type Page } from "@playwright/test";
import { base32Decode, hotp } from "../../src/modules/auth/totp";
import { appCode, currentStep, hasKey, rememberKey } from "./app-code";
import { SIGNED_OUT } from "./state";

/**
 * Operations (Stage 39a): O/I support signs in on ops — the emailed code
 * and always the app — sees every site, and sets a site's plan; the site's
 * Owner then sees it in Settings · Plan. Anyone else is told ops is ours.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const ops = base.replace("127.0.0.1", "ops.localhost");
const admin = base.replace("127.0.0.1", "admin.localhost");
const demo = base.replace("127.0.0.1", "demo.localhost");
const SUPPORT = "support@example.com"; // OI_SUPPORT_EMAILS in CI

test.use({ viewport: { width: 1280, height: 900 } });

/** Sign in on ops in a fresh browser: the code, then the app (set up the first time). */
async function opsSignIn(browser: Browser, email: string): Promise<Page> {
  const p = await (await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: SIGNED_OUT })).newPage();
  await p.goto(ops + "/");
  await expect(p).toHaveURL(/\/sign-in$/);
  await p.getByLabel("Email").fill(email);
  await p.getByRole("button", { name: "Send code" }).click();
  await p.getByLabel("Code").fill((await p.getByTestId("dev-code").textContent())!);
  await p.getByRole("button", { name: "Sign in" }).click();
  const appStep = p.getByRole("heading", { name: "One more code" });
  const setUp = p.getByTestId("two-factor-qr");
  const sites = p.getByRole("heading", { name: "Sites" });
  const notOurs = p.getByRole("heading", { name: "This is output/input's own" });
  await appStep.or(setUp).or(sites).or(notOurs).first().waitFor();
  if (await appStep.isVisible()) {
    await p.getByLabel("Code from your app").fill(await appCode(email));
    await p.getByRole("button", { name: "Sign in" }).click();
  } else if (await setUp.isVisible()) {
    const key = (await p.getByTestId("two-factor-key").textContent())!.replace(/\s/g, "");
    const step = currentStep();
    await p.getByLabel("Code from your app").fill(hotp(base32Decode(key), step));
    await p.getByRole("button", { name: "Turn it on" }).click();
    await expect(p.getByTestId("recovery-code")).toHaveCount(10);
    rememberKey(email, key, step);
    await p.getByRole("link", { name: "I've saved them" }).click();
  }
  return p;
}

test("support sets a site's plan in ops; the Owner sees it in Settings · Plan", async ({ page, browser }) => {
  const sup = await opsSignIn(browser, SUPPORT);
  await expect(sup.getByRole("heading", { name: "Sites" })).toBeVisible();
  await sup.getByTestId("ops-site-demo").click();
  await expect(sup.getByRole("heading", { name: "Demo site" })).toBeVisible();
  // Their admin opens in its own tab, so ops stays open.
  await expect(sup.getByRole("link", { name: /Open their admin/ })).toHaveAttribute("target", "_blank");

  // A mistake points at its box.
  await sup.getByLabel("Name").fill("");
  await sup.getByRole("button", { name: "Save plan" }).click();
  await expect(sup.getByText("Give the plan a name.")).toBeVisible();
  await expect(sup.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");

  await sup.getByLabel("Name").fill("Shop and journal");
  await sup.getByLabel("What it includes").fill("Products, orders, pages, articles, forms, menus and contacts.");
  await sup.getByLabel("Price a month").fill("180");
  await sup.getByLabel("Photos and files (GB)").fill("5");
  await sup.getByLabel("Products").fill("");
  await sup.getByLabel("People who can log in").fill("2");
  await sup.getByLabel("Visits a month").fill("10000");
  await sup.getByRole("button", { name: "Save plan" }).click();
  await expect(sup.getByText("Saved")).toBeVisible();
  await sup.goto(ops + "/");
  await expect(sup.getByTestId("ops-site-demo")).toContainText("Shop and journal");

  // A visit to the live site counts (as a person's browser: crawlers and headless browsers that say so aren't counted).
  const userAgent = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36";
  const visitor = await (await browser.newContext({ storageState: SIGNED_OUT, userAgent })).newPage();
  await visitor.goto(demo + "/");

  // The Owner: Settings → Plan.
  await page.goto(admin + "/sites");
  await page.getByRole("button", { name: "Demo site" }).click();
  await page.goto(admin + "/settings");
  await expect(page.getByRole("link", { name: /^Plan/ })).toContainText("Shop and journal · $180 a month");
  await page.getByRole("link", { name: /^Plan/ }).click();
  await expect(page.getByTestId("plan-card")).toContainText("Shop and journal");
  await expect(page.getByTestId("plan-card")).toContainText("$180 a month");
  const rows = page.getByTestId("usage-row");
  await expect(rows.filter({ hasText: "Photos and files" })).toContainText("of 5 GB");
  await expect(rows.filter({ hasText: "Products" })).toContainText("of no limit");
  await expect(rows.filter({ hasText: "People who can log in" })).toContainText(/\d+ of 2/);
  await expect.poll(async () => {
    await page.reload();
    return (await rows.filter({ hasText: "Visits this month" }).textContent()) ?? "";
  }).toMatch(/[1-9][\d,]* of 10,000/);

  // Stage 39b: the Owner sets up payment. Without O/I's Stripe key (CI) it's test billing: no card, nothing charged.
  await expect(page.getByTestId("paying")).toContainText("Test billing here");
  await page.getByRole("button", { name: "Set up payment" }).click();
  await expect(page.getByTestId("paid-notice")).toBeVisible();
  await expect(page.getByTestId("paying")).toContainText("Visa ending 4242");
  await expect(page.getByTestId("renews")).toContainText("Next renews");
  await expect(page.getByRole("button", { name: "Set up payment" })).toHaveCount(0);

  // Ops sees they're paying; a new price applies from the next bill, and the currency stays.
  await sup.reload();
  await expect(sup.getByTestId("ops-site-demo").getByTestId("ops-billing")).toHaveText("Paying by card");
  await sup.getByTestId("ops-site-demo").click();
  await expect(sup.getByTestId("ops-paying")).toContainText("$180 a month");
  await sup.getByLabel("Currency").selectOption("NZD");
  await sup.getByRole("button", { name: "Save plan" }).click();
  await expect(sup.getByText("Stripe can't change that while they're paying")).toBeVisible();
  await expect(sup.getByLabel("Currency")).toHaveAttribute("aria-invalid", "true");
  await sup.getByLabel("Currency").selectOption("AUD");
  await sup.getByLabel("Price a month").fill("200");
  await sup.getByRole("button", { name: "Save plan" }).click();
  await expect(sup.getByText("Saved")).toBeVisible();
  await page.reload();
  await expect(page.getByTestId("plan-card")).toContainText("$200 a month");
});

test("ops is ours: a client's Owner signing in there is told so", async ({ browser }) => {
  test.skip(!hasKey("owner@example.com"), "needs the owner's app key from the setup project");
  const p = await opsSignIn(browser, "owner@example.com");
  await expect(p.getByRole("heading", { name: "This is output/input's own" })).toBeVisible();
  await p.goto(ops + "/sites/" + "00000000-0000-4000-8000-000000000000");
  await expect(p.getByRole("heading", { name: "This is output/input's own" })).toBeVisible();
});
