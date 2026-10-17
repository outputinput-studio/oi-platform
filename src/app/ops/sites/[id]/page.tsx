import { headers } from "next/headers";
import { adminOriginForOps } from "@/lib/hosts";
import { ROLE_NAMES } from "@/modules/auth/roles";
import { requireOps } from "@/modules/ops/access";
import { opsSite } from "@/modules/ops/server";
import { billingLine, cardWords } from "@/modules/billing/billing";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { Label, PageHeader, Rows } from "../../../admin/ui";
import { UsageMeters } from "../../../admin/usage-meters";
import { OpsShell } from "../../ops-shell";
import { PlanForm } from "./plan-form";

export const dynamic = "force-dynamic";

/**
 * One site, from ops (design/operations.html): its plan — ours to set —
 * what it's using, and who can sign in (read-only; it mirrors their Team).
 */
export default async function OpsSitePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireOps();
  const { site, plan, usage, people, billing: b } = await opsSite({ actorId: user.id, siteId: (await params).id });
  const admin = adminOriginForOps((await headers()).get("x-oi-host") ?? "");
  return (
    <OpsShell email={user.email}>
      <PageHeader
        title={site.name}
        back="/"
        actions={
          <a href={`${admin}/sites`} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center rounded-button border border-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-hover">
            Open their admin ↗
          </a>
        }
      />
      <p className="mt-4 text-[13px] text-muted">
        <span className="font-mono">{site.domain ?? site.slug}</span> · {site.launchedAt ? "Live" : "Not live yet"} · Their admin opens in a new tab, so ops stays open here. It signs you in as Output/Input · Support. It&apos;s logged, and they can see we were there.
      </p>
      <div className="mt-7 grid gap-8 md:grid-cols-[1fr_360px]">
        <section>
          <Label>Plan</Label>
          <PlanForm siteId={site.id} plan={plan} />
        </section>
        <div className="space-y-8">
          <section>
            <Label>Paying</Label>
            <div data-testid="ops-paying" className="rounded-card border border-line bg-surface px-4 py-3.5">
              <p className={`text-[14.5px] font-medium ${b?.status === "past_due" ? "text-warning" : ""}`}>{billingLine(b)}</p>
              {b && b.status !== "canceled" ? (
                <p className="mt-1 font-mono text-[12.5px] text-muted">
                  {formatPrice(b.price, b.currency as Currency)} a month
                  {b.renewsAt && <> · next {b.renewsAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })}</>}
                  {cardWords(b.cardBrand, b.cardLast4) && <> · {cardWords(b.cardBrand, b.cardLast4)}</>}
                  {b.provider === "test" && <> · test billing</>}
                </p>
              ) : (
                <p className="mt-1 text-[12.5px] text-muted">An Owner sets up payment on Settings · Plan, once the plan has a price.</p>
              )}
            </div>
            {b && b.status !== "canceled" && <p className="mt-2 text-[12.5px] text-muted">A new price applies from their next bill. Their currency stays while they pay.</p>}
          </section>
          <section>
            <Label>Usage</Label>
            <UsageMeters plan={plan} usage={usage} />
          </section>
          <section>
            <Label right={`${people.length}`}>People</Label>
            <Rows variant="static">
              {people.map((p) => (
                <div key={p.email} className="px-4 py-3">
                  <p className="text-[14.5px] font-medium">{p.name || p.email}</p>
                  <p className="font-mono text-[12.5px] text-muted">
                    {p.email} · {ROLE_NAMES[p.role]}
                  </p>
                </div>
              ))}
            </Rows>
            <p className="mt-2 text-[12.5px] text-muted">Read-only here — this mirrors their own Team and roles.</p>
          </section>
        </div>
      </div>
    </OpsShell>
  );
}
