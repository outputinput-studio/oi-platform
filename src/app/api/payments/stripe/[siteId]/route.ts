import type Stripe from "stripe";
import { withSite } from "@/db/client";
import { sites } from "@/db/schema";
import { markOrderFailed, markOrderPaid } from "@/modules/orders/server";
import { siteStripe, siteWebhookSecret } from "@/modules/payments/server";

/**
 * Each site's own Stripe sends its events here, to the address shown on
 * Settings · Payments (it carries the site's id). The site's own signing
 * secret proves it came from that site's Stripe, so one site can't mark
 * another site's order paid.
 */
export async function POST(req: Request, ctx: { params: Promise<{ siteId: string }> }): Promise<Response> {
  const { siteId } = await ctx.params;
  if (!isUuid(siteId)) return new Response("Not found.", { status: 404 });
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1)).catch(() => []);
  const secret = site ? siteWebhookSecret(site) : null;
  if (!site || !secret) return new Response("Payments aren't set up here.", { status: 404 });

  let event: Stripe.Event;
  try {
    event = siteStripe(site).webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId ?? "";
    if (session.payment_status !== "paid" || session.metadata?.siteId !== siteId || !isUuid(orderId)) return Response.json({ ignored: true });
    await markOrderPaid({ siteId, orderId });
    return Response.json({ ok: true });
  }
  if (event.type === "checkout.session.async_payment_failed") {
    const session = event.data.object;
    const orderId = session.metadata?.orderId ?? "";
    if (session.metadata?.siteId !== siteId || !isUuid(orderId)) return Response.json({ ignored: true });
    await markOrderFailed({ siteId, orderId });
    return Response.json({ ok: true });
  }
  return Response.json({ ignored: true });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
