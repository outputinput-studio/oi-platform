import { z } from "zod";

/**
 * Menu items, and how a link turns into an address. Pure: the admin
 * editor, the server and the storefront all use these, so what the team
 * sees under each item ("Page · /about", "This page no longer exists")
 * is exactly what the site does with it.
 *
 * A menu is a flat, ordered list. Each item has a depth of 0 or 1; a
 * depth-1 item sits under the nearest depth-0 item above it. One level
 * of nesting is the limit.
 */

const uuid = z.string().uuid();

/** Where an item goes. Pages and articles by id, so renaming one never breaks the menu. */
export const linkSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("page"), pageId: uuid }),
  z.object({ type: z.literal("journal") }),
  z.object({ type: z.literal("articleCategory"), categoryId: uuid }),
  z.object({ type: z.literal("article"), articleId: uuid }),
  z.object({
    type: z.literal("url"),
    url: z
      .string()
      .trim()
      .max(600)
      .refine((s) => /^https?:\/\/[^\s]+\.[^\s]+$/i.test(s) || /^mailto:\S+@\S+$/i.test(s) || /^tel:\+?[\d\s-]{5,}$/i.test(s), "A full web address starting with https://, or mailto: / tel:"),
    newTab: z.boolean().default(false),
  }),
]);
export type MenuLink = z.infer<typeof linkSchema>;

export const itemSchema = z.object({
  id: z.string().min(1).max(40),
  /** Empty: the page's (or article's) own title. */
  label: z.string().trim().max(80).default(""),
  link: linkSchema,
  depth: z.union([z.literal(0), z.literal(1)]).default(0),
});
export type MenuItem = z.infer<typeof itemSchema>;

export const MAX_ITEMS = 60;

export const itemsSchema = z.array(itemSchema).max(MAX_ITEMS, `A menu holds up to ${MAX_ITEMS} items.`).transform(normaliseDepths);

export const menuSettingsSchema = z.object({
  name: z.string().trim().min(1, "Give the menu a name.").max(60),
  items: itemsSchema,
});
export type MenuSettings = z.infer<typeof menuSettingsSchema>;

/** The first item can't sit under anything. */
export function normaliseDepths<T extends { depth: 0 | 1 }>(items: T[]): T[] {
  return items.map((it, i) => (i === 0 && it.depth !== 0 ? { ...it, depth: 0 as const } : it));
}

/** Read stored items, dropping anything that no longer parses rather than failing the page. */
export function readItems(raw: unknown): MenuItem[] {
  if (!Array.isArray(raw)) return [];
  const out: MenuItem[] = [];
  for (const r of raw) {
    const p = itemSchema.safeParse(r);
    if (p.success) out.push(p.data);
  }
  return normaliseDepths(out);
}

// ───────────────────────── what a link points at ─────────────────────────

/** Everything a menu could point at, with what the site needs to know about each. */
export type LinkTargets = {
  pages: { id: string; title: string; path: string; live: boolean }[];
  categories: { id: string; name: string; path: string }[];
  articles: { id: string; title: string; path: string; live: boolean }[];
};

export type Described = {
  /** "Page", "Article category", "Web address"… */
  kind: string;
  /** The title of what it points at, for an empty label. */
  title: string;
  /** Where it goes; null when it goes nowhere any more. */
  href: string | null;
  external: boolean;
  newTab: boolean;
  /** gone: the target was deleted. notLive: it's a draft or scheduled, so the site leaves it out for now. */
  problem?: "gone" | "notLive";
};

export function describeLink(link: MenuLink, t: LinkTargets): Described {
  switch (link.type) {
    case "page": {
      const p = t.pages.find((x) => x.id === link.pageId);
      if (!p) return { kind: "Page", title: "", href: null, external: false, newTab: false, problem: "gone" };
      return { kind: "Page", title: p.title, href: p.path, external: false, newTab: false, problem: p.live ? undefined : "notLive" };
    }
    case "journal":
      return { kind: "Journal", title: "Journal", href: "/journal", external: false, newTab: false };
    case "articleCategory": {
      const c = t.categories.find((x) => x.id === link.categoryId);
      if (!c) return { kind: "Article category", title: "", href: null, external: false, newTab: false, problem: "gone" };
      return { kind: "Article category", title: c.name, href: c.path, external: false, newTab: false };
    }
    case "article": {
      const a = t.articles.find((x) => x.id === link.articleId);
      if (!a) return { kind: "Article", title: "", href: null, external: false, newTab: false, problem: "gone" };
      return { kind: "Article", title: a.title, href: a.path, external: false, newTab: false, problem: a.live ? undefined : "notLive" };
    }
    case "url":
      return { kind: "Web address", title: link.url.replace(/^(https?:\/\/|mailto:|tel:)/i, "").replace(/\/$/, ""), href: link.url, external: true, newTab: link.newTab };
  }
}

/** The line under an item in the editor: "Page · /about", or what's wrong with it. */
export function itemSummary(d: Described): string {
  if (d.problem === "gone") return d.kind === "Page" ? "This page no longer exists" : `This ${d.kind.toLowerCase()} no longer exists`;
  const where = `${d.kind} · ${d.href}`;
  return d.problem === "notLive" ? `${where} · not live yet, hidden on your site` : where;
}

/** What shows: the label, or the target's own title. */
export function itemLabel(item: MenuItem, d: Described): string {
  return item.label || d.title || "Untitled";
}

// ───────────────────────── for the storefront ─────────────────────────

export type NavLink = { label: string; href: string; external: boolean; newTab: boolean; children: NavLink[] };

/**
 * The items a visitor sees, as a tree. Anything that goes nowhere or
 * isn't live is left out; if that was a parent, its children move up a
 * level rather than vanishing with it.
 */
export function navTree(items: MenuItem[], t: LinkTargets): NavLink[] {
  const out: NavLink[] = [];
  let parent: NavLink | null = null;
  for (const it of items) {
    const d = describeLink(it.link, t);
    if (!d.href || d.problem) {
      if (it.depth === 0) parent = null;
      continue;
    }
    const node: NavLink = { label: itemLabel(it, d), href: d.href, external: d.external, newTab: d.newTab, children: [] };
    if (it.depth === 1 && parent) parent.children.push(node);
    else {
      out.push(node);
      parent = node;
    }
  }
  return out;
}

/** A short list of what's in a menu, for its card: "5 items · shop, about, journal". */
export function menuSummary(items: MenuItem[], t: LinkTargets): { text: string; broken: boolean } {
  if (items.length === 0) return { text: "Nothing in it yet", broken: false };
  const described = items.map((i) => ({ i, d: describeLink(i.link, t) }));
  const gone = described.find((x) => x.d.problem === "gone");
  const count = `${items.length} item${items.length === 1 ? "" : "s"}`;
  if (gone) return { text: `${count} · ${itemSummary(gone.d)}`, broken: true };
  const names = described
    .filter((x) => x.i.depth === 0)
    .map((x) => itemLabel(x.i, x.d).toLowerCase())
    .slice(0, 5);
  return { text: `${count} · ${names.join(", ")}`, broken: false };
}

/** A fresh id for a new item. Short; only needs to be unique within the menu. */
export function newItemId(): string {
  return Math.random().toString(36).slice(2, 10);
}
