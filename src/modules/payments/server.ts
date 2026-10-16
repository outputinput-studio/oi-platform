import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withSite } from "@/db/client";
import { sites, type Site } from "@/db/schema";
import { assertAccess } from "@/modules/auth/access";
import { env, environmentName } from "@/lib/env";
import { readPayments, type PaymentsSettings, type Provider } from "./settings";

/**
 * Taking payments. Output/Input has one Stripe platform account (Connect);
 * each client connects their own Stripe account to it, and their
 * customers pay that account directly — the money never passes through
 * us. Outside production with no Stripe keys, a test provider stands in
 * so checkout can be tried end to end on staging and in CI.
 */

let client: Stripe | null = null;
export function stripe(): Stripe {
  const key = env().STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe isn't set up for this environment.");
  client ??= new Stripe(key);
  return client;
}

/** Stripe when the platform keys are set; test payments outside production when they aren't; otherwise none. */
export function platformProvider(): Provider | null {
  if (env().STRIPE_SECRET_KEY) return "stripe";
  return environmentName() === "production" ? null : "test";
}

export type PaymentsStatus = PaymentsSettings & {
  provider: Provider | null;
  /** Whether Add to cart shows and checkout works. */
  ready: boolean;
};

export function paymentsStatus(site: Pick<Site, "payments">): PaymentsStatus {
  const s = readPayments(site.payments);
  const provider = platformProvider();
  const ready = provider === "test" || (provider === "stripe" && !!s.stripeAccountId && s.chargesEnabled);
  return { ...s, provider, ready };
}

/**
 * "Connect Stripe": make (or reuse) the site's Stripe account and hand
 * back the address of Stripe's own onboarding, which returns to us when
 * done. Owners only: it decides where the money goes.
 */
export async function startStripeConnect(p: { actorId: string; siteId: string; returnUrl: string; refreshUrl: string }): Promise<string> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const s = stripe();
  const site = await loadSite(p.siteId);
  let current = readPayments(site.payments);
  if (!current.stripeAccountId) {
    const account = await s.accounts.create({ type: "standard", metadata: { siteId: p.siteId } });
    current = { ...current, stripeAccountId: account.id };
    await save(p.siteId, current);
  }
  const link = await s.accountLinks.create({ account: current.stripeAccountId, type: "account_onboarding", return_url: p.returnUrl, refresh_url: p.refreshUrl });
  return link.url;
}

/** Ask Stripe how the account stands now (after onboarding, or any time the Payments screen opens). */
export async function refreshStripeAccount(p: { actorId: string; siteId: string }): Promise<PaymentsSettings> {
  await assertAccess(p.actorId, p.siteId);
  const site = await loadSite(p.siteId);
  const current = readPayments(site.payments);
  if (!current.stripeAccountId || platformProvider() !== "stripe") return current;
  const a = await stripe().accounts.retrieve(current.stripeAccountId);
  const bank = a.external_accounts?.data.find((x) => x.object === "bank_account") as Stripe.BankAccount | undefined;
  const next: PaymentsSettings = {
    stripeAccountId: a.id,
    chargesEnabled: !!a.charges_enabled,
    detailsSubmitted: !!a.details_submitted,
    livemode: env().STRIPE_SECRET_KEY?.startsWith("sk_live_") ?? false,
    businessName: a.business_profile?.name || a.settings?.dashboard?.display_name || "",
    bankLast4: bank?.last4 ?? "",
  };
  await save(p.siteId, next);
  return next;
}

/** Forget the Stripe account here. Nothing can be bought until it's connected again. Owners only. */
export async function disconnectStripe(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  await save(p.siteId, readPayments({}));
}

async function loadSite(siteId: string): Promise<Site> {
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1));
  if (!site) throw new Error("That site doesn't exist.");
  return site;
}

async function save(siteId: string, s: PaymentsSettings) {
  await withSite(siteId, (tx) => tx.update(sites).set({ payments: s }).where(eq(sites.id, siteId)));
}
