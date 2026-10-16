"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import {
  addSection,
  createPage,
  deletePage,
  moveSection,
  removeSection,
  reorderSections,
  setPageStatus,
  updatePage,
  updateSection,
} from "./server";

export type FormState = { ok?: string; error?: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function createPageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    const page = await createPage({
      actorId: user.id,
      siteId: site.id,
      title: String(form.get("title") ?? ""),
      slug: String(form.get("slug") ?? ""),
    });
    id = page.id;
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/pages/${id}`);
}

export async function updatePageAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updatePage({
      actorId: user.id,
      siteId: site.id,
      pageId: String(form.get("pageId")),
      // Either field may be left out: the title autosaves on its own, the address saves on demand.
      title: form.has("title") ? String(form.get("title")) : undefined,
      slug: form.has("slug") ? String(form.get("slug")) : undefined,
    });
    revalidatePath("/pages");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function setPageStatusAction(form: FormData) {
  const { user, site } = await requireSiteAccess();
  const at = form.get("at") ? new Date(String(form.get("at"))) : undefined;
  await setPageStatus({
    actorId: user.id,
    siteId: site.id,
    pageId: String(form.get("pageId")),
    status: z.enum(["draft", "published", "scheduled"]).parse(form.get("status")),
    at,
  });
  revalidatePath(`/pages/${String(form.get("pageId"))}`);
  revalidatePath("/pages");
}

export async function deletePageAction(form: FormData) {
  const { user, site } = await requireSiteAccess();
  await deletePage({ actorId: user.id, siteId: site.id, pageId: String(form.get("pageId")) });
  revalidatePath("/pages");
  redirect("/pages");
}

export async function addSectionAction(form: FormData) {
  const { user, site } = await requireSiteAccess();
  const pageId = String(form.get("pageId"));
  await addSection({
    actorId: user.id,
    siteId: site.id,
    pageId,
    type: String(form.get("type")),
    afterId: form.get("afterId") ? String(form.get("afterId")) : undefined,
  });
  revalidatePath(`/pages/${pageId}`);
}

export async function moveSectionAction(form: FormData) {
  const { user, site } = await requireSiteAccess();
  await moveSection({
    actorId: user.id,
    siteId: site.id,
    sectionId: String(form.get("sectionId")),
    direction: z.enum(["up", "down"]).parse(form.get("direction")),
  });
  revalidatePath(`/pages/${String(form.get("pageId"))}`);
}

/** A drag's result: the new order of section ids. Returns an error for the editor to show rather than throwing. */
export async function reorderSectionsAction(pageId: string, order: string[]): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await reorderSections({ actorId: user.id, siteId: site.id, pageId, order: z.array(z.string().uuid()).max(200).parse(order) });
    revalidatePath(`/pages/${pageId}`);
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function removeSectionAction(form: FormData) {
  const { user, site } = await requireSiteAccess();
  await removeSection({ actorId: user.id, siteId: site.id, sectionId: String(form.get("sectionId")) });
  revalidatePath(`/pages/${String(form.get("pageId"))}`);
}

/** Autosave target for search and sharing. */
/** The Publishing card: status and, for scheduled, when. Returns the message rather than throwing. */
export async function publishPageAction(pageId: string, status: "draft" | "published" | "scheduled", at?: string): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await setPageStatus({ actorId: user.id, siteId: site.id, pageId, status, at: at ? new Date(at) : undefined });
    revalidatePath(`/pages/${pageId}`);
    revalidatePath("/pages");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function savePageSeoAction(pageId: string, seo: unknown): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updatePage({ actorId: user.id, siteId: site.id, pageId, seo });
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

/** Autosave target for the page title (the address is saved on demand, from its own form). */
export async function savePageTitleAction(pageId: string, title: string): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updatePage({ actorId: user.id, siteId: site.id, pageId, title });
    revalidatePath("/pages");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

/**
 * Autosave target. Called from the section editor a moment after typing
 * stops; returns the message the editor shows (Saved / Retry).
 */
export async function saveSectionAction(sectionId: string, data: unknown): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateSection({ actorId: user.id, siteId: site.id, sectionId, data });
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}
