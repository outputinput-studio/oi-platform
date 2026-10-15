import { test, expect } from "@playwright/test";

/** One check per front door, against the built app, by Host header. */
const base = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";

test("admin.localhost is the admin: it asks you to sign in", async ({ request }) => {
  const res = await request.get(base + "/", { headers: { host: "admin.localhost" }, maxRedirects: 0 });
  expect(res.status()).toBe(307);
  expect(res.headers()["location"]).toBe("/sign-in");
});

for (const [host, surface] of [
  ["ops.localhost", "ops"],
  ["demo.localhost", "site"],
] as const) {
  test(`${host} shows the ${surface} placeholder`, async ({ request }) => {
    const res = await request.get(base + "/", { headers: { host } });
    expect(res.status()).toBe(200);
    expect(await res.text()).toContain(`data-surface="${surface}"`);
  });
}

test("surface trees cannot be reached by path", async ({ request }) => {
  const res = await request.get(base + "/admin", { headers: { host: "demo.localhost" } });
  expect(res.status()).toBe(404);
});

test("health reports the database", async ({ request }) => {
  const res = await request.get(base + "/api/health");
  expect(res.status()).toBe(200);
  expect(await res.json()).toMatchObject({ ok: true, database: true });
});
