import { and, eq, isNull, ne } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { productCategories, products } from "@/db/schema";
import { RESERVED_SHOP_SLUGS } from "./catalogue";
import { FieldError } from "@/lib/form-error";

/**
 * Products and product categories share /shop/<slug>, so an address must
 * be free across both, and not one kept for the cart and checkout.
 */
export async function assertShopSlugFree(tx: Tx, slug: string, except: { productId?: string; categoryId?: string } = {}): Promise<void> {
  if (RESERVED_SHOP_SLUGS.includes(slug)) throw new FieldError("slug", `/shop/${slug} is kept for the shop itself. Pick another address.`);
  const [p] = await tx
    .select({ id: products.id })
    .from(products)
    .where(and(eq(products.slug, slug), isNull(products.deletedAt), except.productId ? ne(products.id, except.productId) : undefined))
    .limit(1);
  if (p) throw new FieldError("slug", `There's already a product at /shop/${slug}. Pick another address.`);
  const [c] = await tx
    .select({ id: productCategories.id })
    .from(productCategories)
    .where(and(eq(productCategories.slug, slug), isNull(productCategories.deletedAt), except.categoryId ? ne(productCategories.id, except.categoryId) : undefined))
    .limit(1);
  if (c) throw new FieldError("slug", `There's already a category at /shop/${slug}. Pick another address.`);
}

/** The name's address, or the first free -2, -3… after it. */
export async function freeShopSlug(tx: Tx, base: string): Promise<string> {
  const taken = new Set([
    ...RESERVED_SHOP_SLUGS,
    ...(await tx.select({ s: products.slug }).from(products).where(isNull(products.deletedAt))).map((r) => r.s),
    ...(await tx.select({ s: productCategories.slug }).from(productCategories).where(isNull(productCategories.deletedAt))).map((r) => r.s),
  ]);
  const b = base || "product";
  if (!taken.has(b)) return b;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${b}-${i}`)) return `${b}-${i}`;
  return `${b}-${Date.now()}`;
}
