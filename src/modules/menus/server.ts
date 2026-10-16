import { and, asc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { articleCategories, articles, menus, pages, type Menu, type MenuKind } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { HOME_SLUG } from "@/modules/pages/server";
import { isLive } from "@/modules/pages/live";
import { articlePath } from "@/modules/articles/server";
import { menuSettingsSchema, menuSummary, navTree, newItemId, readItems, type LinkTargets, type MenuItem, type NavLink } from "./items";

/**
 * Menus. Every site has a header and a footer ("always here"); the team
 * can add more, and each extra one is another column in the footer.
 *
 * A header nobody has touched has no row: the site shows the automatic
 * menu (every live page, then Journal when there's something to read),
 * and the editor opens with those same items so what you see is what's
 * live. The first save makes it the team's own. "Back to automatic"
 * removes the row again.
 *
 * A menu is addressed as "header", "footer" or a custom menu's id.
 */

export type MenuKey = "header" | "footer" | string;
const keySchema = z.union([z.literal("header"), z.literal("footer"), z.string().uuid()]);

const FIXED_NAMES: Record<"header" | "footer", string> = { header: "Header", footer: "Footer" };

export type MenuView = {
  key: MenuKey;
  kind: MenuKind;
  name: string;
  items: MenuItem[];
  /** True for a header still on the automatic menu. */
  automatic: boolean;
};

export type MenuCard = MenuView & { summary: string; broken: boolean };

export async function listMenus(p: { actorId: string; siteId: string }): Promise<MenuCard[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const [rows, targets] = await Promise.all([liveRows(tx), linkTargets(tx)]);
    const views = [fixed(rows, "header", targets), fixed(rows, "footer", targets), ...rows.filter((r) => r.kind === "custom").map(view)];
    return views.map((v) => {
      const s = menuSummary(v.items, targets);
      return { ...v, summary: v.automatic ? "Automatic · every live page, then Journal" : s.text, broken: s.broken };
    });
  });
}

export async function getMenu(p: { actorId: string; siteId: string; key: string }): Promise<{ menu: MenuView; targets: LinkTargets }> {
  await assertAccess(p.actorId, p.siteId);
  const key = parseKey(p.key);
  return withSite(p.siteId, async (tx) => {
    const [rows, targets] = await Promise.all([liveRows(tx), linkTargets(tx)]);
    if (key === "header" || key === "footer") return { menu: fixed(rows, key, targets), targets };
    const row = rows.find((r) => r.id === key && r.kind === "custom");
    if (!row) throw new AccessError("That menu doesn't exist.");
    return { menu: view(row), targets };
  });
}

/** The editor autosaves the whole menu. Header and footer keep their names. */
export async function saveMenu(p: { actorId: string; siteId: string; key: string; settings: unknown }): Promise<MenuView> {
  await assertAccess(p.actorId, p.siteId);
  const key = parseKey(p.key);
  const s = menuSettingsSchema.parse(p.settings);
  return withSite(p.siteId, async (tx) => {
    if (key === "header" || key === "footer") {
      const [existing] = await tx
        .select()
        .from(menus)
        .where(and(eq(menus.kind, key), isNull(menus.deletedAt)))
        .limit(1);
      if (existing) {
        const [row] = await tx.update(menus).set({ items: s.items, updatedAt: new Date() }).where(eq(menus.id, existing.id)).returning();
        return view(row);
      }
      const [row] = await tx.insert(menus).values({ siteId: p.siteId, kind: key, name: FIXED_NAMES[key], items: s.items }).returning();
      return view(row);
    }
    const [row] = await tx
      .update(menus)
      .set({ name: s.name, items: s.items, updatedAt: new Date() })
      .where(and(eq(menus.id, key), eq(menus.kind, "custom"), isNull(menus.deletedAt)))
      .returning();
    if (!row) throw new AccessError("That menu doesn't exist.");
    return view(row);
  });
}

export async function createMenu(p: { actorId: string; siteId: string; name: string }): Promise<MenuView> {
  await assertAccess(p.actorId, p.siteId);
  const name = z.string().trim().min(1, "Give the menu a name.").max(60).parse(p.name);
  const [row] = await withSite(p.siteId, (tx) => tx.insert(menus).values({ siteId: p.siteId, kind: "custom", name }).returning());
  return view(row);
}

/** Only extra menus can go. Header and footer are always there. */
export async function deleteMenu(p: { actorId: string; siteId: string; key: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  const key = parseKey(p.key);
  if (key === "header" || key === "footer") throw new AccessError("The header and footer are always there. Empty it instead.");
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(menus)
      .set({ deletedAt: new Date() })
      .where(and(eq(menus.id, key), eq(menus.kind, "custom"), isNull(menus.deletedAt)))
      .returning({ id: menus.id }),
  );
  if (!row) throw new AccessError("That menu doesn't exist.");
}

/** The header goes back to every live page, then Journal — and follows new pages again. */
export async function resetHeader(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, (tx) => tx.update(menus).set({ deletedAt: new Date() }).where(and(eq(menus.kind, "header"), isNull(menus.deletedAt))));
}

// ───────────────────────── storefront ─────────────────────────

export type SiteMenus = {
  header: NavLink[];
  /** The footer menu first (no title), then each extra menu as a titled column. Empty ones are left out. */
  footer: { title: string; links: NavLink[] }[];
  /** The header is the automatic one, so the editor's preview may add a draft page to it. */
  automaticHeader: boolean;
};

export async function siteMenus(p: { siteId: string }): Promise<SiteMenus> {
  return withSite(p.siteId, async (tx) => {
    const [rows, targets] = await Promise.all([liveRows(tx), linkTargets(tx)]);
    const header = fixed(rows, "header", targets);
    const footer = fixed(rows, "footer", targets);
    const columns = [{ title: "", links: navTree(footer.items, targets) }, ...rows.filter((r) => r.kind === "custom").map((r) => ({ title: r.name, links: navTree(view(r).items, targets) }))];
    return {
      header: navTree(header.items, targets),
      footer: columns.filter((c) => c.links.length > 0),
      automaticHeader: header.automatic,
    };
  });
}

// ───────────────────────── helpers ─────────────────────────

function parseKey(raw: string): MenuKey {
  const r = keySchema.safeParse(raw);
  if (!r.success) throw new AccessError("That menu doesn't exist.");
  return r.data;
}

async function liveRows(tx: Tx): Promise<Menu[]> {
  return tx.select().from(menus).where(isNull(menus.deletedAt)).orderBy(asc(menus.createdAt));
}

function view(row: Menu): MenuView {
  const key = row.kind === "custom" ? row.id : row.kind;
  return { key, kind: row.kind, name: row.kind === "custom" ? row.name : FIXED_NAMES[row.kind], items: readItems(row.items), automatic: false };
}

/** Header or footer: the saved one, or the starting point if nobody has saved it yet. */
function fixed(rows: Menu[], kind: "header" | "footer", t: LinkTargets): MenuView {
  const row = rows.find((r) => r.kind === kind);
  if (row) return view(row);
  if (kind === "footer") return { key: "footer", kind, name: FIXED_NAMES.footer, items: [], automatic: false };
  return { key: "header", kind, name: FIXED_NAMES.header, items: automaticItems(t), automatic: true };
}

/** Every live page except the front page, in the Pages order; then Journal when there's a live article. */
function automaticItems(t: LinkTargets): MenuItem[] {
  const items: MenuItem[] = t.pages.filter((pg) => pg.live && pg.path !== "/").map((pg) => ({ id: newItemId(), label: "", link: { type: "page", pageId: pg.id }, depth: 0 }));
  if (t.articles.some((a) => a.live)) items.push({ id: newItemId(), label: "", link: { type: "journal" }, depth: 0 });
  return items;
}

/** Everything a menu can point at on this site, with whether it's live. Deleted things aren't here, so links to them read as gone. */
async function linkTargets(tx: Tx): Promise<LinkTargets> {
  const [pg, cats, arts] = await Promise.all([
    tx
      .select({ id: pages.id, title: pages.title, slug: pages.slug, status: pages.status, publishedAt: pages.publishedAt })
      .from(pages)
      .where(isNull(pages.deletedAt))
      .orderBy(asc(pages.position), asc(pages.createdAt)),
    tx
      .select({ id: articleCategories.id, name: articleCategories.name, slug: articleCategories.slug })
      .from(articleCategories)
      .where(isNull(articleCategories.deletedAt))
      .orderBy(asc(articleCategories.position), asc(articleCategories.createdAt)),
    tx
      .select({ id: articles.id, title: articles.title, slug: articles.slug, status: articles.status, publishedAt: articles.publishedAt, catId: articleCategories.id, catSlug: articleCategories.slug, catName: articleCategories.name })
      .from(articles)
      .leftJoin(articleCategories, and(eq(articleCategories.id, articles.categoryId), isNull(articleCategories.deletedAt)))
      .where(isNull(articles.deletedAt))
      .orderBy(asc(articles.title)),
  ]);
  return {
    pages: pg.map((x) => ({ id: x.id, title: x.title, path: x.slug === HOME_SLUG ? "/" : `/${x.slug}`, live: isLive(x) })),
    categories: cats.map((c) => ({ id: c.id, name: c.name, path: `/journal/${c.slug}` })),
    articles: arts.map((a) => ({
      id: a.id,
      title: a.title,
      path: articlePath({ slug: a.slug, category: a.catId && a.catSlug && a.catName ? { id: a.catId, slug: a.catSlug, name: a.catName } : null }),
      live: isLive(a),
    })),
  };
}
