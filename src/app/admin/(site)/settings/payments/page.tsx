import { requireSiteAccess } from "@/modules/auth/access";
import { paymentsStatus, refreshStripeAccount } from "@/modules/payments/server";
import { connectStripeAction, disconnectStripeAction } from "@/modules/payments/actions";
import { Button, Label, PageHeader, Pill, Row, Rows } from "../../../ui";

export const dynamic = "force-dynamic";

/**
 * Settings · Payments, as in design/admin.html: connect the business's
 * own Stripe account. Stripe holds the card details, the money and the
 * payouts; nothing to copy or paste here.
 */
export default async function PaymentsPage() {
  const { user, site, role } = await requireSiteAccess();
  let s = paymentsStatus(site);
  if (s.provider === "stripe" && s.stripeAccountId) {
    try {
      await refreshStripeAccount({ actorId: user.id, siteId: site.id });
      const { site: fresh } = await requireSiteAccess();
      s = paymentsStatus(fresh);
    } catch (err) {
      console.error("stripe refresh failed", err);
    }
  }
  const owner = role === "owner";
  return (
    <>
      <PageHeader title="Payments" back="/settings" />
      <div className="max-w-[640px] space-y-6 pt-5 md:pt-6">
        {s.provider === "test" && (
          <div data-testid="test-payments" className="rounded-card border border-warning bg-warning-bg px-4 py-3">
            <p className="text-[14px] font-medium">Test payments are on</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-body">
              This copy of the site has no Stripe keys, so checkout uses a test page instead: orders go through, nothing real moves. On the live site this is where you connect Stripe.
            </p>
          </div>
        )}
        {s.provider === null && (
          <div className="rounded-card border border-line bg-surface px-4 py-3">
            <p className="text-[14px] font-medium">Not switched on yet</p>
            <p className="mt-0.5 text-[12.5px] leading-[1.5] text-muted">Output/Input is finishing the payments set-up. Your site stays up and people can still enquire; Add to cart appears once this is ready.</p>
          </div>
        )}
        {s.provider === "stripe" && !s.stripeAccountId && (
          <div className="rounded-card border border-line bg-surface p-4">
            <p className="text-[16px] font-medium">Take payments with Stripe</p>
            <p className="mt-1 text-[13px] leading-[1.5] text-body">Stripe handles the card details, the money and the payouts to your bank. You&apos;ll never see a card number, and there&apos;s nothing here to copy or paste.</p>
            {owner ? (
              <form action={connectStripeAction} className="mt-4">
                <Button type="submit">Connect Stripe</Button>
              </form>
            ) : (
              <p className="mt-3 text-[13px] text-muted">An owner connects Stripe.</p>
            )}
            <p className="mt-3 text-[12.5px] text-muted">Opens Stripe. You&apos;ll answer their questions about the business and your bank account, then land back here. Ten minutes, once.</p>
            <p className="mt-3 text-[12.5px] text-muted">Until this is done your site stays up and people can still enquire, but nothing can be bought — Add to cart is hidden.</p>
          </div>
        )}
        {s.provider === "stripe" && s.stripeAccountId && (
          <>
            <div>
              <Label>Stripe</Label>
              <Rows variant="static">
                <Row
                  title={
                    <span className="flex items-center gap-2">
                      {s.chargesEnabled ? "Connected" : "Not finished"} {!s.livemode && <Pill tone="warning">Test mode</Pill>}
                    </span>
                  }
                  detail={`${s.businessName || "Your business"} · Stripe`}
                />
                {s.bankLast4 && <Row title="Paid into" detail={`···· ${s.bankLast4}`} />}
                <Row title="Payouts" detail="By Stripe, to your bank. Refunds, disputes and tax paperwork live in Stripe too." />
              </Rows>
            </div>
            {!s.chargesEnabled && (
              <div className="rounded-card border border-warning bg-warning-bg p-4">
                <p className="text-[14px] font-medium">Stripe still has questions</p>
                <p className="mt-0.5 text-[12.5px] text-body">Nothing can be bought until they&apos;re answered.</p>
                {owner && (
                  <form action={connectStripeAction} className="mt-3">
                    <Button type="submit" size="sm">
                      Finish in Stripe
                    </Button>
                  </form>
                )}
              </div>
            )}
            {owner && (
              <form action={disconnectStripeAction} className="rounded-card border border-line bg-surface p-4">
                <Button type="submit" variant="danger" size="sm">
                  Disconnect Stripe
                </Button>
                <p className="mt-2 text-[12.5px] text-muted">Nothing can be bought while it&apos;s disconnected. Your Stripe account itself stays as it is.</p>
              </form>
            )}
          </>
        )}
      </div>
    </>
  );
}
