import { requireSiteAccess } from "@/modules/auth/access";
import { PageHeader } from "../../../ui";
import { SettingsForm } from "../settings-form";

export const dynamic = "force-dynamic";

/** The site's name. Owners and managers change it. */
export default async function SiteSettingsPage() {
  const { site } = await requireSiteAccess("manager");
  return (
    <>
      <PageHeader title="Site name" back="/settings" />
      <div className="pt-5 md:pt-6">
        <SettingsForm name={site.name} slug={site.slug} canEdit />
      </div>
    </>
  );
}
