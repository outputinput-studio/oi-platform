/**
 * Site search against the database: every word has to turn up somewhere;
 * products, live pages and live articles only; LIKE's wildcards are
 * literal; and one site's search never finds another's things.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { searchWords } from "@/lib/search";
import { createProduct, updateProduct, searchProducts } from "@/modules/products/server";
import { createProductCategory } from "@/modules/products/categories";
import { addSection, createPage, searchPages, setPageStatus } from "@/modules/pages/server";
import { createArticle, searchArticles, setArticleStatus, updateArticle } from "@/modules/articles/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const own = "test-search-owner";

beforeAll(async () => {
  await owner.query(`delete from users where id = $1`, [own]);
  await owner.query(`delete from sites where slug in ('search-a','search-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('search-a','Search A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('search-b','Search B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@search.invalid',true,now())`, [own]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$2,'owner'), ($1,$3,'owner')`, [own, siteA, siteB]);

  const saunas = await createProductCategory({ actorId: own, siteId: siteA, name: "Saunas" });
  const barrel = await createProduct({ actorId: own, siteId: siteA, name: "Barrel sauna", categoryId: saunas.id });
  await updateProduct({ actorId: own, siteId: siteA, productId: barrel.id, edit: { visible: true, price: 900000, description: "Thermo-pine, wood-fired stove.", code: "BRL-200" } });
  const robe = await createProduct({ actorId: own, siteId: siteA, name: "Linen robe" });
  await updateProduct({ actorId: own, siteId: siteA, productId: robe.id, edit: { visible: true, price: 12000, options: [{ id: "c", name: "Colour", kind: "list", values: ["Sage", "Charcoal"] }] } });
  await updateProduct({ actorId: own, siteId: siteA, productId: robe.id, edit: { variant: { values: ["Sage"], code: "ROBE-SG" } } });
  const hidden = await createProduct({ actorId: own, siteId: siteA, name: "Hidden sauna hat" });
  await updateProduct({ actorId: own, siteId: siteA, productId: hidden.id, edit: { price: 100, description: "100% wool" } });
  const discount = await createProduct({ actorId: own, siteId: siteA, name: "Gift card" });
  await updateProduct({ actorId: own, siteId: siteA, productId: discount.id, edit: { visible: true, price: 5000, description: "Take 100% of the guesswork out." } });

  const about = await createPage({ actorId: own, siteId: siteA, title: "About us" });
  await addSection({ actorId: own, siteId: siteA, pageId: about.id, type: "text", data: { heading: "Our workshop", body: "Every sauna is built by hand in Bang Saen." } });
  await addSection({ actorId: own, siteId: siteA, pageId: about.id, type: "pictureAndWords", data: { heading: "The bench", pictureSide: "right" } });
  await setPageStatus({ actorId: own, siteId: siteA, pageId: about.id, status: "published" });
  const draft = await createPage({ actorId: own, siteId: siteA, title: "Sauna secrets" });
  await addSection({ actorId: own, siteId: siteA, pageId: draft.id, type: "text", data: { heading: "Not yet", body: "Draft about a sauna." } });

  const post = await createArticle({ actorId: own, siteId: siteA, title: "How hot should a sauna be?" });
  await updateArticle({ actorId: own, siteId: siteA, articleId: post.id, edit: { excerpt: "Temperature, humidity and the löyly.", body: "Most people like 80 to 90 degrees." } });
  await setArticleStatus({ actorId: own, siteId: siteA, articleId: post.id, status: "published" });
  const unpublished = await createArticle({ actorId: own, siteId: siteA, title: "Sauna draft" });
  void unpublished;

  const theirs = await createProduct({ actorId: own, siteId: siteB, name: "Their barrel sauna" });
  await updateProduct({ actorId: own, siteId: siteB, productId: theirs.id, edit: { visible: true, price: 1 } });
});

afterAll(async () => {
  await owner.query(`delete from users where id = $1`, [own]);
  await owner.query(`delete from sites where slug in ('search-a','search-b')`);
  await owner.end();
});

const names = (rows: { name: string }[]) => rows.map((r) => r.name);

describe("site search", () => {
  test("products: name, description, category, code, option values and combination codes; visible only", async () => {
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("sauna") }))).toEqual(["Barrel sauna"]);
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("wood-fired") }))).toEqual(["Barrel sauna"]);
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("saunas") }))).toEqual(["Barrel sauna"]); // the category
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("brl") }))).toEqual(["Barrel sauna"]);
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("charcoal") }))).toEqual(["Linen robe"]);
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("robe-sg") }))).toEqual(["Linen robe"]);
  });

  test("every word has to match; no words, no results", async () => {
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("barrel stove") }))).toEqual(["Barrel sauna"]);
    expect(await searchProducts({ siteId: siteA, words: searchWords("barrel robe") })).toEqual([]);
    expect(await searchProducts({ siteId: siteA, words: [] })).toEqual([]);
  });

  test("a % is a percent sign, not a wildcard", async () => {
    expect(names(await searchProducts({ siteId: siteA, words: searchWords("100%") }))).toEqual(["Gift card"]);
    expect(await searchProducts({ siteId: siteA, words: searchWords("%") })).toEqual([]);
  });

  test("pages: the title and the words on them, live only, with what matched", async () => {
    const found = await searchPages({ siteId: siteA, words: searchWords("hand") });
    expect(found).toEqual([{ slug: "about-us", title: "About us", hit: "Every sauna is built by hand in Bang Saen." }]);
    expect((await searchPages({ siteId: siteA, words: searchWords("sauna") })).map((p) => p.slug)).toEqual(["about-us"]); // not the draft
    expect((await searchPages({ siteId: siteA, words: searchWords("about") })).map((p) => p.slug)).toEqual(["about-us"]);
    // Settings aren't words: the picture sits on the right, but "right" isn't on the page.
    expect(await searchPages({ siteId: siteA, words: searchWords("right") })).toEqual([]);
    expect((await searchPages({ siteId: siteA, words: searchWords("bench") })).map((p) => p.hit)).toEqual(["The bench"]);
  });

  test("articles: live only, by title, summary or body", async () => {
    expect((await searchArticles({ siteId: siteA, words: searchWords("sauna") })).map((a) => a.title)).toEqual(["How hot should a sauna be?"]);
    expect((await searchArticles({ siteId: siteA, words: searchWords("löyly") })).map((a) => a.title)).toEqual(["How hot should a sauna be?"]);
    expect(await searchArticles({ siteId: siteA, words: searchWords("draft") })).toEqual([]);
  });

  test("one site's search never finds another's", async () => {
    expect(names(await searchProducts({ siteId: siteB, words: searchWords("sauna") }))).toEqual(["Their barrel sauna"]);
    expect(await searchPages({ siteId: siteB, words: searchWords("workshop") })).toEqual([]);
  });

  test("/search, /shop, /journal, /account and /track can't be a page's address", async () => {
    await expect(createPage({ actorId: own, siteId: siteA, title: "Search" })).rejects.toThrow(/kept for the site search/);
    await expect(createPage({ actorId: own, siteId: siteA, title: "Anything", slug: "shop" })).rejects.toThrow(/kept for the shop/);
    await expect(createPage({ actorId: own, siteId: siteA, title: "Account" })).rejects.toThrow(/kept for customer accounts/);
    await expect(createPage({ actorId: own, siteId: siteA, title: "Track" })).rejects.toThrow(/kept for order tracking/);
  });
});
