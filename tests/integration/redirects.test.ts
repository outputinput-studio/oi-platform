/**
 * Redirects: rules, the not-found log, and the old link that keeps
 * working after a rename.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { addRedirect, dismissNotFound, listNotFound, listRedirects, normalisePath, recordNotFound, redirectFor, removeRedirect } from "@/modules/redirects/server";
import { createPage, setPageStatus, updatePage } from "@/modules/pages/server";
import { createArticle, setArticleStatus, updateArticle } from "@/modules/articles/server";
import { updateSearchSettings } from "@/modules/sites/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-redir-ann"; // staff at A
const bob = "test-redir-bob"; // owner of A and B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('redir-a','redir-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('redir-a','Redir A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('redir-b','Redir B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@redir.invalid',true,now()), ($2,'Bob','bob@redir.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$3,'owner'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('redir-a','redir-b')`);
  await owner.end();
});

describe("redirects", () => {
  test("paths are normalised", () => {
    expect(normalisePath("/Shop/Teal-Bikini.html/")).toBe("/shop/teal-bikini.html");
    expect(normalisePath("about?x=1#top")).toBe("/about");
    expect(normalisePath("//")).toBe("/");
  });
  test("a miss is remembered; a rule answers it and clears it", async () => {
    await recordNotFound({ siteId: siteA, path: "/Gallery/", referrer: "https://www.instagram.com/p/abc" });
    await recordNotFound({ siteId: siteA, path: "/gallery", referrer: null });
    const misses = await listNotFound({ actorId: ann, siteId: siteA });
    expect(misses).toHaveLength(1);
    expect(misses[0]).toMatchObject({ path: "/gallery", hits: 2, referrer: "" });
    expect(await redirectFor({ siteId: siteA, path: "/gallery" })).toBeNull();

    const r = await addRedirect({ actorId: ann, siteId: siteA, from: "/Gallery", to: "/about" });
    expect(r.fromPath).toBe("/gallery");
    expect(await listNotFound({ actorId: ann, siteId: siteA })).toEqual([]);
    expect(await redirectFor({ siteId: siteA, path: "/gallery/" })).toBe("/about");
    expect((await listRedirects({ actorId: ann, siteId: siteA }))[0].hits).toBe(1);
    // Another site's rule doesn't answer here.
    expect(await redirectFor({ siteId: siteB, path: "/gallery" })).toBeNull();
    await expect(removeRedirect({ actorId: bob, siteId: siteB, redirectId: r.id })).rejects.toThrow(AccessError);
    await removeRedirect({ actorId: ann, siteId: siteA, redirectId: r.id });
  });
  test("what's refused", async () => {
    await expect(addRedirect({ actorId: ann, siteId: siteA, from: "/", to: "/about" })).rejects.toThrow(/front page/);
    await expect(addRedirect({ actorId: ann, siteId: siteA, from: "/a", to: "/a" })).rejects.toThrow(/circle/);
    await expect(addRedirect({ actorId: ann, siteId: siteA, from: "/a", to: "example.com" })).rejects.toThrow(/full address/);
    const ext = await addRedirect({ actorId: ann, siteId: siteA, from: "/old-shop", to: "https://shop.example.com/x" });
    expect(ext.toPath).toBe("https://shop.example.com/x");
    await dismissNotFound({ actorId: ann, siteId: siteA, path: "/nothing" });
  });
  test("renaming a live page or article keeps the old link; off when the owner says so", async () => {
    const page = await createPage({ actorId: ann, siteId: siteA, title: "Our story", slug: "our-story" });
    await updatePage({ actorId: ann, siteId: siteA, pageId: page.id, slug: "story-draft" }); // draft: no rule
    expect((await listRedirects({ actorId: ann, siteId: siteA })).some((r) => r.fromPath === "/our-story")).toBe(false);
    await setPageStatus({ actorId: ann, siteId: siteA, pageId: page.id, status: "published" });
    await updatePage({ actorId: ann, siteId: siteA, pageId: page.id, slug: "about" });
    expect(await redirectFor({ siteId: siteA, path: "/story-draft" })).toBe("/about");
    await updatePage({ actorId: ann, siteId: siteA, pageId: page.id, slug: "about-us" });
    // A rename of a rename: the first old link lands on the newest address.
    expect(await redirectFor({ siteId: siteA, path: "/story-draft" })).toBe("/about-us");
    expect(await redirectFor({ siteId: siteA, path: "/about" })).toBe("/about-us");

    const a = await createArticle({ actorId: ann, siteId: siteA, title: "First post" });
    await setArticleStatus({ actorId: ann, siteId: siteA, articleId: a.id, status: "published" });
    await updateArticle({ actorId: ann, siteId: siteA, articleId: a.id, edit: { slug: "hello-world" } });
    expect(await redirectFor({ siteId: siteA, path: "/journal/first-post" })).toBe("/journal/hello-world");

    await updateSearchSettings({ actorId: bob, siteId: siteA, settings: { autoRedirect: false } });
    await updatePage({ actorId: ann, siteId: siteA, pageId: page.id, slug: "who-we-are" });
    expect(await redirectFor({ siteId: siteA, path: "/about-us" })).toBeNull();
  });
});
