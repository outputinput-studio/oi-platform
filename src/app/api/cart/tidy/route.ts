import { NextResponse, type NextRequest } from "next/server";
import { CART_COOKIE, CART_REF_COOKIE, readCart, writeCart } from "@/modules/orders/cart";
import { cartCookieOptions } from "@/modules/orders/cookies";
import { priceCart } from "@/modules/orders/server";
import { siteFromHost } from "@/modules/sites/server";

/**
 * The cart page calls this once it has told the shopper what was taken
 * out: the cookie loses what can't be bought (and keeps no more than there
 * is). A route rather than a server action, because an action that sets a
 * cookie re-renders the page, and the note would vanish before it's read.
 *
 * Public like the cart itself; it only ever rewrites the caller's own cart.
 */
export async function POST(request: NextRequest) {
  const site = await siteFromHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "");
  if (!site) return new NextResponse(null, { status: 404 });
  const cart = readCart(request.cookies.get(CART_COOKIE)?.value);
  const ref = request.cookies.get(CART_REF_COOKIE)?.value;
  const { tidy } = await priceCart({ site, cart, cartRef: ref && /^[0-9a-f-]{36}$/.test(ref) ? ref : undefined });
  const res = NextResponse.json({ ok: true, removed: cart.length - tidy.length });
  if (JSON.stringify(tidy) !== JSON.stringify(cart)) res.cookies.set(CART_COOKIE, writeCart(tidy), cartCookieOptions());
  return res;
}
