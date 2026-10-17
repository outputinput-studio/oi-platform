import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { HOME_SLUG, listPages } from "@/modules/pages/server";
import { Card, Chips, PageHeader, Pill } from "../../ui";
import { CONTENT_TABS } from "../content-tabs";
import { AddPage } from "./add-page";
import { LocalTime } from "../local-time";

export const dynamic = "force-dynamic";

/**
 * Content, as in design/admin.html: the site's pages as cards, each with
 * its address, when it was last edited, and whether it's live. Articles,
 * forms and menus join as tabs when they're built.
 */
export default async function PagesPage() {
  const { user, site } = await requireSiteAccess("manager");
  const all = await listPages({ actorId: user.id, siteId: site.id });
  const hasHome = all.some((p) => p.slug === HOME_SLUG);

  return (
    <>
      <PageHeader title="Content" back="/" actions={<AddPage suggestHome={!hasHome} />} />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Content" current="/pages" items={CONTENT_TABS} />
        <p className="label mb-2.5 mt-5">Pages</p>
        {all.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No pages yet</p>
            <p className="mt-1 text-[13px] text-muted">Start with the front page. Add page is at the top.</p>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {all.map((p) => (
              <li key={p.id}>
                <Link href={`/pages/${p.id}`} data-testid={`page-${p.slug}`} className="block">
                  <Card className="p-[14px] hover:bg-hover">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="truncate text-[15px] font-medium">{p.title}</span>
                      {p.status === "published" ? <Pill tone="success">Live</Pill> : p.status === "scheduled" ? <Pill tone="warning">Scheduled</Pill> : <Pill tone="neutral">Draft</Pill>}
                    </div>
                    <p className="mt-1.5 font-mono text-[12.5px] text-muted">{p.slug === HOME_SLUG ? "/" : `/${p.slug}`}</p>
                    <p className="mt-1.5 text-[12px] text-muted">
                      {p.status === "scheduled" && p.publishedAt ? (
                        <>
                          Goes live <LocalTime iso={p.publishedAt.toISOString()} />
                        </>
                      ) : (
                        `Edited ${timeAgo(p.updatedAt)}`
                      )}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
