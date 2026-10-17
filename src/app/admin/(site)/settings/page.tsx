import { requireSiteAccess } from "@/modules/auth/access";
import { siteSearch, siteShipping, siteShop, siteTheme } from "@/modules/sites/server";
import { paymentsStatus } from "@/modules/payments/server";
import { listForms } from "@/modules/forms/server";
import { businessOf, senderFor } from "@/modules/sites/business";
import { statusNames } from "@/modules/sites/shop";
import { siteColours, type Theme } from "@/modules/sites/theme";
import { readMessages, splitList, type Messages } from "@/modules/sites/messages";
import { readAccountSettings } from "@/modules/customers/settings";
import { Label, PageHeader, Row, Rows } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * Settings, as in design/admin.html: groups of rows, each a screen of its
 * own. More rows arrive with each module (selling, messages, domains…).
 */
export default async function SettingsPage() {
  const { site, role, user } = await requireSiteAccess();
  const shop = siteShop(site);
  const shipping = siteShipping(site);
  const profile = businessOf(site);
  const sender = senderFor(site);
  const messages = readMessages(site.messages);
  const enquiryId = shop.enquiryFormId;
  const enquiryForm = enquiryId ? (await listForms({ actorId: user.id, siteId: site.id })).find((f) => f.id === enquiryId) : undefined;
  return (
    <>
      <PageHeader title="Settings" back="/" />
      <div className="space-y-7 pt-5 md:pt-6">
        <section>
          <Label>Selling</Label>
          <Rows>
            <Row title="Shipping" detail={shipping.zones.length ? `${shipping.zones.length} zone${shipping.zones.length === 1 ? "" : "s"} · posted within ${shipping.dispatchDays} business days` : "Free delivery everywhere until you add a zone"} href="/settings/shipping" />
            <Row title="Product details" detail={shop.detailRows.length ? `${shop.detailRows.map((r) => r.title).join(", ")} · on every product page` : "Rows every product page opens up: materials, care, delivery"} href="/settings/product-details" />
            <Row title="Order statuses" detail={Object.values(statusNames(shop)).join(" · ")} href="/settings/statuses" />
            <Row title="Tax and currency" detail={`${shop.currency} · prices ${shop.pricesIncludeTax ? "include" : "don't include"} ${shop.taxName}`} href="/settings/shop" />
            <Row title="Payments" detail={paymentsLine(paymentsStatus(site))} href="/settings/payments" />
            <Row title="Enquiries" detail={enquiryForm ? `Through ${enquiryForm.name}` : "Choose the form people use to ask about a product"} href="/settings/enquiries" />
            <Row title="Customer accounts" detail={accountsLine(readAccountSettings(site.accounts))} href="/settings/accounts" />
          </Rows>
        </section>
        <section>
          <Label>Messages</Label>
          <Rows>
            <Row title="Customer emails" detail={`Four order emails${messages.keepCopy ? " · you keep a copy" : ""} · send yourself a test`} href="/settings/emails" />
            <Row title="Who gets notified" detail={notifyLine(messages)} href="/settings/notify" />
            <Row title="Sending" detail={`From ${sender.fromName}${sender.replyTo ? ` · replies to ${sender.replyTo}` : " · no reply address yet"}`} href="/settings/sending" />
          </Rows>
        </section>
        <section>
          <Label>Your business</Label>
          <Rows>
            <Row title="Business profile" detail={[profile.tradingName || site.name, profile.businessNumber].filter(Boolean).join(" · ")} href="/settings/business" />
            <Row title="Branding" detail={brandingLine(siteTheme(site))} href="/settings/branding" />
            <Row title="Footer" detail="Newsletter form and social links" href="/settings/footer" />
          </Rows>
        </section>
        <section>
          <Label>Your site</Label>
          <Rows>
            <Row title="Site name" detail={site.name} href="/settings/site" />
            <Row title="Domain" detail={domainLine(site)} href="/settings/domain" />
            <Row title="Search engines" detail={siteSearch(site).hideFromSearch ? "Hidden from Google" : "Sitemap, title pattern, sharing image"} href="/settings/search" />
            <Row title="Redirects" detail="Old addresses, pointed somewhere useful" href="/settings/redirects" />
          </Rows>
        </section>
        <section>
          <Label>People</Label>
          <Rows>
            <Row title="Team" detail={role === "owner" ? "Who can sign in, and as what" : "Who can sign in"} href="/team" />
            <Row title="Your account" detail={user.email} href="/account" />
          </Rows>
        </section>
      </div>
    </>
  );
}

function paymentsLine(s: ReturnType<typeof paymentsStatus>): string {
  if (s.provider === "test") return "Test payments until your Stripe keys go in";
  if (!s.hasKeys) return "Put your Stripe keys in to take payments";
  return s.chargesEnabled ? `Stripe connected${s.livemode ? "" : " · test mode"}` : "Stripe still has questions";
}

function notifyLine(m: Messages): string {
  const o = m.notify.newOrder;
  if (!o.on) return "New orders: nobody is emailed";
  const to = splitList(o.to);
  return `New orders to ${to.length ? to.join(", ") : "the owners"}${o.cc || o.bcc ? " · with copies" : ""}`;
}

function brandingLine(t: Theme): string {
  const c = siteColours(t);
  return [t.logo ? "Logo" : "No logo yet", t.favicon ? "favicon" : "", `${c.background} · ${t.accent}`].filter(Boolean).join(" · ");
}

function accountsLine(a: ReturnType<typeof readAccountSettings>): string {
  if (!a.enabled) return "Off · order tracking is always on";
  return a.passwords ? "On · a code, or a password if they set one" : "On · sign in with a code";
}

function domainLine(site: { slug: string; domain: string | null; domainOkAt: Date | null; launchedAt: Date | null }): string {
  const where = site.domain ? `${site.domain}${site.domainOkAt ? "" : " · waiting for DNS"}` : `${site.slug} · connect your own domain`;
  return site.launchedAt ? where : `${where} · not live yet`;
}
