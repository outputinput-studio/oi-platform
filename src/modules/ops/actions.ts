"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { formError } from "@/lib/form-error";
import { parsePrice } from "@/modules/sites/shop";
import { setPlan } from "@/modules/plans/server";
import { requireOps } from "./access";

export type OpsFormState = { ok?: string; error?: string; fields?: string[] };

/** "" → no limit; anything else → a number for the schema to judge. */
function limit(v: FormDataEntryValue | null): number | null {
  const s = String(v ?? "").replace(/[\s,]/g, "");
  return s === "" ? null : Number(s);
}

export async function setPlanAction(_prev: OpsFormState, form: FormData): Promise<OpsFormState> {
  const user = await requireOps();
  try {
    const siteId = z.string().uuid().parse(form.get("siteId"));
    const price = parsePrice(String(form.get("price") ?? ""));
    await setPlan({
      actorId: user.id,
      siteId,
      plan: {
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
      },
    });
    revalidatePath(`/sites/${siteId}`);
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}
