"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { refreshStripeAccount, removeStripeKeys, saveStripeKeys } from "./server";

export type PaymentsFormState = { ok?: string; error?: string };

/** Settings · Payments: the client's own Stripe keys. */
export async function saveStripeKeysAction(_prev: PaymentsFormState, form: FormData): Promise<PaymentsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const s = await saveStripeKeys({ actorId: user.id, siteId: site.id, secretKey: String(form.get("secretKey") ?? ""), webhookSecret: String(form.get("webhookSecret") ?? "") });
    revalidatePath("/", "layout");
    return { ok: s.chargesEnabled ? "Connected. Your shop can take payments." : "Saved — Stripe still has questions for you before it can take money." };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

export async function refreshStripeAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await refreshStripeAccount({ actorId: user.id, siteId: site.id });
  revalidatePath("/", "layout");
  redirect("/settings/payments");
}

export async function removeStripeKeysAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await removeStripeKeys({ actorId: user.id, siteId: site.id });
  revalidatePath("/", "layout");
  redirect("/settings/payments");
}
