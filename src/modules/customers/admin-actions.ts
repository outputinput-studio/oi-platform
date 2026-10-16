"use server";

import { revalidatePath } from "next/cache";
import { requireSiteAccess } from "@/modules/auth/access";
import { formError } from "@/lib/form-error";
import { updateAccountSettings } from "./admin";

export type AccountSettingsState = { ok?: string; error?: string; fields?: string[] };

/** Settings · Customer accounts: each switch saves as it's flipped. */
export async function saveAccountSettingsAction(settings: { enabled: boolean; passwords: boolean }): Promise<AccountSettingsState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateAccountSettings({ actorId: user.id, siteId: site.id, settings });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err, { fallback: "Couldn't save that. Try again." });
  }
}
