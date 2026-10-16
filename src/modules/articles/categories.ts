import { and, asc, count, eq, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { articleCategories, articles, sites, type ArticleCategory } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { slugFromTitle } from "@/modules/pages/slug";
import { autoRedirect } from "@/modules/redirects/server";
import { readSearchSettings } from "@/modules/sites/search";
import { articleIsLive } from "@/modules/pages/live";

/**
 * Article categories. Each is a page at /journal/<slug>; an article's
 * main category puts it at /journal/<category>/<article>. An article
 * can sit in others too and shows on their pages as well.
 */

const nameSchema = z.string().trim().min(1, "Give it a name.").max(80);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "An address is lower-case words joined by dashes.")
  .max(60);

export type CategoryRow = ArticleCategory & { articleCount: number };

export async function listCategories(p: { actorId: string; siteId: string }): Promise<CategoryRow[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) => categoriesWithCounts(tx));
}

export async function createCategory(p: { actorId: string; siteId: string; name: string; slug?: string; description?: string }): Promise<ArticleCategory> {
  await assertAccess(p.actorId, p.siteId);
  const name = nameSchema.parse(p.name);
  const description = z.string().trim().max(300).parse(p.description ?? "");
  const slug = slugSchema.parse(p.slug?.trim() ? p.slug : slugFromTitle(name));
  return withSite(p.siteId, async (tx) => {
    await assertFree(tx, slug);
    const [{ next }] = await tx.select({ next: sql<number>`coalesce(max(${articleCategories.position}), -1) + 1` }).from(articleCategories).where(isNull(articleCategories.deletedAt));
    const [c] = await tx.insert(articleCategories).values({ siteId: p.siteId, name, slug, description, position: Number(next) }).returning();
    return c;
  });
}

export async function updateCategory(p: { actorId: string; siteId: string; categoryId: string; name?: string; slug?: string; description?: string }): Promise<ArticleCategory> {
  await assertAccess(p.actorId, p.siteId);
  const patch: Partial<ArticleCategory> = {};
  if (p.name !== undefined) patch.name = nameSchema.parse(p.name);
  if (p.slug !== undefined) patch.slug = slugSchema.parse(p.slug);
  if (p.description !== undefined) patch.description = z.string().trim().max(300).parse(p.description);
  return withSite(p.siteId, async (tx) => {
    const c = await load(tx, p.categoryId);
    if (patch.slug && patch.slug !== c.slug) await assertFree(tx, patch.slug, c.id);
    const [updated] = await tx.update(articleCategories).set(patch).where(eq(articleCategories.id, c.id)).returning();
    // The category's page and every live article under it moved: old links keep working.
    if (patch.slug && patch.slug !== c.slug) {
      const [site] = await tx.select({ search: sites.search }).from(sites).limit(1);
      if (!site || readSearchSettings(site.search).autoRedirect) {
        await autoRedirect(tx, { siteId: p.siteId, from: `/journal/${c.slug}`, to: `/journal/${patch.slug}` });
        const live = await tx.select({ slug: articles.slug }).from(articles).where(and(eq(articles.categoryId, c.id), articleIsLive()));
        for (const a of live) await autoRedirect(tx, { siteId: p.siteId, from: `/journal/${c.slug}/${a.slug}`, to: `/journal/${patch.slug}/${a.slug}` });
      }
    }
    return updated;
  });
}

/** Soft delete. Articles in it become uncategorised (main) or just lose the tag. */
export async function deleteCategory(p: { actorId: string; siteId: string; categoryId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const c = await load(tx, p.categoryId);
    await tx.update(articleCategories).set({ deletedAt: new Date() }).where(eq(articleCategories.id, c.id));
    await tx.update(articles).set({ categoryId: null }).where(eq(articles.categoryId, c.id));
    await tx
      .update(articles)
      .set({ categoryIds: sql`(select coalesce(jsonb_agg(x), '[]'::jsonb) from jsonb_array_elements_text(${articles.categoryIds}) x where x <> ${c.id})` })
      .where(sql`${articles.categoryIds} ? ${c.id}`);
  });
}

export async function reorderCategories(p: { actorId: string; siteId: string; order: string[] }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const live = await tx.select({ id: articleCategories.id }).from(articleCategories).where(isNull(articleCategories.deletedAt));
    const want = new Set(p.order);
    if (want.size !== p.order.length || live.length !== p.order.length || !live.every((c) => want.has(c.id))) throw new Error("The list changed under you. Reload and try again.");
    for (let i = 0; i < p.order.length; i++) await tx.update(articleCategories).set({ position: i }).where(eq(articleCategories.id, p.order[i]));
  });
}

// ───────────────────────── storefront ─────────────────────────

/** Live categories with at least one live article, for the journal's chips and the sitemap. */
export async function publishedCategories(p: { siteId: string }): Promise<CategoryRow[]> {
  const rows = await withSite(p.siteId, (tx) => categoriesWithCounts(tx, true));
  return rows.filter((c) => c.articleCount > 0);
}

export async function publishedCategory(p: { siteId: string; slug: string }): Promise<ArticleCategory | null> {
  const [c] = await withSite(p.siteId, (tx) =>
    tx.select().from(articleCategories).where(and(eq(articleCategories.slug, p.slug), isNull(articleCategories.deletedAt))).limit(1),
  );
  return c ?? null;
}

// ───────────────────────── helpers ─────────────────────────

/** Every live category and how many articles it holds (main or extra); live articles only when `liveOnly`. */
async function categoriesWithCounts(tx: Tx, liveOnly = false): Promise<CategoryRow[]> {
  const cats = await tx.select().from(articleCategories).where(isNull(articleCategories.deletedAt)).orderBy(asc(articleCategories.position), asc(articleCategories.createdAt));
  const out: CategoryRow[] = [];
  for (const c of cats) {
    const [r] = await tx
      .select({ n: count() })
      .from(articles)
      .where(and(liveOnly ? articleIsLive() : isNull(articles.deletedAt), or(eq(articles.categoryId, c.id), sql`${articles.categoryIds} ? ${c.id}`)));
    out.push({ ...c, articleCount: Number(r?.n ?? 0) });
  }
  return out;
}

async function load(tx: Tx, id: string): Promise<ArticleCategory> {
  if (!z.string().uuid().safeParse(id).success) throw new AccessError("That category doesn't exist.");
  const [c] = await tx.select().from(articleCategories).where(and(eq(articleCategories.id, id), isNull(articleCategories.deletedAt))).limit(1);
  if (!c) throw new AccessError("That category doesn't exist.");
  return c;
}

async function assertFree(tx: Tx, slug: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: articleCategories.id })
    .from(articleCategories)
    .where(and(eq(articleCategories.slug, slug), isNull(articleCategories.deletedAt), exceptId ? sql`${articleCategories.id} <> ${exceptId}` : undefined))
    .limit(1);
  if (clash) throw new AccessError(`There's already a category at /journal/${slug}. Pick another address.`);
}

