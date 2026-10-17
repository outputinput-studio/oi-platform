import Stripe from "stripe";
import { env } from "@/lib/env";
import { billingStripe, handleBillingEvent } from "@/modules/billing/server";

/**
 * O/I's own Stripe tells us about plan payments here (Stage 39b): a card
 * set up, a monthly bill paid or failed, a subscription changed or ended.
 * The signing secret (OI_BILLING_WEBHOOK_SECRET) proves it's our Stripe;
 * which site it's about comes from the subscription's metadata, set by us.
 */
export async function POST(req: Request): Promise<Response> {
  const stripe = billingStripe();
  const secret = env().OI_BILLING_WEBHOOK_SECRET;
  if (!stripe || !secret) return new Response("Billing isn't set up here.", { status: 404 });

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(await req.text(), req.headers.get("stripe-signature") ?? "", secret);
  } catch {
    return new Response("Bad signature.", { status: 400 });
  }
  try {
    const siteId = await handleBillingEvent(event);
    return Response.json(siteId ? { ok: true } : { ignored: true });
  } catch (err) {
    // Stripe tries again later; nothing is half-done, as each event re-reads the subscription whole.
    console.error("billing webhook:", err instanceof Error ? err.message : err);
    return new Response("Try again.", { status: 500 });
  }
}
