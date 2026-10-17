import { requireSiteAccess } from "@/modules/auth/access";
import { Card, Notice, PageHeader } from "../../../ui";
import { StartExport } from "./export-form";

export const dynamic = "force-dynamic";

/**
 * Settings · Export everything (design/admin.html). Owners: it's the whole
 * business — customers included — in one file.
 */
export default async function ExportPage({ searchParams }: { searchParams: Promise<{ link?: string }> }) {
  await requireSiteAccess("owner");
  const { link } = await searchParams;
  const problem = link === "expired" ? "That link has run out. Ask for a new one below." : link === "wrong" ? "That download link isn't right. Ask for a new one below." : undefined;
  return (
    <>
      <PageHeader title="Export everything" back="/settings" />
      <div className="max-w-[640px] space-y-4 pt-5 md:pt-6">
        {problem && <Notice error={problem} />}
        <Card variant="static" className="space-y-4 p-5">
          <p className="text-[15px] font-semibold">Everything you have put in</p>
          <p className="text-[14px] leading-relaxed text-body">
            One download with your products, orders, contacts, pages, articles and every photo, as ordinary files anyone can open. It takes a few minutes and we
            email you the link.
          </p>
          <p className="text-[14px] leading-relaxed text-body">It is your work. You should be able to walk out with it whenever you like.</p>
          <StartExport />
        </Card>
        <p className="text-[12.5px] leading-relaxed text-muted">
          The link works for 7 days, and only for you, signed in. Spreadsheets (.csv) open in Excel, Numbers or Google Sheets; pages are .json, articles are
          .md, photos are as you uploaded them.
        </p>
      </div>
    </>
  );
}
