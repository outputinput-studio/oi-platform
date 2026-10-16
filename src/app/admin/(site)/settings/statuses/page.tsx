import { requireSiteAccess } from "@/modules/auth/access";
import { siteShop } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { StatusesForm } from "./statuses-form";

export const dynamic = "force-dynamic";

/** Settings · Order statuses, as in design/admin.html: the four stages in your own words. */
export default async function StatusesPage() {
  const { site, role } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Order statuses" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <StatusesForm initial={siteShop(site).statusNames} canEdit={role === "owner"} />
      </div>
    </>
  );
}
