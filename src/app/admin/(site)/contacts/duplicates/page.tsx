import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { findDuplicates } from "@/modules/contacts/server";
import { Card, PageHeader } from "../../../ui";

export const dynamic = "force-dynamic";

const name = (c: { name: string; email: string; phone: string }) =>
  c.name || c.email || c.phone || "Someone";

/** Possible duplicates: pairs that share a phone number or a full name. Each opens Merge contacts. */
export default async function DuplicatesPage() {
  const { user, site } = await requireSiteAccess();
  const pairs = await findDuplicates({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Possible duplicates" back="/contacts" />
      <div className="max-w-[640px] pt-4 md:pt-5">
        <p className="mb-4 text-[13.5px] leading-[1.5] text-muted">
          The same phone number, or the same full name. Open one to merge them, or to say
          they&apos;re different people.
        </p>
        {pairs.length === 0 ? (
          <Card variant="static" className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No duplicates</p>
            <p className="mt-1 text-[13px] text-muted">
              Nobody here looks like the same person twice.
            </p>
          </Card>
        ) : (
          <Card className="divide-y divide-line-soft">
            {pairs.map((p) => (
              <Link
                key={`${p.a.id}:${p.b.id}`}
                href={`/contacts/merge?a=${p.a.id}&b=${p.b.id}`}
                data-testid="duplicate"
                className="block px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover"
              >
                <span className="block text-[15px] font-medium">
                  {name(p.a)} and {name(p.b)}
                </span>
                <span className="mt-0.5 block text-[13px] text-muted">
                  {p.reason.replace("These two ", "They ")}
                </span>
              </Link>
            ))}
          </Card>
        )}
      </div>
    </>
  );
}
