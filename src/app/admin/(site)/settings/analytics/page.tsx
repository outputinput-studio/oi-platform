import { requireSiteAccess } from "@/modules/auth/access";
import { readAnalytics, readCookieNotice } from "@/modules/sites/tracking";
import { PageHeader } from "../../../ui";
import { AnalyticsForm } from "./analytics-form";

export const dynamic = "force-dynamic";

/** Settings · Analytics: a Google Analytics ID and a Meta pixel ID. Owners and managers. */
export default async function AnalyticsPage() {
  const { site } = await requireSiteAccess("manager");
  return (
    <>
      <PageHeader title="Analytics" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <AnalyticsForm initial={readAnalytics(site.analytics)} noticeOn={readCookieNotice(site.cookies).enabled} live={!!site.launchedAt} canEdit />
      </div>
    </>
  );
}
