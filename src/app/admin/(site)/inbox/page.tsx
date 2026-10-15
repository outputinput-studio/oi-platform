import Link from "next/link";
import { timeAgo } from "@/lib/time";
import { requireSiteAccess } from "@/modules/auth/access";
import { headlineAnswer, listForms, listSubmissions, senderOf } from "@/modules/forms/server";
import { Card, Chips, PageHeader } from "../../ui";

export const dynamic = "force-dynamic";

/**
 * The inbox, as in design/admin.html: what people have sent through the
 * site's forms, newest first, with chips to see one form's or what's
 * been marked done. Nothing is ever deleted; done just moves it over.
 */
export default async function InboxPage({ searchParams }: { searchParams: Promise<{ form?: string; done?: string }> }) {
  const sp = await searchParams;
  const { user, site } = await requireSiteAccess();
  const forms = await listForms({ actorId: user.id, siteId: site.id });
  const formId = forms.some((f) => f.id === sp.form) ? sp.form : undefined;
  const status = sp.done ? "done" : "new";
  const rows = await listSubmissions({ actorId: user.id, siteId: site.id, formId, status });
  const total = forms.reduce((n, f) => n + f.newCount, 0);

  const chips = [
    { href: "/inbox", label: "All", count: total },
    ...forms.map((f) => ({ href: `/inbox?form=${f.id}`, label: f.name, count: f.newCount })),
    { href: "/inbox?done=1", label: "Done" },
  ];
  const current = status === "done" ? "/inbox?done=1" : formId ? `/inbox?form=${formId}` : "/inbox";

  return (
    <>
      <PageHeader title="Inbox" back="/" />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Inbox" current={current} items={chips} />
        <div className="mt-5">
          {rows.length === 0 ? (
            <Card variant="static" className="px-5 py-8 text-center">
              {status === "done" ? (
                <>
                  <p className="text-[15px] font-medium">Nothing marked done yet</p>
                  <p className="mt-1 text-[13px] text-muted">Done moves things out of the list. They stay here.</p>
                </>
              ) : forms.length === 0 ? (
                <>
                  <p className="text-[15px] font-medium">Nothing yet</p>
                  <p className="mt-1 text-[13px] text-muted">
                    Submissions from your forms land here, and you get an email as they arrive. You don&apos;t have a form yet —{" "}
                    <Link href="/forms" className="text-accent-text underline underline-offset-4">
                      add one
                    </Link>
                    .
                  </p>
                </>
              ) : formId ? (
                <>
                  <p className="text-[15px] font-medium">Nothing new for this form</p>
                  <p className="mt-1 text-[13px] text-muted">Nobody has sent it lately. It might not be on a page yet.</p>
                </>
              ) : (
                <>
                  <p className="text-[15px] font-medium">You&apos;re all caught up</p>
                  <p className="mt-1 text-[13px] text-muted">Everything has been marked done. Nothing was deleted — it&apos;s all under Done.</p>
                </>
              )}
            </Card>
          ) : (
            <Card className="divide-y divide-line-soft">
              {rows.map((s) => {
                const who = senderOf(s.fields, s.answers);
                return (
                  <Link key={s.id} href={`/inbox/${s.id}`} data-testid="submission" className="flex items-start gap-3 px-4 py-3.5 first:rounded-t-card last:rounded-b-card hover:bg-hover">
                    <span className={`mt-[7px] h-2 w-2 flex-none rounded-full ${s.status === "new" ? "bg-accent" : "bg-transparent"}`} aria-label={s.status === "new" ? "New" : undefined} />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="truncate text-[15px] font-medium">{who.name || who.email || "Someone"}</span>
                        <span className="flex-none text-[12px] text-muted">{s.formName}</span>
                      </span>
                      <span className="mt-0.5 line-clamp-2 text-[13.5px] text-body">{headlineAnswer(s.fields, s.answers) || who.email}</span>
                    </span>
                    <span className="flex-none text-[12px] text-muted">{timeAgo(s.createdAt)}</span>
                  </Link>
                );
              })}
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
