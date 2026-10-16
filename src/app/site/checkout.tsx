import Link from "next/link";
import { cookies } from "next/headers";
import type { Site } from "@/db/schema";
import { COUNTRIES } from "@/lib/countries";
import { Placeholder } from "@/lib/placeholder";
import { mediaUrl } from "@/modules/media/server";
import { siteMenus } from "@/modules/menus/server";
import { setCartQtyAction, testPayAction } from "@/modules/orders/actions";
import { CART_COOKIE, CART_REF_COOKIE, readCart } from "@/modules/orders/cart";
import { confirmStripeReturn } from "@/modules/orders/checkout";
import { orderForCustomer, priceCart, type OrderItem, type PricedCart } from "@/modules/orders/server";
import { paymentsStatus } from "@/modules/payments/server";
import { formatPrice, homeCountry, type Currency } from "@/modules/sites/shop";
import { choiceText, withChoice } from "@/modules/products/options";
import { siteShipping, siteShop } from "@/modules/sites/server";
import { publicForm } from "@/modules/forms/server";
import { businessOf } from "@/modules/sites/business";
import { Frame } from "./storefront";
import { hostAndSite } from "./metadata";
import { CheckoutForm, ClearCart, TidyCart } from "./checkout-form";

/**
 * The cart, checkout, the test payment page and "thank you", all inside
 * the site's own frame and theme. Prices are worked out on the server
 * from the products every time; the cart cookie only holds ids and
 * quantities.
 */

async function current() {
  const { host, site } = await hostAndSite();
  if (!site) return null;
  const jar = await cookies();
  const [menus, cart] = await Promise.all([siteMenus({ siteId: site.id }), priceCart({ site, cart: readCart(jar.get(CART_COOKIE)?.value), cartRef: jar.get(CART_REF_COOKIE)?.value })]);
  return { host, site, menus, cart };
}

export async function CartPage() {
  const c = await current();
  if (!c) return <Placeholder surface="site" />;
  const { site, menus, cart } = c;
  return (
    <Frame site={site} menus={menus} current="/shop/cart">
      <h1 className="pt-6 text-[34px] font-semibold tracking-[-0.8px] md:pt-10 md:text-[44px]">Your cart</h1>
      <Dropped names={cart.dropped} held={cart.held} />
      {cart.lines.length === 0 ? (
        <div className="py-10">
          <p className="text-[var(--text-muted)]">Nothing in it yet.</p>
          <Link href="/shop" className="mt-4 inline-block underline underline-offset-4">
            Back to the shop
          </Link>
        </div>
      ) : (
        <div className="grid gap-10 pt-6 md:grid-cols-[minmax(0,1fr)_340px]">
          <ul className="divide-y divide-[var(--border-soft)] border-y border-[var(--border-soft)]">
            {cart.lines.map((l) => (
              <li key={l.key} data-testid={`cart-line-${l.slug}`} className="flex gap-4 py-4">
                <Link href={`/shop/${l.slug}`} className="flex-none">
                  {l.photo ? (
                    // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                    <img src={mediaUrl(l.photo)} alt="" className="h-24 w-20 rounded-[6px] bg-[var(--surface)] object-cover" />
                  ) : (
                    <span className="block h-24 w-20 rounded-[6px] bg-[var(--surface)]" />
                  )}
                </Link>
                <div className="min-w-0 flex-1">
                  <Link href={`/shop/${l.slug}`} className="text-[15px] hover:underline hover:underline-offset-4">
                    {l.name}
                  </Link>
                  {l.choices.length > 0 && <p className="mt-0.5 text-[13.5px] text-[var(--text-body)]">{choiceText(l.choices)}</p>}
                  <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{l.note}</p>
                  <div className="mt-3 flex items-center gap-3">
                    <form action={setCartQtyAction} className="flex items-center gap-2">
                      <input type="hidden" name="line" value={l.key} />
                      <label className="sr-only" htmlFor={`qty-${l.key}`}>
                        How many
                      </label>
                      <select
                        id={`qty-${l.key}`}
                        name="qty"
                        defaultValue={l.qty}
                        className="h-9 rounded-[6px] border border-[var(--border)] bg-transparent px-2 text-[14px]"
                      >
                        {Array.from({ length: Math.min(l.max, 20) }, (_, i) => i + 1).map((n) => (
                          <option key={n} value={n}>
                            {n}
                          </option>
                        ))}
                      </select>
                      <button type="submit" className="text-[13px] underline underline-offset-4">
                        Update
                      </button>
                    </form>
                    <form action={setCartQtyAction}>
                      <input type="hidden" name="line" value={l.key} />
                      <input type="hidden" name="qty" value="0" />
                      <button type="submit" className="text-[13px] text-[var(--text-muted)] underline underline-offset-4">
                        Remove
                      </button>
                    </form>
                  </div>
                </div>
                <p className="text-[15px]">{formatPrice(l.unit * l.qty, cart.currency)}</p>
              </li>
            ))}
          </ul>
          <aside>
            <Totals cart={cart} />
            {paymentsStatus(site).ready ? (
              <Link href="/shop/checkout" className="mt-5 flex h-12 items-center justify-center rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90">
                Checkout
              </Link>
            ) : (
              <p className="mt-5 text-[14px] text-[var(--text-muted)]">This shop isn&apos;t taking payments online yet. Get in touch to order.</p>
            )}
          </aside>
        </div>
      )}
    </Frame>
  );
}

export async function CheckoutPage() {
  const c = await current();
  if (!c) return <Placeholder surface="site" />;
  const { site, menus, cart } = c;
  const pay = paymentsStatus(site);
  const enquiryId = siteShop(site).enquiryFormId;
  const canQuote = enquiryId ? !!(await publicForm({ siteId: site.id, formId: enquiryId })) : false;
  return (
    <Frame site={site} menus={menus} current="/shop/checkout">
      <h1 className="pt-6 text-[34px] font-semibold tracking-[-0.8px] md:pt-10 md:text-[44px]">Checkout</h1>
      <Dropped names={cart.dropped} held={cart.held} />
      {cart.lines.length === 0 ? (
        <p className="py-10 text-[var(--text-muted)]">
          Your cart is empty.{" "}
          <Link href="/shop" className="underline underline-offset-4">
            Back to the shop
          </Link>
        </p>
      ) : (
        <div className="grid gap-10 pt-6 md:grid-cols-[minmax(0,1fr)_340px]">
          <CheckoutForm
            needsAddress={cart.needsAddress}
            countries={COUNTRIES}
            defaultCountry={homeCountry(cart.currency)}
            testMode={pay.provider === "test"}
            shipping={siteShipping(site)}
            subtotal={cart.subtotal}
            parcel={cart.parcel}
            currency={cart.currency}
            tax={{ rate: cart.taxRate, included: cart.pricesIncludeTax, name: cart.taxName }}
            canQuote={canQuote}
          />
          <aside>
            <ul className="space-y-2 border-b border-[var(--border-soft)] pb-4 text-[14px]">
              {cart.lines.map((l) => (
                <li key={l.key} className="flex justify-between gap-3">
                  <span>
                    {l.qty} × {withChoice(l.name, l.choices)}
                  </span>
                  <span>{formatPrice(l.unit * l.qty, cart.currency)}</span>
                </li>
              ))}
            </ul>
            <Totals cart={cart} />
          </aside>
        </div>
      )}
    </Frame>
  );
}

/** Test payments: a stand-in for Stripe outside production. Says so plainly. */
export async function TestPayPage({ orderId }: { orderId: string }) {
  const c = await current();
  if (!c) return <Placeholder surface="site" />;
  const { site, menus } = c;
  const order = await orderForCustomer({ siteId: site.id, orderId });
  if (!order || order.provider !== "test" || paymentsStatus(site).provider !== "test") return <Gone site={site} menus={menus} />;
  return (
    <Frame site={site} menus={menus} current="/shop/checkout">
      <div className="mx-auto max-w-md py-10">
        <p className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">Test payment</p>
        <h1 className="mt-2 text-[28px] font-semibold">Order {order.number}</h1>
        <p className="mt-2 text-[15px] text-[var(--text-body)]">
          This is a test shop: no card is asked for and no real money moves. On the live site this is Stripe&apos;s own payment page.
        </p>
        <p className="mt-6 text-[22px]">{formatPrice(order.total, order.currency as Currency)}</p>
        {order.paymentStatus === "paid" ? (
          <Link href={`/shop/checkout/done?order=${order.id}`} className="mt-5 inline-block underline underline-offset-4">
            Already paid — see the order
          </Link>
        ) : (
          <form action={testPayAction} className="mt-5">
            <input type="hidden" name="orderId" value={order.id} />
            <button type="submit" className="h-12 w-full rounded-[6px] bg-[var(--accent)] text-[15px] font-medium text-[var(--accent-fg)] hover:opacity-90">
              Pay {formatPrice(order.total, order.currency as Currency)} (test)
            </button>
          </form>
        )}
      </div>
    </Frame>
  );
}

export async function DonePage({ orderId, sessionId }: { orderId: string; sessionId?: string }) {
  const c = await current();
  if (!c) return <Placeholder surface="site" />;
  const { site, menus, host } = c;
  if (sessionId) await confirmStripeReturn({ site, orderId, sessionId, adminUrl: `https://${host.replace(/^[^.]+\./, "admin.")}` }).catch((err) => console.error("stripe return check failed", err));
  const order = await orderForCustomer({ siteId: site.id, orderId });
  if (!order) return <Gone site={site} menus={menus} />;
  const cur = order.currency as Currency;
  const paid = order.paymentStatus === "paid";
  const profile = businessOf(site);
  const pickup = (order.shipping as { kind?: string } | null)?.kind === "pickup" && profile.address;
  return (
    <Frame site={site} menus={menus} current="/shop/checkout">
      {paid && <ClearCart />}
      <div className="mx-auto max-w-lg py-10">
        <p className="font-mono text-[11.5px] uppercase tracking-[1.5px] text-[var(--accent-text)]">Order {order.number}</p>
        <h1 data-testid="done-heading" className="mt-2 text-[30px] font-semibold leading-[1.15]">
          {paid ? `Thank you, ${order.name.split(" ")[0]}` : "Waiting for the payment to come through"}
        </h1>
        <p className="mt-3 text-[15px] text-[var(--text-body)]">
          {paid ? `A receipt is on its way to ${order.email}.` : "This can take a minute. Refresh this page shortly; nothing more to do."}
        </p>
        <ul className="mt-6 space-y-2 border-y border-[var(--border-soft)] py-4 text-[14px]">
          {(order.items as OrderItem[]).map((it, i) => (
            <li key={i} className="flex justify-between gap-3">
              <span>
                {it.qty} × {withChoice(it.name, it.choices)}
              </span>
              <span>{formatPrice(it.unit * it.qty, cur)}</span>
            </li>
          ))}
        </ul>
        <p className="mt-3 flex justify-between text-[16px] font-medium">
          <span>Total</span>
          <span>{formatPrice(order.total, cur)}</span>
        </p>
        {pickup && (
          <div data-testid="pickup-from" className="mt-6 rounded-[8px] border border-[var(--border)] px-4 py-3 text-[14px]">
            <p className="font-medium">Pick up from</p>
            <p className="mt-1 whitespace-pre-line text-[var(--text-body)]">{profile.address}</p>
            {profile.hours && <p className="mt-1 text-[var(--text-muted)]">{profile.hours}</p>}
          </div>
        )}
        <Link href="/shop" className="mt-8 inline-block underline underline-offset-4">
          Back to the shop
        </Link>
      </div>
    </Frame>
  );
}

function Totals({ cart }: { cart: PricedCart }) {
  return (
    <dl className="space-y-2 pt-4 text-[14px]">
      <div className="flex justify-between">
        <dt>Subtotal</dt>
        <dd>{formatPrice(cart.subtotal, cart.currency)}</dd>
      </div>
      {cart.needsAddress && (
        <div className="flex justify-between text-[var(--text-muted)]">
          <dt>Delivery</dt>
          <dd>Worked out at checkout</dd>
        </div>
      )}
      {cart.tax > 0 && (
        <div className="flex justify-between text-[var(--text-muted)]">
          <dt>{cart.pricesIncludeTax ? `Includes ${cart.taxName}` : `${cart.taxName} ${cart.taxRate}%`}</dt>
          <dd>{formatPrice(cart.tax, cart.currency)}</dd>
        </div>
      )}
      <div className="flex justify-between border-t border-[var(--border-soft)] pt-2 text-[16px] font-medium">
        <dt>Total</dt>
        <dd data-testid="cart-total">{formatPrice(cart.total, cart.currency)}</dd>
      </div>
    </dl>
  );
}

function Dropped({ names, held }: { names: string[]; held: string[] }) {
  if (names.length === 0 && held.length === 0) return null;
  return (
    <div className="mt-4 space-y-2">
      {names.length > 0 && <TidyCart />}
      {names.length > 0 && (
        <p className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px] text-[var(--text-body)]">
          {names.join(", ")} {names.length === 1 ? "is" : "are"} no longer available, so we took {names.length === 1 ? "it" : "them"} out of your cart.
        </p>
      )}
      {held.length > 0 && (
        <p data-testid="held" className="rounded-[6px] border border-[var(--border)] px-4 py-3 text-[14px] text-[var(--text-body)]">
          {held.join(", ")} {held.length === 1 ? "is" : "are"} in someone else&apos;s checkout right now. If they don&apos;t finish within half an hour, {held.length === 1 ? "it'll" : "they'll"} be back.
        </p>
      )}
    </div>
  );
}

function Gone({ site, menus }: { site: Site; menus: Awaited<ReturnType<typeof siteMenus>> }) {
  return (
    <Frame site={site} menus={menus} current="/shop/checkout">
      <p className="py-16 text-center text-[var(--text-muted)]">We couldn&apos;t find that order.</p>
    </Frame>
  );
}

/** A sensible first guess for the country box: where the money is. */
