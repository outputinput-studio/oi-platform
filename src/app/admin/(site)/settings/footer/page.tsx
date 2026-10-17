import { requireSiteAccess } from "@/modules/auth/access";
import { listForms } from "@/modules/forms/server";
import { siteSearch, siteTheme } from "@/modules/sites/server";
import { SOCIAL_NETWORKS } from "@/modules/sites/search";
import { PageHeader } from "../../../ui";
import { FooterForm } from "./footer-form";

export const dynamic = "force-dynamic";

/** Settings · Footer, as in design/admin.html: the newsletter form on every page, and social links. Footer menus are in Content · Menus. */
export default async function FooterPage() {
  const { site, user } = await requireSiteAccess("manager");
  const forms = await listForms({ actorId: user.id, siteId: site.id });
  const footer = siteTheme(site).footer;
  const b = siteSearch(site).business;
  return (
    <>
      <PageHeader title="Footer" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <FooterForm
          initial={{
            newsletterFormId: forms.some((f) => f.id === footer.newsletterFormId) ? footer.newsletterFormId : null,
            newsletterHeading: footer.newsletterHeading,
            social: Object.fromEntries(SOCIAL_NETWORKS.map(([k]) => [k, b[k]])) as Record<(typeof SOCIAL_NETWORKS)[number][0], string>,
          }}
          forms={forms.map((f) => ({ id: f.id, name: f.name, fields: f.fields.length, createContact: f.createContact }))}
          canEdit
        />
      </div>
    </>
  );
}
