"use server";

import { requireSiteAccess } from "@/modules/auth/access";
import { formError } from "@/lib/form-error";
import { askForHelp } from "./server";

export type HelpFormState = { ok?: string; error?: string; fields?: string[] };

/** Get help → "Send it". */
export async function askForHelpAction(_prev: HelpFormState, form: FormData): Promise<HelpFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await askForHelp({
      actorId: user.id,
      siteId: site.id,
      input: { topic: form.get("topic") ?? undefined, message: String(form.get("message") ?? ""), from: String(form.get("from") ?? "") || undefined },
    });
    return { ok: "We've got it. We'll reply to your email, usually the same working day." };
  } catch (err) {
    return formError(err);
  }
}
