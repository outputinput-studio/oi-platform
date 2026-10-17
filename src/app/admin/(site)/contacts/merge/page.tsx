import Link from "next/link";
import { redirect } from "next/navigation";
import { requireSiteAccess } from "@/modules/auth/access";
import { getContact, listContacts, mergePreview } from "@/modules/contacts/server";
import { Card, PageHeader } from "../../../ui";
import { Avatar } from "../../nav";
import { SearchBox } from "../search-box";
import { MergeForm } from "./merge-form";

export const dynamic = "force-dynamic";

/**
 * Merge contacts, as in design/admin.html. With two people (?a=…&b=…): them
 * side by side, what to keep where they differ, then one confirm. With one
 * (from their page, "Merge with someone else"): pick who else they are.
 */
export default async function MergePage({
  searchParams,
}: {
  searchParams: Promise<{ a?: string; b?: string; q?: string }>;
}) {
  const { a, b, q = "" } = await searchParams;
  const { user, site } = await requireSiteAccess();
  if (!a) redirect("/contacts/duplicates");

  if (!b) {
    const me = await getContact({ actorId: user.id, siteId: site.id, contactId: a });
    const others = (await listContacts({ actorId: user.id, siteId: site.id, q })).filter(
      (c) => c.id !== a,
    );
    const label = me.name || me.email || me.phone || "this contact";
    return (
      <>
        <PageHeader title="Merge with someone else" back={`/contacts/${a}`} />
        <div className="max-w-[640px] pt-4 md:pt-5">
          <p className="mb-4 text-[13.5px] leading-[1.5] text-muted">
            Who else is {label}? You&apos;ll see the two side by side before anything changes.
          </p>
          <SearchBox initial={q} base={`/contacts/merge?a=${a}`} />
          {others.length === 0 ? (
            <Card variant="static" className="mt-4 px-5 py-6 text-center text-[13.5px] text-muted">
              {q ? (
                <>Nobody else matches &ldquo;{q}&rdquo;.</>
              ) : (
                "There's nobody else in your contacts yet."
              )}
            </Card>
          ) : (
            <Card className="mt-4 divide-y divide-line-soft">
              {others.slice(0, 100).map((c) => (
                <Link
                  key={c.id}
                  href={`/contacts/merge?a=${a}&b=${c.id}`}
                  data-testid="merge-candidate"
                  className="flex items-center gap-3 px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover"
                >
                  <Avatar name={c.name || c.email || "?"} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[15px] font-medium">
                      {c.name || c.email || c.phone}
                    </span>
                    <span className="mt-0.5 block truncate font-mono text-[12.5px] text-muted">
                      {[c.email, c.phone].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                </Link>
              ))}
            </Card>
          )}
        </div>
      </>
    );
  }

  const m = await mergePreview({ actorId: user.id, siteId: site.id, aId: a, bId: b });
  return (
    <>
      <PageHeader title="Merge contacts" back="/contacts" />
      <div className="max-w-[640px] pt-4 md:pt-5">
        <MergeForm
          a={{ ...m.a, since: m.a.since.toISOString() }}
          b={{ ...m.b, since: m.b.since.toISOString() }}
          differ={m.differ}
          reason={m.reason}
        />
      </div>
    </>
  );
}
