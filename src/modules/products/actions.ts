"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { createProduct, deleteProduct, updateProduct } from "./server";
import { deleteCode, saveCode } from "@/modules/discounts/server";
import { createProductCategory, deleteProductCategory, reorderProductCategories, updateProductCategory } from "./categories";
import { formError } from "@/lib/form-error";
import { notifyBackInStock } from "@/modules/waiting/server";

export type ProductFormState = { ok?: string; error?: string; fields?: string[] };
/** Adding a category also hands back the new one, so the product editor can pick it straight away. */
export type CategoryFormState = ProductFormState & { category?: { id: string; name: string } };


export async function createProductAction(_prev: ProductFormState, form: FormData): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  let id: string;
  try {
    id = (await createProduct({ actorId: user.id, siteId: site.id, name: String(form.get("name") ?? ""), categoryId: String(form.get("categoryId") ?? "") || null })).id;
  } catch (err) {
    return formError(err);
  }
  redirect(`/products/${id}`);
}

/** The editor autosaves a moment after a change; only the changed fields come through. */
export async function saveProductAction(productId: string, edit: unknown): Promise<ProductFormState> {
  const { user, site } = await requireSiteAccess();
  try {
    await updateProduct({ actorId: user.id, siteId: site.id, productId, edit });
    revalidatePath("/products");
  } catch (err) {
    return formError(err);
  }
  // Back for sale: whoever asked hears about it. A mail problem never undoes the save.
  try {
    const host = ((await headers()).get("x-oi-host") ?? "").replace(/^admin\./, `${site.slug}.`);
    await notifyBackInStock({ siteId: site.id, productId, shopOrigin: `https://${host}` });
  } catch (err) {
    console.error("back in stock check failed", err);
  }
  return { ok: "Saved" };
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
    return formError(err);
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
    return formError(err);
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
    return formError(err);
  }
}

// ───────────────────────── discount codes ─────────────────────────

export async function saveCodeAction(codeId: string | undefined, edit: unknown): Promise<ProductFormState & { id?: string }> {
  const { user, site } = await requireSiteAccess();
  try {
    const c = await saveCode({ actorId: user.id, siteId: site.id, codeId, edit });
    revalidatePath("/products/discounts");
    return { ok: "Saved", id: c.id };
  } catch (err) {
    return formError(err);
  }
}

export async function deleteCodeAction(form: FormData): Promise<void> {
  const { user, site } = await requireSiteAccess();
  await deleteCode({ actorId: user.id, siteId: site.id, codeId: String(form.get("codeId")) });
  revalidatePath("/products/discounts");
  redirect("/products/discounts");
}
