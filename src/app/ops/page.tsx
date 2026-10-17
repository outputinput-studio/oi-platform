import Link from "next/link";
import { formatBytes } from "@/modules/plans/plan";
import { requireOps } from "@/modules/ops/access";
import { opsSites } from "@/modules/ops/server";
import { PageHeader, Rows } from "../admin/ui";
import { OpsShell } from "./ops-shell";

export const dynamic = "force-dynamic";

/** Ops Home: every client site with its plan and storage (design/operations.html, Sites). */
export default async function OpsHome() {
  const user = await requireOps();
  const sites = await opsSites({ actorId: user.id });
  return (
    <OpsShell email={user.email}>
      <PageHeader title="Sites" />
      <p className="mb-5 mt-5 text-[13.5px] text-muted">
        {sites.length} site{sites.length === 1 ? "" : "s"}. Open one to set its plan or see what it&apos;s using.
      </p>
      <Rows>
        {sites.map((s) => (
          <Link key={s.id} href={`/sites/${s.id}`} data-testid={`ops-site-${s.slug}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-3.5 hover:bg-hover">
            <span className="min-w-[160px] flex-1 text-[15px] font-medium">{s.name}</span>
            <span className="w-[220px] truncate font-mono text-[12.5px] text-muted">{s.domain ?? s.slug}</span>
            <span className="w-[160px] text-[13px] text-body">{s.planName ?? <span className="text-faint">No plan yet</span>}</span>
            <span className="w-[80px] text-[13px] text-muted">{s.launchedAt ? "Live" : "Not live"}</span>
            <span className="w-[80px] text-right font-mono text-[12.5px] text-muted">{formatBytes(s.storageBytes)}</span>
          </Link>
        ))}
      </Rows>
    </OpsShell>
  );
}
