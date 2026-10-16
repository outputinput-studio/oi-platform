import { and, asc, count, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { productCategories, products, sites, type ProductCategory } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { slugFromTitle } from "@/modules/pages/slug";
import { autoRedirect } from "@/modules/redirects/server";
import { readSearchSettings } from "@/modules/sites/search";
import { productSlugSchema } from "./catalogue";
import { assertShopSlugFree } from "./slugs";

/**
 * Product categories: how people browse the shop. Each is a page at
 * /shop/<slug>, in the order the team drags them into.
 */

const nameSchema = z.string().trim().min(1, "Give it a name.").max(80);

export type ProductCategoryRow = ProductCategory & { productCount: number };

export async function listProductCategories(p: { actorId: string; siteId: string }): Promise<ProductCategoryRow[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) => withCounts(tx, false));
}

export async function createProductCategory(p: { actorId: string; siteId: string; name: string; slug?: string; description?: string }): Promise<ProductCategory> {
  await assertAccess(p.actorId, p.siteId);
  const name = nameSchema.parse(p.name);
  const description = z.string().trim().max(300).parse(p.description ?? "");
  const slug = productSlugSchema.parse(p.slug?.trim() ? p.slug : slugFromTitle(name));
  return withSite(p.siteId, async (tx) => {
    await assertShopSlugFree(tx, slug);
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${productCategories.position}), -1) + 1` }).from(productCategories).where(isNull(productCategories.deletedAt));
    const [c] = await tx.insert(productCategories).values({ siteId: p.siteId, name, slug, description, position: Number(next) }).returning();
    return c;
  });
}

export async function updateProductCategory(p: { actorId: string; siteId: string; categoryId: string; name?: string; slug?: string; description?: string }): Promise<ProductCategory> {
  await assertAccess(p.actorId, p.siteId);
  const patch: Partial<ProductCategory> = {};
  if (p.name !== undefined) patch.name = nameSchema.parse(p.name);
  if (p.slug !== undefined) patch.slug = productSlugSchema.parse(p.slug);
  if (p.description !== undefined) patch.description = z.string().trim().max(300).parse(p.description);
  return withSite(p.siteId, async (tx) => {
    const c = await load(tx, p.categoryId);
    if (patch.slug && patch.slug !== c.slug) await assertShopSlugFree(tx, patch.slug, { categoryId: c.id });
    const [updated] = await tx.update(productCategories).set(patch).where(eq(productCategories.id, c.id)).returning();
    if (patch.slug && patch.slug !== c.slug) {
      const [site] = await tx.select({ search: sites.search }).from(sites).limit(1);
      if (!site || readSearchSettings(site.search).autoRedirect) await autoRedirect(tx, { siteId: p.siteId, from: `/shop/${c.slug}`, to: `/shop/${patch.slug}` });
    }
    return updated;
  });
}

/** Soft delete. Its products stay, uncategorised. */
export async function deleteProductCategory(p: { actorId: string; siteId: string; categoryId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const c = await load(tx, p.categoryId);
    await tx.update(productCategories).set({ deletedAt: new Date() }).where(eq(productCategories.id, c.id));
    await tx.update(products).set({ categoryId: null }).where(eq(products.categoryId, c.id));
  });
}

export async function reorderProductCategories(p: { actorId: string; siteId: string; order: string[] }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const live = await tx.select({ id: productCategories.id }).from(productCategories).where(isNull(productCategories.deletedAt));
    const want = new Set(p.order);
    if (want.size !== p.order.length || live.length !== p.order.length || !live.every((c) => want.has(c.id))) throw new Error("The list changed under you. Reload and try again.");
    for (let i = 0; i < p.order.length; i++) await tx.update(productCategories).set({ position: i }).where(eq(productCategories.id, p.order[i]));
  });
}

// ───────────────────────── storefront ─────────────────────────

/** Categories with at least one visible product, for the shop's chips and the sitemap. */
export async function publishedProductCategories(p: { siteId: string }): Promise<ProductCategoryRow[]> {
  const rows = await withSite(p.siteId, (tx) => withCounts(tx, true));
  return rows.filter((c) => c.productCount > 0);
}

export async function productCategoryBySlug(p: { siteId: string; slug: string }): Promise<ProductCategory | null> {
  const [c] = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(productCategories)
      .where(and(eq(productCategories.slug, p.slug), isNull(productCategories.deletedAt)))
      .limit(1),
  );
  return c ?? null;
}

// ───────────────────────── helpers ─────────────────────────

async function withCounts(tx: Tx, visibleOnly: boolean): Promise<ProductCategoryRow[]> {
  const cats = await tx.select().from(productCategories).where(isNull(productCategories.deletedAt)).orderBy(asc(productCategories.position), asc(productCategories.createdAt));
  const counts = await tx
    .select({ id: products.categoryId, n: count() })
    .from(products)
    .where(and(isNull(products.deletedAt), visibleOnly ? eq(products.visible, true) : undefined))
    .groupBy(products.categoryId);
  const by = new Map(counts.map((c) => [c.id, Number(c.n)]));
  return cats.map((c) => ({ ...c, productCount: by.get(c.id) ?? 0 }));
}

async function load(tx: Tx, id: string): Promise<ProductCategory> {
  if (!z.string().uuid().safeParse(id).success) throw new AccessError("That category doesn't exist.");
  const [c] = await tx
    .select()
    .from(productCategories)
    .where(and(eq(productCategories.id, id), isNull(productCategories.deletedAt)))
    .limit(1);
  if (!c) throw new AccessError("That category doesn't exist.");
  return c;
}
