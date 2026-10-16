"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { renameSite, setEnquiryForm, updateBusiness, updateSearchSettings, updateSending, updateShipping, updateShopSettings, updateStatusNames, updateTheme } from "./server";

export type SettingsFormState = { ok?: string; error?: string };

export async function updateThemeAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateTheme({ actorId: user.id, siteId: site.id, theme: { mode: form.get("mode"), accent: form.get("accent") } });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

export async function renameSiteAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await renameSite({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? "") });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

/** Settings · Search engines autosaves the whole object. */
export async function saveSearchSettingsAction(settings: unknown): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateSearchSettings({ actorId: user.id, siteId: site.id, settings });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

/** Settings · Tax and currency. */
export async function updateShopSettingsAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateShopSettings({
      actorId: user.id,
      siteId: site.id,
      settings: { currency: form.get("currency"), pricesIncludeTax: form.get("pricesIncludeTax") === "on", taxName: form.get("taxName"), taxRate: form.get("taxRate") },
    });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

/** Settings · Shipping saves the whole thing. */
export async function saveShippingAction(settings: unknown): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateShipping({ actorId: user.id, siteId: site.id, settings });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

/** Settings · Enquiries: which form takes enquiries, or none. */
export async function saveEnquiryFormAction(formId: string | null): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await setEnquiryForm({ actorId: user.id, siteId: site.id, formId });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    if (err instanceof z.ZodError) return { error: "Pick one of your forms." };
    return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
  }
}

function failed(err: unknown): SettingsFormState {
  if (err instanceof z.ZodError) return { error: err.issues[0]?.message ?? "That doesn't look right." };
  return { error: err instanceof Error ? err.message : "Something went wrong. Try again." };
}

/** Settings · Business profile. */
export async function updateBusinessAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  const s = (k: string) => String(form.get(k) ?? "");
  try {
    await updateBusiness({ actorId: user.id, siteId: site.id, business: { tradingName: s("tradingName"), businessNumber: s("businessNumber"), phone: s("phone"), email: s("email"), address: s("address"), hours: s("hours") } });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
  }
}

/** Settings · Sending. */
export async function updateSendingAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateSending({ actorId: user.id, siteId: site.id, sending: { fromName: String(form.get("fromName") ?? ""), replyTo: String(form.get("replyTo") ?? "") } });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
  }
}

/** Settings · Order statuses. */
export async function updateStatusNamesAction(_prev: SettingsFormState, form: FormData): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  const s = (k: string) => String(form.get(k) ?? "");
  try {
    await updateStatusNames({ actorId: user.id, siteId: site.id, names: { new: s("new"), inProgress: s("inProgress"), sent: s("sent"), done: s("done") } });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
  }
}
