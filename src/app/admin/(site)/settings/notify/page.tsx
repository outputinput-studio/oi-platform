import { requireSiteAccess } from "@/modules/auth/access";
import { listForms } from "@/modules/forms/server";
import { readMessages } from "@/modules/sites/messages";
import { PageHeader } from "../../../ui";
import { NotifyEditor } from "./notify-editor";

export const dynamic = "force-dynamic";

/** Settings · Who gets notified, as in design/admin.html: the emails that come to the team, event by event and form by form. */
export default async function NotifyPage() {
  const { site, role, user } = await requireSiteAccess();
  const forms = await listForms({ actorId: user.id, siteId: site.id });
  return (
    <>
      <PageHeader title="Who gets notified" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <NotifyEditor
          initial={{
            notify: readMessages(site.messages).notify,
            forms: forms.map((f) => ({ id: f.id, name: f.name, on: f.notifyOn, to: f.notifyEmails, cc: f.notifyCc, bcc: f.notifyBcc })),
          }}
          canEdit={role === "owner"}
        />
      </div>
    </>
  );
}
