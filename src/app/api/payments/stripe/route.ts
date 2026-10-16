import { eq } from "drizzle-orm";
import type Stripe from "stripe";
import { withSite } from "@/db/client";
import { sites } from "@/db/schema";
import { env } from "@/lib/env";
import { markOrderPaid } from "@/modules/orders/server";
import { readPayments } from "@/modules/payments/settings";
import { stripe } from "@/modules/payments/server";

/**
 * Stripe's Connect webhook: events from every client's connected account
 * arrive here. The signature proves it's Stripe; the site comes from the
 * metadata we put on the checkout, and must own the account the event
 * came from, so one site's Stripe can't mark another site's order paid.
 */
export async function POST(req: Request): Promise<Response> {
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret || !env().STRIPE_SECRET_KEY) return new Response("Payments aren't set up here.", { status: 404 });
  const signature = req.headers.get("stripe-signature") ?? "";
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(await req.text(), signature, secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }

  if (event.type === "checkout.session.completed" || event.type === "checkout.session.async_payment_succeeded") {
    const session = event.data.object;
    const siteId = session.metadata?.siteId ?? "";
    const orderId = session.metadata?.orderId ?? "";
    if (session.payment_status !== "paid" || !isUuid(siteId) || !isUuid(orderId)) return Response.json({ ignored: true });
    const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1)).catch(() => []);
    if (!site || readPayments(site.payments).stripeAccountId !== event.account) return new Response("Not this site's account.", { status: 400 });
    await markOrderPaid({ siteId, orderId });
    return Response.json({ ok: true });
  }

  if (event.type === "account.updated") {
    const a = event.data.object;
    const siteId = a.metadata?.siteId ?? "";
    if (!isUuid(siteId)) return Response.json({ ignored: true });
    await withSite(siteId, async (tx) => {
      const [site] = await tx.select().from(sites).limit(1);
      if (!site) return;
      const cur = readPayments(site.payments);
      if (cur.stripeAccountId !== a.id) return;
      await tx
        .update(sites)
        .set({ payments: { ...cur, chargesEnabled: !!a.charges_enabled, detailsSubmitted: !!a.details_submitted } })
        .where(eq(sites.id, siteId));
    });
    return Response.json({ ok: true });
  }

  return Response.json({ ignored: true });
}

function isUuid(s: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
}
