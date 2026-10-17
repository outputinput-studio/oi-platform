import { requireSiteAccess } from "@/modules/auth/access";
import { listPages } from "@/modules/pages/server";
import { readAnalytics, readCookieNotice } from "@/modules/sites/tracking";
import { PageHeader } from "../../../ui";
import { CookiesForm } from "./cookies-form";

export const dynamic = "force-dynamic";

/** Settings · Cookie notice: on or off, what it says, and a privacy page to link to. Owners only. */
export default async function CookiesPage() {
  const { site, role, user } = await requireSiteAccess();
  const pages = (await listPages({ actorId: user.id, siteId: site.id })).filter((p) => p.status === "published");
  const a = readAnalytics(site.analytics);
  return (
    <>
      <PageHeader title="Cookie notice" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <CookiesForm
          initial={readCookieNotice(site.cookies)}
          pages={pages.map((p) => ({ path: `/${p.slug}`, title: p.title }))}
          hasAnalytics={!!(a.gaId || a.metaPixelId)}
          canEdit={role === "owner"}
        />
      </div>
    </>
  );
}
