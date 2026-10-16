"use server";

import { cookies, headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { siteFromHost } from "@/modules/sites/server";
import { paymentsStatus } from "@/modules/payments/server";
import { environmentName } from "@/lib/env";
import { CART_COOKIE, addLine, cartCount, readCart, setLine, writeCart, type CartLine } from "./cart";
import { markOrderPaid, orderForCustomer, priceCart } from "./server";
import { startCheckout } from "./checkout";
import { moveOrder } from "./admin";
import { requireSiteAccess } from "@/modules/auth/access";

/**
 * The storefront's cart and checkout. No sign-in: the site is the one the
 * hostname names, and the cart is a cookie on that address.
 */

export type CartState = { ok?: string; error?: string; count?: number };

async function here() {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const site = await siteFromHost(host);
  if (!site) throw new Error("This shop isn't available.");
  return { host, site };
}

async function saveCart(lines: CartLine[]) {
  (await cookies()).set(CART_COOKIE, writeCart(lines), { httpOnly: true, sameSite: "lax", secure: environmentName() !== "local", path: "/", maxAge: 60 * 60 * 24 * 30 });
}

export async function addToCartAction(productId: string): Promise<CartState> {
  try {
    const { site } = await here();
    if (!paymentsStatus(site).ready) return { error: "This shop isn't taking orders online yet." };
    const id = z.string().uuid().parse(productId);
    const jar = await cookies();
    const next = addLine(readCart(jar.get(CART_COOKIE)?.value), id, 1);
    // Check it can be bought, and don't let the cart hold more than there is.
    const priced = await priceCart({ site, cart: next });
    const line = priced.lines.find((l) => l.productId === id);
    if (!line) return { error: "Sorry, that can't be bought right now." };
    const capped = next.map((l) => (l.id === id ? { ...l, q: line.qty } : l));
    await saveCart(capped);
    revalidatePath("/", "layout");
    return { ok: "Added", count: cartCount(capped) };
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

export async function checkoutAction(_prev: CartState, form: FormData): Promise<CartState> {
  let to: string;
  try {
    const { site, host } = await here();
    const cart = readCart((await cookies()).get(CART_COOKIE)?.value);
    const s = (k: string) => String(form.get(k) ?? "");
    const hasAddress = form.get("country") !== null;
    const details = {
      name: s("name"),
      email: s("email"),
      phone: s("phone"),
      note: s("note"),
      address: hasAddress ? { line1: s("line1"), line2: s("line2"), city: s("city"), state: s("state"), postcode: s("postcode"), country: s("country") } : undefined,
      rate: s("rate"),
    };
    to = (await startCheckout({ site, host, cart, details })).redirect;
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Check the details and try again." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
  redirect(to);
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
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "Check the details and try again." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}
