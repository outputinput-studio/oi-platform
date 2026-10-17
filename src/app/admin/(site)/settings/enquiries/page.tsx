import { requireSiteAccess } from "@/modules/auth/access";
import { listForms } from "@/modules/forms/server";
import { siteShop } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { EnquiryFormPicker } from "./enquiry-form-picker";

export const dynamic = "force-dynamic";

/**
 * Settings · Enquiries: the one form people use to ask about something.
 * Enquire-only and sold products show it with the product named, and a
 * delivery zone that's quoted individually sends its requests through it.
 * Owners and managers choose.
 */
export default async function EnquiriesPage() {
  const { user, site } = await requireSiteAccess("manager");
  const forms = await listForms({ actorId: user.id, siteId: site.id });
  const current = siteShop(site).enquiryFormId;
  return (
    <>
      <PageHeader title="Enquiries" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <EnquiryFormPicker
          forms={forms.map((f) => ({ id: f.id, name: f.name, fields: f.fields.length }))}
          initial={forms.some((f) => f.id === current) ? current : null}
          canEdit
        />
      </div>
    </>
  );
}
