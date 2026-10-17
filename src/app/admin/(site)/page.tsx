import { isLive } from "@/modules/pages/live";
import { requireSiteAccess } from "@/modules/auth/access";
import { atLeast } from "@/modules/auth/roles";
import { newSubmissionCount } from "@/modules/forms/server";
import { newOrderCount } from "@/modules/orders/admin";
import { listMedia } from "@/modules/media/server";
import { listPages } from "@/modules/pages/server";
import { Card, PageHeader, Row, Rows } from "../ui";
import { Greeting } from "./greeting";

export const dynamic = "force-dynamic";

/**
 * Home, as in design/admin.html: the day, a greeting, the numbers that
 * matter, and what needs you. Staff (orders, the inbox, contacts) see
 * what's waiting for them; everyone else sees pages and images.
 */
export default async function AdminHome() {
  const { site, user, role } = await requireSiteAccess();
  if (!atLeast(role, "manager")) return <StaffHome siteName={site.name} siteId={site.id} name={user.name || user.email} />;
  const [pages, images] = await Promise.all([
    listPages({ actorId: user.id, siteId: site.id }),
    listMedia({ actorId: user.id, siteId: site.id }),
  ]);
  const live = pages.filter((p) => isLive(p)).length;
  const drafts = pages.length - live;

  return (
    <>
      <PageHeader title={site.name} titleTestId="site-name" />
      <div className="pt-5 md:pt-7">
        <Greeting name={user.name || user.email} />
        <p className="sr-only">
          Signed in as <span data-testid="role">{role}</span>
        </p>

        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Pages live" value={live} sub={drafts ? `${drafts} draft${drafts === 1 ? "" : "s"}` : pages.length ? "no drafts" : "none yet"} href="/pages" />
          <Stat label="Images" value={images.length} sub={images.length ? "in the library" : "none yet"} href="/media" />
        </div>

        <p className="label mt-8">Needs you today</p>
        <Rows className="mt-2.5" variant={pages.length && live ? "static" : "default"}>
          {pages.length === 0 ? (
            <Row title="Make your front page" detail="The site shows “coming soon” until it has one." href="/pages" />
          ) : live === 0 ? (
            <Row title="Nothing is live yet" detail="Publish a page and the site goes up." href="/pages" />
          ) : (
            <Row title="Nothing needs you" detail="Enquiries and orders will show up here when those arrive." />
          )}
        </Rows>
      </div>
    </>
  );
}

async function StaffHome({ siteName, siteId, name }: { siteName: string; siteId: string; name: string }) {
  const [orders, inbox] = await Promise.all([newOrderCount({ siteId }), newSubmissionCount({ siteId })]);
  return (
    <>
      <PageHeader title={siteName} titleTestId="site-name" />
      <div className="pt-5 md:pt-7">
        <Greeting name={name} />
        <p className="sr-only">
          Signed in as <span data-testid="role">staff</span>
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <Stat label="Orders to start" value={orders} sub={orders ? "paid, waiting for you" : "all caught up"} href="/orders" testId="stat-orders" />
          <Stat label="New in the inbox" value={inbox} sub={inbox ? "not answered yet" : "all caught up"} href="/inbox" />
        </div>
      </div>
    </>
  );
}

function Stat({ label, value, sub, href, testId }: { label: string; value: number; sub: string; href: string; testId?: string }) {
  return (
    <Card className="p-[15px]" data-testid={testId}>
      <a href={href} className="block">
        <p className="label">{label}</p>
        <p className="mt-2 text-[34px] font-semibold leading-none tracking-[-1px]">{value}</p>
        <p className="mt-2.5 text-[13px] text-muted">{sub}</p>
      </a>
    </Card>
  );
}
