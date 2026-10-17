import Stripe from "stripe";
import { eq, inArray } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { addons, billing, siteAddons, sites, users, type AddonRow, type Billing } from "@/db/schema";
import { assertAccess } from "@/modules/auth/access";
import { logActivity } from "@/modules/activity/server";
import { readPlan, type Plan } from "@/modules/plans/plan";
import { env, environmentName } from "@/lib/env";
import { FieldError } from "@/lib/form-error";
import { cardExpiry, nextMonth, statusFromStripe, type BillingStatus } from "./billing";

/**
 * Paying output/input for the plan (Stage 39b). Through O/I's own Stripe
 * account (OI_BILLING_STRIPE_KEY) — never the client's: their keys are for
 * their customers. An Owner sets up payment on Settings · Plan, on Stripe's
 * own page; from then it's a monthly Stripe subscription. Stripe tells us
 * what happened through /api/billing/stripe, and we keep only what the
 * screens show (status, next bill, the card's brand and last four).
 *
 * Without O/I's key, outside production, "Set up payment" uses test
 * billing: it starts at once, with a pretend card, and nothing is charged.
 * In production without the key, it waits.
 */

export type Provider = "stripe" | "test";

let client: Stripe | null = null;
let standIn: Stripe | null = null;

/** O/I's own Stripe, or null when its key isn't set. */
export function billingStripe(): Stripe | null {
  if (standIn) return standIn;
  const key = env().OI_BILLING_STRIPE_KEY;
  if (!key) return null;
  if (!client) client = new Stripe(key);
  return client;
}

/** For the tests: a stand-in for Stripe (null puts the real one back). Never used by the app. */
export function setBillingStripeForTests(s: Stripe | null): void {
  standIn = s;
}

export function billingProvider(): Provider | null {
  if (standIn || env().OI_BILLING_STRIPE_KEY) return "stripe";
  return environmentName() === "production" ? null : "test";
}

async function billingRow(siteId: string): Promise<Billing | null> {
  const [b] = await withSite(siteId, (tx) => tx.select().from(billing).limit(1));
  return b ?? null;
}

async function sitePlan(siteId: string): Promise<{ name: string; plan: Plan | null }> {
  const [s] = await withSite(siteId, (tx) => tx.select({ name: sites.name, plan: sites.plan }).from(sites).limit(1));
  return { name: s?.name ?? "", plan: readPlan(s?.plan) };
}

/** Paying, or meant to be: a row that isn't stopped. */
const live = (b: Billing | null): b is Billing => !!b && b.status !== "canceled";

export type BillingView = {
  provider: Provider | null;
  billing: Pick<Billing, "provider" | "status" | "price" | "currency" | "renewsAt" | "cardBrand" | "cardLast4" | "cardExpires"> | null;
};

/** Settings · Plan, "Paying for it". Owners only. */
export async function billingView(p: { actorId: string; siteId: string }): Promise<BillingView> {
  await assertAccess(p.actorId, p.siteId, "owner");
  return { provider: billingProvider(), billing: pick(await billingRow(p.siteId)) };
}

/** Ops: the same, for output/input (the caller has checked it's support). */
export async function billingForOps(siteId: string): Promise<BillingView["billing"]> {
  return pick(await billingRow(siteId));
}

function pick(b: Billing | null): BillingView["billing"] {
  if (!b) return null;
  const { provider, status, price, currency, renewsAt, cardBrand, cardLast4, cardExpires } = b;
  return { provider, status, price, currency, renewsAt, cardBrand, cardLast4, cardExpires };
}

const NOT_YET = "Paying online isn't open yet. We'll let you know when it is.";
const STRIPE_DOWN = "Stripe didn't answer just now. Try again in a minute.";

/**
 * "Set up payment": the Owner goes to Stripe's page to add a card, and the
 * plan is billed monthly from today. Returns where to send them.
 * `returnTo` is Settings · Plan's own address on the admin host.
 */
export async function startPaying(p: { actorId: string; siteId: string; returnTo: string }): Promise<{ redirect: string }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const { plan } = await sitePlan(p.siteId);
  if (!plan) throw new Error("We haven't set your plan yet. Ask us and we'll set it up.");
  if (plan.price <= 0) throw new Error("Your plan doesn't cost anything, so there's nothing to pay.");
  const current = await billingRow(p.siteId);
  if (current && (current.status === "active" || current.status === "past_due")) throw new Error("You're already paying for your plan.");

  const provider = billingProvider();
  if (!provider) throw new Error(NOT_YET);

  if (provider === "test") {
    const now = new Date();
    const row = { provider: "test", status: "active" as BillingStatus, price: plan.price, currency: plan.currency, renewsAt: nextMonth(now), cardBrand: "visa", cardLast4: "4242", cardExpires: "12/34", customerId: null, subscriptionId: null, startedAt: now, updatedAt: now };
    await withSite(p.siteId, (tx) => tx.insert(billing).values({ siteId: p.siteId, ...row }).onConflictDoUpdate({ target: billing.siteId, set: row }));
    await logActivity(p.siteId, p.actorId, { action: "set up payment for the plan", href: "/settings/plan" });
    return { redirect: "/settings/plan?paid=1" };
  }

  const [actor] = await db.select({ email: users.email }).from(users).where(eq(users.id, p.actorId)).limit(1);
  const stripe = billingStripe()!;
  try {
    // Their add-ons ride along, each its own line on the same monthly bill.
    const extras = [];
    for (const a of await addonsOf(p.siteId)) {
      if (a.currency !== plan.currency || a.price <= 0) continue;
      extras.push({ quantity: 1, price_data: { currency: a.currency.toLowerCase(), unit_amount: a.price, recurring: { interval: "month" as const }, product: await addonProduct(a) } });
    }
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [
        {
          quantity: 1,
          price_data: { currency: plan.currency.toLowerCase(), unit_amount: plan.price, recurring: { interval: "month" }, product_data: { name: `output/input · ${plan.name}`.slice(0, 250) } },
        },
        ...extras,
      ],
      ...(current?.customerId ? { customer: current.customerId } : actor ? { customer_email: actor.email } : {}),
      client_reference_id: p.siteId,
      metadata: { siteId: p.siteId },
      subscription_data: { metadata: { siteId: p.siteId } },
      success_url: `${p.returnTo}?paid=1&session={CHECKOUT_SESSION_ID}`,
      cancel_url: p.returnTo,
    });
    if (!session.url) throw new Error(STRIPE_DOWN);
    return { redirect: session.url };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) throw new Error(STRIPE_DOWN);
    throw err;
  }
}

/**
 * Back from Stripe's page: ask Stripe what happened rather than waiting for
 * the webhook, so Settings · Plan is right straight away. The session has
 * to be this site's.
 */
export async function confirmPaying(p: { actorId: string; siteId: string; sessionId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const stripe = billingStripe();
  if (!stripe || !/^cs_[A-Za-z0-9_]+$/.test(p.sessionId)) return;
  const session = await stripe.checkout.sessions.retrieve(p.sessionId).catch(() => null);
  if (!session || session.metadata?.siteId !== p.siteId || !session.subscription) return;
  await syncSubscription(typeof session.subscription === "string" ? session.subscription : session.subscription.id);
}

/**
 * "Card and invoices": Stripe's own page for changing the card and
 * downloading past invoices. Returns its address.
 */
export async function manageBilling(p: { actorId: string; siteId: string; returnTo: string }): Promise<{ redirect: string }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const b = await billingRow(p.siteId);
  if (!b || b.provider === "test") throw new Error("Test billing has no card or invoices to show.");
  const stripe = billingStripe();
  if (!stripe || !b.customerId) throw new Error(NOT_YET);
  try {
    const portal = await stripe.billingPortal.sessions.create({ customer: b.customerId, return_url: p.returnTo });
    return { redirect: portal.url };
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) throw new Error(STRIPE_DOWN);
    throw err;
  }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Bring our row in step with the subscription as Stripe has it now. Every
 * webhook ends here: we fetch the subscription fresh rather than trusting
 * the event's copy, so events arriving out of order can't leave it wrong.
 * The site comes from the subscription's own metadata, which only we set.
 * Returns the site's id, or null when it isn't one of ours.
 */
export async function syncSubscription(subscriptionId: string): Promise<string | null> {
  const stripe = billingStripe();
  if (!stripe) return null;
  const sub = await stripe.subscriptions.retrieve(subscriptionId, { expand: ["default_payment_method"] });
  const siteId = sub.metadata?.siteId ?? "";
  if (!UUID.test(siteId)) return null;
  const [site] = await withSite(siteId, (tx) => tx.select({ id: sites.id }).from(sites).limit(1));
  if (!site) return null;

  // The plan is the line that isn't one of their add-ons; each add-on line is remembered against it.
  const extras = await addonsOf(siteId);
  const productOf = (i: Stripe.SubscriptionItem) => (typeof i.price.product === "string" ? i.price.product : i.price.product.id);
  const addonFor = (i: Stripe.SubscriptionItem) => extras.find((a) => a.stripeProductId && a.stripeProductId === productOf(i));
  const item = sub.items.data.find((i) => !addonFor(i)) ?? sub.items.data[0];
  for (const i of sub.items.data) {
    const a = addonFor(i);
    if (a) await withSite(siteId, (tx) => tx.update(siteAddons).set({ stripeItemId: i.id }).where(eq(siteAddons.addonId, a.id)));
  }
  const pm = sub.default_payment_method && typeof sub.default_payment_method !== "string" ? sub.default_payment_method : null;
  const status = statusFromStripe(sub.status);
  const row = {
    provider: "stripe",
    customerId: typeof sub.customer === "string" ? sub.customer : sub.customer.id,
    subscriptionId: sub.id,
    status,
    price: item?.price.unit_amount ?? 0,
    currency: (item?.price.currency ?? "aud").toUpperCase(),
    renewsAt: item?.current_period_end ? new Date(item.current_period_end * 1000) : null,
    ...(pm?.card ? { cardBrand: pm.card.brand, cardLast4: pm.card.last4, cardExpires: cardExpiry(pm.card.exp_month, pm.card.exp_year) } : {}),
    updatedAt: new Date(),
  };
  const before = await billingRow(siteId);
  await withSite(siteId, (tx) => tx.insert(billing).values({ siteId, ...row }).onConflictDoUpdate({ target: billing.siteId, set: row }));
  if (before?.status !== status) {
    const action =
      status === "active" ? (before?.status === "past_due" ? "took the plan's payment after it failed" : "started billing the plan monthly")
      : status === "past_due" ? "couldn't take the plan's payment — Stripe will try again"
      : status === "canceled" ? "stopped billing the plan"
      : null;
    if (action) await logActivity(siteId, null, { action, href: "/settings/plan" });
  }
  return siteId;
}

/** A webhook event from O/I's Stripe (already verified): which subscription it's about, synced. */
export async function handleBillingEvent(event: Stripe.Event): Promise<string | null> {
  const subId = subscriptionOf(event);
  return subId ? syncSubscription(subId) : null;
}

function subscriptionOf(event: Stripe.Event): string | null {
  const ref = (s: string | { id: string } | null | undefined) => (s ? (typeof s === "string" ? s : s.id) : null);
  switch (event.type) {
    case "checkout.session.completed":
      return event.data.object.mode === "subscription" ? ref(event.data.object.subscription) : null;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      return event.data.object.id;
    case "invoice.paid":
    case "invoice.payment_failed":
      return ref(event.data.object.parent?.subscription_details?.subscription);
    default:
      return null;
  }
}

/**
 * The plan changed in ops while the site is paying (Carl: from the next
 * bill — no part-charges). Stripe can't change a subscription's currency,
 * so that's refused while they pay. Runs before the plan is saved.
 */
export async function checkPlanChange(siteId: string, plan: Plan): Promise<void> {
  const b = await billingRow(siteId);
  if (!live(b)) return;
  if (b.currency !== plan.currency) {
    throw new FieldError("currency", `They pay in ${b.currency}, and Stripe can't change that while they're paying. Keep ${b.currency}.`);
  }
}

/** After the plan is saved: the next bill is the new price. */
export async function applyPlanPrice(siteId: string, plan: Plan): Promise<void> {
  const b = await billingRow(siteId);
  if (!live(b) || b.price === plan.price) return;
  if (b.provider === "stripe" && b.subscriptionId) {
    const stripe = billingStripe();
    if (!stripe) throw new Error("O/I's Stripe key isn't set, so their bill can't change. The plan is saved; their bill stays as it was.");
    const sub = await stripe.subscriptions.retrieve(b.subscriptionId);
    const theirs = new Set((await addonsOf(siteId)).map((a) => a.stripeProductId).filter(Boolean));
    const item = sub.items.data.find((i) => !theirs.has(typeof i.price.product === "string" ? i.price.product : i.price.product.id));
    if (!item) return;
    const product = typeof item.price.product === "string" ? item.price.product : item.price.product.id;
    await stripe.subscriptions.update(b.subscriptionId, {
      items: [{ id: item.id, price_data: { currency: b.currency.toLowerCase(), product, unit_amount: plan.price, recurring: { interval: "month" } } }],
      proration_behavior: "none",
    });
  }
  await withSite(siteId, (tx) => tx.update(billing).set({ price: plan.price, updatedAt: new Date() }).where(eq(billing.siteId, siteId)));
}

/** A site's add-ons, as our list has them. */
async function addonsOf(siteId: string): Promise<AddonRow[]> {
  const ids = (await withSite(siteId, (tx) => tx.select({ id: siteAddons.addonId }).from(siteAddons))).map((r) => r.id);
  return ids.length ? db.select().from(addons).where(inArray(addons.id, ids)) : [];
}

/** The add-on's product in O/I's Stripe, made the first time someone pays for it. */
async function addonProduct(a: AddonRow): Promise<string> {
  if (a.stripeProductId) return a.stripeProductId;
  const product = await billingStripe()!.products.create({ name: `output/input · ${a.name}`.slice(0, 250), metadata: { addonId: a.id } });
  await db.update(addons).set({ stripeProductId: product.id }).where(eq(addons.id, a.id));
  a.stripeProductId = product.id;
  return product.id;
}

/**
 * An add-on joins a site that's paying (Carl: on straight away, the part
 * month on the next bill). Its currency has to be the bill's. Returns the
 * new line's id on their subscription, or null when nothing's billed yet
 * (not paying, or test billing) — it joins the bill when they set up payment.
 */
export async function billAddon(siteId: string, a: AddonRow): Promise<string | null> {
  const b = await billingRow(siteId);
  if (!live(b)) return null;
  if (b.currency !== a.currency) throw new Error(`This add-on is priced in ${a.currency} and your plan is billed in ${b.currency}. Ask us and we'll sort it.`);
  if (b.provider !== "stripe" || !b.subscriptionId || a.price <= 0) return null;
  const stripe = billingStripe();
  if (!stripe) throw new Error(NOT_YET);
  try {
    const item = await stripe.subscriptionItems.create({
      subscription: b.subscriptionId,
      quantity: 1,
      price_data: { currency: a.currency.toLowerCase(), product: await addonProduct(a), unit_amount: a.price, recurring: { interval: "month" } },
      proration_behavior: "create_prorations",
      metadata: { siteId, addonId: a.id },
    });
    return item.id;
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) throw new Error(STRIPE_DOWN);
    throw err;
  }
}

/** An add-on taken off: its line leaves the bill, the unused part credited on the next one. */
export async function unbillAddon(itemId: string | null): Promise<void> {
  const stripe = billingStripe();
  if (!itemId || !stripe) return;
  try {
    await stripe.subscriptionItems.del(itemId, { proration_behavior: "create_prorations" });
  } catch (err) {
    if (err instanceof Stripe.errors.StripeError) throw new Error(STRIPE_DOWN);
    throw err;
  }
}

/** We changed an add-on's price: from each paying site's next bill, like a plan. */
export async function repriceAddon(siteId: string, itemId: string | null, a: AddonRow): Promise<void> {
  const stripe = billingStripe();
  const b = await billingRow(siteId);
  if (!itemId || !stripe || !live(b) || b.provider !== "stripe") return;
  await stripe.subscriptionItems.update(itemId, {
    price_data: { currency: a.currency.toLowerCase(), product: await addonProduct(a), unit_amount: a.price, recurring: { interval: "month" } },
    proration_behavior: "none",
  });
}

/** Whether the site's bill is live, and in what currency — for add-ons to check before they're added. */
export async function billedIn(siteId: string): Promise<string | null> {
  const b = await billingRow(siteId);
  return live(b) ? b.currency : null;
}
