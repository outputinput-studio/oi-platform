import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { findDuplicates, listContacts } from "@/modules/contacts/server";
import { atLeast } from "@/modules/auth/roles";
import { Card, Chevron, DownloadIcon, PageHeader } from "../../ui";
import { AddContact } from "./add-contact";
import { SearchBox } from "./search-box";
import { Avatar } from "../nav";

export const dynamic = "force-dynamic";

/**
 * Contacts, as in design/admin.html: everyone who has written through a
 * form or been added by hand, most recent activity first. Search covers
 * names, emails, phones and the team's own notes.
 */
export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const { q = "" } = await searchParams;
  const { user, site, role } = await requireSiteAccess();
  const [rows, dups] = await Promise.all([listContacts({ actorId: user.id, siteId: site.id, q }), q ? Promise.resolve([]) : findDuplicates({ actorId: user.id, siteId: site.id })]);

  return (
    <>
      <PageHeader title="Contacts" back="/" actions={<AddContact />} />
      <div className="pt-4 md:pt-5">
        <SearchBox initial={q} />
        {dups.length > 0 && (
          <Link
            href={dups.length === 1 ? `/contacts/merge?a=${dups[0].a.id}&b=${dups[0].b.id}` : "/contacts/duplicates"}
            data-testid="duplicates-banner"
            className="mt-3 flex items-center gap-2.5 rounded-card border border-line bg-panel px-4 py-3 text-[14px] text-text hover:border-accent"
          >
            <span className="h-2 w-2 flex-none rounded-full bg-warning" aria-hidden />
            <span className="flex-1">
              {dups.length} possible duplicate{dups.length === 1 ? "" : "s"}
            </span>
            <Chevron />
          </Link>
        )}
        <div className="mt-4">
          {rows.length === 0 ? (
            <Card variant="static" className="px-5 py-8 text-center">
              {q ? (
                <>
                  <p className="text-[15px] font-medium">Nobody matches &ldquo;{q}&rdquo;</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Names, emails, phone numbers and your own notes are all searched.{" "}
                    <Link href="/contacts" className="text-accent-text underline underline-offset-4">
                      Show everyone
                    </Link>
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-medium">Your people live here</p>
                  <p className="mt-1 text-[13px] text-muted">Anyone who writes to you through a form on your site turns up in this list. Add someone is at the top.</p>
                </>
              )}
            </Card>
          ) : (
            <Card className="divide-y divide-line-soft">
              {rows.map((c) => (
                <Link key={c.id} href={`/contacts/${c.id}`} data-testid="contact" className="flex items-center gap-3 px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover">
                  <Avatar name={c.name || c.email || "?"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">{c.name || c.email || c.phone}</span>
                    <span className="mt-0.5 block truncate text-[13px] text-muted">
                      {c.newCount > 0 ? <span className="text-accent-text">Needs a reply</span> : c.lastSubmissionAt ? "Wrote to you" : "Added by hand"}
                      {c.name && c.email ? ` · ${c.email}` : ""}
                    </span>
                  </span>
                  <span className="flex-none text-[12px] text-muted">{timeAgo(c.lastSubmissionAt ?? c.updatedAt)}</span>
                </Link>
              ))}
            </Card>
          )}
        </div>
        {rows.length > 0 && atLeast(role, "manager") && (
          <div className="mt-4">
            <a
              href={`/contacts/export${q ? `?q=${encodeURIComponent(q)}` : ""}`}
              download
              className="flex items-center gap-3 rounded-card border border-line bg-surface px-4 py-3.5 text-[14.5px] text-text hover:bg-hover"
            >
              <DownloadIcon />
              <span className="flex-1">Export this list as CSV</span>
            </a>
            <p className="mt-2.5 text-[12px] leading-[1.45] text-muted">
              Export gives you what you are looking at now — name, email, phone, notes, orders, total spent and when they came in.
            </p>
          </div>
        )}
      </div>
    </>
  );
}

