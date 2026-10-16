import { headers } from "next/headers";
import { requireSiteAccess } from "@/modules/auth/access";
import { siteSearch } from "@/modules/sites/server";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { PageHeader } from "../../../ui";
import { SearchForm } from "./search-form";

export const dynamic = "force-dynamic";

/** Settings · Search engines, as in design/admin.html. Owners only. */
export default async function SearchSettingsPage() {
  const { site, role } = await requireSiteAccess();
  const adminHost = (await headers()).get("x-oi-host") ?? "";
  const siteHost = adminHost.replace(/^admin\./, `${site.slug}.`);
  const s = siteSearch(site);
  return (
    <>
      <PageHeader title="Search engines" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <SearchForm
          initial={s}
          siteName={site.name}
          siteHost={siteHost}
          shareImageUrl={s.shareImage ? mediaUrl(s.shareImage.key) : undefined}
          mediaAvailable={mediaAvailable()}
          canEdit={role === "owner"}
        />
      </div>
    </>
  );
}
