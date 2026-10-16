"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { addRedirect, dismissNotFound, removeRedirect } from "./server";

export type FormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function addRedirectAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const r = await addRedirect({ actorId: user.id, siteId: site.id, from: String(form.get("from") ?? ""), to: String(form.get("to") ?? "") });
    revalidatePath("/settings/redirects");
    return { ok: `${r.fromPath} now goes to ${r.toPath}.` };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function removeRedirectAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await removeRedirect({ actorId: user.id, siteId: site.id, redirectId: String(form.get("redirectId")) });
  revalidatePath("/settings/redirects");
}

export async function dismissNotFoundAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await dismissNotFound({ actorId: user.id, siteId: site.id, path: String(form.get("path")) });
  revalidatePath("/settings/redirects");
}
