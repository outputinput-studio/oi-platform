"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAccess } from "@/modules/auth/access";
import { addRedirect, dismissNotFound, removeRedirect } from "./server";
import { formError } from "@/lib/form-error";

export type FormState = { ok?: string; error?: string; fields?: string[] };


export async function addRedirectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const r = await addRedirect({ actorId: user.id, siteId: site.id, from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") });
    revalidatePath("/settings/redirects");
    return { ok: `${r.fromPath} now goes to ${r.toPath}.` };
  } catch (err) {
    return formError(err);
  }
}

export async function removeRedirectAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await removeRedirect({ actorId: user.id, siteId: site.id, redirectId: String(form.get("redirectId")) });
  revalidatePath("/settings/redirects");
}

export async function dismissNotFoundAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await dismissNotFound({ actorId: user.id, siteId: site.id, path: String(form.get("path")) });
  revalidatePath("/settings/redirects");
}
