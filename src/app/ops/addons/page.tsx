import Link from "next/link";
import { requireOps } from "@/modules/ops/access";
import { listAddons } from "@/modules/addons/server";
import { perMonth } from "@/modules/addons/addon";
import { PageHeader, Rows } from "../../admin/ui";
import { OpsShell } from "../ops-shell";

export const dynamic = "force-dynamic";

/** Our add-ons: what a site can add to its plan, what each costs, and whether they add it themselves. */
export default async function OpsAddons() {
  const user = await requireOps();
  const list = await listAddons({ actorId: user.id });
  return (
    <OpsShell email={user.email}>
      <PageHeader
        title="Add-ons"
        actions={
          <Link href="/addons/new" className="inline-flex h-9 items-center rounded-button bg-accent px-3.5 text-[13.5px] font-medium text-text hover:bg-accent-hover">
            New add-on
          </Link>
        }
      />
      <p className="mb-5 mt-5 max-w-[640px] text-[13.5px] leading-relaxed text-muted">
        Extras a site adds to its plan on Settings · Plan. Self-serve ones are one tap and on straight away; the rest say &ldquo;Ask us&rdquo; and we add them from the site&apos;s page.
      </p>
      {list.length ? (
        <Rows>
          {list.map((a) => (
            <Link key={a.id} href={`/addons/${a.id}`} data-testid="addon-row" className="flex flex-wrap items-baseline gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-hover">
              <span className="min-w-[180px] flex-1 text-[15px] font-medium">{a.name}</span>
              <span className="font-mono text-[13px]">{perMonth(a)}</span>
              <span className="w-[110px] text-[13px] text-muted">{a.selfServe ? "Self-serve" : "Ask us"}</span>
              <span className="w-[70px] text-right text-[13px] text-muted">
                {a.sites} {a.sites === 1 ? "site" : "sites"}
              </span>
            </Link>
          ))}
        </Rows>
      ) : (
        <p className="rounded-card border border-dashed border-line px-4 py-6 text-center text-[14px] text-body">No add-ons yet. Start with more GB, more visits and one more person.</p>
      )}
    </OpsShell>
  );
}
