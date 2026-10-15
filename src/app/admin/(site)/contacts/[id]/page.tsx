import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { getContact } from "@/modules/contacts/server";
import { deleteContactAction } from "@/modules/contacts/actions";
import { Button, Card, Label, PageHeader, Pill } from "../../../ui";
import { Avatar } from "../../nav";
import { ContactDetailsForm, Notes } from "./contact-forms";

export const dynamic = "force-dynamic";

/** One person: who they are (editable), what they've sent, and the team's notes. */
export default async function ContactPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const c = await getContact({ actorId: user.id, siteId: site.id, contactId: id });
  const title = c.name || c.email || c.phone || "Contact";

  return (
    <>
      <PageHeader title={title} back="/contacts" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <div className="flex items-center gap-4">
          <Avatar name={c.name || c.email || "?"} size={48} />
          <div className="min-w-0">
            <p className="truncate text-[17px] font-semibold">{title}</p>
            <p className="text-[13px] text-muted">
              {c.submissions.length ? `Wrote to you ${timeAgo(c.submissions[0].createdAt)}` : "Added by hand"} · contact since {c.createdAt.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        {(c.email || c.phone) && (
          <div className="mt-4 flex gap-2">
            {c.email && (
              <a href={`mailto:${c.email}`} className="inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover">
                Email
              </a>
            )}
            {c.phone && (
              <a href={`tel:${c.phone.replace(/[^\d+]/g, "")}`} className="inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover">
                Call
              </a>
            )}
          </div>
        )}

        <Label className="mt-8">Their enquiries</Label>
        {c.submissions.length === 0 ? (
          <Card variant="static" className="px-4 py-5 text-[13.5px] text-muted">
            Nothing sent through a form. They were added by hand.
          </Card>
        ) : (
          <Card className="divide-y divide-line-soft">
            {c.submissions.map((s) => (
              <Link key={s.id} href={`/inbox/${s.id}`} className="flex items-start gap-3 px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover">
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="text-[14.5px] font-medium">{s.formName}</span>
                    {s.status === "new" ? <Pill tone="warning">Needs a reply</Pill> : <Pill tone="neutral">Done</Pill>}
                  </span>
                  <span className="mt-0.5 line-clamp-2 text-[13.5px] text-body">{s.headline}</span>
                </span>
                <span className="flex-none text-[12px] text-muted">{timeAgo(s.createdAt)}</span>
              </Link>
            ))}
          </Card>
        )}

        <Label className="mt-8">Details</Label>
        <ContactDetailsForm contactId={c.id} initial={{ name: c.name, email: c.email, phone: c.phone }} />

        <Notes contactId={c.id} notes={c.notes} />

        <form action={deleteContactAction} className="mt-8 rounded-card border border-line bg-surface p-4">
          <input type="hidden" name="contactId" value={c.id} />
          <Button type="submit" variant="danger" size="sm">
            Remove this contact
          </Button>
          <p className="mt-2 text-[12.5px] text-muted">They come off the list. What they sent stays in your inbox.</p>
        </form>
      </div>
    </>
  );
}
