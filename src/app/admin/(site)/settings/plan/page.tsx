import { requireSiteAccess } from "@/modules/auth/access";
import { planView } from "@/modules/plans/server";
import { billingView, confirmPaying } from "@/modules/billing/server";
import { cardWords } from "@/modules/billing/billing";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { Label, PageHeader } from "../../../ui";
import { UsageMeters } from "../../../usage-meters";
import { ManageBilling, StartPaying } from "./billing-forms";

export const dynamic = "force-dynamic";

const day = (d: Date) => d.toLocaleDateString("en-AU", { day: "numeric", month: "long", timeZone: "UTC" });

/**
 * Settings · Plan (design/admin.html): "Your arrangement with us" — the plan
 * output/input set, when it next renews, what the site uses against it, and
 * "Paying for it": the card on file, or Set up payment. Owners only.
 */
export default async function PlanPage({ searchParams }: { searchParams: Promise<{ paid?: string; session?: string }> }) {
  const { user, site } = await requireSiteAccess("owner");
  const q = await searchParams;
  // Back from Stripe's page: ask Stripe now rather than waiting for its webhook.
  if (q.session) await confirmPaying({ actorId: user.id, siteId: site.id, sessionId: q.session });
  const [{ plan, usage }, { provider, billing: b }] = await Promise.all([planView({ actorId: user.id, siteId: site.id }), billingView({ actorId: user.id, siteId: site.id })]);
  const paying = b && (b.status === "active" || b.status === "past_due");
  // What they're billed is Stripe's number; a price changed in ops shows from the next bill.
  const nextBill = paying && plan && b.price !== plan.price ? plan.price : null;

  return (
    <>
      <PageHeader title="Plan" back="/settings" />
      <div className="max-w-[640px] space-y-8 pt-5 md:pt-7">
        {q.paid && paying && (
          <p role="status" data-testid="paid-notice" className="rounded-card border border-success bg-success-bg px-4 py-3 text-[14px]">
            Thanks — your card is on file and your plan is paid monthly from here.
          </p>
        )}
        {b?.status === "past_due" && (
          <div data-testid="past-due" className="space-y-3 rounded-card border border-warning bg-warning-bg px-4 py-3">
            <p className="text-[14px] leading-relaxed">
              Your last payment didn&apos;t go through. Nothing has stopped — Stripe will try again, or you can update your card now.
            </p>
            <ManageBilling label="Update your card" />
          </div>
        )}

        <section>
          <Label>Your arrangement with us</Label>
          <div data-testid="plan-card" className="rounded-card border border-line bg-surface px-4 py-4">
            {plan ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[18px] font-semibold">{plan.name}</p>
                  <p className="font-mono text-[15px]">
                    {formatPrice(paying ? b.price : plan.price, (paying ? b.currency : plan.currency) as Currency)} <span className="text-[13px] text-muted">a month</span>
                  </p>
                </div>
                {plan.description && <p className="mt-2 text-[14px] leading-relaxed text-body">{plan.description}</p>}
                {paying && b.renewsAt && (
                  <p data-testid="renews" className="mt-3 text-[13px] text-muted">
                    Next renews {day(b.renewsAt)}
                    {nextBill !== null && <> · then {formatPrice(nextBill, b.currency as Currency)} a month</>}
                  </p>
                )}
              </>
            ) : (
              <p className="text-[14px] text-body">We haven&apos;t put your plan in here yet. Ask us and we&apos;ll set it up.</p>
            )}
          </div>
        </section>

        <section>
          <Label>What you are using</Label>
          <UsageMeters plan={plan} usage={usage} />
        </section>

        {plan && plan.price > 0 && (
          <section>
            <Label>Paying for it</Label>
            <div data-testid="paying" className="rounded-card border border-line bg-surface px-4 py-4">
              {paying ? (
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-[15px] font-medium">{cardWords(b.cardBrand, b.cardLast4) ?? "Card on file"}</p>
                    {b.cardExpires && <p className="text-[13px] text-muted">Expires {b.cardExpires}</p>}
                    {b.provider === "test" && <p className="mt-1 text-[12.5px] text-warning">Test billing — no card is charged.</p>}
                  </div>
                  {b.provider === "stripe" && <ManageBilling />}
                </div>
              ) : provider ? (
                <div className="space-y-3">
                  <p className="text-[14px] leading-relaxed text-body">
                    Monthly, by card, through Stripe. You add the card on Stripe&apos;s own page; we never see its number. Your first month starts today.
                  </p>
                  {provider === "test" && <p className="text-[12.5px] text-warning">Test billing here — no card is asked for or charged.</p>}
                  <StartPaying />
                </div>
              ) : (
                <p className="text-[14px] text-body">Paying online isn&apos;t open yet. We&apos;ll let you know when it is.</p>
              )}
            </div>
          </section>
        )}
      </div>
    </>
  );
}
