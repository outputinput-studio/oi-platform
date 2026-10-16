import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { productCategories, products, sites, type Product } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import type { ImageRef } from "@/modules/pages/registry";
import type { Seo } from "@/modules/pages/seo";
import { slugFromTitle } from "@/modules/pages/slug";
import { autoRedirect } from "@/modules/redirects/server";
import { readSearchSettings } from "@/modules/sites/search";
import { readProductDetails } from "./details";
import { productEditSchema, productNameSchema, readPhotos } from "./catalogue";
import { assertShopSlugFree, freeShopSlug } from "./slugs";

/**
 * Products: the pieces a site sells. The team side authorises first;
 * the storefront side has no actor and only ever sees visible products.
 * Every product lives at /shop/<slug>, whatever its category.
 */

export type ProductRow = Omit<Product, "photos"> & { photos: ImageRef[]; category: { id: string; slug: string; name: string } | null };

type Joined = { p: Product; c: { id: string; slug: string; name: string } | null };

function row(j: Joined): ProductRow {
  return { ...j.p, photos: readPhotos(j.p.photos), category: j.c?.id ? j.c : null };
}

function joined(tx: Tx) {
  return tx
    .select({ p: products, c: { id: productCategories.id, slug: productCategories.slug, name: productCategories.name } })
    .from(products)
    .leftJoin(productCategories, and(eq(productCategories.id, products.categoryId), isNull(productCategories.deletedAt)));
}

export function productPath(p: Pick<Product, "slug">): string {
  return `/shop/${p.slug}`;
}

export async function listProducts(p: { actorId: string; siteId: string }): Promise<ProductRow[]> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) => joined(tx).where(isNull(products.deletedAt)).orderBy(desc(products.createdAt)));
  return rows.map(row);
}

export async function getProduct(p: { actorId: string; siteId: string; productId: string }): Promise<ProductRow> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const found = await load(tx, p.productId);
    const [j] = await joined(tx).where(eq(products.id, found.id)).limit(1);
    return row(j);
  });
}

/** A new product starts hidden, so it can be worked on before anyone sees it. */
export async function createProduct(p: { actorId: string; siteId: string; name: string; categoryId?: string | null }): Promise<ProductRow> {
  await assertAccess(p.actorId, p.siteId);
  const name = productNameSchema.parse(p.name);
  return withSite(p.siteId, async (tx) => {
    const slug = await freeShopSlug(tx, slugFromTitle(name));
    const categoryId = p.categoryId ? (await liveCategory(tx, p.categoryId)).id : null;
    const [created] = await tx.insert(products).values({ siteId: p.siteId, name, slug, categoryId }).returning();
    const [j] = await joined(tx).where(eq(products.id, created.id)).limit(1);
    return row(j);
  });
}

export async function updateProduct(p: { actorId: string; siteId: string; productId: string; edit: unknown }): Promise<ProductRow> {
  await assertAccess(p.actorId, p.siteId);
  const e = productEditSchema.parse(p.edit);
  return withSite(p.siteId, async (tx) => {
    const cur = await load(tx, p.productId);
    if (e.slug && e.slug !== cur.slug) await assertShopSlugFree(tx, e.slug, { productId: cur.id });
    const patch: Partial<Product> = { updatedAt: new Date() };
    for (const k of ["name", "slug", "description", "price", "salePrice", "digital", "make", "stock", "leadTime", "leadUnit", "availability", "buyWith", "visible", "photos", "code", "details"] as const) {
      if (e[k] !== undefined) (patch as Record<string, unknown>)[k] = e[k];
    }
    if (e.seo !== undefined) patch.seo = e.seo as Seo;
    if (e.categoryId !== undefined) patch.categoryId = e.categoryId ? (await liveCategory(tx, e.categoryId)).id : null;
    const price = patch.price !== undefined ? patch.price : cur.price;
    const sale = patch.salePrice !== undefined ? patch.salePrice : cur.salePrice;
    if (sale !== null && (price === null || sale >= price)) throw new Error("A sale price is lower than the price. Clear it to stop the sale.");
    await tx.update(products).set(patch).where(eq(products.id, cur.id));
    // A visible product whose address changed keeps its old link working.
    if (patch.slug && patch.slug !== cur.slug && cur.visible) {
      const [site] = await tx.select({ search: sites.search }).from(sites).limit(1);
      if (!site || readSearchSettings(site.search).autoRedirect) await autoRedirect(tx, { siteId: p.siteId, from: productPath(cur), to: `/shop/${patch.slug}` });
    }
    const [j] = await joined(tx).where(eq(products.id, cur.id)).limit(1);
    return row(j);
  });
}

export async function deleteProduct(p: { actorId: string; siteId: string; productId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const cur = await load(tx, p.productId);
    await tx.update(products).set({ deletedAt: new Date() }).where(eq(products.id, cur.id));
  });
}

// ───────────────────────── storefront ─────────────────────────

/** The shop: every visible product, newest first; or one category's. */
export async function publishedProducts(p: { siteId: string; categoryId?: string }): Promise<ProductRow[]> {
  const rows = await withSite(p.siteId, (tx) =>
    joined(tx)
      .where(and(isNull(products.deletedAt), eq(products.visible, true), p.categoryId ? eq(products.categoryId, p.categoryId) : undefined))
      .orderBy(desc(products.createdAt)),
  );
  return rows.map(row);
}

export async function publishedProduct(p: { siteId: string; slug: string }): Promise<ProductRow | null> {
  const [j] = await withSite(p.siteId, (tx) =>
    joined(tx)
      .where(and(eq(products.slug, p.slug), isNull(products.deletedAt), eq(products.visible, true)))
      .limit(1),
  );
  return j ? row(j) : null;
}

/** Whether the automatic menu should offer Shop. */
export async function hasPublishedProducts(p: { siteId: string }): Promise<boolean> {
  const [x] = await withSite(p.siteId, (tx) =>
    tx
      .select({ id: products.id })
      .from(products)
      .where(and(isNull(products.deletedAt), eq(products.visible, true)))
      .limit(1),
  );
  return !!x;
}

// ───────────────────────── helpers ─────────────────────────

async function liveCategory(tx: Tx, id: string) {
  const [c] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.id, id), isNull(productCategories.deletedAt)))
    .limit(1);
  if (!c) throw new AccessError("That category doesn't exist.");
  return c;
}

async function load(tx: Tx, id: string): Promise<Product> {
  if (!z.string().uuid().safeParse(id).success) throw new AccessError("That product doesn't exist.");
  const [x] = await tx
    .select()
    .from(products)
    .where(and(eq(products.id, id), isNull(products.deletedAt)))
    .limit(1);
  if (!x) throw new AccessError("That product doesn't exist.");
  return x;
}

/**
 * For Settings · Product details: per row, how many products change it for
 * themselves and how many hide it, out of how many products there are.
 */
export async function detailRowUsage(p: { actorId: string; siteId: string }): Promise<{ total: number; rows: Record<string, { custom: number; hidden: number }> }> {
  await assertAccess(p.actorId, p.siteId);
  const all = await withSite(p.siteId, (tx) => tx.select({ details: products.details }).from(products).where(isNull(products.deletedAt)));
  const rows: Record<string, { custom: number; hidden: number }> = {};
  for (const { details } of all) {
    for (const [id, o] of Object.entries(readProductDetails(details))) {
      rows[id] ??= { custom: 0, hidden: 0 };
      rows[id][o.mode === "hidden" ? "hidden" : "custom"]++;
    }
  }
  return { total: all.length, rows };
}
