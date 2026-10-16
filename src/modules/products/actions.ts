"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { createProduct, deleteProduct, updateProduct } from "./server";
import { createProductCategory, deleteProductCategory, reorderProductCategories, updateProductCategory } from "./categories";

export type ProductFormState = { ok?: string; error?: string };
/** Adding a category also hands back the new one, so the product editor can pick it straight away. */
export type CategoryFormState = ProductFormState & { category?: { id: string; name: string } };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function createProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    id = (await createProduct({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? ""), categoryId: String(form.get("categoryId") ?? "") || null })).id;
  } catch (err) {
    return { error: message(err) };
  }
  redirect(`/products/${id}`);
}

/** The editor autosaves a moment after a change; only the changed fields come through. */
export async function saveProductAction(productId: string, edit: unknown): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateProduct({ actorId: user.id, siteId: site.id, productId, edit });
    revalidatePath("/products");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteProductAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteProduct({ actorId: user.id, siteId: site.id, productId: String(form.get("productId")) });
  revalidatePath("/products");
  redirect("/products");
}

export async function createProductCategoryAction(_prev: CategoryFormState, form: FormData): Promise<CategoryFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    const c = await createProductCategory({
      actorId: user.id,
      siteId: site.id,
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      description: String(form.get("description") ?? ""),
    });
    revalidatePath("/products/categories");
    revalidatePath("/products");
    return { ok: "Added", category: { id: c.id, name: c.name } };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function updateProductCategoryAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateProductCategory({
      actorId: user.id,
      siteId: site.id,
      categoryId: String(form.get("categoryId")),
      name: String(form.get("name") ?? ""),
      slug: String(form.get("slug") ?? ""),
      description: String(form.get("description") ?? ""),
    });
    revalidatePath("/products/categories");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}

export async function deleteProductCategoryAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteProductCategory({ actorId: user.id, siteId: site.id, categoryId: String(form.get("categoryId")) });
  revalidatePath("/products/categories");
  redirect("/products/categories");
}

export async function reorderProductCategoriesAction(order: string[]): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await reorderProductCategories({ actorId: user.id, siteId: site.id, order: z.array(z.string().uuid()).max(200).parse(order) });
    revalidatePath("/products/categories");
    return { ok: "Saved" };
  } catch (err) {
    return { error: message(err) };
  }
}
