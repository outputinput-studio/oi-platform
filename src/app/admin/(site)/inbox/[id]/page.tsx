import { requireSiteAccess } from "@/modules/auth/access";
import { getSubmission, senderOf } from "@/modules/forms/server";
import { setSubmissionStatusAction } from "@/modules/forms/actions";
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
        {who.email && (
          <div className="mt-4 flex gap-2">
            <a href={`mailto:${who.email}`} className="inline-flex h-10 items-center rounded-button border border-line-strong px-4 text-[14px] text-text hover:bg-hover">
              Email {who.name ? who.name.split(" ")[0] : ""}
            </a>
          </div>
        )}
        <Card variant="static" className="mt-5 divide-y divide-line-soft">
          {s.fields.map((f) => (
            <div key={f.id} className="px-4 py-3.5">
              <p className="text-[12.5px] text-muted">{f.label}</p>
              <p className="mt-1 whitespace-pre-wrap text-[15px] text-text">{s.answers[f.id] || <span className="text-faint">—</span>}</p>
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
