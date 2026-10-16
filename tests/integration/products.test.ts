/**
 * Products and product categories: addresses shared under /shop, prices,
 * what the shop shows, renames, and the site lock.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { createProduct, deleteProduct, getProduct, hasPublishedProducts, listProducts, publishedProduct, publishedProducts, updateProduct } from "@/modules/products/server";
import { createProductCategory, deleteProductCategory, listProductCategories, publishedProductCategories, updateProductCategory } from "@/modules/products/categories";
import { redirectFor } from "@/modules/redirects/server";
import { updateShopSettings } from "@/modules/sites/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-products-ann"; // staff on A
const bob = "test-products-bob"; // owner on B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('products-a','products-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('products-a','Products A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('products-b','Products B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@products.invalid',true,now()), ($2,'Bob','bob@products.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('products-a','products-b')`);
  await owner.end();
});

describe("products", () => {
  let bikini = "";
  let bikinis = "";
  test("a new product is hidden, addressed from its name, and shares /shop with categories", async () => {
    bikinis = (await createProductCategory({ actorId: ann, siteId: siteA, name: "Bikinis" })).id;
    const p = await createProduct({ actorId: ann, siteId: siteA, name: "Teal crystal bikini", categoryId: bikinis });
    bikini = p.id;
    expect(p).toMatchObject({ slug: "teal-crystal-bikini", visible: false, availability: "forSale", category: { slug: "bikinis" } });
    // The category took "bikinis"; a product named that gets the next free address.
    expect((await createProduct({ actorId: ann, siteId: siteA, name: "Bikinis" })).slug).toBe("bikinis-2");
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { slug: "bikinis" } })).rejects.toThrow(/already a category/);
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { slug: "cart" } })).rejects.toThrow(/kept for the shop/);
    await expect(createProductCategory({ actorId: ann, siteId: siteA, name: "Teal crystal bikini" })).rejects.toThrow(/already a product/);
  });

  test("prices: a sale price must be lower; the shop only sees visible pieces", async () => {
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { salePrice: 30000 } })).rejects.toThrow(/sale price/);
    await updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { price: 42000, salePrice: 38000, make: "madeToOrder", leadTime: 6 } });
    expect(await publishedProducts({ siteId: siteA })).toEqual([]);
    expect(await hasPublishedProducts({ siteId: siteA })).toBe(false);
    expect(await publishedProductCategories({ siteId: siteA })).toEqual([]);

    await updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { visible: true } });
    expect((await publishedProducts({ siteId: siteA })).map((x) => x.slug)).toEqual(["teal-crystal-bikini"]);
    expect((await publishedProducts({ siteId: siteA, categoryId: bikinis })).length).toBe(1);
    expect((await publishedProductCategories({ siteId: siteA })).map((c) => [c.slug, c.productCount])).toEqual([["bikinis", 1]]);
    expect(await publishedProduct({ siteId: siteA, slug: "teal-crystal-bikini" })).toMatchObject({ price: 42000, salePrice: 38000, leadTime: 6 });
    expect(await publishedProduct({ siteId: siteA, slug: "bikinis-2" })).toBeNull(); // still hidden
  });

  test("renaming a visible product or a category leaves the old address working", async () => {
    await updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { slug: "teal-bikini" } });
    expect(await redirectFor({ siteId: siteA, path: "/shop/teal-crystal-bikini" })).toBe("/shop/teal-bikini");
    await updateProductCategory({ actorId: ann, siteId: siteA, categoryId: bikinis, slug: "two-piece" });
    expect(await redirectFor({ siteId: siteA, path: "/shop/bikinis" })).toBe("/shop/two-piece");
    // Deleting the category leaves the product, uncategorised.
    await deleteProductCategory({ actorId: ann, siteId: siteA, categoryId: bikinis });
    expect((await getProduct({ actorId: ann, siteId: siteA, productId: bikini })).category).toBeNull();
    expect(await listProductCategories({ actorId: ann, siteId: siteA })).toEqual([]);
  });

  test("bad input is refused; only owners change the currency; another site's products are out of reach", async () => {
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { price: -5 } })).rejects.toThrow();
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: bikini, edit: { photos: [{ key: "https://evil.example/x.jpg", alt: "", width: 1, height: 1 }] } })).rejects.toThrow();
    await expect(updateShopSettings({ actorId: ann, siteId: siteA, settings: { currency: "THB" } })).rejects.toBeInstanceOf(AccessError);
    expect(await updateShopSettings({ actorId: bob, siteId: siteB, settings: { currency: "THB", taxName: "VAT", taxRate: 7 } })).toMatchObject({ currency: "THB", pricesIncludeTax: true, taxName: "VAT", taxRate: 7 });

    const theirs = await createProduct({ actorId: bob, siteId: siteB, name: "Theirs" });
    await expect(getProduct({ actorId: ann, siteId: siteB, productId: theirs.id })).rejects.toBeInstanceOf(AccessError); // not a member
    await expect(getProduct({ actorId: ann, siteId: siteA, productId: theirs.id })).rejects.toThrow(/doesn't exist/); // RLS hides it
    await expect(updateProduct({ actorId: ann, siteId: siteA, productId: theirs.id, edit: { visible: true } })).rejects.toThrow(/doesn't exist/);
    expect((await listProducts({ actorId: ann, siteId: siteA })).some((p) => p.id === theirs.id)).toBe(false);

    await deleteProduct({ actorId: ann, siteId: siteA, productId: bikini });
    expect(await publishedProducts({ siteId: siteA })).toEqual([]);
  });
});
