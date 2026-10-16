import type { Site } from "@/db/schema";
import { paymentsStatus, siteStripe } from "@/modules/payments/server";
import { mediaUrl } from "@/modules/media/server";
import type { CartLine } from "./cart";
import { HOLD_MINUTES, markOrderPaid, orderForCustomer, placeOrder, setProviderRef, type OrderItem } from "./server";

/**
 * From cart to payment. The order is saved first (pending), then the
 * customer pays: on Stripe's own checkout page, in the client's own Stripe
 * account, or — outside production with no Stripe keys — on a test page
 * where nothing real moves. Either way they come back to /shop/checkout/done.
 */
export async function startCheckout(p: { site: Site; host: string; cart: CartLine[]; cartRef?: string; details: unknown }): Promise<{ redirect: string }> {
  const pay = paymentsStatus(p.site);
  if (!pay.ready || !pay.provider) throw new Error("This shop isn't taking payments yet. Get in touch to order.");
  const order = await placeOrder({ site: p.site, cart: p.cart, cartRef: p.cartRef, details: p.details, provider: pay.provider });
  if (pay.provider === "test") return { redirect: `/shop/checkout/pay?order=${order.id}` };

  const base = `https://${p.host}`;
  const items = order.items as OrderItem[];
  const currency = order.currency.toLowerCase();
  const line_items = items.map((it) => ({
    quantity: it.qty,
    price_data: { currency, unit_amount: it.unit, product_data: { name: it.name, ...(it.photo ? { images: [mediaUrl(it.photo)] } : {}) } },
  }));
  if (order.shippingPrice > 0) line_items.push({ quantity: 1, price_data: { currency, unit_amount: order.shippingPrice, product_data: { name: `Delivery — ${String((order.shipping as { name?: string } | null)?.name ?? "")}`.replace(/ — $/, "") } } });
  // Prices that don't include tax get it added as its own line, so the total matches the order.
  const included = order.total === order.subtotal - order.discount + order.shippingPrice;
  if (!included) line_items.push({ quantity: 1, price_data: { currency, unit_amount: order.tax, product_data: { name: `${order.taxName} ${order.taxRate}%` } } });
  // A discount becomes a one-off coupon in the client's own Stripe, so their dashboard shows it.
  const stripe = siteStripe(p.site);
  const discounts = order.discount > 0 ? [{ coupon: (await stripe.coupons.create({ amount_off: order.discount, currency, duration: "once", name: order.discountCode || "Discount", max_redemptions: 1 })).id }] : undefined;
  const session = await stripe.checkout.sessions.create(
    {
      mode: "payment",
      line_items,
      ...(discounts ? { discounts } : {}),
      customer_email: order.email,
      client_reference_id: order.id,
      metadata: { siteId: p.site.id, orderId: order.id, number: String(order.number) },
      payment_intent_data: { metadata: { siteId: p.site.id, orderId: order.id, number: String(order.number) }, description: `Order ${order.number}` },
      success_url: `${base}/shop/checkout/done?order=${order.id}&session={CHECKOUT_SESSION_ID}`,
      cancel_url: `${base}/shop/cart`,
      // Stripe's page closes about when the stock we're holding for them is released.
      expires_at: Math.floor(Date.now() / 1000) + (HOLD_MINUTES - 2) * 60,
    },
  );
  await setProviderRef({ siteId: p.site.id, orderId: order.id, ref: session.id });
  if (!session.url) throw new Error("Stripe didn't give us a checkout page. Try again.");
  return { redirect: session.url };
}

/**
 * The customer is back from Stripe. Ask Stripe directly whether it's paid
 * rather than trusting the address, so the order shows as paid even if
 * the webhook is still on its way.
 */
export async function confirmStripeReturn(p: { site: Site; orderId: string; sessionId: string; adminUrl: string }): Promise<void> {
  const pay = paymentsStatus(p.site);
  if (pay.provider !== "stripe") return;
  const order = await orderForCustomer({ siteId: p.site.id, orderId: p.orderId });
  if (!order || order.paymentStatus === "paid" || order.providerRef !== p.sessionId) return;
  const session = await siteStripe(p.site).checkout.sessions.retrieve(p.sessionId);
  if (session.payment_status === "paid" && session.metadata?.orderId === order.id) await markOrderPaid({ siteId: p.site.id, orderId: order.id, adminUrl: p.adminUrl });
}
