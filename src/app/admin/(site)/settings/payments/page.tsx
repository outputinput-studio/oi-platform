import { headers } from "next/headers";
import { requireSiteAccess } from "@/modules/auth/access";
import { paymentsStatus } from "@/modules/payments/server";
import { refreshStripeAction, removeStripeKeysAction } from "@/modules/payments/actions";
import { secretsAvailable } from "@/lib/secrets";
import { Button, Label, PageHeader, Pill, Row, Rows } from "../../../ui";
import { StripeKeysForm } from "./stripe-keys-form";

export const dynamic = "force-dynamic";

/**
 * Settings · Payments: the business's own Stripe account. They put their
 * own keys in; customers pay that account directly, and payouts, refunds
 * history, disputes and tax paperwork all live in their Stripe.
 */
export default async function PaymentsPage() {
  const { site, role } = await requireSiteAccess();
  const s = paymentsStatus(site);
  const owner = role === "owner";
  const host = (await headers()).get("x-oi-host") ?? "";
  const webhookUrl = `https://${host}/api/payments/stripe/${site.id}`;
  return (
    <>
      <PageHeader title="Payments" back="/settings" />
      <div className="max-w-[640px] space-y-6 pt-5 md:pt-6">
        {s.provider === "test" && (
          <div data-testid="test-payments" className="rounded-card border border-warning bg-warning-bg px-4 py-3">
            <p className="text-[14px] font-medium">Test payments are on</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-body">No Stripe keys here yet, so checkout uses a test page: orders go through, nothing real moves. On the live site, nothing can be bought until your keys are in.</p>
          </div>
        )}

        {s.hasKeys ? (
          <div>
            <Label>Your Stripe</Label>
            <Rows variant="static">
              <Row
                title={
                  <span className="flex items-center gap-2">
                    {s.chargesEnabled ? "Connected" : "Stripe still has questions"} {!s.livemode && <Pill tone="warning">Test mode</Pill>}
                  </span>
                }
                detail={`${s.businessName || "Your Stripe account"} · key ending ${s.keyLast4}`}
              />
              <Row title="Webhook" detail={s.hasWebhook ? "Set — orders are confirmed even if the customer closes the page" : "Not set — add it so no paid order is missed"} />
            </Rows>
            {!s.chargesEnabled && (
              <form action={refreshStripeAction} className="mt-3">
                <p className="mb-2 text-[12.5px] text-muted">Finish Stripe&apos;s own questions in your Stripe dashboard, then check again.</p>
                <Button type="submit" size="sm" variant="quiet">
                  Check again
                </Button>
              </form>
            )}
          </div>
        ) : (
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-[16px] font-medium">Take payments with your own Stripe</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-body">Customers pay your Stripe account directly. Stripe holds the card details, the money and the payouts to your bank; you&apos;ll never see a card number.</p>
          </div>
        )}

        {owner ? (
          secretsAvailable() ? (
            <div>
              <Label>{s.hasKeys ? "Replace your keys" : "Your keys"}</Label>
              <ol className="mb-4 list-decimal space-y-2 pl-5 text-[13px] leading-[1.5] text-body">
                <li>
                  In Stripe, go to <b>Developers → API keys → Create restricted key</b>. Give it write access to <b>Checkout Sessions</b>, <b>Coupons</b> and <b>Refunds</b>, and read access to <b>Balance</b>. (Your standard secret key also works.)
                </li>
                <li>
                  Go to <b>Developers → Webhooks → Add endpoint</b>. Paste the address below, pick the events <b>checkout.session.completed</b> and <b>checkout.session.async_payment_succeeded</b>, then copy its <b>Signing secret</b>.
                </li>
                <li>Paste both here and save. We check the key with Stripe, then keep it encrypted — nobody can read it back, us included.</li>
              </ol>
              <p className="label mb-1.5">Webhook address</p>
              <p data-testid="webhook-url" className="mb-4 break-all rounded-card border border-line bg-sunken px-3.5 py-2.5 font-mono text-[12.5px]">
                {webhookUrl}
              </p>
              <StripeKeysForm hasKeys={s.hasKeys} />
            </div>
          ) : (
            <p className="rounded-card border border-line bg-surface px-4 py-3 text-[13px] text-muted">Secure storage for keys isn&apos;t switched on here yet. Output/Input needs to finish this before keys can be saved.</p>
          )
        ) : (
          <p className="text-[13px] text-muted">An owner puts the Stripe keys in.</p>
        )}

        {owner && s.hasKeys && (
          <form action={removeStripeKeysAction} className="rounded-card border border-line bg-surface p-4">
            <Button type="submit" variant="danger" size="sm">
              Remove the keys
            </Button>
            <p className="mt-2 text-[12.5px] text-muted">Nothing can be bought until new ones go in. Your Stripe account itself stays as it is.</p>
          </form>
        )}
      </div>
    </>
  );
}
