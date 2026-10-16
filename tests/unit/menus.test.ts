import { describe, expect, test } from "vitest";
import { describeLink, itemSummary, itemsSchema, menuSummary, navTree, readItems, type LinkTargets, type MenuItem } from "@/modules/menus/items";

const P1 = "11111111-1111-4111-8111-111111111111";
const P2 = "22222222-2222-4222-8222-222222222222";
const GONE = "33333333-3333-4333-8333-333333333333";
const C1 = "44444444-4444-4444-8444-444444444444";

const targets: LinkTargets = {
  pages: [
    { id: P1, title: "Shop", path: "/shop", live: true },
    { id: P2, title: "Sizing and care", path: "/sizing", live: false },
  ],
  categories: [{ id: C1, name: "Behind the scenes", path: "/journal/behind-the-scenes" }],
  articles: [],
  productCategories: [{ id: C1, name: "Bikinis", path: "/shop/bikinis" }],
  products: [{ id: P2, title: "Teal bikini", path: "/shop/teal-bikini", live: false }],
};
const item = (id: string, link: MenuItem["link"], depth: 0 | 1 = 0, label = ""): MenuItem => ({ id, label, link, depth });

describe("menu items", () => {
  test("a link says where it goes, and when it goes nowhere", () => {
    expect(itemSummary(describeLink({ type: "page", pageId: P1 }, targets))).toBe("Page · /shop");
    expect(itemSummary(describeLink({ type: "page", pageId: GONE }, targets))).toBe("This page no longer exists");
    expect(itemSummary(describeLink({ type: "page", pageId: P2 }, targets))).toMatch(/not live yet/);
    expect(itemSummary(describeLink({ type: "articleCategory", categoryId: C1 }, targets))).toBe("Article category · /journal/behind-the-scenes");
    expect(itemSummary(describeLink({ type: "productCategory", categoryId: C1 }, targets))).toBe("Product category · /shop/bikinis");
    expect(itemSummary(describeLink({ type: "product", productId: P2 }, targets))).toMatch(/^Product · \/shop\/teal-bikini · not live yet/);
    expect(itemSummary(describeLink({ type: "shop" }, targets))).toBe("Shop · /shop");
    expect(describeLink({ type: "url", url: "https://instagram.com/kini/", newTab: true }, targets)).toMatchObject({ external: true, newTab: true, title: "instagram.com/kini" });
  });

  test("only real web addresses get in; the first item can't be indented; one level only", () => {
    expect(() => itemsSchema.parse([item("a", { type: "url", url: "javascript:alert(1)", newTab: false })])).toThrow();
    expect(() => itemsSchema.parse([item("a", { type: "url", url: "https://example.com", newTab: false }, 1)])).not.toThrow();
    expect(itemsSchema.parse([item("a", { type: "journal" }, 1)])[0].depth).toBe(0);
    expect(() => itemsSchema.parse([{ id: "a", label: "", link: { type: "journal" }, depth: 2 }])).toThrow();
    expect(readItems([{ junk: true }, item("b", { type: "journal" }, 1)])).toEqual([item("b", { type: "journal" }, 0)]);
  });

  test("the site's menu leaves out what isn't live, and children of a missing parent move up", () => {
    const tree = navTree(
      [
        item("1", { type: "page", pageId: P1 }),
        item("2", { type: "articleCategory", categoryId: C1 }, 1, "Stories"),
        item("3", { type: "page", pageId: P2 }), // draft: left out
        item("4", { type: "page", pageId: GONE }), // gone: left out…
        item("5", { type: "journal" }, 1), // …so this moves up
      ],
      targets,
    );
    expect(tree).toEqual([
      { label: "Shop", href: "/shop", external: false, newTab: false, children: [{ label: "Stories", href: "/journal/behind-the-scenes", external: false, newTab: false, children: [] }] },
      { label: "Journal", href: "/journal", external: false, newTab: false, children: [] },
    ]);
  });

  test("a card's summary names the top-level items, or the first broken one", () => {
    expect(menuSummary([item("1", { type: "page", pageId: P1 }), item("2", { type: "journal" })], targets)).toEqual({ text: "2 items · shop, journal", broken: false });
    expect(menuSummary([item("1", { type: "page", pageId: GONE })], targets)).toEqual({ text: "1 item · This page no longer exists", broken: true });
    expect(menuSummary([], targets).text).toBe("Nothing in it yet");
  });
});
