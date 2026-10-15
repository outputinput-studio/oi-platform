import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { listContacts } from "@/modules/contacts/server";
import { Card, PageHeader } from "../../ui";
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
  const { user, site } = await requireSiteAccess();
  const rows = await listContacts({ actorId: user.id, siteId: site.id, q });

  return (
    <>
      <PageHeader title="Contacts" back="/" actions={<AddContact />} />
      <div className="pt-4 md:pt-5">
        <SearchBox initial={q} />
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
      </div>
    </>
  );
}
