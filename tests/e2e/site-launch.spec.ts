import { test, expect, type Page } from "@playwright/test";

/**
 * Settings · Domain and Going live, on the seeded "soon" site, which hasn't
 * launched: visitors get a holding page, the team a preview link, an owner
 * connects a domain (shown the records it needs) and launches.
 */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
const admin = base.replace("127.0.0.1", "admin.localhost");
const soon = base.replace("127.0.0.1", "soon.localhost");

test.use({ viewport: { width: 1200, height: 900 } });

async function signInToSoon(page: Page) {
  await page.goto(admin + "/sign-in");
  await page.getByLabel("Email").fill("owner@example.com");
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill((await page.getByTestId("dev-code").textContent())!);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.getByRole("button", { name: "Opening soon" }).click();
  await expect(page).toHaveURL(admin + "/");
}

test("a site that hasn't launched shows visitors a holding page, everywhere", async ({ page, request }) => {
  await page.goto(soon + "/");
  await expect(page.getByTestId("holding")).toContainText("Opening soon");
  await page.goto(soon + "/shop");
  await expect(page.getByTestId("holding")).toBeVisible();
  await page.goto(soon + "/account");
  await expect(page.getByTestId("holding")).toBeVisible();
  const robots = await (await request.get(base + "/robots.txt", { headers: { host: "soon.localhost" } })).text();
  expect(robots).toContain("Disallow: /");
  const sitemap = await (await request.get(base + "/sitemap.xml", { headers: { host: "soon.localhost" } })).text();
  expect(sitemap).not.toContain("<loc>");
});

test("the team's preview link opens the real site; a made-up pass doesn't", async ({ page, browser }) => {
  await signInToSoon(page);
  await page.goto(admin + "/settings");
  await expect(page.getByRole("link", { name: /^Domain/ })).toContainText("not live yet");
  await page.getByRole("link", { name: /^Domain/ }).click();
  await expect(page.getByTestId("slug-host")).toHaveText("soon.localhost");
  await expect(page.getByTestId("live-state")).toHaveText("Not live yet");
  const href = (await page.getByRole("link", { name: "Open the real site" }).getAttribute("href"))!;
  expect(href).toMatch(/^http:\/\/soon\.localhost:3000\/preview-pass\?t=\d+\./);

  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(soon + "/preview-pass?t=123.made-up");
  await expect(visitor.getByTestId("holding")).toBeVisible();
  await visitor.goto(href);
  await expect(visitor).toHaveURL(soon + "/");
  await expect(visitor.getByTestId("holding")).toHaveCount(0);
  await visitor.goto(soon + "/shop");
  await expect(visitor.getByTestId("holding")).toHaveCount(0);
});

test("your own domain: refused when it isn't one, then the records it needs; disconnected again", async ({ page }) => {
  await signInToSoon(page);
  await page.goto(admin + "/settings/domain");
  await page.getByLabel("Domain").fill("not a domain");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByText("That doesn't look like a domain")).toBeVisible();
  await expect(page.getByLabel("Domain")).toHaveAttribute("aria-invalid", "true");

  // Typed with www: www is the main address.
  await page.getByLabel("Domain").fill("https://www.Soon-Shop.test/");
  await page.getByRole("button", { name: "Connect" }).click();
  await expect(page.getByTestId("domain-name")).toHaveText("www.soon-shop.test");
  await expect(page.getByTestId("domain-state")).toHaveText("Waiting for DNS");
  await expect(page.getByTestId("record-A")).toContainText("A · soon-shop.test");
  await expect(page.getByTestId("record-A")).toContainText("76.76.21.21");
  await expect(page.getByTestId("record-CNAME")).toContainText("CNAME · www.soon-shop.test");
  await expect(page.getByTestId("record-CNAME")).toContainText("cname.vercel-dns.com");
  await expect(page.getByTestId("domain-security")).toHaveText("Not yet");

  // Without www instead: the choice saves, and the bare domain becomes the main address.
  await expect(page.getByRole("radio", { name: "www.soon-shop.test" })).toHaveAttribute("aria-checked", "true");
  await page.getByRole("radio", { name: "soon-shop.test", exact: true }).click();
  await expect(page.getByTestId("domain-name")).toHaveText("soon-shop.test");

  await page.getByRole("button", { name: "Disconnect this domain" }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await expect(page.getByLabel("Domain")).toBeVisible();
});

test("launching: from then on everyone sees the site", async ({ page, browser }) => {
  await signInToSoon(page);
  await page.goto(admin + "/settings/domain");
  await page.getByRole("button", { name: "Launch site" }).click();
  await expect(page.getByTestId("live-state")).toContainText("Live since");
  const visitor = await (await browser.newContext()).newPage();
  await visitor.goto(soon + "/");
  await expect(visitor.getByTestId("holding")).toHaveCount(0);
});
