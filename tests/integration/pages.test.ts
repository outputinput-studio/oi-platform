/**
 * Pages and sections: the module's rules, and the site lock across them.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import {
  addSection,
  createPage,
  deletePage,
  getPage,
  listPages,
  moveSection,
  publishedPage,
  removeSection,
  reorderSections,
  setPageStatus,
  slugFromTitle,
  updatePage,
  updateSection,
} from "@/modules/pages/server";
import { emptySection, SECTION_TYPES, parseSectionData } from "@/modules/pages/registry";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-pages-ann"; // manager at A
const bob = "test-pages-bob"; // owner of B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('pages-a','pages-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('pages-a','Pages A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('pages-b','Pages B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@pages.invalid',true,now()), ($2,'Bob','bob@pages.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'manager'), ($2,$4,'owner')`, [
    ann,
    bob,
    siteA,
    siteB,
  ]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('pages-a','pages-b')`);
  await owner.end();
});

describe("registry", () => {
  test("every type has an empty default that validates", () => {
    for (const t of SECTION_TYPES) expect(() => parseSectionData(t, emptySection(t))).not.toThrow();
  });
  test("bad data is refused", () => {
    expect(() => parseSectionData("questions", { items: "nope" })).toThrow();
    expect(() => parseSectionData("hero", { image: { url: "not a url" } })).toThrow();
  });
  test("slugs come from titles", () => {
    expect(slugFromTitle("About Us!")).toBe("about-us");
    expect(slugFromTitle("  Café & Bar  ")).toBe("cafe-bar");
    expect(slugFromTitle("???")).toBe("page");
  });
});

describe("pages", () => {
  let homeId = "";
  let aboutId = "";

  test("a manager can create pages; the slug comes from the title unless given", async () => {
    const home = await createPage({ actorId: ann, siteId: siteA, title: "Welcome", slug: "home" });
    const about = await createPage({ actorId: ann, siteId: siteA, title: "About us" });
    homeId = home.id;
    aboutId = about.id;
    expect(about.slug).toBe("about-us");
    expect(about.status).toBe("draft");
    expect((await listPages({ actorId: ann, siteId: siteA })).map((p) => p.slug)).toEqual(["home", "about-us"]);
  });

  test("a slug can't be taken twice, and must look like an address", async () => {
    await expect(createPage({ actorId: ann, siteId: siteA, title: "Another", slug: "about-us" })).rejects.toThrow(/already/);
    await expect(createPage({ actorId: ann, siteId: siteA, title: "Bad", slug: "About Us" })).rejects.toThrow();
  });

  test("an outsider can't see or touch a site's pages", async () => {
    await expect(listPages({ actorId: bob, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(getPage({ actorId: bob, siteId: siteA, pageId: aboutId })).rejects.toThrow(AccessError);
    // Even with a real page id, under his own site the lock hides it.
    await expect(getPage({ actorId: bob, siteId: siteB, pageId: aboutId })).rejects.toThrow(/doesn't exist/);
  });

  test("sections: add, edit, reorder, remove — in order, validated", async () => {
    const s1 = await addSection({ actorId: ann, siteId: siteA, pageId: aboutId, type: "hero", data: { heading: "Hi" } });
    const s2 = await addSection({ actorId: ann, siteId: siteA, pageId: aboutId, type: "text", data: { body: "Hello" } });
    const s3 = await addSection({ actorId: ann, siteId: siteA, pageId: aboutId, type: "statement", afterId: s1.id });
    let page = await getPage({ actorId: ann, siteId: siteA, pageId: aboutId });
    expect(page.sections.map((s) => s.id)).toEqual([s1.id, s3.id, s2.id]);
    expect(page.sections.map((s) => s.position)).toEqual([0, 1, 2]);

    await updateSection({ actorId: ann, siteId: siteA, sectionId: s3.id, data: { text: "We make things." } });
    await expect(updateSection({ actorId: ann, siteId: siteA, sectionId: s3.id, data: { text: 5 } })).rejects.toThrow();

    await moveSection({ actorId: ann, siteId: siteA, sectionId: s2.id, direction: "up" });
    await moveSection({ actorId: ann, siteId: siteA, sectionId: s1.id, direction: "up" }); // already first: no-op
    page = await getPage({ actorId: ann, siteId: siteA, pageId: aboutId });
    expect(page.sections.map((s) => s.id)).toEqual([s1.id, s2.id, s3.id]);

    // A drag sends the whole order; it has to name every live section once.
    await reorderSections({ actorId: ann, siteId: siteA, pageId: aboutId, order: [s3.id, s1.id, s2.id] });
    page = await getPage({ actorId: ann, siteId: siteA, pageId: aboutId });
    expect(page.sections.map((s) => s.id)).toEqual([s3.id, s1.id, s2.id]);
    expect(page.sections.map((s) => s.position)).toEqual([0, 1, 2]);
    await expect(reorderSections({ actorId: ann, siteId: siteA, pageId: aboutId, order: [s1.id, s2.id] })).rejects.toThrow(/changed under you/);
    await expect(reorderSections({ actorId: ann, siteId: siteA, pageId: aboutId, order: [s1.id, s1.id, s2.id] })).rejects.toThrow(/changed under you/);
    await expect(reorderSections({ actorId: bob, siteId: siteA, pageId: aboutId, order: [s1.id, s2.id, s3.id] })).rejects.toThrow(AccessError);
    await reorderSections({ actorId: ann, siteId: siteA, pageId: aboutId, order: [s1.id, s2.id, s3.id] });

    await removeSection({ actorId: ann, siteId: siteA, sectionId: s2.id });
    page = await getPage({ actorId: ann, siteId: siteA, pageId: aboutId });
    expect(page.sections.map((s) => s.id)).toEqual([s1.id, s3.id]);
    expect(page.sections.map((s) => s.position)).toEqual([0, 1]);
    // Soft delete: the row is still there.
    const r = await owner.query(`select deleted_at from sections where id = $1`, [s2.id]);
    expect(r.rows[0].deleted_at).not.toBeNull();
  });

  test("a scheduled page goes live on its own when the time comes", async () => {
    const { publishedPage, publishedPages } = await import("@/modules/pages/server");
    const { isLive } = await import("@/modules/pages/live");
    const p = await createPage({ actorId: ann, siteId: siteA, title: "Launch", slug: "launch" });
    await expect(setPageStatus({ actorId: ann, siteId: siteA, pageId: p.id, status: "scheduled" })).rejects.toThrow(/date and time/);
    await expect(setPageStatus({ actorId: ann, siteId: siteA, pageId: p.id, status: "scheduled", at: new Date(Date.now() - 60_000) })).rejects.toThrow(/already passed/);
    const soon = new Date(Date.now() + 3_600_000);
    const s = await setPageStatus({ actorId: ann, siteId: siteA, pageId: p.id, status: "scheduled", at: soon });
    expect(s.status).toBe("scheduled");
    expect(s.publishedAt?.getTime()).toBe(soon.getTime());
    expect(isLive(s)).toBe(false);
    expect(await publishedPage({ siteId: siteA, slug: "launch" })).toBeNull();
    expect((await publishedPages({ siteId: siteA })).some((x) => x.slug === "launch")).toBe(false);
    // The clock moves on (we move it): nothing else has to happen.
    await owner.query(`update pages set published_at = now() - interval '1 minute' where id = $1`, [p.id]);
    expect((await publishedPage({ siteId: siteA, slug: "launch" }))?.status).toBe("scheduled");
    expect((await publishedPages({ siteId: siteA })).some((x) => x.slug === "launch")).toBe(true);
    await deletePage({ actorId: ann, siteId: siteA, pageId: p.id });
  });

  test("search and sharing saves with the page and refuses junk", async () => {
    const p = await updatePage({ actorId: ann, siteId: siteA, pageId: aboutId, seo: { title: "About us — Pages A", description: "Who we are.", noindex: true } });
    expect(p.seo).toMatchObject({ title: "About us — Pages A", description: "Who we are.", noindex: true, image: null });
    await expect(updatePage({ actorId: ann, siteId: siteA, pageId: aboutId, seo: { image: { url: "http://x" } } })).rejects.toThrow();
    await updatePage({ actorId: ann, siteId: siteA, pageId: aboutId, seo: {} });
  });

  test("an unknown section type is refused", async () => {
    await expect(addSection({ actorId: ann, siteId: siteA, pageId: aboutId, type: "carousel" })).rejects.toThrow(AccessError);
  });

  test("the storefront sees only published pages, only for its own site", async () => {
    expect(await publishedPage({ siteId: siteA, slug: "about-us" })).toBeNull();
    await setPageStatus({ actorId: ann, siteId: siteA, pageId: aboutId, status: "published" });
    const pub = await publishedPage({ siteId: siteA, slug: "about-us" });
    expect(pub?.title).toBe("About us");
    expect(pub?.sections.map((s) => s.type)).toEqual(["hero", "statement"]);
    expect(pub?.publishedAt).not.toBeNull();
    expect(await publishedPage({ siteId: siteB, slug: "about-us" })).toBeNull();
    await setPageStatus({ actorId: ann, siteId: siteA, pageId: aboutId, status: "draft" });
    expect(await publishedPage({ siteId: siteA, slug: "about-us" })).toBeNull();
  });

  test("rename and re-address a page", async () => {
    const p = await updatePage({ actorId: ann, siteId: siteA, pageId: aboutId, title: "Our story", slug: "story" });
    expect([p.title, p.slug]).toEqual(["Our story", "story"]);
    await expect(updatePage({ actorId: ann, siteId: siteA, pageId: aboutId, slug: "home" })).rejects.toThrow(/already/);
  });

  test("delete is soft, frees the address, and never touches home", async () => {
    await deletePage({ actorId: ann, siteId: siteA, pageId: aboutId });
    expect((await listPages({ actorId: ann, siteId: siteA })).map((p) => p.slug)).toEqual(["home"]);
    await expect(getPage({ actorId: ann, siteId: siteA, pageId: aboutId })).rejects.toThrow(/doesn't exist/);
    const again = await createPage({ actorId: ann, siteId: siteA, title: "Story again", slug: "story" });
    expect(again.slug).toBe("story");
    await expect(deletePage({ actorId: ann, siteId: siteA, pageId: homeId })).rejects.toThrow(/home page/);
  });
});
