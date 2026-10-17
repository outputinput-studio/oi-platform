"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { formError } from "@/lib/form-error";
import { parsePrice } from "@/modules/sites/shop";
import { setPlan } from "@/modules/plans/server";
import { assignPlan, deleteDefaultPlan, saveDefaultPlan } from "@/modules/plans/catalogue";
import { requireOps } from "./access";

export type OpsFormState = { ok?: string; error?: string; fields?: string[] };

/** "" → no limit; anything else → a number for the schema to judge. */
function limit(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[\s,]/g, "");
  return s === "" ? null : Number(s);
}

/** The plan fields, as the schema wants them; it judges what's wrong. */
function planFromForm(form: FormData) {
  const price = parsePrice(String(form.get("price") ?? ""));
  return {
    name: String(form.get("name") ?? ""),
    description: String(form.get("description") ?? ""),
    price: price ?? -1,
    currency: String(form.get("currency") ?? ""),
    limits: {
      storageGb: limit(form.get("limits.storageGb")) ?? 0,
      products: limit(form.get("limits.products")),
      people: limit(form.get("limits.people")),
      visits: limit(form.get("limits.visits")),
    },
  };
}

/** A site's own custom plan. */
export async function setPlanAction(_prev: OpsFormState, form: FormData): Promise<OpsFormState> {
  const user = await requireOps();
  try {
    const siteId = z.string().uuid().parse(form.get("siteId"));
    await setPlan({ actorId: user.id, siteId, plan: planFromForm(form) });
    revalidatePath(`/sites/${siteId}`);
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}

/** Put a site on one of our default plans. */
export async function assignPlanAction(_prev: OpsFormState, form: FormData): Promise<OpsFormState> {
  const user = await requireOps();
  try {
    const siteId = z.string().uuid().parse(form.get("siteId"));
    const plan = await assignPlan({ actorId: user.id, siteId, planId: String(form.get("planId") ?? "") });
    revalidatePath(`/sites/${siteId}`);
    return { ok: `On ${plan.name}` };
  } catch (err) {
    return formError(err);
  }
}

/** ops · Plans: add a default plan, or change one (every site on it follows). */
export async function saveDefaultPlanAction(_prev: OpsFormState, form: FormData): Promise<OpsFormState> {
  const user = await requireOps();
  let made: string | null = null;
  try {
    const id = String(form.get("id") ?? "") || undefined;
    const r = await saveDefaultPlan({ actorId: user.id, id, plan: planFromForm(form) });
    revalidatePath("/plans");
    if (!id) made = r.id;
    else return { ok: r.sites ? `Saved — ${r.sites} ${r.sites === 1 ? "site follows" : "sites follow"}` : "Saved" };
  } catch (err) {
    return formError(err);
  }
  redirect(`/plans/${made}?added=1`);
}

export async function deleteDefaultPlanAction(_prev: OpsFormState, form: FormData): Promise<OpsFormState> {
  const user = await requireOps();
  try {
    await deleteDefaultPlan({ actorId: user.id, id: String(form.get("id") ?? "") });
  } catch (err) {
    return formError(err);
  }
  revalidatePath("/plans");
  redirect("/plans");
}
