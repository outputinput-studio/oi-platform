import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listActivity, type ActivityLine } from "@/modules/activity/server";
import { Card, PageHeader } from "../../ui";
import { LocalTime } from "../local-time";

export const dynamic = "force-dynamic";

const PAGE = 100;

/** Activity, as in design/admin.html: everything that changed, and who changed it. Newest first, a hundred at a time. */
export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<{ before?: string }>;
}) {
  const { before } = await searchParams;
  const { user, site } = await requireSiteAccess();
  const from = before ? new Date(before) : undefined;
  const lines = await listActivity({
    actorId: user.id,
    siteId: site.id,
    before: from && !Number.isNaN(from.getTime()) ? from : undefined,
    limit: PAGE,
  });

  return (
    <>
      <PageHeader title="Activity" back={before ? "/activity" : "/"} />
      <div className="max-w-[720px] pt-4 md:pt-5">
        <p className="text-[13.5px] text-muted">Everything that changed, and who changed it.</p>
        {lines.length === 0 ? (
          <Card variant="static" className="mt-4 px-5 py-8 text-center">
            <p className="text-[15px] font-medium">{before ? "Nothing older" : "Nothing yet"}</p>
            <p className="mt-1 text-[13px] text-muted">
              Changes to pages, products, orders, settings and the team show up here as they happen.
            </p>
          </Card>
        ) : (
          <Card data-testid="activity" className="mt-4 divide-y divide-line-soft">
            {lines.map((l) =>
              l.href ? (
                <Link
                  key={l.id}
                  href={l.href}
                  className="block px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover"
                >
                  <Line l={l} />
                </Link>
              ) : (
                <div key={l.id} className="px-4 py-3.5">
                  <Line l={l} />
                </div>
              ),
            )}
          </Card>
        )}
        {lines.length === PAGE && (
          <Link
            href={`/activity?before=${encodeURIComponent(lines[lines.length - 1].at.toISOString())}`}
            className="mt-4 inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover"
          >
            Show older
          </Link>
        )}
      </div>
    </>
  );
}

function Line({ l }: { l: ActivityLine }) {
  return (
    <>
      <p data-testid="activity-line" className="text-[14.5px] leading-[1.45] text-body">
        {l.who} {l.before}
        {l.subject && <span className="font-medium text-text">{l.subject}</span>}
        {l.after}
      </p>
      <p className="mt-0.5 text-[12.5px] text-muted">
        <LocalTime iso={l.at.toISOString()} style="day" />
      </p>
    </>
  );
}
