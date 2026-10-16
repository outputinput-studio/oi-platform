import Link from "next/link";
import { cookies } from "next/headers";
import type { Site } from "@/db/schema";
import { CART_COOKIE, CART_REF_COOKIE, readCart } from "@/modules/orders/cart";
import { priceCart } from "@/modules/orders/server";
import { paymentsStatus } from "@/modules/payments/server";

/** The cart in the header, with how many things are in it. Only on a site that can take payments. */
export async function CartLink({ site }: { site: Site }) {
  if (!paymentsStatus(site).ready) return null;
  // Counted from what can actually be bought, so it never shows things the cart page has taken out.
  const jar = await cookies();
  const cart = readCart(jar.get(CART_COOKIE)?.value);
  const n = cart.length ? (await priceCart({ site, cart, cartRef: jar.get(CART_REF_COOKIE)?.value })).lines.reduce((t, l) => t + l.qty, 0) : 0;
  return (
    <Link href="/shop/cart" aria-label={n ? `Cart, ${n} item${n === 1 ? "" : "s"}` : "Cart"} className="relative flex flex-none items-center text-[var(--text-muted)] hover:text-[var(--text)]">
      <svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <path d="M6 7h12l-1 14H7z" />
        <path d="M9 7a3 3 0 0 1 6 0" />
      </svg>
      {n > 0 && (
        <span data-testid="cart-count" aria-hidden className="absolute -right-2 -top-1.5 flex h-[17px] min-w-[17px] items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10.5px] font-semibold leading-none text-[var(--accent-fg)]">
          {n}
        </span>
      )}
    </Link>
  );
}
