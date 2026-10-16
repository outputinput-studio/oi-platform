/**
 * Menus: the automatic header, saving one's own, the footer columns,
 * what the storefront leaves out, and the site lock.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { createPage, deletePage, setPageStatus } from "@/modules/pages/server";
import { createMenu, deleteMenu, getMenu, listMenus, resetHeader, saveMenu, siteMenus } from "@/modules/menus/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-menus-ann";
const bob = "test-menus-bob";

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('menus-a','menus-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('menus-a','Menus A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('menus-b','Menus B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@menus.invalid',true,now()), ($2,'Bob','bob@menus.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('menus-a','menus-b')`);
  await owner.end();
});

describe("menus", () => {
  let shop = "";
  let sizing = "";
  test("an untouched header is automatic: every live page but the front one", async () => {
    const home = await createPage({ actorId: ann, siteId: siteA, title: "Home", slug: "home" });
    shop = (await createPage({ actorId: ann, siteId: siteA, title: "Shop", slug: "shop" })).id;
    sizing = (await createPage({ actorId: ann, siteId: siteA, title: "Sizing", slug: "sizing" })).id;
    for (const id of [home.id, shop]) await setPageStatus({ actorId: ann, siteId: siteA, pageId: id, status: "published" });

    const list = await listMenus({ actorId: ann, siteId: siteA });
    expect(list.map((m) => m.name)).toEqual(["Header", "Footer"]);
    expect(list[0]).toMatchObject({ automatic: true, summary: expect.stringMatching(/^Automatic/) });
    const s = await siteMenus({ siteId: siteA });
    expect(s).toMatchObject({ automaticHeader: true, footer: [] });
    expect(s.header.map((l) => l.href)).toEqual(["/shop"]);
  });

  test("saving the header makes it the team's own; nesting and drafts behave on the site", async () => {
    await saveMenu({
      actorId: ann,
      siteId: siteA,
      key: "header",
      settings: {
        name: "Ignored for the header",
        items: [
          { id: "a", label: "", link: { type: "page", pageId: shop }, depth: 0 },
          { id: "b", label: "Sizes", link: { type: "page", pageId: sizing }, depth: 1 }, // a draft: hidden for now
          { id: "c", label: "Instagram", link: { type: "url", url: "https://instagram.com/x", newTab: true }, depth: 1 },
        ],
      },
    });
    const { menu } = await getMenu({ actorId: ann, siteId: siteA, key: "header" });
    expect(menu).toMatchObject({ name: "Header", automatic: false });
    let s = await siteMenus({ siteId: siteA });
    expect(s.automaticHeader).toBe(false);
    expect(s.header).toEqual([{ label: "Shop", href: "/shop", external: false, newTab: false, children: [{ label: "Instagram", href: "https://instagram.com/x", external: true, newTab: true, children: [] }] }]);

    await setPageStatus({ actorId: ann, siteId: siteA, pageId: sizing, status: "published" });
    s = await siteMenus({ siteId: siteA });
    expect(s.header[0].children.map((c) => c.label)).toEqual(["Sizes", "Instagram"]);

    // A deleted page reads as gone in the admin and drops off the site.
    await deletePage({ actorId: ann, siteId: siteA, pageId: sizing });
    const cards = await listMenus({ actorId: ann, siteId: siteA });
    expect(cards[0]).toMatchObject({ broken: true, summary: "3 items · This page no longer exists" });
    s = await siteMenus({ siteId: siteA });
    expect(s.header[0].children.map((c) => c.label)).toEqual(["Instagram"]);

    await resetHeader({ actorId: ann, siteId: siteA });
    expect((await siteMenus({ siteId: siteA })).automaticHeader).toBe(true);
  });

  test("footer and extra menus become footer columns; only extra menus can be deleted", async () => {
    await saveMenu({ actorId: ann, siteId: siteA, key: "footer", settings: { name: "Footer", items: [{ id: "f", label: "Shop", link: { type: "page", pageId: shop }, depth: 0 }] } });
    const help = await createMenu({ actorId: ann, siteId: siteA, name: "Help" });
    await saveMenu({ actorId: ann, siteId: siteA, key: help.key, settings: { name: "Help & care", items: [{ id: "h", label: "Email us", link: { type: "url", url: "mailto:hi@example.com", newTab: false }, depth: 0 }] } });
    const s = await siteMenus({ siteId: siteA });
    expect(s.footer.map((c) => [c.title, c.links.map((l) => l.label)])).toEqual([
      ["", ["Shop"]],
      ["Help & care", ["Email us"]],
    ]);
    await expect(deleteMenu({ actorId: ann, siteId: siteA, key: "footer" })).rejects.toThrow(/always there/);
    await deleteMenu({ actorId: ann, siteId: siteA, key: help.key });
    expect((await listMenus({ actorId: ann, siteId: siteA })).map((m) => m.name)).toEqual(["Header", "Footer"]);
  });

  test("bad input is refused, and another site's menus are out of reach", async () => {
    await expect(saveMenu({ actorId: ann, siteId: siteA, key: "footer", settings: { name: "Footer", items: [{ id: "x", label: "", link: { type: "url", url: "javascript:alert(1)" }, depth: 0 }] } })).rejects.toThrow();
    await expect(getMenu({ actorId: ann, siteId: siteA, key: "sidebar" })).rejects.toBeInstanceOf(AccessError);
    const theirs = await createMenu({ actorId: bob, siteId: siteB, name: "Theirs" });
    await expect(getMenu({ actorId: ann, siteId: siteB, key: "header" })).rejects.toBeInstanceOf(AccessError); // not a member
    await expect(getMenu({ actorId: ann, siteId: siteA, key: theirs.key })).rejects.toThrow(/doesn't exist/); // RLS hides it
    await expect(deleteMenu({ actorId: ann, siteId: siteA, key: theirs.key })).rejects.toThrow(/doesn't exist/);
    expect((await siteMenus({ siteId: siteB })).footer).toEqual([]); // empty columns are left out
  });
});
