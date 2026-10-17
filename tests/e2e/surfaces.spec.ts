import { test, expect } from "@playwright/test";

/** One check per front door, against the built app, by Host header. */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test("admin.localhost is the admin: it asks you to sign in", async ({ request }) => {
  const res = await request.get(base + "/", { headers: { host: "admin.localhost" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/sign-in");
});

test("ops.localhost is operations: it asks you to sign in", async ({ request }) => {
  const res = await request.get(base + "/", { headers: { host: "ops.localhost" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/sign-in");
  const page = await request.get(base + "/sign-in", { headers: { host: "ops.localhost" } });
  expect(await page.text()).toContain('data-surface="ops"');
});

test("a storefront host answers as a site, published or not", async ({ request }) => {
  const res = await request.get(base + "/", { headers: { host: "demo.localhost" } });
  expect(res.status()).toBe(200);
  expect(await res.text()).toContain("Demo site");
  // A host that matches no site keeps the stage-1 placeholder rather than failing.
  const none = await request.get(base + "/", { headers: { host: "nobody.localhost" } });
  expect(none.status()).toBe(200);
  expect(await none.text()).toContain('data-surface="site"');
});

test("surface trees cannot be reached by path", async ({ request }) => {
  const res = await request.get(base + "/admin", { headers: { host: "demo.localhost" } });
  expect(res.status()).toBe(404);
});

test("health reports the database", async ({ request }) => {
  const res = await request.get(base + "/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, database: true });
});
