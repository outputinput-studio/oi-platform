"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { createArticle, deleteArticle, setArticleStatus, updateArticle } from "./server";
import { createCategory, deleteCategory, reorderCategories, updateCategory } from "./categories";
import { formError } from "@/lib/form-error";

export type FormState = { ok?: string; error?: string; fields?: string[] };


export async function createArticleAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    id = (await createArticle({ actorId: user.id, siteId: site.id, title: String(form.get("title") ?? "") })).id;
  } catch (err) {
    return formError(err);
  }
  redirect(`/articles/${id}`);
}

/** The editor autosaves a moment after a change; only the changed fields come through. */
export async function saveArticleAction(articleId: string, edit: unknown): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateArticle({ actorId: user.id, siteId: site.id, articleId, edit });
    revalidatePath("/articles");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}

export async function setArticleStatusAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  const articleId = String(form.get("articleId"));
  await setArticleStatus({ actorId: user.id, siteId: site.id, articleId, status: z.enum(["draft", "published", "scheduled"]).parse(form.get("status")) });
  revalidatePath(`/articles/${articleId}`);
  revalidatePath("/articles");
}

/** The Publishing card: status and, for scheduled, when. Returns the message rather than throwing. */
export async function publishArticleAction(articleId: string, status: "draft" | "published" | "scheduled", at?: string): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await setArticleStatus({ actorId: user.id, siteId: site.id, articleId, status, at: at ? new Date(at) : undefined });
    revalidatePath(`/articles/${articleId}`);
    revalidatePath("/articles");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}

export async function deleteArticleAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteArticle({ actorId: user.id, siteId: site.id, articleId: String(form.get("articleId")) });
  revalidatePath("/articles");
  redirect("/articles");
}

// ───────────────────────── categories ─────────────────────────

export async function createCategoryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const c = await createCategory({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? ""), slug: String(form.get("slug") ?? ""), description: String(form.get("description") ?? "") });
    revalidatePath("/articles/categories");
    return { ok: `${c.name} added.` };
  } catch (err) {
    return formError(err);
  }
}

export async function updateCategoryAction(_prev: FormState, form: FormData): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateCategory({
      actorId: user.id,
      siteId: site.id,
      categoryId: String(form.get("categoryId")),
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      description: String(form.get("description") ?? ""),
    });
    revalidatePath("/articles/categories");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}

export async function deleteCategoryAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteCategory({ actorId: user.id, siteId: site.id, categoryId: String(form.get("categoryId")) });
  revalidatePath("/articles/categories");
}

export async function reorderCategoriesAction(order: string[]): Promise<FormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await reorderCategories({ actorId: user.id, siteId: site.id, order: z.array(z.string().uuid()).max(200).parse(order) });
    revalidatePath("/articles/categories");
    return { ok: "Saved" };
  } catch (err) {
    return formError(err);
  }
}
