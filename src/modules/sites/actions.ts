"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { renameSite, setEnquiryForm, updateBusiness, updateFooter, updateMessages, updateSearchSettings, updateSending, updateShipping, updateShopSettings, updateStatusNames, updateTheme } from "./server";

export type SettingsFormState = { ok?: string; error?: string };

/** Settings · Branding: logo, favicon and the three colours. */
export async function saveBrandingAction(brand: { accent: string; text: string; background: string; logo: unknown; favicon: unknown }): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateTheme({ actorId: user.id, siteId: site.id, theme: { accent: brand.accent, text: brand.text, background: brand.background, logo: brand.logo ?? null, favicon: brand.favicon ?? null } });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
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

/** Settings · Customer emails and Settings · Who gets notified: one save each. */
export async function saveMessagesAction(patch: { keepCopy?: boolean; templates?: unknown; notify?: unknown; forms?: { id: string; on: boolean; to: string; cc: string; bcc: string }[] }): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateMessages({ actorId: user.id, siteId: site.id, ...patch });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
  }
}

/** "Send me a test": to the signed-in person's own address. */
export async function sendTestEmailAction(key: string, template: { subject: string; body: string }): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const { sendTemplateTest } = await import("@/modules/orders/admin");
    const r = await sendTemplateTest({ actorId: user.id, siteId: site.id, to: user.email, key, template });
    return { ok: r.delivered ? `Sent to ${user.email}` : "Email isn't set up here, so it was written to the server log instead." };
  } catch (err) {
    return failed(err);
  }
}

/** Settings · Footer: the newsletter form and the social links. */
export async function saveFooterAction(p: { footer: unknown; social: unknown }): Promise<SettingsFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateFooter({ actorId: user.id, siteId: site.id, ...p });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return failed(err);
  }
}
