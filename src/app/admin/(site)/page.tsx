import { requireSiteAccess } from "@/modules/auth/access";
import { listMedia } from "@/modules/media/server";
import { listPages } from "@/modules/pages/server";
import { Card, PageHeader, Row, Rows } from "../ui";
import { Greeting } from "./greeting";

export const dynamic = "force-dynamic";

/**
 * Home, as in design/admin.html: the day, a greeting, the numbers that
 * matter, and what needs you. Orders and enquiries arrive with their
 * modules; until then the numbers are pages and images.
 */
export default async function AdminHome() {
  const { site, user, role } = await requireSiteAccess();
  const [pages, images] = await Promise.all([
    listPages({ actorId: user.id, siteId: site.id }),
    listMedia({ actorId: user.id, siteId: site.id }),
  ]);
  const live = pages.filter((p) => p.status === "published").length;
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
        <Rows className="mt-2.5">
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

function Stat({ label, value, sub, href }: { label: string; value: number; sub: string; href: string }) {
  return (
    <Card className="p-[15px]">
      <a href={href} className="block">
        <p className="label">{label}</p>
        <p className="mt-2 text-[34px] font-semibold leading-none tracking-[-1px]">{value}</p>
        <p className="mt-2.5 text-[13px] text-muted">{sub}</p>
      </a>
    </Card>
  );
}
