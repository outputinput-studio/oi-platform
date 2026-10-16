import { requireSiteAccess } from "@/modules/auth/access";
import { siteSearch, siteTheme } from "@/modules/sites/server";
import { Label, PageHeader, Row, Rows } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * Settings, as in design/admin.html: groups of rows, each a screen of its
 * own. More rows arrive with each module (selling, messages, domains…).
 */
export default async function SettingsPage() {
  const { site, role, user } = await requireSiteAccess();
  return (
    <>
      <PageHeader title="Settings" back="/" />
      <div className="space-y-7 pt-5 md:pt-6">
        <section>
          <Label>Your site</Label>
          <Rows>
            <Row title="Site name" detail={site.name} href="/settings/site" />
            <Row title="Theme" detail={`${siteTheme(site).mode === "light" ? "Light" : "Dark"} · accent ${siteTheme(site).accent}`} href="/settings/theme" />
            <Row title="Address" detail={`${site.slug} · your own domain arrives in a later stage`} />
            <Row title="Search engines" detail={siteSearch(site).hideFromSearch ? "Hidden from Google" : "Sitemap, title pattern, sharing image"} href="/settings/search" />
            <Row title="Redirects" detail="Old addresses, pointed somewhere useful" href="/settings/redirects" />
            <Row title="Team" detail={role === "owner" ? "Who can sign in, and as what" : "Who can sign in"} href="/team" />
          </Rows>
        </section>
        <section>
          <Label>You</Label>
          <Rows>
            <Row title="Your account" detail={user.email} href="/account" />
          </Rows>
        </section>
      </div>
    </>
  );
}
