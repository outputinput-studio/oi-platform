import { requireSiteAccess } from "@/modules/auth/access";
import { businessOf } from "@/modules/sites/business";
import { PageHeader } from "../../../ui";
import { BusinessForm } from "./business-form";

export const dynamic = "force-dynamic";

/** Settings · Business profile, as in design/admin.html. Owners and managers change it. */
export default async function BusinessPage() {
  const { site } = await requireSiteAccess("manager");
  return (
    <>
      <PageHeader title="Business profile" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <BusinessForm initial={businessOf(site)} siteName={site.name} canEdit />
      </div>
    </>
  );
}
