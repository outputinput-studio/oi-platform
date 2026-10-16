"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteFromHost } from "@/modules/sites/server";
import { paymentsStatus } from "@/modules/payments/server";
import { randomUUID } from "node:crypto";
import { CART_COOKIE, CART_REF_COOKIE, addLine, readCart, setLine, writeCart, type CartLine } from "./cart";
import { markOrderPaid, orderForCustomer, priceCart } from "./server";
import { startCheckout } from "./checkout";
import { cartCookieOptions } from "./cookies";
import { requestProductQuote, requestQuote } from "./quote";
import { moveOrder, refundOrder } from "./admin";
import { discountFor } from "@/modules/discounts/server";
import { requireSiteAccess } from "@/modules/auth/access";
import { formError } from "@/lib/form-error";

/**
 * The storefront's cart and checkout. No sign-in: the site is the one the
 * hostname names, and the cart is a cookie on that address.
 */

export type CartState = { ok?: string; error?: string; fields?: string[]; count?: number };

async function here() {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) throw new Error("This shop isn't available.");
  return { host, site };
}

async function saveCart(lines: CartLine[]) {
  const jar = await cookies();
  const opts = cartCookieOptions();
  jar.set(CART_COOKIE, writeCart(lines), opts);
  if (!jar.get(CART_REF_COOKIE)?.value) jar.set(CART_REF_COOKIE, randomUUID(), opts);
}

async function cartRef(): Promise<string | undefined> {
  const v = (await cookies()).get(CART_REF_COOKIE)?.value;
  return v && /^[0-9a-f-]{36}$/.test(v) ? v : undefined;
}

export async function addToCartAction(productId: string): Promise<CartState> {
  try {
    const { site } = await here();
    if (!paymentsStatus(site).ready) return { error: "This shop isn't taking orders online yet." };
    const id = z.string().uuid().parse(productId);
    const jar = await cookies();
    const next = addLine(readCart(jar.get(CART_COOKIE)?.value), id, 1);
    // Check it can be bought, and don't let the cart hold more than there is.
    const priced = await priceCart({ site, cart: next, cartRef: await cartRef() });
    const line = priced.lines.find((l) => l.productId === id);
    if (!line) return { error: "Sorry, that can't be bought right now." };
    // Saved tidy: anything that can't be bought any more goes, quantities no more than there is.
    await saveCart(priced.tidy);
    revalidatePath("/", "layout");
    return { ok: "Added", count: priced.lines.reduce((t, l) => t + l.qty, 0) };
  } catch (err) {
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

export async function setCartQtyAction(form: FormData): Promise<void> {
  const id = z.string().uuid().parse(form.get("productId"));
  const q = z.coerce.number().int().min(0).max(99).parse(form.get("qty"));
  const jar = await cookies();
  await saveCart(setLine(readCart(jar.get(CART_COOKIE)?.value), id, q));
  revalidatePath("/", "layout");
}

/** The checkout form's fields, as the order and quote code reads them (both check them again). */
/** Checkout's address sits under `address` when checked; on the page its fields are named on their own (line1, city…). */
function checkoutError(err: unknown) {
  const e = formError(err, { fallback: "Check the details and try again." });
  return { ...e, ...(e.fields ? { fields: e.fields.map((f) => f.replace(/^address\./, "")) } : {}) };
}

function detailsFrom(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? "");
  const hasAddress = form.get("country") !== null;
  return {
    name: s("name"),
    email: s("email"),
    phone: s("phone"),
    note: s("note"),
    address: hasAddress ? { line1: s("line1"), line2: s("line2"), city: s("city"), state: s("state"), postcode: s("postcode"), country: s("country") } : undefined,
    rate: s("rate"),
    code: s("code"),
  };
}

export async function checkoutAction(_prev: CartState, form: FormData): Promise<CartState> {
  let to: string;
  try {
    const { site, host } = await here();
    const cart = readCart((await cookies()).get(CART_COOKIE)?.value);
    to = (await startCheckout({ site, host, cart, cartRef: await cartRef(), details: detailsFrom(form) })).redirect;
  } catch (err) {
    return checkoutError(err);
  }
  redirect(to);
}

/** Checkout for a zone that's quoted individually: the details go to the Inbox instead of payment. The cart stays as it is. */
export async function quoteAction(_prev: CartState, form: FormData): Promise<CartState> {
  try {
    const { site, host } = await here();
    const cart = readCart((await cookies()).get(CART_COOKIE)?.value);
    return await requestQuote({ site, cart, cartRef: await cartRef(), details: detailsFrom(form), inboxUrl: `https://${host.replace(/^[^.]+\./, "admin.")}/inbox` });
  } catch (err) {
    return checkoutError(err);
  }
}

/** Email quote on a product page. No sign-in, like the cart; `website` is the hidden trap a bot fills in. */
export async function productQuoteAction(productId: string, _prev: CartState, form: FormData): Promise<CartState> {
  try {
    const { site, host } = await here();
    if (String(form.get("website") ?? "")) return { ok: "Thanks. We'll be in touch." };
    const s = (k: string) => String(form.get(k) ?? "");
    const details = { name: s("name"), email: s("email"), phone: s("phone"), country: s("country"), city: s("city"), postcode: s("postcode"), qty: s("qty") || "1", note: s("note") };
    return await requestProductQuote({ site, productId, details, inboxUrl: `https://${host.replace(/^[^.]+\./, "admin.")}/inbox` });
  } catch (err) {
    return formError(err, { fallback: "Check the details and try again." });
  }
}

/** The test payment page's Pay button. Only exists where the test provider is in use (never production). */
export async function testPayAction(form: FormData): Promise<void> {
  const { site, host } = await here();
  if (paymentsStatus(site).provider !== "test") throw new Error("Test payments are off here.");
  const orderId = z.string().uuid().parse(form.get("orderId"));
  const order = await orderForCustomer({ siteId: site.id, orderId });
  if (!order || order.provider !== "test") throw new Error("That order doesn't exist.");
  await markOrderPaid({ siteId: site.id, orderId, adminUrl: `https://${host.replace(/^[^.]+\./, "admin.")}` });
  (await cookies()).delete(CART_COOKIE);
  redirect(`/shop/checkout/done?order=${orderId}`);
}

/** The done page empties the cart once the order is paid (cookies can only change in an action). */
export async function clearCartAction(): Promise<void> {
  (await cookies()).delete(CART_COOKIE);
  revalidatePath("/", "layout");
}

// ───────────────────────── the team side ─────────────────────────

/** Orders admin: move an order to its next stage, maybe emailing the customer. */
export async function moveOrderAction(orderId: string, change: unknown): Promise<CartState> {
  const { user, site } = await requireSiteAccess();
  try {
    await moveOrder({ actorId: user.id, siteId: site.id, orderId, change });
    revalidatePath("/orders", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err, { fallback: "Check the details and try again." });
  }
}

/** Checkout's "Apply": what a code would take off this cart, before anything is placed. */
export async function previewCodeAction(code: string, email: string): Promise<{ ok?: true; off?: number; freeShipping?: boolean; code?: string; error?: string }> {
  try {
    const { site } = await here();
    const priced = await priceCart({ site, cart: readCart((await cookies()).get(CART_COOKIE)?.value), cartRef: await cartRef() });
    const r = await discountFor({ siteId: site.id, code: String(code).slice(0, 40), lines: priced.lines, currency: priced.currency, email: String(email).slice(0, 200) || undefined });
    return r.ok ? { ok: true, off: r.off, freeShipping: r.freeShipping, code: r.code } : { error: r.reason };
  } catch {
    return { error: "Couldn't check that code. Try again." };
  }
}

/** Orders admin: refund all or part of an order. */
export async function refundOrderAction(orderId: string, refund: unknown): Promise<CartState> {
  const { user, site } = await requireSiteAccess();
  try {
    await refundOrder({ actorId: user.id, siteId: site.id, orderId, refund });
    revalidatePath("/orders", "layout");
    return { ok: "Refunded" };
  } catch (err) {
    return formError(err, { fallback: "Check the details and try again." });
  }
}
