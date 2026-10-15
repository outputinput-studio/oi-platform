import { and, desc, eq, isNull, ne } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { articles, type Article } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { imageRef, type ImageRef } from "@/modules/pages/registry";
import { slugFromTitle } from "@/modules/pages/slug";

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
});
export type ArticleEdit = z.infer<typeof articleEditSchema>;

export type ArticleRow = Omit<Article, "cover"> & { cover: ImageRef | null };

function row(a: Article): ArticleRow {
  const r = imageRef.safeParse(a.cover);
  return { ...a, cover: r.success ? r.data : null };
}

export async function listArticles(p: { actorId: string; siteId: string }): Promise<ArticleRow[]> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) =>
    tx.select().from(articles).where(isNull(articles.deletedAt)).orderBy(desc(articles.publishedAt), desc(articles.createdAt)),
  );
  return rows.map(row);
}

export async function getArticle(p: { actorId: string; siteId: string; articleId: string }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => row(await load(tx, p.articleId)));
}

export async function createArticle(p: { actorId: string; siteId: string; title: string }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  const title = titleSchema.parse(p.title);
  return withSite(p.siteId, async (tx) => {
    const slug = await freeSlug(tx, slugFromTitle(title));
    const [a] = await tx.insert(articles).values({ siteId: p.siteId, title, slug }).returning();
    return row(a);
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
    if (e.publishedOn !== undefined) patch.publishedAt = e.publishedOn ? new Date(`${e.publishedOn}T12:00:00Z`) : a.publishedAt;
    const [updated] = await tx.update(articles).set(patch).where(eq(articles.id, a.id)).returning();
    return row(updated);
  });
}

export async function setArticleStatus(p: { actorId: string; siteId: string; articleId: string; status: "draft" | "published" }): Promise<ArticleRow> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const a = await load(tx, p.articleId);
    const [updated] = await tx
      .update(articles)
      .set({ status: p.status, publishedAt: p.status === "published" ? (a.publishedAt ?? new Date()) : a.publishedAt, updatedAt: new Date() })
      .where(eq(articles.id, a.id))
      .returning();
    return row(updated);
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

/** The journal: every live article, newest first. */
export async function publishedArticles(p: { siteId: string }): Promise<ArticleRow[]> {
  const rows = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(articles)
      .where(and(eq(articles.status, "published"), isNull(articles.deletedAt)))
      .orderBy(desc(articles.publishedAt), desc(articles.createdAt)),
  );
  return rows.map(row);
}

export async function publishedArticle(p: { siteId: string; slug: string }): Promise<ArticleRow | null> {
  const [a] = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(articles)
      .where(and(eq(articles.slug, p.slug), eq(articles.status, "published"), isNull(articles.deletedAt)))
      .limit(1),
  );
  return a ? row(a) : null;
}

/** Whether the storefront menu should show Journal at all. */
export async function hasPublishedArticles(p: { siteId: string }): Promise<boolean> {
  const [a] = await withSite(p.siteId, (tx) =>
    tx.select({ id: articles.id }).from(articles).where(and(eq(articles.status, "published"), isNull(articles.deletedAt))).limit(1),
  );
  return !!a;
}

// ───────────────────────── helpers ─────────────────────────

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
  if (clash) throw new AccessError(`There's already an article at /journal/${slug}. Pick another address.`);
}

/** The title's slug, or the first free -2, -3… after it. */
async function freeSlug(tx: Tx, base: string): Promise<string> {
  const taken = new Set((await tx.select({ slug: articles.slug }).from(articles).where(isNull(articles.deletedAt))).map((r) => r.slug));
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
  return `${base}-${Date.now()}`;
}
