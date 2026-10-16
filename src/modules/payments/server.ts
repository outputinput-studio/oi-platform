import Stripe from "stripe";
import { eq } from "drizzle-orm";
import { withSite } from "@/db/client";
import { sites, type Site } from "@/db/schema";
import { assertAccess } from "@/modules/auth/access";
import { environmentName } from "@/lib/env";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { readPayments, secretKeySchema, webhookSecretSchema, type PaymentsSettings, type Provider } from "./settings";
import { named } from "@/lib/form-error";

/**
 * Taking payments: each client uses their own Stripe account. They put
 * their own keys in (Settings · Payments); customers pay that account
 * directly and the client handles everything else in their own Stripe
 * dashboard. Output/Input has no Stripe account in the middle.
 *
 * Outside production, a site with no keys uses a test provider instead,
 * so checkout can be tried end to end on staging and in CI.
 */

const clients = new Map<string, Stripe>();

/** A Stripe client for this site's own account. */
export function siteStripe(site: Pick<Site, "payments">): Stripe {
  const s = readPayments(site.payments);
  if (!s.secretKey) throw new Error("This site hasn't put its Stripe keys in yet.");
  const key = decryptSecret(s.secretKey);
  let c = clients.get(key);
  if (!c) {
    c = new Stripe(key);
    clients.set(key, c);
  }
  return c;
}

/** The site's webhook signing secret, if it has one. */
export function siteWebhookSecret(site: Pick<Site, "payments">): string | null {
  const s = readPayments(site.payments);
  return s.webhookSecret ? decryptSecret(s.webhookSecret) : null;
}

export type PaymentsStatus = Omit<PaymentsSettings, "secretKey" | "webhookSecret"> & {
  provider: Provider | null;
  /** Whether Add to cart shows and checkout works. */
  ready: boolean;
  hasKeys: boolean;
  hasWebhook: boolean;
};

export function paymentsStatus(site: Pick<Site, "payments">): PaymentsStatus {
  const { secretKey, webhookSecret, ...rest } = readPayments(site.payments);
  const hasKeys = !!secretKey;
  const provider: Provider | null = hasKeys ? "stripe" : environmentName() === "production" ? null : "test";
  const ready = provider === "test" || (provider === "stripe" && rest.chargesEnabled);
  return { ...rest, provider, ready, hasKeys, hasWebhook: !!webhookSecret };
}

export type AccountCheck = { accountId: string; businessName: string; chargesEnabled: boolean };

/** Ask Stripe who a key belongs to and whether it can take money. A restricted key without account access still counts if it can read the balance. */
export async function checkStripeKey(secretKey: string): Promise<AccountCheck> {
  const s = new Stripe(secretKey);
  try {
    const a = await s.accounts.retrieveCurrent();
    return { accountId: a.id, businessName: a.business_profile?.name || a.settings?.dashboard?.display_name || "", chargesEnabled: !!a.charges_enabled };
  } catch (err) {
    const e = err as { type?: string; statusCode?: number };
    if (e.type === "StripeAuthenticationError" || e.statusCode === 401) throw new Error("Stripe didn't accept that key. Check you copied all of it.");
    // Restricted keys may not read the account; if they can read the balance, they work.
    await s.balance.retrieve().catch(() => {
      throw new Error("That key can't take payments. Give it the permissions listed on this screen.");
    });
    return { accountId: "", businessName: "", chargesEnabled: true };
  }
}

/**
 * Save the site's own Stripe keys (owners only: it decides where the
 * money goes). The key is checked with Stripe first, then stored
 * encrypted. A blank webhook secret keeps the one already saved.
 */
export async function saveStripeKeys(p: { actorId: string; siteId: string; secretKey: string; webhookSecret?: string; check?: (key: string) => Promise<AccountCheck> }): Promise<PaymentsStatus> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const key = named("secretKey", secretKeySchema, p.secretKey);
  const hook = named("webhookSecret", webhookSecretSchema, p.webhookSecret ?? "");
  const account = await (p.check ?? checkStripeKey)(key);
  const site = await loadSite(p.siteId);
  const cur = readPayments(site.payments);
  const next: PaymentsSettings = {
    secretKey: encryptSecret(key),
    webhookSecret: hook ? encryptSecret(hook) : cur.webhookSecret,
    keyLast4: key.slice(-4),
    livemode: key.includes("_live_"),
    ...account,
  };
  await save(p.siteId, next);
  return paymentsStatus({ payments: next });
}

/** Ask Stripe again how the account stands (after the client finishes Stripe's own set-up). */
export async function refreshStripeAccount(p: { actorId: string; siteId: string }): Promise<PaymentsStatus> {
  await assertAccess(p.actorId, p.siteId);
  const site = await loadSite(p.siteId);
  const cur = readPayments(site.payments);
  if (!cur.secretKey) return paymentsStatus(site);
  const account = await checkStripeKey(decryptSecret(cur.secretKey));
  const next = { ...cur, ...account };
  await save(p.siteId, next);
  return paymentsStatus({ payments: next });
}

/** Take the keys out. Nothing can be bought until new ones go in. Owners only. */
export async function removeStripeKeys(p: { actorId: string; siteId: string }): Promise<void> {
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
