import { and, eq, gt, inArray, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withSite, type Tx } from "@/db/client";
import { memberships, orders, products, sites, users, type Order, type Site } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { COUNTRY_CODES, countryName } from "@/lib/countries";
import { upsertFromSubmission } from "@/modules/contacts/server";
import { customerView, makeLine, readPhotos } from "@/modules/products/catalogue";
import { readShopSettings, formatPrice, type Currency } from "@/modules/sites/shop";
import { businessOf, tradingName } from "@/modules/sites/business";
import { customerMail, readMessages, recipientsFor, templateFor } from "@/modules/sites/messages";
import { draftFrom, orderVars } from "./emails";
import { quoteFor, ratesFor, readShipping } from "@/modules/sites/shipping";
import { countUse, discountFor } from "@/modules/discounts/server";
import { taxOn, type CartLine } from "./cart";

/**
 * Checkout and orders. The storefront side (pricing a cart, placing an
 * order, marking it paid) has no actor: the site comes from the host and
 * everything runs inside its lock. Prices always come from the products
 * table, never from the browser.
 */

// ───────────────────────── pricing a cart ─────────────────────────

/**
 * How long stock is held for someone who has started paying. Stripe's
 * checkout page is set to close a little before this, so a piece is
 * never held for nobody.
 */
export const HOLD_MINUTES = 35;

/** What other shoppers' unpaid checkouts from the last HOLD_MINUTES are holding, by product. */
async function heldQuantities(tx: Tx, exceptCartRef?: string): Promise<Map<string, number>> {
  const since = new Date(Date.now() - HOLD_MINUTES * 60_000);
  const rows = await tx
    .select({ items: orders.items })
    .from(orders)
    .where(and(eq(orders.paymentStatus, "pending"), gt(orders.createdAt, since), exceptCartRef ? ne(orders.cartRef, exceptCartRef) : undefined));
  const held = new Map<string, number>();
  for (const r of rows) for (const it of r.items as OrderItem[]) held.set(it.productId, (held.get(it.productId) ?? 0) + it.qty);
  return held;
}

export type PricedLine = {
  productId: string;
  name: string;
  slug: string;
  /** What one costs now (the sale price when there is one). */
  unit: number;
  qty: number;
  /** The most they can have: stock on hand, 1 for a one-off. */
  max: number;
  photo: string | null;
  note: string;
  digital: boolean;
  categoryId: string | null;
};

export type PricedCart = {
  lines: PricedLine[];
  /** Things that were in the cart but can't be bought any more. */
  dropped: string[];
  /** Things someone else is paying for right now (held for HOLD_MINUTES). */
  held: string[];
  /**
   * The cart as it should be kept: what can be bought (no more than there
   * is) plus what's held for someone else (it may come back). Dropped
   * things are gone from it.
   */
  tidy: CartLine[];
  currency: Currency;
  subtotal: number;
  tax: number;
  taxName: string;
  taxRate: number;
  pricesIncludeTax: boolean;
  total: number;
  /** Anything physical in it: ask for an address. */
  needsAddress: boolean;
};

export async function priceCart(p: { site: Site; cart: CartLine[]; cartRef?: string }): Promise<PricedCart> {
  const shop = readShopSettings(p.site.shop);
  const ids = p.cart.map((l) => l.id);
  const [rows, holds] = ids.length
    ? await withSite(p.site.id, async (tx) =>
        Promise.all([
          tx
            .select()
            .from(products)
            .where(and(inArray(products.id, ids), isNull(products.deletedAt), eq(products.visible, true))),
          heldQuantities(tx, p.cartRef),
        ]),
      )
    : [[], new Map<string, number>()];
  const byId = new Map(rows.map((r) => [r.id, r]));
  const lines: PricedLine[] = [];
  const dropped: string[] = [];
  const held: string[] = [];
  const tidy: CartLine[] = [];
  for (const l of p.cart) {
    const prod = byId.get(l.id);
    if (!prod) {
      dropped.push("Something in your cart");
      continue;
    }
    const v = customerView(prod, shop.currency);
    if (!v.buyable) {
      dropped.push(prod.name);
      continue;
    }
    const onHold = holds.get(prod.id) ?? 0;
    const max = prod.make === "oneOnly" ? 1 - onHold : prod.make === "ready" && prod.stock !== null ? prod.stock - onHold : 20;
    if (max <= 0) {
      held.push(prod.name);
      tidy.push(l);
      continue;
    }
    const unit = prod.salePrice !== null && prod.price !== null && prod.salePrice < prod.price ? prod.salePrice : prod.price!;
    const photos = readPhotos(prod.photos);
    tidy.push({ ...l, q: Math.min(l.q, max) });
    lines.push({ productId: prod.id, name: prod.name, slug: prod.slug, unit, qty: Math.min(l.q, max), max, photo: photos[0]?.key ?? null, note: makeLine(prod), digital: prod.digital, categoryId: prod.categoryId });
  }
  const subtotal = lines.reduce((n, l) => n + l.unit * l.qty, 0);
  const t = taxOn(subtotal, shop.taxRate, shop.pricesIncludeTax);
  return {
    lines,
    dropped,
    held,
    tidy,
    currency: shop.currency,
    subtotal,
    tax: t.tax,
    taxName: shop.taxName,
    taxRate: shop.taxRate,
    pricesIncludeTax: shop.pricesIncludeTax,
    total: t.total,
    needsAddress: lines.some((l) => !l.digital),
  };
}

// ───────────────────────── placing an order ─────────────────────────

const addressSchema = z.object({
  line1: z.string().trim().min(1, "Which street?").max(200),
  line2: z.string().trim().max(200).default(""),
  city: z.string().trim().min(1, "Which town or suburb?").max(100),
  state: z.string().trim().max(100).default(""),
  postcode: z.string().trim().min(2, "What's the postcode?").max(20),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => COUNTRY_CODES.has(c), "Pick a country."),
});
export type Address = z.infer<typeof addressSchema>;

export const checkoutSchema = z.object({
  name: z.string().trim().min(1, "Your name, please.").max(120),
  email: z.string().trim().toLowerCase().email("That email address doesn't look right.").max(200),
  phone: z.string().trim().max(40).default(""),
  note: z.string().trim().max(1000).default(""),
  address: addressSchema.optional(),
  /** The delivery rate they picked (an id from Settings · Shipping). */
  rate: z.string().max(40).default(""),
  /** A discount code, as typed. */
  code: z.string().trim().max(40).default(""),
});
export type CheckoutDetails = z.infer<typeof checkoutSchema>;

export type OrderItem = { productId: string; name: string; slug: string; unit: number; qty: number; photo: string | null; note: string; digital: boolean };

/** A pending order from the cart as it stands, priced on the server. Payment comes next. */
export async function placeOrder(p: { site: Site; cart: CartLine[]; details: unknown; provider: string; cartRef?: string }): Promise<Order> {
  const priced = await priceCart({ site: p.site, cart: p.cart, cartRef: p.cartRef });
  if (priced.lines.length === 0)
    throw new Error(priced.held.length ? `${priced.held.join(", ")} ${priced.held.length === 1 ? "is" : "are"} in someone else's checkout right now. Try again in half an hour.` : "Your cart is empty — nothing in it can be bought right now.");

  // Delivery: the rate they picked must be one this address and total can have. A pickup needs no street address.
  const raw = (p.details ?? {}) as { address?: { country?: string; postcode?: string }; rate?: string; code?: string; email?: string };
  let shipping: { name: string; kind: string; estimate: string } | null = null;
  let shippingPrice = 0;
  let pickupCountry = "";
  if (priced.needsAddress) {
    const ship = readShipping(p.site.shipping);
    if (quoteFor(ship, raw.address?.country ?? "", "") !== null) throw new Error("Delivery there is quoted separately. Ask for a quote instead.");
    const rates = ratesFor(ship, { country: raw.address?.country ?? "", postcode: raw.address?.postcode }, priced.subtotal);
    if (rates.length === 0) throw new Error("Sorry, we don't send to that country yet. Get in touch and we'll sort something out.");
    const rate = rates.find((r) => r.id === raw.rate) ?? (rates.length === 1 ? rates[0] : undefined);
    if (!rate) throw new Error("Pick how you'd like it delivered.");
    shipping = { name: rate.name, kind: rate.kind, estimate: rate.estimate };
    shippingPrice = rate.price;
    if (rate.kind === "pickup") {
      pickupCountry = raw.address?.country ?? "";
      p = { ...p, details: { ...(p.details as object), address: undefined } };
    }
  }
  const details = checkoutSchema.parse(p.details);
  if (priced.needsAddress && !details.address && shipping?.kind !== "pickup") throw new Error("Where should it go? Fill in the address.");

  // A discount code, checked again here whatever the page showed.
  let off = 0;
  let code = "";
  if (details.code) {
    const applied = await discountFor({ siteId: p.site.id, code: details.code, lines: priced.lines, currency: priced.currency, email: details.email });
    if (!applied.ok) throw new Error(applied.reason);
    off = applied.off;
    code = applied.code ?? "";
    if (applied.freeShipping) shippingPrice = 0;
  }
  const t = taxOn(priced.subtotal - off + shippingPrice, priced.taxRate, priced.pricesIncludeTax);
  const items: OrderItem[] = priced.lines.map((l) => ({ productId: l.productId, name: l.name, slug: l.slug, unit: l.unit, qty: l.qty, photo: l.photo, note: l.note, digital: l.digital }));
  return withSite(p.site.id, async (tx) => {
    // Their earlier unpaid try (back from Stripe, changed something) stops holding stock: this one replaces it.
    if (p.cartRef) await tx.update(orders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(and(eq(orders.cartRef, p.cartRef), eq(orders.paymentStatus, "pending")));
    const number = await nextNumber(tx);
    const [o] = await tx
      .insert(orders)
      .values({
        siteId: p.site.id,
        number,
        name: details.name,
        email: details.email,
        phone: details.phone,
        address: priced.needsAddress && details.address ? details.address : pickupCountry ? { country: pickupCountry } : {},
        note: details.note,
        items,
        currency: priced.currency,
        subtotal: priced.subtotal,
        shipping,
        shippingPrice,
        discountCode: code,
        discount: off,
        tax: t.tax,
        taxName: priced.taxName,
        taxRate: Math.round(priced.taxRate),
        total: t.total,
        provider: p.provider,
        cartRef: p.cartRef ?? "",
      })
      .returning();
    return o;
  });
}

export async function setProviderRef(p: { siteId: string; orderId: string; ref: string }): Promise<void> {
  await withSite(p.siteId, (tx) => tx.update(orders).set({ providerRef: p.ref }).where(eq(orders.id, p.orderId)));
}

/** An order as the customer may see it after paying (by its unguessable id). */
export async function orderForCustomer(p: { siteId: string; orderId: string }): Promise<Order | null> {
  if (!z.string().uuid().safeParse(p.orderId).success) return null;
  const [o] = await withSite(p.siteId, (tx) => tx.select().from(orders).where(eq(orders.id, p.orderId)).limit(1));
  return o ?? null;
}

/** The site's next order number: 1001 for the first. */
async function nextNumber(tx: Tx): Promise<number> {
  // One order at a time per site gets a number; other sites aren't held up.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext('orders:' || current_setting('app.site_id')))`);
  const [r] = await tx.select({ n: sql<number>`coalesce(max(${orders.number}), 1000) + 1` }).from(orders);
  return Number(r.n);
}

// ───────────────────────── paid ─────────────────────────

/**
 * The money arrived (Stripe's webhook, the customer coming back from
 * Stripe, or a test payment). Safe to call more than once: only the
 * first call does anything. Stock comes down, a one-off is marked sold,
 * the customer becomes a contact, and the owner and customer get emails.
 */
export async function markOrderPaid(p: { siteId: string; orderId: string; adminUrl?: string }): Promise<{ order: Order; first: boolean }> {
  const result = await withSite(p.siteId, async (tx) => {
    const [o] = await tx.select().from(orders).where(eq(orders.id, p.orderId)).for("update").limit(1);
    if (!o) throw new Error("That order doesn't exist.");
    if (o.paymentStatus === "paid") return { order: o, first: false };
    const items = o.items as OrderItem[];
    for (const it of items) {
      await tx
        .update(products)
        .set({
          stock: sql`case when ${products.make} = 'ready' and ${products.stock} is not null then greatest(${products.stock} - ${it.qty}, 0) else ${products.stock} end`,
          availability: sql`case when ${products.make} = 'oneOnly' then 'sold' else ${products.availability} end`,
          updatedAt: new Date(),
        })
        .where(eq(products.id, it.productId));
    }
    await countUse(tx, o.discountCode);
    const contactId = await upsertFromSubmission(tx, { siteId: p.siteId, name: o.name, email: o.email, phone: o.phone });
    const [paid] = await tx.update(orders).set({ paymentStatus: "paid", paidAt: new Date(), contactId, updatedAt: new Date() }).where(eq(orders.id, o.id)).returning();
    const [site] = await tx.select().from(sites).limit(1);
    // Counted stock that this order brought down to its last one or two (or none).
    const low = await tx
      .select({ name: products.name, stock: products.stock })
      .from(products)
      .where(and(inArray(products.id, items.map((it) => it.productId)), eq(products.make, "ready"), sql`${products.stock} is not null and ${products.stock} <= ${LOW_STOCK}`));
    return { order: paid, first: true, site, low };
  });
  if (result.first && "site" in result && result.site) {
    await sendOrderEmails(result.site, result.order, p.adminUrl).catch((err) => console.error("order emails failed", err));
    if (result.low.length) await notifyLowStock(result.site, result.low as { name: string; stock: number }[], p.adminUrl).catch((err) => console.error("low stock email failed", err));
  }
  return { order: result.order, first: result.first };
}

/** "Running low" is the last one or two. */
export const LOW_STOCK = 2;

/**
 * Stripe says a payment that was still going through (a bank debit, say)
 * didn't. The order stops holding stock and the team hears about it, if
 * they've asked to (Settings · Who gets notified).
 */
export async function markOrderFailed(p: { siteId: string; orderId: string; adminUrl?: string }): Promise<void> {
  const r = await withSite(p.siteId, async (tx) => {
    const [o] = await tx.update(orders).set({ paymentStatus: "failed", updatedAt: new Date() }).where(and(eq(orders.id, p.orderId), eq(orders.paymentStatus, "pending"))).returning();
    const [site] = await tx.select().from(sites).limit(1);
    return { o, site };
  });
  if (!r.o || !r.site) return;
  const who = recipientsFor(readMessages(r.site.messages).notify.paymentFailed, await ownerEmails(p.siteId));
  if (!who) return;
  await sendEmail({
    ...who,
    subject: `A payment didn't go through: order ${r.o.number} from ${r.o.name}`,
    text: `${r.o.name} (${r.o.email}${r.o.phone ? `, ${r.o.phone}` : ""}) tried to pay ${formatPrice(r.o.total, r.o.currency as Currency)} for order ${r.o.number}, and their payment was declined.\n\n${orderLines(r.o)}\n\nNothing was charged and the stock isn't held. You might reply to them with another way to pay.`,
    replyTo: r.o.email,
  }).catch((err) => console.error("payment failed email failed", err));
}

async function notifyLowStock(site: Site, low: { name: string; stock: number }[], adminUrl?: string) {
  const who = recipientsFor(readMessages(site.messages).notify.lowStock, await ownerEmails(site.id));
  if (!who) return;
  const lines = low.map((l) => `${l.name} — ${l.stock === 0 ? "sold out" : `${l.stock} left`}`);
  await sendEmail({
    ...who,
    subject: low.length === 1 ? `Running low: ${low[0].name}` : `Running low: ${low.length} products`,
    text: `${lines.join("\n")}${adminUrl ? `\n\nUpdate stock: ${adminUrl}/products` : ""}`,
  });
}

// ───────────────────────── emails ─────────────────────────

export function orderLines(o: Order): string {
  const cur = o.currency as Currency;
  const items = (o.items as OrderItem[]).map((it) => `${it.qty} × ${it.name} — ${formatPrice(it.unit * it.qty, cur)}`);
  const addr = o.address as Partial<Address>;
  const where = addr.line1 ? [addr.line1, addr.line2, [addr.city, addr.state, addr.postcode].filter(Boolean).join(" "), addr.country ? countryName(addr.country) : ""].filter(Boolean).join("\n") : "";
  return [
    ...items,
    o.discount ? `Code ${o.discountCode} — −${formatPrice(o.discount, cur)}` : "",
    o.shipping ? `${String((o.shipping as { name?: string }).name ?? "Delivery")} — ${o.shippingPrice ? formatPrice(o.shippingPrice, cur) : "included"}` : "",
    `Total — ${formatPrice(o.total, cur)}${o.tax ? ` (includes ${o.taxName} ${formatPrice(o.tax, cur)})` : ""}`,
    where ? `\nDeliver to:\n${o.name}\n${where}` : (o.shipping as { kind?: string } | null)?.kind === "pickup" ? "\nPicking up." : "",
  ]
    .filter(Boolean)
    .join("\n");
}

async function sendOrderEmails(site: Site, o: Order, adminUrl?: string) {
  const cur = o.currency as Currency;
  const who = recipientsFor(readMessages(site.messages).notify.newOrder, await ownerEmails(site.id));
  if (who) {
    await sendEmail({
      ...who,
      subject: `New order ${o.number} — ${formatPrice(o.total, cur)} from ${o.name}`,
      text: `${o.name} (${o.email}${o.phone ? `, ${o.phone}` : ""}) just paid for order ${o.number}.\n\n${orderLines(o)}${o.note ? `\n\nTheir note: ${o.note}` : ""}${adminUrl ? `\n\nOpen it: ${adminUrl}/orders/${o.id}` : ""}`,
      // Hitting reply writes to the customer.
      replyTo: o.email,
    });
  }
  await sendEmail({ to: o.email, ...receiptEmail(site, o), ...customerMail(site) });
}

/**
 * The customer's confirmation, in the site's own wording (Settings ·
 * Customer emails). The receipt always goes in — where {receipt} sits, or
 * after the message — and with a business number (Settings · Business
 * profile) the tax-invoice lines close it; a pickup order gets the
 * address and hours.
 */
export function receiptEmail(site: Pick<Site, "name" | "business" | "search" | "messages">, o: Order): { subject: string; text: string } {
  const b = businessOf(site);
  const name = tradingName(site);
  const pickup = (o.shipping as { kind?: string } | null)?.kind === "pickup" && b.address ? `\n\nPick up from:\n${b.address}${b.hours ? `\n${b.hours}` : ""}` : "";
  const receipt = `${orderLines(o)}${pickup}`;
  const tpl = templateFor(readMessages(site.messages), "confirmed");
  const body = /\{\s*receipt\s*\}/i.test(tpl.body) ? tpl.body : `${tpl.body}\n\n{receipt}`;
  const d = draftFrom({ subject: tpl.subject, body }, { ...orderVars(o, name), receipt });
  const date = (o.paidAt ?? o.createdAt).toLocaleDateString("en-AU", { day: "numeric", month: "long", year: "numeric" });
  const footer = [b.businessNumber ? `Tax invoice · ${name} · ${b.businessNumber}\nOrder ${o.number} · ${date}` : "", [b.phone, b.email].filter(Boolean).join(" · ")].filter(Boolean).join("\n");
  return { subject: d.subject, text: footer ? `${d.message}\n\n${footer}` : d.message };
}

/** Owners' addresses. Platform tables, so outside withSite(). */
async function ownerEmails(siteId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.siteId, siteId), eq(memberships.role, "owner")));
  return rows.map((r) => r.email);
}
