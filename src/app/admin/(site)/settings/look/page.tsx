import { requireSiteAccess } from "@/modules/auth/access";
import { siteTheme } from "@/modules/sites/server";
import { PageHeader } from "../../../ui";
import { LookForm } from "./look-form";

export const dynamic = "force-dynamic";

/** How the site looks to visitors: light or dark, and the brand colour. */
export default async function LookPage() {
  const { site, role } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Look" back="/settings" />
      <div className="pt-5 md:pt-6">
        <LookForm theme={siteTheme(site)} canEdit={role === "owner"} />
      </div>
    </>
  );
}
