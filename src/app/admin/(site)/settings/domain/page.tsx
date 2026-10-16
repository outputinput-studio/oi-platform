import { headers } from "next/headers";
import { publicHost, slugHost } from "@/lib/hosts";
import { requireSiteAccess } from "@/modules/auth/access";
import { domainStatus } from "@/modules/sites/domain";
import { teamPreviewPass } from "@/modules/sites/launch";
import { PageHeader } from "../../../ui";
import { DomainSettings } from "./domain-settings";

export const dynamic = "force-dynamic";

/** Settings · Domain (design/admin.html): where the site lives, the client's own domain, and Going live. */
export default async function DomainPage() {
  const { site, role, user } = await requireSiteAccess();
  const h = await headers();
  const adminHost = h.get("x-oi-host") ?? "";
  // Locally the site is on http and a port; on Vercel, https.
  const proto = h.get("x-forwarded-proto") ?? "https";
  const port = (h.get("host") ?? "").match(/:\d+$/)?.[0] ?? "";
  const status = await domainStatus({ actorId: user.id, siteId: site.id });
  const slug = slugHost(adminHost, site.slug);
  const fresh = { ...site, domainOkAt: site.domainOkAt ?? (status.connected ? new Date() : null) };
  const address = publicHost(fresh, slug);
  const preview = `${proto}://${address}${address === slug ? port : ""}/preview-pass?t=${encodeURIComponent(await teamPreviewPass({ actorId: user.id, siteId: site.id }))}`;
  return (
    <>
      <PageHeader title="Domain" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <DomainSettings status={status} slugHost={slug} address={address} previewUrl={preview} canEdit={role === "owner"} />
      </div>
    </>
  );
}
