/**
 * "Email me when it's back": only sold-out things can be waited on, asking
 * twice is one ask, the team sees who's waiting, and making it buyable
 * again sends one email each, once. Plus per-product delivery: weight,
 * oversized and pieces that ship free, priced on the server.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Pool } from "pg";
import type { Email } from "@/lib/email";

const sent: Email[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (m: Email) => {
    sent.push(m);
    return { delivered: false };
  },
}));

const { AccessError } = await import("@/modules/auth/access");
const { siteFromHost, updateShipping } = await import("@/modules/sites/server");
const { createProduct, updateProduct } = await import("@/modules/products/server");
const { joinWaiting, listWaiting, notifyBackInStock, waitingCounts } = await import("@/modules/waiting/server");
const { placeOrder, priceCart } = await import("@/modules/orders/server");

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteId = "";
let otherSiteId = "";
const own = "test-waiting-owner";
const shop = "https://waiting-a.outputinput.io";

beforeAll(async () => {
  await owner.query(`delete from users where id = $1`, [own]);
  await owner.query(`delete from sites where slug in ('waiting-a','waiting-b')`);
  siteId = (await owner.query(`insert into sites (slug, name) values ('waiting-a','Waiting A') returning id`)).rows[0].id;
  otherSiteId = (await owner.query(`insert into sites (slug, name) values ('waiting-b','Waiting B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@waiting.invalid',true,now())`, [own]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$2,'owner'), ($1,$3,'owner')`, [own, siteId, otherSiteId]);
});

afterAll(async () => {
  await owner.query(`delete from users where id = $1`, [own]);
  await owner.query(`delete from sites where slug in ('waiting-a','waiting-b')`);
  await owner.end();
});

beforeEach(() => {
  sent.length = 0;
});

describe("the waiting list", () => {
  let robe = "";
  test("only something sold out can be waited on; asking twice is one ask; bad emails are refused", async () => {
    robe = (await createProduct({ actorId: own, siteId, name: "Linen robe" })).id;
    await updateProduct({ actorId: own, siteId, productId: robe, edit: { price: 12000, stock: 2, visible: true } });
    await expect(joinWaiting({ siteId, productId: robe, email: "amelia@example.com" })).rejects.toThrow(/not sold out/);

    await updateProduct({ actorId: own, siteId, productId: robe, edit: { stock: 0 } });
    await expect(joinWaiting({ siteId, productId: robe, email: "not an email" })).rejects.toThrow(/doesn't look right/);
    expect((await joinWaiting({ siteId, productId: robe, email: "Amelia@Example.com" })).ok).toMatch(/amelia@example.com/);
    await joinWaiting({ siteId, productId: robe, email: "amelia@example.com" });
    await joinWaiting({ siteId, productId: robe, email: "bec@example.com" });
    expect((await listWaiting({ actorId: own, siteId, productId: robe })).map((w) => w.email).sort()).toEqual(["amelia@example.com", "bec@example.com"]);
    expect((await waitingCounts({ actorId: own, siteId })).get(robe)).toBe(2);
  });

  test("another site can't see or add to this list", async () => {
    await expect(joinWaiting({ siteId: otherSiteId, productId: robe, email: "x@example.com" })).rejects.toThrow(/isn't on the shop/);
    expect(await listWaiting({ actorId: own, siteId: otherSiteId, productId: robe })).toEqual([]);
    await expect(listWaiting({ actorId: "nobody", siteId, productId: robe })).rejects.toBeInstanceOf(AccessError);
  });

  test("back in stock: one email each, once; nothing while it's still sold out", async () => {
    expect(await notifyBackInStock({ siteId, productId: robe, shopOrigin: shop })).toBe(0);
    await updateProduct({ actorId: own, siteId, productId: robe, edit: { stock: 4 } });
    expect(await notifyBackInStock({ siteId, productId: robe, shopOrigin: shop })).toBe(2);
    expect(sent.map((m) => m.to).sort()).toEqual(["amelia@example.com", "bec@example.com"]);
    expect(sent[0]).toMatchObject({ subject: "Linen robe is back" });
    expect(sent[0].text).toContain(`${shop}/shop/linen-robe`);
    expect(await notifyBackInStock({ siteId, productId: robe, shopOrigin: shop })).toBe(0); // never twice
    expect(await listWaiting({ actorId: own, siteId, productId: robe })).toEqual([]);
  });

  test("a sold-out combination is waited on by itself", async () => {
    const suit = (await createProduct({ actorId: own, siteId, name: "Swimsuit" })).id;
    await updateProduct({ actorId: own, siteId, productId: suit, edit: { price: 30000, visible: true, options: [{ id: "s", name: "Size", kind: "list", values: ["8", "10"] }] } });
    await updateProduct({ actorId: own, siteId, productId: suit, edit: { variant: { values: ["8"], stock: 0 } } });
    await expect(joinWaiting({ siteId, productId: suit, variant: "10", email: "c@example.com" })).rejects.toThrow(/not sold out/);
    await joinWaiting({ siteId, productId: suit, variant: "8", email: "c@example.com" });
    await updateProduct({ actorId: own, siteId, productId: suit, edit: { variant: { values: ["8"], stock: 5 } } });
    expect(await notifyBackInStock({ siteId, productId: suit, shopOrigin: shop })).toBe(1);
    expect(sent[0].subject).toBe("Swimsuit (8) is back");
  });
});

describe("delivery per product", () => {
  test("weight picks the rate, oversized narrows it, and a cart that ships free pays nothing for delivery", async () => {
    const site = (await siteFromHost("waiting-a.localhost"))!;
    await updateShipping({
      actorId: own,
      siteId,
      settings: {
        dispatchDays: 2,
        zones: [
          {
            id: "au",
            name: "AU",
            countries: ["AU"],
            rates: [
              { id: "small", name: "Small parcel", price: 900, maxWeight: 1000 },
              { id: "heavy", name: "Heavy parcel", price: 2400, minWeight: 1000 },
              { id: "freight", name: "Freight", price: 15000, oversized: true },
            ],
          },
        ],
      },
    });
    const fresh = (await siteFromHost("waiting-a.localhost"))!;
    const tile = (await createProduct({ actorId: own, siteId, name: "Tile" })).id;
    await updateProduct({ actorId: own, siteId, productId: tile, edit: { price: 1000, weight: 400, visible: true } });
    const sauna = (await createProduct({ actorId: own, siteId, name: "Barrel sauna" })).id;
    await updateProduct({ actorId: own, siteId, productId: sauna, edit: { price: 900000, weight: 300000, oversized: true, visible: true } });
    const gift = (await createProduct({ actorId: own, siteId, name: "Gift wrap" })).id;
    await updateProduct({ actorId: own, siteId, productId: gift, edit: { price: 500, weight: 50, shipsFree: true, visible: true } });

    expect((await priceCart({ site: fresh, cart: [{ id: tile, q: 2 }, { id: gift, q: 1 }] })).parcel).toEqual({ weight: 800, oversized: false, allFree: false });
    const details = { name: "Kim", email: "kim@example.com", address: { line1: "1 Hay St", city: "Perth", postcode: "6000", country: "AU" } };
    // 2 × 400 g: the small parcel. 3 × 400 g: the heavy one. A sauna: only freight.
    expect((await placeOrder({ site: fresh, cart: [{ id: tile, q: 2 }], details: { ...details, rate: "small" }, provider: "test" })).shippingPrice).toBe(900);
    await expect(placeOrder({ site: fresh, cart: [{ id: tile, q: 3 }], details: { ...details, rate: "small" }, provider: "test" })).rejects.toThrow(/Pick how/);
    expect((await placeOrder({ site: fresh, cart: [{ id: sauna, q: 1 }], details, provider: "test" })).shippingPrice).toBe(15000);
    // Only free pieces: free delivery, no rate to pick.
    const free = await placeOrder({ site: fresh, cart: [{ id: gift, q: 2 }], details, provider: "test" });
    expect(free).toMatchObject({ shippingPrice: 0, shipping: { name: "Free delivery" } });
    expect(site.id).toBe(siteId);
  });
});
