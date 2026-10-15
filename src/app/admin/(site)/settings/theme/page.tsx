import { requireSiteAccess } from "@/modules/auth/access";
import { siteTheme } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { ThemeForm } from "./theme-form";

export const dynamic = "force-dynamic";

/** How the site looks to visitors: light or dark, and the brand colour. */
export default async function ThemePage() {
  const { site, role } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Theme" back="/settings" />
      <div className="pt-5 md:pt-6">
        <ThemeForm theme={siteTheme(site)} canEdit={role === "owner"} />
      </div>
    </>
  );
}
