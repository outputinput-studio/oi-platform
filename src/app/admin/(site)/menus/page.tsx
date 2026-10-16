import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listMenus } from "@/modules/menus/server";
import { Chevron, Chips, PageHeader } from "../../ui";
import { CONTENT_TABS } from "../content-tabs";
import { AddMenu } from "./add-menu";

export const dynamic = "force-dynamic";

/** Content → Menus, as in design/admin.html: Header and Footer always here, then any the team added. */
export default async function MenusPage() {
  const { user, site } = await requireSiteAccess();
  const all = await listMenus({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Content" back="/" />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Content" current="/menus" items={CONTENT_TABS} />
        <p className="label mb-2.5 mt-5">Menus</p>
        <ul className="space-y-2.5">
          {all.map((m) => (
            <li key={m.key}>
              <Link
                href={`/menus/${m.key}`}
                data-testid={`menu-${m.kind === "custom" ? m.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") : m.kind}`}
                className={`flex items-center gap-3 rounded-card border bg-surface p-[14px] hover:bg-hover ${m.broken ? "border-warning" : "border-line"}`}
              >
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-[15px] font-medium">{m.name}</span>
                    {m.kind !== "custom" && <span className="rounded-[3px] border border-control px-[5px] py-[2px] font-mono text-[10px] uppercase tracking-[0.6px] text-muted">Always here</span>}
                  </span>
                  <span className={`mt-1 block truncate text-[12px] leading-[1.4] ${m.broken ? "text-warning" : "text-muted"}`}>{m.summary}</span>
                </span>
                <Chevron />
              </Link>
            </li>
          ))}
        </ul>
        <AddMenu />
        <p className="mt-2 text-[12.5px] leading-[1.5] text-muted">You choose what goes in your navigation and in what order. Header and footer stay put; any menu you add is another column in the footer.</p>
      </div>
    </>
  );
}
