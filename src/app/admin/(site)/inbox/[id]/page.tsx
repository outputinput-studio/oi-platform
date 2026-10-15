import { requireSiteAccess } from "@/modules/auth/access";
import { fileUrl, getSubmission, senderOf } from "@/modules/forms/server";
import { filesIn } from "@/modules/forms/fields";
import { setSubmissionStatusAction } from "@/modules/forms/actions";
import Link from "next/link";
import { Button, Card, PageHeader } from "../../../ui";

export const dynamic = "force-dynamic";

/** One submission, exactly as it arrived. Email them, or mark it done. */
export default async function SubmissionPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const s = await getSubmission({ actorId: user.id, siteId: site.id, submissionId: id });
  const who = senderOf(s.fields, s.answers);
  const when = s.createdAt.toLocaleString("en-AU", { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <>
      <PageHeader title={who.name || who.email || "Submission"} back="/inbox" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <p className="text-[13px] text-muted">
          {s.formName} · {when}
        </p>
        {(who.email || s.contactId) && (
          <div className="mt-4 flex gap-2">
            {who.email && (
              <a href={`mailto:${who.email}`} className="inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover">
                Email {who.name ? who.name.split(" ")[0] : ""}
              </a>
            )}
            {s.contactId && (
              <Link href={`/contacts/${s.contactId}`} className="inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover">
                Open contact
              </Link>
            )}
          </div>
        )}
        <Card variant="static" className="mt-5 divide-y divide-line-soft">
          {s.fields.map((f) => (
            <div key={f.id} className="px-4 py-3.5">
              <p className="text-[12.5px] text-muted">{f.label}</p>
              {f.type === "file" ? (
                <Files files={filesIn(s.answers[f.id])} />
              ) : (
                <p className="mt-1 whitespace-pre-wrap text-[15px] text-text">{s.answers[f.id] || <span className="text-faint">—</span>}</p>
              )}
            </div>
          ))}
        </Card>
        <p className="mt-2 text-[12.5px] text-muted">This is what they sent, exactly as it arrived. Nothing here can be edited.</p>
        <form action={setSubmissionStatusAction} className="mt-6">
          <input type="hidden" name="submissionId" value={s.id} />
          <input type="hidden" name="status" value={s.status === "new" ? "done" : "new"} />
          <Button type="submit" variant={s.status === "new" ? "primary" : "secondary"}>
            {s.status === "new" ? "Mark as done" : "Move back to new"}
          </Button>
          <p className="mt-2 text-[12.5px] text-muted">{s.status === "new" ? "Done moves it out of the list. It stays under the Done chip." : "It goes back to the top of the inbox."}</p>
        </form>
      </div>
    </>
  );
}

/** What they attached: a thumbnail for a photo, a plain link for a PDF. Opens in a new tab. */
function Files({ files }: { files: ReturnType<typeof filesIn> }) {
  if (files.length === 0) return <p className="mt-1 text-[15px] text-faint">—</p>;
  return (
    <ul className="mt-2 flex flex-wrap gap-2">
      {files.map((u) => {
        const url = fileUrl(u.key);
        const img = u.type.startsWith("image/");
        return (
          <li key={u.key}>
            <a href={url || undefined} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-button border border-line bg-surface p-1.5 pr-3 text-[13px] text-text hover:bg-hover">
              {img && url ? (
                // eslint-disable-next-line @next/next/no-img-element -- served straight from the bucket
                <img src={url} alt="" className="h-12 w-12 rounded object-cover" />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded bg-sunken font-mono text-[10px] uppercase text-muted">{u.type.split("/")[1] ?? "file"}</span>
              )}
              <span className="max-w-[160px] truncate">{u.name}</span>
            </a>
          </li>
        );
      })}
    </ul>
  );
}
