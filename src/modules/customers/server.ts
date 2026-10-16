import { and, desc, eq, gt, gte, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { customerAddresses, customerCodes, customerSessions, customers, orders, products, waiting, type Customer, type CustomerAddress, type Order, type Site } from "@/db/schema";
import { env, environmentName } from "@/lib/env";
import { emailDelivery, sendEmail } from "@/lib/email";
import { FieldError, named } from "@/lib/form-error";
import { senderFor, tradingName } from "@/modules/sites/business";
import { addressSchema } from "@/modules/orders/server";
import { fillOptions, readOptions } from "@/modules/products/options";
import { readAccountSettings } from "./settings";
import { CODE_MINUTES, SESSION_DAYS, codeHash, hashPassword, newCode, newToken, requesterHash, sameHex, tokenHash, verifyPassword } from "./secrets";
import { clearThrottle, lockedFor, miss } from "./throttle";

/**
 * Customer accounts on the storefront (design/storefront-accounts.html).
 *
 * There's no sign-up form: someone types their email, we email a six-digit
 * code, and the first time a code works the email becomes their account.
 * A password is optional, and only where the site allows them; a code
 * always works, so there's nothing to reset. Signed in means a random
 * token in a cookie on the shop's own address for 30 days.
 *
 * Every function runs inside withSite(): accounts, codes and sessions are
 * one site's own, and a customer of two shops has two accounts that know
 * nothing of each other. "Authorising first" here means the session: the
 * account functions take the customer the session resolved to, never an
 * id the browser sent.
 */

export const CUSTOMER_COOKIE = "oi_account";
/** How soon another code may be asked for. */
export const RESEND_SECONDS = 30;
/** Codes to one email in an hour, and from one connection in an hour. */
const CODES_PER_EMAIL = 5;
const CODES_PER_REQUESTER = 10;
const VISIBLE = ["paid", "refunded"] as const;
const MAX_ADDRESSES = 10;

export const emailSchema = z.string().trim().toLowerCase().email("That email address doesn't look right.").max(200);
const nameSchema = z.string().trim().max(120);
const phoneSchema = z.string().trim().max(40);
export const passwordSchema = z.string().min(8, "Eight characters or more.").max(200, "That's a very long password. 200 characters at most.");
const codeSchema = z.string().trim().regex(/^\d{6}$/, "Codes are six digits.");

type SiteLike = Pick<Site, "id" | "name" | "business" | "messages" | "accounts">;

function settingsOf(site: Pick<Site, "accounts">) {
  return readAccountSettings(site.accounts);
}

function assertOn(site: Pick<Site, "accounts">) {
  if (!settingsOf(site).enabled) throw new Error("Accounts aren't on for this shop.");
}

const secret = () => env().BETTER_AUTH_SECRET;

// ───────────────────────── codes ─────────────────────────

export type Purpose = "signIn" | "email";
export type SendResult = { ok: true; resendIn: number; devCode?: string } | { ok: false; why: "locked" | "resend" | "busy"; wait: number };

/** What's being guessed at, for the throttle: signing in as an email, or proving a new one for an account. */
function lockKey(purpose: Purpose, email: string, customerId?: string) {
  return purpose === "email" ? `email:${customerId}` : `signIn:${email}`;
}

/**
 * Email a code. Refused (with how long to wait) while the email is locked
 * out, within 30 seconds of the last one, or when too many have gone to
 * this email or from this connection in the last hour. Any older code
 * stops working: the newest one is the one that works.
 */
export async function sendCode(p: { site: SiteLike; email: string; purpose?: Purpose; customerId?: string; requester?: string; now?: Date }): Promise<SendResult> {
  assertOn(p.site);
  const purpose = p.purpose ?? "signIn";
  const email = named("email", emailSchema, p.email);
  const now = p.now ?? new Date();
  const hour = new Date(now.getTime() - 60 * 60 * 1000);
  const requester = requesterHash(secret(), p.requester ?? "");
  const code = newCode();
  const r = await withSite(p.site.id, async (tx): Promise<SendResult> => {
    const locked = await lockedFor(tx, lockKey(purpose, email, p.customerId), now);
    if (locked) return { ok: false, why: "locked", wait: locked };
    const recent = await tx
      .select({ createdAt: customerCodes.createdAt })
      .from(customerCodes)
      .where(and(eq(customerCodes.email, email), gte(customerCodes.createdAt, hour)))
      .orderBy(desc(customerCodes.createdAt));
    const last = recent[0]?.createdAt;
    if (last && now.getTime() - last.getTime() < RESEND_SECONDS * 1000) return { ok: false, why: "resend", wait: Math.ceil(RESEND_SECONDS - (now.getTime() - last.getTime()) / 1000) };
    if (recent.length >= CODES_PER_EMAIL) return { ok: false, why: "busy", wait: Math.ceil((recent[recent.length - 1].createdAt.getTime() + 3600_000 - now.getTime()) / 1000) };
    if (requester) {
      const [{ n }] = await tx
        .select({ n: sql<number>`count(*)::int` })
        .from(customerCodes)
        .where(and(eq(customerCodes.requester, requester), gte(customerCodes.createdAt, hour)));
      if (n >= CODES_PER_REQUESTER) return { ok: false, why: "busy", wait: 15 * 60 };
    }
    await tx
      .update(customerCodes)
      .set({ usedAt: now })
      .where(and(eq(customerCodes.email, email), eq(customerCodes.purpose, purpose), isNull(customerCodes.usedAt)));
    await tx.insert(customerCodes).values({
      siteId: p.site.id,
      email,
      purpose,
      customerId: p.customerId ?? null,
      codeHash: codeHash(secret(), p.site.id, email, code),
      requester,
      expiresAt: new Date(now.getTime() + CODE_MINUTES * 60_000),
      createdAt: now,
    });
    return { ok: true, resendIn: RESEND_SECONDS };
  });
  if (!r.ok) return r;
  const shop = tradingName(p.site);
  // From the shop's own name, replying to the shop — but never copied to the shop: a code is only for the customer.
  await sendEmail({
    to: email,
    subject: `${code} is your code for ${shop}`,
    text:
      purpose === "email"
        ? `Your code is ${code}. Type it in to make ${email} the email on your ${shop} account. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, ignore this email: nothing changes.`
        : `Your code is ${code}. It works for ${CODE_MINUTES} minutes.\n\nIf you didn't ask for it, ignore this email: nobody can sign in without it.`,
    ...senderFor(p.site),
  });
  // Outside production with no email provider, the code is shown on screen: that's how staging and CI sign in.
  const devCode = environmentName() !== "production" && emailDelivery() === "console" ? code : undefined;
  return { ok: true, resendIn: RESEND_SECONDS, ...(devCode ? { devCode } : {}) };
}

export type CheckResult = { ok: true } | { ok: false; why: "wrong" | "expired" | "locked"; wait?: number };

/** Is this the newest code sent to this email, still in date? Five wrong tries lock it out. */
async function checkCode(tx: Tx, p: { siteId: string; email: string; code: string; purpose: Purpose; customerId?: string; now: Date }): Promise<CheckResult> {
  const key = lockKey(p.purpose, p.email, p.customerId);
  const locked = await lockedFor(tx, key, p.now);
  if (locked) return { ok: false, why: "locked", wait: locked };
  const [c] = await tx
    .select()
    .from(customerCodes)
    .where(and(eq(customerCodes.email, p.email), eq(customerCodes.purpose, p.purpose), isNull(customerCodes.usedAt), ...(p.customerId ? [eq(customerCodes.customerId, p.customerId)] : [])))
    .orderBy(desc(customerCodes.createdAt))
    .limit(1);
  if (!c || c.expiresAt <= p.now) return { ok: false, why: "expired" };
  if (!sameHex(c.codeHash, codeHash(secret(), p.siteId, p.email, p.code))) {
    await tx.update(customerCodes).set({ attempts: c.attempts + 1 }).where(eq(customerCodes.id, c.id));
    const wait = await miss(tx, p.siteId, key, p.now);
    if (wait) {
      // Locked out: this code is finished; a new one after the wait.
      await tx.update(customerCodes).set({ usedAt: p.now }).where(eq(customerCodes.id, c.id));
      return { ok: false, why: "locked", wait };
    }
    return { ok: false, why: "wrong" };
  }
  await tx.update(customerCodes).set({ usedAt: p.now }).where(eq(customerCodes.id, c.id));
  await clearThrottle(tx, key);
  return { ok: true };
}

// ───────────────────────── signing in ─────────────────────────

export type SignedIn = { ok: true; token: string; customer: Customer };
export type SignInFailed = { ok: false; why: "wrong" | "expired" | "locked"; wait?: number };

/**
 * The first step: an email. Where passwords are allowed and this person
 * set one, they're asked for it; otherwise a code goes out.
 */
export async function beginSignIn(p: { site: SiteLike; email: string; requester?: string; now?: Date }): Promise<{ step: "password"; email: string } | { step: "code"; email: string; sent: SendResult }> {
  assertOn(p.site);
  const email = named("email", emailSchema, p.email);
  if (settingsOf(p.site).passwords) {
    const [c] = await withSite(p.site.id, (tx) => tx.select({ hash: customers.passwordHash }).from(customers).where(eq(customers.email, email)).limit(1));
    if (c?.hash) return { step: "password", email };
  }
  return { step: "code", email, sent: await sendCode({ site: p.site, email, requester: p.requester, now: p.now }) };
}

/** A code typed in: right, and the email is an account (made now if it's new) and this browser is signed in. */
export async function signInWithCode(p: { site: SiteLike; email: string; code: string; now?: Date }): Promise<SignedIn | SignInFailed> {
  assertOn(p.site);
  const email = named("email", emailSchema, p.email);
  const code = named("code", codeSchema, p.code);
  const now = p.now ?? new Date();
  return withSite(p.site.id, async (tx) => {
    const r = await checkCode(tx, { siteId: p.site.id, email, code, purpose: "signIn", now });
    if (!r.ok) return r;
    const customer = await accountFor(tx, p.site.id, email);
    return { ok: true as const, token: await startSession(tx, p.site.id, customer.id, now), customer };
  });
}

export async function signInWithPassword(p: { site: SiteLike; email: string; password: string; now?: Date }): Promise<SignedIn | SignInFailed> {
  assertOn(p.site);
  if (!settingsOf(p.site).passwords) throw new Error("This shop signs people in with a code.");
  const email = named("email", emailSchema, p.email);
  const password = String(p.password ?? "").slice(0, 200);
  const now = p.now ?? new Date();
  return withSite(p.site.id, async (tx) => {
    const key = lockKey("signIn", email);
    const locked = await lockedFor(tx, key, now);
    if (locked) return { ok: false as const, why: "locked" as const, wait: locked };
    const [c] = await tx.select().from(customers).where(eq(customers.email, email)).limit(1);
    if (!c?.passwordHash || !(await verifyPassword(password, c.passwordHash))) {
      const wait = await miss(tx, p.site.id, key, now);
      return wait ? { ok: false as const, why: "locked" as const, wait } : { ok: false as const, why: "wrong" as const };
    }
    await clearThrottle(tx, key);
    await linkOrders(tx, c);
    return { ok: true as const, token: await startSession(tx, p.site.id, c.id, now), customer: c };
  });
}

/** The account for an email, made the first time. A new account takes its name and phone from their latest order. */
async function accountFor(tx: Tx, siteId: string, email: string): Promise<Customer> {
  const [existing] = await tx.select().from(customers).where(eq(customers.email, email)).limit(1);
  let c = existing;
  if (!c) {
    const [last] = await tx
      .select({ name: orders.name, phone: orders.phone })
      .from(orders)
      .where(and(sql`lower(${orders.email}) = ${email}`, inArray(orders.paymentStatus, [...VISIBLE])))
      .orderBy(desc(orders.createdAt))
      .limit(1);
    [c] = await tx
      .insert(customers)
      .values({ siteId, email, name: last?.name ?? "", phone: last?.phone ?? "" })
      .onConflictDoNothing()
      .returning();
    if (!c) [c] = await tx.select().from(customers).where(eq(customers.email, email)).limit(1);
  }
  await linkOrders(tx, c);
  return c;
}

/** Orders placed with this email (as a guest, before the account, or since) become the account's. */
async function linkOrders(tx: Tx, c: Pick<Customer, "id" | "email">) {
  await tx
    .update(orders)
    .set({ customerId: c.id })
    .where(and(isNull(orders.customerId), sql`lower(${orders.email}) = ${c.email}`));
}

async function startSession(tx: Tx, siteId: string, customerId: string, now: Date): Promise<string> {
  const token = newToken();
  // Expired sessions for this person go as a new one starts.
  await tx.delete(customerSessions).where(and(eq(customerSessions.customerId, customerId), sql`${customerSessions.expiresAt} <= ${now}`));
  await tx.insert(customerSessions).values({ siteId, customerId, tokenHash: tokenHash(token), expiresAt: new Date(now.getTime() + SESSION_DAYS * 86_400_000), createdAt: now });
  return token;
}

/** Who this cookie belongs to, if anyone — and only while the shop has accounts on. */
export async function currentCustomer(p: { site: Pick<Site, "id" | "accounts">; token: string | undefined; now?: Date }): Promise<Customer | null> {
  if (!p.token || p.token.length > 100 || !settingsOf(p.site).enabled) return null;
  const now = p.now ?? new Date();
  const [row] = await withSite(p.site.id, (tx) =>
    tx
      .select({ customer: customers })
      .from(customerSessions)
      .innerJoin(customers, eq(customers.id, customerSessions.customerId))
      .where(and(eq(customerSessions.tokenHash, tokenHash(p.token!)), gt(customerSessions.expiresAt, now)))
      .limit(1),
  );
  return row?.customer ?? null;
}

export async function signOut(p: { siteId: string; token: string | undefined }): Promise<void> {
  if (!p.token || p.token.length > 100) return;
  await withSite(p.siteId, (tx) => tx.delete(customerSessions).where(eq(customerSessions.tokenHash, tokenHash(p.token!))));
}

// ───────────────────────── their details ─────────────────────────

export async function updateDetails(p: { siteId: string; customer: Customer; name: string; phone: string }): Promise<Customer> {
  const name = named("name", nameSchema, p.name);
  const phone = named("phone", phoneSchema, p.phone);
  const [c] = await withSite(p.siteId, (tx) => tx.update(customers).set({ name, phone, updatedAt: new Date() }).where(eq(customers.id, p.customer.id)).returning());
  return c;
}

/** A new email starts with a code to it: it changes only once they've typed the code in. */
export async function startEmailChange(p: { site: SiteLike; customer: Customer; email: string; requester?: string; now?: Date }): Promise<SendResult> {
  const email = named("email", emailSchema, p.email);
  if (email === p.customer.email) throw new FieldError("email", "That's already the email on your account.");
  return sendCode({ site: p.site, email, purpose: "email", customerId: p.customer.id, requester: p.requester, now: p.now });
}

export async function finishEmailChange(p: { site: SiteLike; customer: Customer; email: string; code: string; now?: Date }): Promise<{ ok: true; customer: Customer } | SignInFailed> {
  const email = named("email", emailSchema, p.email);
  const code = named("code", codeSchema, p.code);
  const now = p.now ?? new Date();
  return withSite(p.site.id, async (tx) => {
    const r = await checkCode(tx, { siteId: p.site.id, email, code, purpose: "email", customerId: p.customer.id, now });
    if (!r.ok) return r;
    // Only someone who owns the new address gets this far, so saying it's taken tells nobody anything new.
    const [taken] = await tx.select({ id: customers.id }).from(customers).where(and(eq(customers.email, email), ne(customers.id, p.customer.id))).limit(1);
    if (taken) throw new FieldError("email", "That email already has its own account here. Sign in with it instead.");
    const [c] = await tx.update(customers).set({ email, updatedAt: now }).where(eq(customers.id, p.customer.id)).returning();
    await linkOrders(tx, c);
    return { ok: true as const, customer: c };
  });
}

/** Set or change a password (where the shop allows them). Codes keep working either way. */
export async function setPassword(p: { site: Pick<Site, "id" | "accounts">; customer: Customer; password: string }): Promise<void> {
  if (!settingsOf(p.site).passwords) throw new Error("This shop signs people in with a code.");
  const password = named("password", passwordSchema, p.password);
  const hash = await hashPassword(password);
  await withSite(p.site.id, (tx) => tx.update(customers).set({ passwordHash: hash, updatedAt: new Date() }).where(eq(customers.id, p.customer.id)));
}

// ───────────────────────── addresses ─────────────────────────

export const savedAddressSchema = addressSchema.extend({
  label: z.string().trim().max(40).default(""),
  name: z.string().trim().min(1, "Who's it for?").max(120),
});
export type SavedAddressInput = z.input<typeof savedAddressSchema>;

export async function listAddresses(p: { siteId: string; customer: Customer }): Promise<CustomerAddress[]> {
  return withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(customerAddresses)
      .where(and(eq(customerAddresses.customerId, p.customer.id), isNull(customerAddresses.deletedAt)))
      .orderBy(desc(customerAddresses.isDefault), desc(customerAddresses.createdAt)),
  );
}

/** Add one (no id) or change one of theirs. The first one they keep is the default. */
export async function saveAddress(p: { siteId: string; customer: Customer; id?: string; input: unknown }): Promise<CustomerAddress> {
  const a = savedAddressSchema.parse(p.input);
  const { label, name, ...address } = a;
  return withSite(p.siteId, async (tx) => {
    const mine = await tx.select({ id: customerAddresses.id }).from(customerAddresses).where(and(eq(customerAddresses.customerId, p.customer.id), isNull(customerAddresses.deletedAt)));
    if (p.id) {
      if (!mine.some((m) => m.id === p.id)) throw new Error("That address isn't on your account.");
      const [row] = await tx.update(customerAddresses).set({ label, name, address, updatedAt: new Date() }).where(eq(customerAddresses.id, p.id)).returning();
      return row;
    }
    if (mine.length >= MAX_ADDRESSES) throw new Error(`${MAX_ADDRESSES} addresses at most. Delete one you don't use first.`);
    const [row] = await tx.insert(customerAddresses).values({ siteId: p.siteId, customerId: p.customer.id, label, name, address, isDefault: mine.length === 0 }).returning();
    return row;
  });
}

export async function makeDefaultAddress(p: { siteId: string; customer: Customer; id: string }): Promise<void> {
  await withSite(p.siteId, async (tx) => {
    const [a] = await tx.select({ id: customerAddresses.id }).from(customerAddresses).where(and(eq(customerAddresses.id, p.id), eq(customerAddresses.customerId, p.customer.id), isNull(customerAddresses.deletedAt))).limit(1);
    if (!a) throw new Error("That address isn't on your account.");
    await tx.update(customerAddresses).set({ isDefault: sql`${customerAddresses.id} = ${a.id}` }).where(eq(customerAddresses.customerId, p.customer.id));
  });
}

/** Deleted (kept out of sight). If it was the default, the newest one left takes over. */
export async function deleteAddress(p: { siteId: string; customer: Customer; id: string }): Promise<void> {
  await withSite(p.siteId, async (tx) => {
    const [a] = await tx
      .update(customerAddresses)
      .set({ deletedAt: new Date(), isDefault: false })
      .where(and(eq(customerAddresses.id, p.id), eq(customerAddresses.customerId, p.customer.id), isNull(customerAddresses.deletedAt)))
      .returning();
    if (!a) throw new Error("That address isn't on your account.");
    const left = await tx.select().from(customerAddresses).where(and(eq(customerAddresses.customerId, p.customer.id), isNull(customerAddresses.deletedAt))).orderBy(desc(customerAddresses.createdAt));
    if (left.length && !left.some((l) => l.isDefault)) await tx.update(customerAddresses).set({ isDefault: true }).where(eq(customerAddresses.id, left[0].id));
  });
}

// ───────────────────────── orders and the waiting list ─────────────────────────

export async function customerOrders(p: { siteId: string; customer: Customer }): Promise<Order[]> {
  return withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, p.customer.id), inArray(orders.paymentStatus, [...VISIBLE])))
      .orderBy(desc(orders.createdAt))
      .limit(100),
  );
}

export async function customerOrder(p: { siteId: string; customer: Customer; number: number }): Promise<Order | null> {
  const [o] = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(orders)
      .where(and(eq(orders.customerId, p.customer.id), eq(orders.number, p.number), inArray(orders.paymentStatus, [...VISIBLE])))
      .limit(1),
  );
  return o ?? null;
}

export type WaitingRow = { id: string; name: string; slug: string; variant: string; createdAt: Date };

/** The sold-out pieces they asked to hear about, still waiting. */
export async function customerWaiting(p: { siteId: string; customer: Customer }): Promise<WaitingRow[]> {
  return withSite(p.siteId, (tx) =>
    tx
      .select({ id: waiting.id, name: products.name, slug: products.slug, variant: waiting.variant, createdAt: waiting.createdAt })
      .from(waiting)
      .innerJoin(products, eq(products.id, waiting.productId))
      .where(and(eq(waiting.email, p.customer.email), isNull(waiting.notifiedAt), isNull(products.deletedAt)))
      .orderBy(desc(waiting.createdAt)),
  );
}

/** "Take me off this": gone, not hidden — they asked not to be emailed. */
export async function leaveWaiting(p: { siteId: string; customer: Customer; id: string }): Promise<void> {
  if (!z.string().uuid().safeParse(p.id).success) return;
  await withSite(p.siteId, (tx) => tx.delete(waiting).where(and(eq(waiting.id, p.id), eq(waiting.email, p.customer.email))));
}

/** The account page's summary lines: how many orders (and on the way), addresses, waiting. */
export async function accountSummary(p: { siteId: string; customer: Customer }) {
  const [os, as, ws] = await Promise.all([customerOrders(p), listAddresses(p), customerWaiting(p)]);
  return { orders: os, addresses: as.length, waiting: ws.length };
}

/**
 * "Buy again": an old order's pieces as cart lines — the same combination,
 * the same filled-in answers where the product still asks for them. What
 * can't be bought now is left for the cart to say so.
 */
export async function againLines(p: { siteId: string; order: Order }): Promise<{ id: string; v?: string; f?: Record<string, string> }[]> {
  const items = p.order.items as { productId: string; variant?: string | null; choices?: { name: string; value: string }[] }[];
  const ids = [...new Set(items.map((i) => i.productId))];
  if (ids.length === 0) return [];
  const rows = await withSite(p.siteId, (tx) => tx.select({ id: products.id, options: products.options }).from(products).where(and(inArray(products.id, ids), isNull(products.deletedAt))));
  const optsFor = new Map(rows.map((r) => [r.id, readOptions(r.options)]));
  return items.flatMap((it) => {
    const opts = optsFor.get(it.productId);
    if (!opts) return [];
    const f = Object.fromEntries(
      fillOptions(opts).flatMap((o) => {
        const v = it.choices?.find((ch) => ch.name === o.name)?.value;
        return v ? [[o.id, v]] : [];
      }),
    );
    return [{ id: it.productId, ...(it.variant ? { v: it.variant } : {}), ...(Object.keys(f).length ? { f } : {}) }];
  });
}
