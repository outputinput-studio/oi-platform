import { requireSiteAccess } from "@/modules/auth/access";
import { getForm } from "@/modules/forms/server";
import { deleteFormAction } from "@/modules/forms/actions";
import { FormEditor } from "./form-editor";

export const dynamic = "force-dynamic";

export default async function EditFormPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { user, site } = await requireSiteAccess();
  const form = await getForm({ actorId: user.id, siteId: site.id, formId: id });
  return (
    <FormEditor
      formId={form.id}
      initial={{ name: form.name, fields: form.fields, buttonText: form.buttonText, afterMessage: form.afterMessage, notifyEmails: form.notifyEmails, createContact: form.createContact }}
      deleteAction={deleteFormAction}
    />
  );
}
