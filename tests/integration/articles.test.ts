/**
 * Articles: addresses, publishing, the journal, and the site lock.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { createArticle, deleteArticle, getArticle, hasPublishedArticles, listArticles, publishedArticle, publishedArticles, setArticleStatus, updateArticle } from "@/modules/articles/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-articles-ann";
const bob = "test-articles-bob";

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('articles-a','articles-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('articles-a','Articles A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('articles-b','Articles B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@articles.invalid',true,now()), ($2,'Bob','bob@articles.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('articles-a','articles-b')`);
  await owner.end();
});

describe("articles", () => {
  let first = "";
  test("the address comes from the title; a repeat gets a number", async () => {
    const a = await createArticle({ actorId: ann, siteId: siteA, title: "Behind a hand-crystalled set!" });
    first = a.id;
    expect(a.slug).toBe("behind-a-hand-crystalled-set");
    const b = await createArticle({ actorId: ann, siteId: siteA, title: "Behind a hand-crystalled set" });
    expect(b.slug).toBe("behind-a-hand-crystalled-set-2");
    await expect(updateArticle({ actorId: ann, siteId: siteA, articleId: b.id, edit: { slug: "behind-a-hand-crystalled-set" } })).rejects.toThrow(/already an article/);
    await expect(updateArticle({ actorId: ann, siteId: siteA, articleId: b.id, edit: { slug: "Not Valid" } })).rejects.toThrow(/lower-case/);
    await deleteArticle({ actorId: ann, siteId: siteA, articleId: b.id });
  });
  test("editing takes only what's sent; the journal shows only what's live, newest first", async () => {
    await updateArticle({ actorId: ann, siteId: siteA, articleId: first, edit: { body: "Eleven hours.\n\nA few thousand crystals.", author: "Michelle", publishedOn: "2026-08-18" } });
    const a = await getArticle({ actorId: ann, siteId: siteA, articleId: first });
    expect(a.title).toBe("Behind a hand-crystalled set!");
    expect(a.author).toBe("Michelle");
    expect(a.publishedAt?.toISOString().slice(0, 10)).toBe("2026-08-18");
    expect(await publishedArticles({ siteId: siteA })).toEqual([]);
    expect(await hasPublishedArticles({ siteId: siteA })).toBe(false);

    await setArticleStatus({ actorId: ann, siteId: siteA, articleId: first, status: "published" });
    const newer = await createArticle({ actorId: ann, siteId: siteA, title: "Newer" });
    await setArticleStatus({ actorId: ann, siteId: siteA, articleId: newer.id, status: "published" });
    const dated = await getArticle({ actorId: ann, siteId: siteA, articleId: newer.id });
    expect(dated.publishedAt).not.toBeNull(); // set on first publish
    expect((await publishedArticles({ siteId: siteA })).map((x) => x.slug)).toEqual(["newer", "behind-a-hand-crystalled-set"]);
    expect((await publishedArticle({ siteId: siteA, slug: "newer" }))?.title).toBe("Newer");
    expect(await publishedArticle({ siteId: siteB, slug: "newer" })).toBeNull();
    expect(await hasPublishedArticles({ siteId: siteA })).toBe(true);
    expect((await listArticles({ actorId: ann, siteId: siteA })).length).toBe(2);
  });
  test("the other site sees nothing", async () => {
    await expect(getArticle({ actorId: bob, siteId: siteB, articleId: first })).rejects.toThrow(AccessError);
    await expect(updateArticle({ actorId: bob, siteId: siteA, articleId: first, edit: { title: "x" } })).rejects.toThrow(AccessError);
    expect(await listArticles({ actorId: bob, siteId: siteB })).toEqual([]);
  });
});
