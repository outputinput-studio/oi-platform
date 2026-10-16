"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { createMenu, deleteMenu, resetHeader, saveMenu } from "./server";

export type MenuFormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function createMenuAction(_prev: MenuFormState, form: FormData): Promise<MenuFormState> {
  const { user, site } = await requireSiteAccess();
  let key: string;
  try {
    key = (await createMenu({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? "") })).key;
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/menus/${key}`);
}

/** The editor autosaves the whole menu a moment after a change. */
export async function saveMenuAction(key: string, settings: unknown): Promise<MenuFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await saveMenu({ actorId: user.id, siteId: site.id, key: String(key), settings });
    revalidatePath("/", "layout");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteMenuAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteMenu({ actorId: user.id, siteId: site.id, key: String(form.get("key") ?? "") });
  revalidatePath("/", "layout");
  redirect("/menus");
}

export async function resetHeaderAction(): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await resetHeader({ actorId: user.id, siteId: site.id });
  revalidatePath("/", "layout");
  redirect("/menus/header");
}
