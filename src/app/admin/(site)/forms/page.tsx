import Link from "next/link";
import { requireSiteAccess } from "@/modules/auth/access";
import { listForms } from "@/modules/forms/server";
import { Card, Chips, PageHeader } from "../../ui";
import { CONTENT_TABS } from "../content-tabs";
import { AddForm } from "./add-form";

export const dynamic = "force-dynamic";

/** Content → Forms: every form the site has, with how many submissions are waiting. */
export default async function FormsPage() {
  const { user, site } = await requireSiteAccess();
  const all = await listForms({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Content" back="/" actions={<AddForm />} />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Content" current="/forms" items={CONTENT_TABS} />
        <p className="label mb-2.5 mt-5">Forms</p>
        {all.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No forms yet</p>
            <p className="mt-1 text-[13px] text-muted">A form is how people write to you from a page. Add form is at the top.</p>
          </Card>
        ) : (
          <ul className="space-y-2.5">
            {all.map((f) => (
              <li key={f.id}>
                <Link href={`/forms/${f.id}`} data-testid={`form-${f.id}`} className="block">
                  <Card className="p-[14px] hover:bg-hover">
                    <div className="flex items-center justify-between gap-2.5">
                      <span className="truncate text-[15px] font-medium">{f.name}</span>
                      {f.newCount > 0 && <span className="rounded-full bg-accent px-2 py-px text-[11px] font-semibold text-text">{f.newCount} new</span>}
                    </div>
                    <p className="mt-1.5 text-[12.5px] text-muted">
                      {f.fields.length} field{f.fields.length === 1 ? "" : "s"} · {f.fields.map((x) => x.label).join(", ")}
                    </p>
                  </Card>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
