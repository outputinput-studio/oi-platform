import Link from "next/link";
import { requireOps } from "@/modules/ops/access";
import { listDefaultPlans } from "@/modules/plans/catalogue";
import { limitsLine } from "@/modules/plans/plan";
import { formatPrice } from "@/modules/sites/shop";
import { PageHeader, Rows } from "../../admin/ui";
import { OpsShell } from "../ops-shell";

export const dynamic = "force-dynamic";

/** Our default plans: each site is put on one, or given a custom plan of its own. */
export default async function OpsPlans() {
  const user = await requireOps();
  const list = await listDefaultPlans({ actorId: user.id });
  return (
    <OpsShell email={user.email}>
      <PageHeader
        title="Plans"
        actions={
          <Link href="/plans/new" className="inline-flex h-9 items-center rounded-button bg-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-accent-hover">
            New plan
          </Link>
        }
      />
      <p className="mb-5 mt-5 max-w-[640px] text-[13.5px] leading-relaxed text-muted">
        Our price list. Put a site on one of these from its page, or give it a custom plan of its own. Change a plan here and every site on it follows.
      </p>
      {list.length ? (
        <Rows>
          {list.map((p) => (
            <Link key={p.id} href={`/plans/${p.id}`} data-testid="default-plan" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-hover">
              <span className="min-w-[180px] flex-1 text-[15px] font-medium">{p.name}</span>
              <span className="font-mono text-[13px]">{formatPrice(p.price, p.currency)} a month</span>
              <span className="w-full font-mono text-[12px] text-muted md:order-last">{limitsLine(p)}</span>
              <span className="w-[80px] text-right text-[13px] text-muted">
                {p.sites} {p.sites === 1 ? "site" : "sites"}
              </span>
            </Link>
          ))}
        </Rows>
      ) : (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[14px] text-body">No plans yet. Add the ones you sell most.</p>
      )}
    </OpsShell>
  );
}
