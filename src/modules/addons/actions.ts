"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { requireOps } from "@/modules/ops/access";
import { formError } from "@/lib/form-error";
import { parsePrice } from "@/modules/sites/shop";
import { addAddon, askAboutAddon, deleteAddon, removeAddon, saveAddon } from "./server";

export type AddonFormState = { ok?: string; error?: string; fields?: string[] };

// ── Settings · Plan (Owners) ───────────────────────────────────────────

export async function addAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const { user, site } = await requireSiteAccess("owner");
  try {
    const a = await addAddon({ actorId: user.id, siteId: site.id, addonId: String(form.get("addonId") ?? "") });
    revalidatePath("/settings/plan");
    return { ok: `${a.name} added` };
  } catch (err) {
    return formError(err);
  }
}

export async function removeAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const { user, site } = await requireSiteAccess("owner");
  try {
    await removeAddon({ actorId: user.id, siteId: site.id, addonId: String(form.get("addonId") ?? "") });
    revalidatePath("/settings/plan");
    return { ok: "Taken off" };
  } catch (err) {
    return formError(err);
  }
}

export async function askAboutAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const { user, site } = await requireSiteAccess("owner");
  try {
    const addonId = String(form.get("addonId") ?? "") || null;
    await askAboutAddon({ actorId: user.id, siteId: site.id, addonId, note: String(form.get("note") ?? "") });
    return { ok: "Sent — we'll be in touch" };
  } catch (err) {
    return formError(err);
  }
}

// ── ops ────────────────────────────────────────────────────────────────

function addonFromForm(form: FormData) {
  const price = parsePrice(String(form.get("price") ?? ""));
  const amount = String(form.get("amount") ?? "").replace(/[\s,]/g, "");
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    price: price ?? -1,
    currency: String(form.get("currency") ?? ""),
    kind: String(form.get("kind") ?? ""),
    amount: amount === "" ? null : Number(amount),
    selfServe: form.get("selfServe") === "on",
  };
}

export async function saveAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const user = await requireOps();
  let made: string | null = null;
  try {
    const id = String(form.get("id") ?? "") || undefined;
    const r = await saveAddon({ actorId: user.id, id, addon: addonFromForm(form) });
    revalidatePath("/addons");
    if (!id) made = r.id;
    else return { ok: r.sites ? `Saved — ${r.sites} ${r.sites === 1 ? "site has" : "sites have"} it` : "Saved" };
  } catch (err) {
    return formError(err);
  }
  redirect(`/addons/${made}?added=1`);
}

export async function deleteAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const user = await requireOps();
  try {
    await deleteAddon({ actorId: user.id, id: String(form.get("id") ?? "") });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/addons");
  redirect("/addons");
}

/** Ops, on a site's page: add or take off any add-on for them (the "Ask us" ones included). */
export async function opsSiteAddonAction(_prev: AddonFormState, form: FormData): Promise<AddonFormState> {
  const user = await requireOps();
  try {
    const siteId = z.string().uuid().parse(form.get("siteId"));
    const addonId = String(form.get("addonId") ?? "");
    if (form.get("op") === "remove") await removeAddon({ actorId: user.id, siteId, addonId });
    else await addAddon({ actorId: user.id, siteId, addonId });
    revalidatePath(`/sites/${siteId}`);
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}
