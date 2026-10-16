"use server";

import { headers } from "next/headers";
import { formError } from "@/lib/form-error";
import { siteFromHost } from "@/modules/sites/server";
import { joinWaiting } from "./server";

export type WaitingState = { ok?: string; error?: string; fields?: string[] };

/** "Email me when it's back", from a product page. No sign-in; `website` is the hidden trap a bot fills in. */
export async function joinWaitingAction(productId: string, variant: string, _prev: WaitingState, form: FormData): Promise<WaitingState> {
  try {
    const h = await headers();
    const site = await siteFromHost(h.get("x-oi-host") ?? h.get("host") ?? "");
    if (!site) return { error: "This shop isn't available." };
    if (String(form.get("website") ?? "")) return { ok: "Done. We'll email you when it's back." };
    return await joinWaiting({ siteId: site.id, productId, variant, email: form.get("email") });
  } catch (err) {
    return formError(err);
  }
}
