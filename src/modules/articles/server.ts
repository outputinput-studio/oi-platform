import { and, desc, eq, isNull, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { articleCategories, articles, sites, type Article } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { imageRef, type ImageRef } from "@/modules/pages/registry";
import { slugFromTitle } from "@/modules/pages/slug";
import { seoSchema, type Seo } from "@/modules/pages/seo";
import { autoRedirect } from "@/modules/redirects/server";
import { readSearchSettings } from "@/modules/sites/search";
import { articleIsLive, isLive } from "@/modules/pages/live";
import { scheduleTime } from "@/modules/pages/server";
import { FieldError, named } from "@/lib/form-error";

/**
 * Articles: the site's journal. Same shape as pages — soft delete,
 * draft/live, an address that's unique per site — but a single piece of
 * writing rather than a stack of sections, dated and listed newest
 * first at /journal.
 */

const titleSchema = z.string().trim().min(1, "Give it a title.").max(160);
const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "An address is lower-case words joined by dashes, like my-first-post.")
  .max(80);

/** What the editor autosaves. Everything optional: only what's sent is changed. */
export const articleEditSchema = z.object({
  title: titleSchema.optional(),
  slug: slugSchema.optional(),
  excerpt: z.string().trim().max(300).optional(),
  body: z.string().max(60_000).optional(),
  cover: imageRef.nullable().optional(),
  author: z.string().trim().max(80).optional(),
  /** A calendar date, yyyy-mm-dd; empty leaves it to the first publish. */
  publishedOn: z
    .string()
    .trim()
    .regex(/^(\d{4}-\d{2}-\d{2})?$/, "Pick a date.")
    .optional(),
  seo: seoSchema.optional(),
  /** The main category (sets the address) and any others. Null clears the main one. */
  categoryId: z.string().uuid().nullable().optional(),
  categoryIds: z.array(z.string().uuid()).max(20).optional(),
});
export type ArticleEdit = z.infer<typeof articleEditSchema>;

export type ArticleRow = Omit<Article, "cover"> & { cover: ImageRef | null; category: { id: string; slug: string; name: string } | null };

/** Where an article lives: under its main category, or straight under /journal. */
export function articlePath(a: Pick<ArticleRow, "slug" | "category">): string {
  return a.category ? `/journal/${a.category.slug}/${a.slug}` : `/journal/${a.slug}`;
}

type Joined = { a: Article; c: { id: string; slug: string; name: string } | null };

function row(j: Joined): ArticleRow {
  const r = imageRef.safeParse(j.a.cover);
  return { ...j.a, cover: r.success ? r.data : null, category: j.c?.id ? j.c : null };
}

/** The select every read uses: the article with its main category (live ones only) alongside. */
function joined(tx: Tx) {
  return tx
    .select({ a: articles, c: { id: articleCategories.id, slug: articleCategories.slug, name: articleCategories.name } })
    .from(articles)
    .leftJoin(articleCategories, and(eq(articleCategories.id, articles.categoryId), isNull(articleCategories.deletedAt)));
}

export async function listArticles(p: { actorId: string; siteId: string }): Promise<ArticleRow[]> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) => joined(tx).where(isNull(articles.deletedAt)).orderBy(desc(articles.publishedAt), desc(articles.createdAt)));
  return rows.map(row);
}

export async function getArticle(p: { actorId: string; siteId: string; articleId: string }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const a = await load(tx, p.articleId);
    const [j] = await joined(tx).where(eq(articles.id, a.id)).limit(1);
    return row(j);
  });
}

export async function createArticle(p: { actorId: string; siteId: string; title: string }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  const title = named("title", titleSchema, p.title);
  return withSite(p.siteId, async (tx) => {
    const slug = await freeSlug(tx, slugFromTitle(title));
    const [a] = await tx.insert(articles).values({ siteId: p.siteId, title, slug }).returning();
    return row({ a, c: null });
  });
}

export async function updateArticle(p: { actorId: string; siteId: string; articleId: string; edit: unknown }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  const e = articleEditSchema.parse(p.edit);
  return withSite(p.siteId, async (tx) => {
    const a = await load(tx, p.articleId);
    if (e.slug && e.slug !== a.slug) await assertSlugFree(tx, e.slug, a.id);
    const patch: Partial<Article> = { updatedAt: new Date() };
    if (e.title !== undefined) patch.title = e.title;
    if (e.slug !== undefined) patch.slug = e.slug;
    if (e.excerpt !== undefined) patch.excerpt = e.excerpt;
    if (e.body !== undefined) patch.body = e.body;
    if (e.cover !== undefined) patch.cover = e.cover;
    if (e.author !== undefined) patch.author = e.author;
    if (e.seo !== undefined) patch.seo = e.seo as Seo;
    if (e.publishedOn !== undefined) patch.publishedAt = e.publishedOn ? new Date(`${e.publishedOn}T12:00:00Z`) : a.publishedAt;
    if (e.categoryId !== undefined) patch.categoryId = e.categoryId ? (await liveCategory(tx, e.categoryId)).id : null;
    if (e.categoryIds !== undefined) {
      const main = patch.categoryId !== undefined ? patch.categoryId : a.categoryId;
      const ids: string[] = [];
      for (const id of e.categoryIds) if (id !== main && !ids.includes(id)) ids.push((await liveCategory(tx, id)).id);
      patch.categoryIds = ids;
    }
    const [before] = await joined(tx).where(eq(articles.id, a.id)).limit(1);
    await tx.update(articles).set(patch).where(eq(articles.id, a.id));
    const [after] = await joined(tx).where(eq(articles.id, a.id)).limit(1);
    // A live article whose address changed — new slug or new main category — keeps its old link working.
    const was = articlePath(row(before));
    const now = articlePath(row(after));
    if (was !== now && isLive(a)) {
      const [site] = await tx.select({ search: sites.search }).from(sites).limit(1);
      if (!site || readSearchSettings(site.search).autoRedirect) await autoRedirect(tx, { siteId: p.siteId, from: was, to: now });
    }
    return row(after);
  });
}

export async function setArticleStatus(p: { actorId: string; siteId: string; articleId: string; status: "draft" | "published" | "scheduled"; at?: Date }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  const at = scheduleTime(p.status, p.at);
  return withSite(p.siteId, async (tx) => {
    const a = await load(tx, p.articleId);
    await tx
      .update(articles)
      .set({ status: p.status, publishedAt: p.status === "scheduled" ? at : p.status === "published" ? (a.publishedAt ?? new Date()) : a.publishedAt, updatedAt: new Date() })
      .where(eq(articles.id, a.id));
    const [j] = await joined(tx).where(eq(articles.id, a.id)).limit(1);
    return row(j);
  });
}

export async function deleteArticle(p: { actorId: string; siteId: string; articleId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const a = await load(tx, p.articleId);
    await tx.update(articles).set({ deletedAt: new Date() }).where(eq(articles.id, a.id));
  });
}

// ───────────────────────── storefront ─────────────────────────

/** The journal: every live article, newest first; or just one category's (main or extra). */
export async function publishedArticles(p: { siteId: string; categoryId?: string }): Promise<ArticleRow[]> {
  const rows = await withSite(p.siteId, (tx) =>
    joined(tx)
      .where(
        and(
          articleIsLive(),
          p.categoryId ? sql`(${articles.categoryId} = ${p.categoryId} or ${articles.categoryIds} ? ${p.categoryId})` : undefined,
        ),
      )
      .orderBy(desc(articles.publishedAt), desc(articles.createdAt)),
  );
  return rows.map(row);
}

/** A live article by its own slug. The caller checks the category in the address matches, so a stale link can be sent on. */
export async function publishedArticle(p: { siteId: string; slug: string }): Promise<ArticleRow | null> {
  const [j] = await withSite(p.siteId, (tx) =>
    joined(tx)
      .where(and(eq(articles.slug, p.slug), articleIsLive()))
      .limit(1),
  );
  return j ? row(j) : null;
}

/** Whether the storefront menu should show Journal at all. */
export async function hasPublishedArticles(p: { siteId: string }): Promise<boolean> {
  const [a] = await withSite(p.siteId, (tx) =>
    tx.select({ id: articles.id }).from(articles).where(articleIsLive()).limit(1),
  );
  return !!a;
}

// ───────────────────────── helpers ─────────────────────────

async function liveCategory(tx: Tx, id: string) {
  const [c] = await tx.select({ id: articleCategories.id }).from(articleCategories).where(and(eq(articleCategories.id, id), isNull(articleCategories.deletedAt))).limit(1);
  if (!c) throw new AccessError("That category doesn't exist.");
  return c;
}

async function load(tx: Tx, id: string): Promise<Article> {
  if (!z.string().uuid().safeParse(id).success) throw new AccessError("That article doesn't exist.");
  const [a] = await tx.select().from(articles).where(and(eq(articles.id, id), isNull(articles.deletedAt))).limit(1);
  if (!a) throw new AccessError("That article doesn't exist.");
  return a;
}

async function assertSlugFree(tx: Tx, slug: string, exceptId?: string) {
  const [clash] = await tx
    .select({ id: articles.id })
    .from(articles)
    .where(and(eq(articles.slug, slug), isNull(articles.deletedAt), exceptId ? ne(articles.id, exceptId) : undefined))
    .limit(1);
  if (clash) throw new FieldError("slug", `There's already an article at /journal/${slug}. Pick another address.`);
}

/** The title's slug, or the first free -2, -3… after it. */
async function freeSlug(tx: Tx, base: string): Promise<string> {
  const taken = new Set((await tx.select({ slug: articles.slug }).from(articles).where(isNull(articles.deletedAt))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}
