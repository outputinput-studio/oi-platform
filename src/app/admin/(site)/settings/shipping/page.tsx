import { requireSiteAccess } from "@/modules/auth/access";
import { siteShipping, siteShop } from "@/modules/sites/server";
import { publicForm } from "@/modules/forms/server";
import { COUNTRIES } from "@/lib/countries";
import { PageHeader } from "../../../ui";
import { ShippingEditor } from "./shipping-editor";

export const dynamic = "force-dynamic";

/** Settings · Shipping, as in design/admin.html: dispatch time, zones, and the rates in each. Owners and managers change it. */
export default async function ShippingPage() {
  const { site } = await requireSiteAccess("manager");
  const enquiryId = siteShop(site).enquiryFormId;
  const hasEnquiryForm = enquiryId ? !!(await publicForm({ siteId: site.id, formId: enquiryId })) : false;
  return (
    <>
      <PageHeader title="Shipping" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <ShippingEditor initial={siteShipping(site)} currency={siteShop(site).currency} countries={COUNTRIES} canEdit hasEnquiryForm={hasEnquiryForm} />
      </div>
    </>
  );
}
