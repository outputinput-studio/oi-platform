import { environmentName } from "@/lib/env";
import { requireSiteAccess } from "@/modules/auth/access";
import { signOut } from "@/modules/auth/actions";
import { newSubmissionCount } from "@/modules/forms/server";
import { Nav } from "./nav";

/**
 * The signed-in admin. Every page under here is for one site, chosen on
 * the site picker and re-checked against memberships on each request
 * (requireSiteAccess). Phone first: a screen fills the display with its
 * own header and the tab bar along the bottom; on a laptop the sidebar
 * takes the left 290 px and the screen sits beside it.
 */
export default async function SiteLayout({ children }: { children: React.ReactNode }) {
  const { site, user, role } = await requireSiteAccess();
  const envName = environmentName();
  const inboxCount = await newSubmissionCount({ siteId: site.id });
  return (
    <div className="min-h-screen md:pl-[var(--sidebar)]">
      <Nav siteName={site.name} userName={user.name || user.email} role={role} envName={envName === "production" ? null : envName} inboxCount={inboxCount} signOut={signOut} />
      <main className="px-4 pb-28 md:px-6 md:pb-12">
        <div className="mx-auto w-full max-w-[1120px]">{children}</div>
      </main>
    </div>
  );
}
