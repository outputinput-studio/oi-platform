import { requireSiteAccess } from "@/modules/auth/access";
import { mediaAvailable, mediaUrl } from "@/modules/media/server";
import { siteSearch, siteTheme } from "@/modules/sites/server";
import { siteColours } from "@/modules/sites/theme";
import { PageHeader } from "../../../ui";
import { BrandingForm } from "./branding-form";

export const dynamic = "force-dynamic";

/** Settings · Branding, as in design/admin.html: logo, favicon and the site's colours. Owners and managers change it. */
export default async function BrandingPage() {
  const { site } = await requireSiteAccess("manager");
  const t = siteTheme(site);
  // An older site's logo for Google stands in until Branding has its own.
  const logo = t.logo ?? siteSearch(site).business.logo;
  return (
    <>
      <PageHeader title="Branding" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <BrandingForm
          initial={{ accent: t.accent, ...siteColours(t), logo, favicon: t.favicon }}
          urls={{ logo: logo ? mediaUrl(logo.key) : undefined, favicon: t.favicon ? mediaUrl(t.favicon.key) : undefined }}
          siteName={site.name}
          mediaAvailable={mediaAvailable()}
          canEdit
        />
      </div>
    </>
  );
}
