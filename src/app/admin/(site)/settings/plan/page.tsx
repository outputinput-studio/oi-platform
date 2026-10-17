import { requireSiteAccess } from "@/modules/auth/access";
import { planView } from "@/modules/plans/server";
import { formatPrice } from "@/modules/sites/shop";
import { Label, PageHeader } from "../../../ui";
import { UsageMeters } from "../../../usage-meters";

export const dynamic = "force-dynamic";

/**
 * Settings · Plan (design/admin.html): "Your arrangement with us" — the plan
 * output/input set, and what the site uses against it. Owners only. Adding
 * to the plan and paying for it arrive with billing.
 */
export default async function PlanPage() {
  const { user, site } = await requireSiteAccess("owner");
  const { plan, usage } = await planView({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Plan" back="/settings" />
      <div className="max-w-[640px] space-y-8 pt-5 md:pt-7">
        <section>
          <Label>Your arrangement with us</Label>
          <div data-testid="plan-card" className="rounded-card border border-line bg-surface px-4 py-4">
            {plan ? (
              <>
                <div className="flex items-baseline justify-between gap-3">
                  <p className="text-[18px] font-semibold">{plan.name}</p>
                  <p className="font-mono text-[15px]">
                    {formatPrice(plan.price, plan.currency)} <span className="text-[13px] text-muted">a month</span>
                  </p>
                </div>
                {plan.description && <p className="mt-2 text-[14px] leading-relaxed text-body">{plan.description}</p>}
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
      </div>
    </>
  );
}
