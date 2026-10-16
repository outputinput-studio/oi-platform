"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { renameSite, updateSearchSettings, updateShipping, updateShopSettings, updateTheme } from "./server";

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
