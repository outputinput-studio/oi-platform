import { requireSiteAccess } from "@/modules/auth/access";
import { senderFor } from "@/modules/sites/business";
import { readMessages, templateFor, TEMPLATE_KEYS } from "@/modules/sites/messages";
import { siteShop } from "@/modules/sites/server";
import { statusNames } from "@/modules/sites/shop";
import { PageHeader } from "../../../ui";
import { EmailsEditor } from "./emails-editor";

export const dynamic = "force-dynamic";

/** Settings · Customer emails, as in design/admin.html: the four order emails, a test of each, and keeping a copy. */
export default async function CustomerEmailsPage() {
  const { site, role, user } = await requireSiteAccess();
  const m = readMessages(site.messages);
  const names = statusNames(siteShop(site));
  return (
    <>
      <PageHeader title="Customer emails" back="/settings" />
      <div className="max-w-[640px] pt-5 md:pt-6">
        <EmailsEditor
          initial={{ keepCopy: m.keepCopy, templates: Object.fromEntries(TEMPLATE_KEYS.map((k) => [k, templateFor(m, k)])) as Record<(typeof TEMPLATE_KEYS)[number], { subject: string; body: string }> }}
          stageNames={{ inProgress: names.inProgress, sent: names.sent, done: names.done }}
          copyTo={senderFor(site).replyTo ?? ""}
          me={user.email}
          canEdit={role === "owner"}
        />
      </div>
    </>
  );
}
