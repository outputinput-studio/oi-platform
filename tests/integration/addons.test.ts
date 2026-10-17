/**
 * Add-ons (Stage 39c, Carl): ops keeps the list; an Owner adds a self-serve
 * one with a tap, on straight away, the part month on the next bill; the
 * rest are "Ask us" and support adds them. Usage is measured against the
 * plan plus its add-ons. Stripe is a stand-in for the billed part.
 */
import { vi, beforeAll, afterAll, afterEach, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@addons.invalid";
});

import type Stripe from "stripe";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { listActivity } from "@/modules/activity/server";
import { planView, setPlan } from "@/modules/plans/server";
import { addAddon, askAboutAddon, deleteAddon, getAddon, listAddons, removeAddon, saveAddon, siteAddonsView } from "@/modules/addons/server";
import { setBillingStripeForTests, startPaying, syncSubscription } from "@/modules/billing/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const made: string[] = [];
const ids = { olga: "test-ao-olga", max: "test-ao-max", help: "test-ao-help", pia: "test-ao-pia" };
const plan = { name: "Shop", description: "", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: 10000 } };
const gb = { name: "AO Another 10 GB", description: "For photos.", price: 1200, currency: "AUD", kind: "storage", amount: 10, selfServe: true };
const quotes = { name: "AO Quotes", description: "Send a price, take a deposit.", price: 1800, currency: "AUD", kind: "feature", amount: null, selfServe: false };
let gbId = "";
let quotesId = "";
const lines = async (actorId: string, siteId: string) => (await listActivity({ actorId, siteId })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('ao-a','ao-b')`);
  await db.query(`delete from addons where name like 'AO %'`);
  siteA = (await db.query(`insert into sites (slug, name) values ('ao-a','AO A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('ao-b','AO B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Olga','olga@addons.invalid',true,now()), ($2,'Max','max@addons.invalid',true,now()), ($3,'output/input','help@addons.invalid',true,now()), ($4,'Pia','pia@addons.invalid',true,now())`,
    [ids.olga, ids.max, ids.help, ids.pia],
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'manager'), ($4,$5,'owner')`, [ids.olga, ids.max, siteA, ids.pia, siteB]);
});

afterEach(() => setBillingStripeForTests(null));

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('ao-a','ao-b')`);
  await db.query(`delete from addons where id = any($1)`, [made]);
  await db.end();
});

describe("the list, in ops", () => {
  test("only output/input keeps it; a capacity add-on needs its number", async () => {
    await expect(listAddons({ actorId: ids.olga })).rejects.toThrow(AccessError);
    await expect(saveAddon({ actorId: ids.olga, addon: gb })).rejects.toThrow(AccessError);
    await expect(saveAddon({ actorId: ids.help, addon: { ...gb, amount: null } })).rejects.toMatchObject({ issues: [{ path: ["amount"] }] });
    gbId = (await saveAddon({ actorId: ids.help, addon: gb })).id;
    quotesId = (await saveAddon({ actorId: ids.help, addon: quotes })).id;
    made.push(gbId, quotesId);
    expect((await listAddons({ actorId: ids.help })).filter((a) => made.includes(a.id)).map((a) => [a.name, a.sites])).toEqual([
      ["AO Another 10 GB", 0],
      ["AO Quotes", 0],
    ]);
  });
});

describe("a site adds them (test billing)", () => {
  test("an Owner adds a self-serve one; it's on straight away, and usage is measured against it", async () => {
    await setPlan({ actorId: ids.help, siteId: siteA, plan });
    await expect(addAddon({ actorId: ids.max, siteId: siteA, addonId: gbId })).rejects.toThrow(AccessError);
    await addAddon({ actorId: ids.olga, siteId: siteA, addonId: gbId });
    expect((await planView({ actorId: ids.olga, siteId: siteA })).withExtras?.limits.storageGb).toBe(15);
    const view = await siteAddonsView({ actorId: ids.olga, siteId: siteA });
    expect(view.addons.find((a) => a.id === gbId)?.has).toBe(true);
    expect(view.extra).toBe(1200);
    expect(await lines(ids.olga, siteA)).toContain("Olga added AO Another 10 GB to the plan");
  });

  test("an 'Ask us' one: the Owner asks, support adds it", async () => {
    await expect(addAddon({ actorId: ids.olga, siteId: siteA, addonId: quotesId })).rejects.toThrow("Ask us about this one");
    await askAboutAddon({ actorId: ids.olga, siteId: siteA, addonId: quotesId, note: "For commissions." });
    expect((await lines(ids.olga, siteA))[0]).toBe("Olga asked us about AO Quotes");
    await addAddon({ actorId: ids.help, siteId: siteA, addonId: quotesId });
    expect((await siteAddonsView({ actorId: ids.olga, siteId: siteA })).extra).toBe(3000);
  });

  test("its currency has to be the plan's", async () => {
    const nzd = (await saveAddon({ actorId: ids.help, addon: { ...gb, name: "AO NZ GB", currency: "NZD" } })).id;
    made.push(nzd);
    await expect(addAddon({ actorId: ids.help, siteId: siteA, addonId: nzd })).rejects.toThrow("priced in NZD");
    // …and an Owner isn't even offered it.
    expect((await siteAddonsView({ actorId: ids.olga, siteId: siteA })).addons.find((a) => a.id === nzd)).toBeUndefined();
  });

  test("taken off: gone from the limits; a used add-on can't leave the list, an unused one can", async () => {
    await expect(deleteAddon({ actorId: ids.help, id: gbId })).rejects.toThrow("1 site has this add-on");
    await removeAddon({ actorId: ids.olga, siteId: siteA, addonId: gbId });
    expect((await planView({ actorId: ids.olga, siteId: siteA })).withExtras?.limits.storageGb).toBe(5);
    expect(await lines(ids.olga, siteA)).toContain("Olga took AO Another 10 GB off the plan");
    expect((await getAddon({ actorId: ids.help, id: gbId }))?.sites).toBe(0);
  });
});

describe("billed through Stripe (a stand-in)", () => {
  const calls: Record<string, unknown[]> = { create: [], del: [], update: [], checkout: [], products: [] };
  const sub = { status: "active", siteId: "", items: [] as unknown[] };
  const stand = {
    products: { create: async (p: unknown) => (calls.products.push(p), { id: `prod_${calls.products.length}` }) },
    checkout: { sessions: { create: async (p: unknown) => (calls.checkout.push(p), { url: "https://checkout.stripe.test/s" }) } },
    subscriptionItems: {
      create: async (p: unknown) => (calls.create.push(p), { id: `si_addon_${calls.create.length}` }),
      del: async (id: string, p: unknown) => (calls.del.push([id, p]), {}),
      update: async (id: string, p: unknown) => (calls.update.push([id, p]), {}),
    },
    subscriptions: {
      retrieve: async (id: string) => ({ id, status: sub.status, customer: "cus_ao", metadata: { siteId: sub.siteId }, items: { data: sub.items }, default_payment_method: null }),
      update: async () => ({}),
    },
  } as unknown as Stripe;

  test("paying with an add-on already on: Checkout bills both; Stripe's answer tells the plan line from the add-on's", async () => {
    setBillingStripeForTests(stand);
    await setPlan({ actorId: ids.help, siteId: siteB, plan });
    await addAddon({ actorId: ids.pia, siteId: siteB, addonId: gbId }); // not paying yet: nothing billed
    expect(calls.create).toHaveLength(0);
    await startPaying({ actorId: ids.pia, siteId: siteB, returnTo: "https://admin.example.test/settings/plan" });
    const lineItems = (calls.checkout.at(-1) as { line_items: { price_data: { unit_amount: number; product?: string } }[] }).line_items;
    expect(lineItems.map((l) => l.price_data.unit_amount)).toEqual([18000, 1200]);
    const product = lineItems[1].price_data.product!;
    expect(product).toMatch(/^prod_/);

    sub.siteId = siteB;
    sub.items = [
      { id: "si_gb", current_period_end: 1893456000, price: { unit_amount: 1200, currency: "aud", product } },
      { id: "si_plan", current_period_end: 1893456000, price: { unit_amount: 18000, currency: "aud", product: "prod_plan" } },
    ];
    await syncSubscription("sub_ao");
    const [b] = (await db.query(`select price from billing where site_id = $1`, [siteB])).rows;
    expect(b.price).toBe(18000);
    const [row] = (await db.query(`select stripe_item_id from site_addons where site_id = $1`, [siteB])).rows;
    expect(row.stripe_item_id).toBe("si_gb");
  });

  test("added while paying: a new line, the part month on the next bill; taken off: credited", async () => {
    setBillingStripeForTests(stand);
    await addAddon({ actorId: ids.help, siteId: siteB, addonId: quotesId });
    expect(calls.create.at(-1)).toMatchObject({ subscription: "sub_ao", proration_behavior: "create_prorations", price_data: { unit_amount: 1800, currency: "aud", recurring: { interval: "month" } } });
    await removeAddon({ actorId: ids.pia, siteId: siteB, addonId: quotesId });
    expect(calls.del.at(-1)).toEqual(["si_addon_1", { proration_behavior: "create_prorations" }]);
  });

  test("a new price for an add-on reaches each paying site from its next bill", async () => {
    setBillingStripeForTests(stand);
    await saveAddon({ actorId: ids.help, id: gbId, addon: { ...gb, price: 1500 } });
    expect(calls.update.at(-1)).toMatchObject(["si_gb", { proration_behavior: "none", price_data: { unit_amount: 1500 } }]);
  });
});
