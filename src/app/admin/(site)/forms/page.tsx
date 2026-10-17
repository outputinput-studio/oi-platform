import { requireSiteAccess } from "@/modules/auth/access";
import { listForms } from "@/modules/forms/server";
import { Card, Chips, PageHeader } from "../../ui";
import { CONTENT_TABS } from "../content-tabs";
import { AddForm } from "./add-form";
import { FormsList } from "./forms-list";

export const dynamic = "force-dynamic";

/** Content → Forms: every form the site has, with how many submissions are waiting. */
export default async function FormsPage() {
  const { user, site } = await requireSiteAccess("manager");
  const all = await listForms({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Content" back="/" actions={<AddForm />} />
      <div className="pt-4 md:pt-5">
        <Chips ariaLabel="Content" current="/forms" items={CONTENT_TABS} />
        <div className="mb-2.5 mt-5 flex items-center justify-between">
          <p className="label">Forms</p>
          {all.length > 1 && <span className="text-[12.5px] text-muted">Drag to reorder</span>}
        </div>
        {all.length === 0 ? (
          <Card className="px-5 py-8 text-center">
            <p className="text-[15px] font-medium">No forms yet</p>
            <p className="mt-1 text-[13px] text-muted">A form is how people write to you from a page. Add form is at the top.</p>
          </Card>
        ) : (
          <FormsList
            forms={all.map((f) => ({
              id: f.id,
              name: f.name,
              newCount: f.newCount,
              summary: `${f.fields.length} field${f.fields.length === 1 ? "" : "s"} · ${f.fields.map((x) => x.label).join(", ")}`,
            }))}
          />
        )}
      </div>
    </>
  );
}
