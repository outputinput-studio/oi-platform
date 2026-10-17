/**
 * Paying output/input for the plan (Stage 39b, Carl): an Owner sets up
 * payment; Stripe's events keep it in step; a price we change applies from
 * the next bill; the currency stays while they pay; a failed payment stops
 * nothing. Without O/I's Stripe key it's test billing. Stripe itself is a
 * stand-in here: what's tested is what we do with its answers.
 */
import { vi, beforeAll, afterAll, afterEach, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@billing.invalid";
});

import type Stripe from "stripe";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { FieldError } from "@/lib/form-error";
import { listActivity } from "@/modules/activity/server";
import { setPlan } from "@/modules/plans/server";
import { billingProvider, billingView, handleBillingEvent, setBillingStripeForTests, startPaying, syncSubscription } from "@/modules/billing/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ids = { owen: "test-bill-owen", mia: "test-bill-mia", help: "test-bill-help", bo: "test-bill-bo" };
const plan = { name: "Shop and journal", description: "", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: null } };
const returnTo = "https://admin.example.test/settings/plan";

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('bill-a','bill-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('bill-a','Bill A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('bill-b','Bill B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Owen','owen@billing.invalid',true,now()), ($2,'Mia','mia@billing.invalid',true,now()), ($3,'output/input','help@billing.invalid',true,now()), ($4,'Bo','bo@billing.invalid',true,now())`,
    [ids.owen, ids.mia, ids.help, ids.bo],
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'manager'), ($4,$5,'owner')`, [ids.owen, ids.mia, siteA, ids.bo, siteB]);
});

afterEach(() => setBillingStripeForTests(null));

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('bill-a','bill-b')`);
  await db.end();
});

describe("test billing (no O/I Stripe key, not production)", () => {
  test("nothing to pay until there's a priced plan", async () => {
    expect(billingProvider()).toBe("test");
    await expect(startPaying({ actorId: ids.owen, siteId: siteA, returnTo })).rejects.toThrow("We haven't set your plan yet");
    await setPlan({ actorId: ids.help, siteId: siteA, plan: { ...plan, price: 0 } });
    await expect(startPaying({ actorId: ids.owen, siteId: siteA, returnTo })).rejects.toThrow("doesn't cost anything");
  });

  test("only an Owner sets up payment, once; it starts at once with a pretend card", async () => {
    await setPlan({ actorId: ids.help, siteId: siteA, plan });
    await expect(startPaying({ actorId: ids.mia, siteId: siteA, returnTo })).rejects.toThrow(AccessError);
    await expect(billingView({ actorId: ids.mia, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(startPaying({ actorId: ids.bo, siteId: siteA, returnTo })).rejects.toThrow(AccessError);

    expect(await startPaying({ actorId: ids.owen, siteId: siteA, returnTo })).toEqual({ redirect: "/settings/plan?paid=1" });
    const { billing } = await billingView({ actorId: ids.owen, siteId: siteA });
    expect(billing).toMatchObject({ provider: "test", status: "active", price: 18000, currency: "AUD", cardLast4: "4242" });
    expect(billing!.renewsAt!.getTime()).toBeGreaterThan(Date.now() + 27 * 86400_000);
    await expect(startPaying({ actorId: ids.owen, siteId: siteA, returnTo })).rejects.toThrow("already paying");
    const lines = (await listActivity({ actorId: ids.owen, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines).toContain("Owen set up payment for the plan");
  });

  test("while they pay: a new price is their next bill; the currency can't change", async () => {
    await setPlan({ actorId: ids.help, siteId: siteA, plan: { ...plan, price: 20000 } });
    expect((await billingView({ actorId: ids.owen, siteId: siteA })).billing?.price).toBe(20000);
    const err = await setPlan({ actorId: ids.help, siteId: siteA, plan: { ...plan, currency: "NZD" } }).catch((e) => e);
    expect(err).toBeInstanceOf(FieldError);
    expect(err).toMatchObject({ field: "currency" });
    // Refused before saving: the plan is still in AUD.
    const [row] = (await db.query(`select plan->>'currency' as c from sites where id = $1`, [siteA])).rows;
    expect(row.c).toBe("AUD");
  });
});

describe("Stripe (O/I's own account; a stand-in here)", () => {
  type Sub = { status: string; siteId: string; price: number };
  const now: Sub = { status: "active", siteId: "", price: 18000 };
  const updates: unknown[] = [];
  const stand = {
    subscriptions: {
      retrieve: async (id: string) => ({
        id,
        status: now.status,
        customer: "cus_test",
        metadata: { siteId: now.siteId },
        items: { data: [{ id: "si_test", current_period_end: 1893456000, price: { unit_amount: now.price, currency: "aud", product: "prod_test" } }] },
        default_payment_method: { card: { brand: "mastercard", last4: "4417", exp_month: 9, exp_year: 2028 } },
      }),
      update: async (_id: string, params: unknown) => {
        updates.push(params);
        return {};
      },
    },
  } as unknown as Stripe;

  test("a subscription Stripe tells us about lands on its site, card and next bill included", async () => {
    setBillingStripeForTests(stand);
    await setPlan({ actorId: ids.help, siteId: siteB, plan });
    now.siteId = siteB;
    expect(await syncSubscription("sub_test")).toBe(siteB);
    const { billing } = await billingView({ actorId: ids.bo, siteId: siteB });
    expect(billing).toMatchObject({ provider: "stripe", status: "active", price: 18000, currency: "AUD", cardBrand: "mastercard", cardLast4: "4417", cardExpires: "09/28" });
    expect(billing!.renewsAt!.toISOString()).toBe("2030-01-01T00:00:00.000Z");
  });

  test("a failed payment: the event re-reads the subscription; nothing stops; Activity says so", async () => {
    setBillingStripeForTests(stand);
    now.status = "past_due";
    const event = { type: "invoice.payment_failed", data: { object: { parent: { subscription_details: { subscription: "sub_test" } } } } } as unknown as Stripe.Event;
    expect(await handleBillingEvent(event)).toBe(siteB);
    expect((await billingView({ actorId: ids.bo, siteId: siteB })).billing?.status).toBe("past_due");
    const lines = (await listActivity({ actorId: ids.bo, siteId: siteB })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines[0]).toBe("output/input couldn't take the plan's payment — Stripe will try again");
    now.status = "active";
  });

  test("a new price goes to Stripe for the next bill, with no part-charge", async () => {
    setBillingStripeForTests(stand);
    await setPlan({ actorId: ids.help, siteId: siteB, plan: { ...plan, price: 25000 } });
    expect(updates.at(-1)).toEqual({
      items: [{ id: "si_test", price_data: { currency: "aud", product: "prod_test", unit_amount: 25000, recurring: { interval: "month" } } }],
      proration_behavior: "none",
    });
    expect((await billingView({ actorId: ids.bo, siteId: siteB })).billing?.price).toBe(25000);
  });

  test("a subscription that isn't ours, or names no site, is ignored", async () => {
    setBillingStripeForTests(stand);
    now.siteId = "not-a-site";
    expect(await syncSubscription("sub_other")).toBeNull();
    now.siteId = "00000000-0000-4000-8000-000000000000";
    expect(await syncSubscription("sub_other")).toBeNull();
    const event = { type: "charge.refunded", data: { object: {} } } as unknown as Stripe.Event;
    expect(await handleBillingEvent(event)).toBeNull();
  });
});
