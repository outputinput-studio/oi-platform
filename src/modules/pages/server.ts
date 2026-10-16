import { and, asc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { pages, sections, sites, type Page, type Section } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { isSectionType, parseSectionData, type SectionType } from "./registry";
import { slugFromTitle } from "./slug";
import { isLive, pageIsLive } from "./live";
import { seoSchema, type Seo } from "./seo";
import { autoRedirect } from "@/modules/redirects/server";
import { readSearchSettings } from "@/modules/sites/search";

/**
 * Pages and their sections. Every function authorises the actor, then
 * runs inside withSite() so the row lock applies as well. Soft delete
 * only: nothing here ever deletes a row.
 */

export const HOME_SLUG = "home";

const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use letters, numbers and hyphens, like about-us.")
  .max(80);
const titleSchema = z.string().trim().min(1, "Give the page a title.").max(120);

export type PageWithSections = Page & { sections: Section[] };

function live<T extends { deletedAt: Date | null }>(rows: T[]) {
  return rows.filter((r) => !r.deletedAt);
}

export { slugFromTitle } from "./slug";

// ───────────────────────── pages ─────────────────────────

export async function listPages(p: { actorId: string; siteId: string }): Promise<Page[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) =>
    tx.select().from(pages).where(isNull(pages.deletedAt)).orderBy(asc(pages.position), asc(pages.createdAt)),
  );
}

export async function getPage(p: { actorId: string; siteId: string; pageId: string }): Promise<PageWithSections> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    const secs = await tx
      .select()
      .from(sections)
      .where(and(eq(sections.pageId, page.id), isNull(sections.deletedAt)))
      .orderBy(asc(sections.position), asc(sections.createdAt));
    return { ...page, sections: secs };
  });
}

export async function createPage(p: { actorId: string; siteId: string; title: string; slug?: string }): Promise<Page> {
  await assertAccess(p.actorId, p.siteId);
  const title = titleSchema.parse(p.title);
  const slug = slugSchema.parse(p.slug?.trim() ? p.slug : slugFromTitle(title));
  return withSite(p.siteId, async (tx) => {
    await assertSlugFree(tx, slug);
    const [{ next }] = await tx
      .select({ next: sql<number>`coalesce(max(${pages.position}), -1) + 1` })
      .from(pages)
      .where(isNull(pages.deletedAt));
    const [page] = await tx.insert(pages).values({ siteId: p.siteId, title, slug, position: next }).returning();
    return page;
  });
}

export async function updatePage(p: {
  actorId: string;
  siteId: string;
  pageId: string;
  title?: string;
  slug?: string;
  seo?: unknown;
}): Promise<Page> {
  await assertAccess(p.actorId, p.siteId);
  const patch: Partial<Pick<Page, "title" | "slug" | "seo">> = {};
  if (p.title !== undefined) patch.title = titleSchema.parse(p.title);
  if (p.slug !== undefined) patch.slug = slugSchema.parse(p.slug);
  if (p.seo !== undefined) patch.seo = seoSchema.parse(p.seo) as Seo;
  return withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    if (patch.slug && patch.slug !== page.slug) await assertSlugFree(tx, patch.slug);
    const [updated] = await tx
      .update(pages)
      .set({ ...patch, updatedAt: new Date() })
      .where(eq(pages.id, page.id))
      .returning();
    // A live page renamed: keep the old link working, unless the owner turned that off.
    if (patch.slug && patch.slug !== page.slug && isLive(page) && (await wantsAutoRedirect(tx))) {
      await autoRedirect(tx, { siteId: p.siteId, from: `/${page.slug}`, to: patch.slug === HOME_SLUG ? "/" : `/${patch.slug}` });
    }
    return updated;
  });
}

export async function setPageStatus(p: {
  actorId: string;
  siteId: string;
  pageId: string;
  status: "draft" | "published" | "scheduled";
  /** For scheduled: when it goes live. Must be in the future. */
  at?: Date;
}): Promise<Page> {
  await assertAccess(p.actorId, p.siteId);
  const at = scheduleTime(p.status, p.at);
  return withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    const [updated] = await tx
      .update(pages)
      .set({
        status: p.status,
        publishedAt: p.status === "scheduled" ? at : p.status === "published" ? (page.publishedAt ?? new Date()) : page.publishedAt,
        updatedAt: new Date(),
      })
      .where(eq(pages.id, page.id))
      .returning();
    return updated;
  });
}

/** Soft delete. The home page can't be deleted; unpublish it instead. */
export async function deletePage(p: { actorId: string; siteId: string; pageId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    if (page.slug === HOME_SLUG) throw new AccessError("The home page can't be deleted. Unpublish it instead.");
    await tx.update(pages).set({ deletedAt: new Date() }).where(eq(pages.id, page.id));
  });
}

// ───────────────────────── sections ─────────────────────────

export async function addSection(p: {
  actorId: string;
  siteId: string;
  pageId: string;
  type: string;
  data?: unknown;
  /** Insert after this section; at the end when omitted. */
  afterId?: string;
}): Promise<Section> {
  await assertAccess(p.actorId, p.siteId);
  if (!isSectionType(p.type)) throw new AccessError("That isn't a kind of section.");
  const data = parseSectionData(p.type, p.data);
  return withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    const existing = await liveSections(tx, page.id);
    let position = existing.length;
    if (p.afterId) {
      const idx = existing.findIndex((s) => s.id === p.afterId);
      if (idx >= 0) position = idx + 1;
    }
    const [created] = await tx
      .insert(sections)
      .values({ siteId: p.siteId, pageId: page.id, type: p.type, data, position })
      .returning();
    await renumber(tx, page.id, [...existing.slice(0, position), created, ...existing.slice(position)]);
    await touch(tx, page.id);
    return { ...created, position };
  });
}

export async function updateSection(p: {
  actorId: string;
  siteId: string;
  sectionId: string;
  data: unknown;
}): Promise<Section> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const section = await loadSection(tx, p.sectionId);
    const data = parseSectionData(section.type as SectionType, p.data);
    const [updated] = await tx
      .update(sections)
      .set({ data, updatedAt: new Date() })
      .where(eq(sections.id, section.id))
      .returning();
    await touch(tx, section.pageId);
    return updated;
  });
}

export async function moveSection(p: {
  actorId: string;
  siteId: string;
  sectionId: string;
  direction: "up" | "down";
}): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const section = await loadSection(tx, p.sectionId);
    const list = await liveSections(tx, section.pageId);
    const i = list.findIndex((s) => s.id === section.id);
    const j = p.direction === "up" ? i - 1 : i + 1;
    if (j < 0 || j >= list.length) return;
    [list[i], list[j]] = [list[j], list[i]];
    await renumber(tx, section.pageId, list);
    await touch(tx, section.pageId);
  });
}

/**
 * The whole order at once, from a drag. The list must name every live
 * section exactly once; anything else is refused, so a stale editor can't
 * drop a section that was added from another tab.
 */
export async function reorderSections(p: { actorId: string; siteId: string; pageId: string; order: string[] }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const page = await loadPage(tx, p.pageId);
    const list = await liveSections(tx, page.id);
    const want = new Set(p.order);
    if (want.size !== p.order.length || list.length !== p.order.length || !list.every((s) => want.has(s.id))) {
      throw new Error("The page changed under you. Reload and try again.");
    }
    const byId = new Map(list.map((s) => [s.id, s]));
    await renumber(tx, page.id, p.order.map((id) => byId.get(id)!));
    await touch(tx, page.id);
  });
}

export async function removeSection(p: { actorId: string; siteId: string; sectionId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const section = await loadSection(tx, p.sectionId);
    await tx.update(sections).set({ deletedAt: new Date() }).where(eq(sections.id, section.id));
    await renumber(tx, section.pageId, (await liveSections(tx, section.pageId)).filter((s) => s.id !== section.id));
    await touch(tx, section.pageId);
  });
}

// ───────────────────────── storefront ─────────────────────────

/**
 * What the public site renders: a published page by slug, with its
 * sections. No actor: the storefront is public. Still inside withSite(),
 * so one site can never serve another's page.
 */
export async function publishedPage(p: { siteId: string; slug: string }): Promise<PageWithSections | null> {
  return withSite(p.siteId, async (tx) => {
    const [page] = await tx
      .select()
      .from(pages)
      .where(and(eq(pages.slug, p.slug), pageIsLive()))
      .limit(1);
    if (!page) return null;
    const secs = await liveSections(tx, page.id);
    return { ...page, sections: secs };
  });
}

/** The storefront's menu: every live page's title and address, in order, the front page first. */
export async function publishedPages(p: { siteId: string }): Promise<Pick<Page, "id" | "slug" | "title">[]> {
  return withSite(p.siteId, (tx) =>
    tx
      .select({ id: pages.id, slug: pages.slug, title: pages.title })
      .from(pages)
      .where(pageIsLive())
      .orderBy(asc(pages.position), asc(pages.createdAt)),
  );
}

// ───────────────────────── helpers ─────────────────────────

async function loadPage(tx: Tx, pageId: string): Promise<Page> {
  const [page] = await tx.select().from(pages).where(and(eq(pages.id, pageId), isNull(pages.deletedAt))).limit(1);
  if (!page) throw new AccessError("That page doesn't exist.");
  return page;
}

async function loadSection(tx: Tx, sectionId: string): Promise<Section> {
  const [s] = await tx.select().from(sections).where(and(eq(sections.id, sectionId), isNull(sections.deletedAt))).limit(1);
  if (!s) throw new AccessError("That section doesn't exist.");
  return s;
}

async function liveSections(tx: Tx, pageId: string): Promise<Section[]> {
  return live(
    await tx
      .select()
      .from(sections)
      .where(eq(sections.pageId, pageId))
      .orderBy(asc(sections.position), asc(sections.createdAt)),
  );
}

async function renumber(tx: Tx, pageId: string, ordered: Section[]) {
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i].position !== i) {
      await tx.update(sections).set({ position: i }).where(eq(sections.id, ordered[i].id));
    }
  }
  void pageId;
}

async function touch(tx: Tx, pageId: string) {
  await tx.update(pages).set({ updatedAt: new Date() }).where(eq(pages.id, pageId));
}

async function assertSlugFree(tx: Tx, slug: string) {
  const [clash] = await tx.select({ id: pages.id }).from(pages).where(and(eq(pages.slug, slug), isNull(pages.deletedAt))).limit(1);
  if (clash) throw new AccessError(`There's already a page at ${slug}. Pick another address.`);
}

/** Settings · Redirects → "Redirect automatically when I rename a page". */
async function wantsAutoRedirect(tx: Tx): Promise<boolean> {
  const [site] = await tx.select({ search: sites.search }).from(sites).limit(1);
  return site ? readSearchSettings(site.search).autoRedirect : true;
}

/** A scheduled time has to be real and ahead of us; other statuses carry none. */
export function scheduleTime(status: string, at?: Date): Date | undefined {
  if (status !== "scheduled") return undefined;
  if (!at || Number.isNaN(at.getTime())) throw new Error("Pick a date and time.");
  if (at.getTime() <= Date.now()) throw new Error("That time has already passed. Pick one ahead, or just publish it now.");
  return at;
}
