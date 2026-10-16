import { test, expect, type Page } from "@playwright/test";

/**
 * Search and sharing: what the storefront tells Google, from the words
 * the client writes or from the content; the sitemap and robots. Runs
 * after pages.spec.ts and site-articles.spec.ts, which make the content.
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

test("defaults come from the content; the client's words win; hidden pages leave the sitemap", async ({ page, request }) => {
  // Before anything is set: the title is the page and site, the description the first words.
  const about = await request.get(base + "/about-us", { headers: { host: "demo.localhost" } });
  const html = await about.text();
  expect(html).toContain("<title>About us · Demo site</title>");
  expect(html).toMatch(/<meta name="description" content="Founded in a shed/);
  expect(html).toMatch(/<meta name="robots" content="index, follow"/);
  const home = await (await request.get(base + "/", { headers: { host: "demo.localhost" } })).text();
  expect(home).toContain("<title>Demo site</title>");
  expect(home).toMatch(/og:title/);

  await signInAsOwner(page);
  await page.goto(admin + "/pages");
  await page.getByTestId("page-about-us").click();
  await page.getByRole("button", { name: "Search and sharing" }).click();
  await page.getByLabel("Search title").fill("Our story — Demo site");
  await page.getByLabel("Search description").fill("Two people, one shed, a lot of tubs.");
  await page.getByRole("switch", { name: "Hide from search engines" }).click();
  await expect(page.getByTestId("seo-save-status")).toHaveText("Saved");

  const after = await (await request.get(base + "/about-us", { headers: { host: "demo.localhost" } })).text();
  expect(after).toContain("<title>Our story — Demo site</title>");
  expect(after).toMatch(/<meta name="description" content="Two people, one shed, a lot of tubs\."/);
  expect(after).toMatch(/<meta name="robots" content="noindex, nofollow"/);

  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "demo.localhost" } })).text();
  expect(sitemap).toContain("https://demo.localhost/</loc>");
  expect(sitemap).not.toContain("/about-us");
  expect(sitemap).toContain("https://demo.localhost/journal/deliveries/our-first-delivery-to-krabi</loc>");

  // Outside production nothing is crawlable; the admin never is.
  const robots = await (await request.get(base + "/robots.txt", { headers: { host: "demo.localhost" } })).text();
  expect(robots).toMatch(/Disallow: \//);
  const adminRobots = await (await request.get(base + "/robots.txt", { headers: { host: "admin.localhost" } })).text();
  expect(adminRobots).toMatch(/Disallow: \//);
  const adminSitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "admin.localhost" } })).text();
  expect(adminSitemap).not.toContain("<loc>");
});

test("site-wide: the title pattern, the business for Google, and hiding the whole site", async ({ page, request }) => {
  await signInAsOwner(page);
  // Name, phone, email and address come from the business profile.
  await page.goto(admin + "/settings");
  await page.getByRole("link", { name: /Business profile/ }).click();
  await page.getByLabel("Trading name").fill("Demo Site Co");
  await page.getByLabel("Business number").fill("ABN 48 219 774 301");
  await page.getByLabel("Address").fill("Unit 4, 88 Guildford Road\nMount Lawley WA 6050");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByTestId("save-bar")).toContainText("Saved");

  // Social links live with the footer now.
  await page.goto(admin + "/settings/footer");
  await page.getByLabel("Instagram").fill("https://www.instagram.com/demosite");
  await page.getByRole("button", { name: "Save footer" }).click();
  await expect(page.getByRole("button", { name: "Saved" })).toBeVisible();

  await page.goto(admin + "/settings/search");
  await page.getByLabel("How page titles read").fill("[Site name] — [Page name]");
  await expect(page.getByTestId("search-save-status")).toHaveText("Saved");

  const home = await (await request.get(base + "/", { headers: { host: "demo.localhost" } })).text();
  expect(home).toContain('"@type":"Organization"');
  expect(home).toContain('"name":"Demo Site Co"');
  expect(home).toContain('"address":"Unit 4, 88 Guildford Road, Mount Lawley WA 6050"');
  expect(home).toContain('"sameAs":["https://www.instagram.com/demosite"]');
  const journal = await (await request.get(base + "/journal", { headers: { host: "demo.localhost" } })).text();
  expect(journal).toContain("<title>Demo site — Journal</title>");

  await page.getByRole("switch", { name: "Hide the whole site from Google" }).click();
  await expect(page.getByTestId("search-save-status")).toHaveText("Saved");
  await page.goto(admin + "/");
  await expect(page.getByTestId("hidden-banner")).toBeVisible();
  const hidden = await (await request.get(base + "/", { headers: { host: "demo.localhost" } })).text();
  expect(hidden).toMatch(/<meta name="robots" content="noindex, nofollow"/);
  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "demo.localhost" } })).text();
  expect(sitemap).not.toContain("<loc>");

  await page.goto(admin + "/settings/search");
  await page.getByRole("switch", { name: "Hide the whole site from Google" }).click();
  await expect(page.getByTestId("search-save-status")).toHaveText("Saved");
});
