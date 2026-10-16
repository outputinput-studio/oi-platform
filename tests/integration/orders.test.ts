/**
 * Checkout and orders: the cart priced on the server, order numbers,
 * paying once (stock, one-offs, contacts), and the site lock.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { createProduct, getProduct, updateProduct } from "@/modules/products/server";
import { markOrderPaid, orderForCustomer, placeOrder, priceCart } from "@/modules/orders/server";
import { siteFromHost } from "@/modules/sites/server";
import type { Site } from "@/db/schema";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA: Site;
let siteBId = "";
const ann = "test-orders-ann";
const address = { line1: "12 Rokeby Road", city: "Subiaco", state: "WA", postcode: "6008", country: "AU" };

beforeAll(async () => {
  await owner.query(`delete from users where id = $1`, [ann]);
  await owner.query(`delete from sites where slug in ('orders-a','orders-b')`);
  const a = (await owner.query(`insert into sites (slug, name) values ('orders-a','Orders A') returning id`)).rows[0].id;
  siteBId = (await owner.query(`insert into sites (slug, name) values ('orders-b','Orders B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Ann','ann@orders.invalid',true,now())`, [ann]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$2,'owner')`, [ann, a]);
  siteA = (await siteFromHost("orders-a.localhost"))!;
});

afterAll(async () => {
  await owner.query(`delete from users where id = $1`, [ann]);
  await owner.query(`delete from sites where slug in ('orders-a','orders-b')`);
  await owner.end();
});

let shelf = "";
let oneOff = "";
let hidden = "";
let first = "";

describe("orders", () => {
  test("the cart is priced from the products, not the browser", async () => {
    shelf = (await createProduct({ actorId: ann, siteId: siteA.id, name: "Shelf piece" })).id;
    await updateProduct({ actorId: ann, siteId: siteA.id, productId: shelf, edit: { price: 10000, salePrice: 8000, stock: 2, visible: true } });
    oneOff = (await createProduct({ actorId: ann, siteId: siteA.id, name: "One off" })).id;
    await updateProduct({ actorId: ann, siteId: siteA.id, productId: oneOff, edit: { price: 50000, make: "oneOnly", visible: true } });
    hidden = (await createProduct({ actorId: ann, siteId: siteA.id, name: "Hidden" })).id;
    await updateProduct({ actorId: ann, siteId: siteA.id, productId: hidden, edit: { price: 100 } });

    const priced = await priceCart({
      site: siteA,
      cart: [
        { id: shelf, q: 5 },
        { id: oneOff, q: 3 },
        { id: hidden, q: 1 },
      ],
    });
    expect(priced.lines.map((l) => [l.name, l.unit, l.qty])).toEqual([
      ["Shelf piece", 8000, 2], // sale price; no more than the 2 in stock
      ["One off", 50000, 1], // only one there is
    ]);
    expect(priced.dropped).toEqual(["Something in your cart"]); // the hidden one isn't on the shop at all
    expect(priced).toMatchObject({ subtotal: 66000, total: 66000, tax: 6000, taxName: "GST", currency: "AUD", needsAddress: true });
  });

  test("orders are numbered from 1001 and need an address for anything that ships", async () => {
    await expect(placeOrder({ site: siteA, cart: [{ id: shelf, q: 1 }], details: { name: "Ella", email: "ella@example.com" }, provider: "test" })).rejects.toThrow(/address/);
    await expect(placeOrder({ site: siteA, cart: [{ id: shelf, q: 1 }], details: { name: "Ella", email: "nope", address }, provider: "test" })).rejects.toThrow(/email/);
    await expect(placeOrder({ site: siteA, cart: [{ id: hidden, q: 1 }], details: { name: "Ella", email: "ella@example.com", address }, provider: "test" })).rejects.toThrow(/empty/);
    const o1 = await placeOrder({ site: siteA, cart: [{ id: shelf, q: 1 }, { id: oneOff, q: 1 }], details: { name: "Ella Nguyen", email: "Ella@Example.com", phone: "0412 884 201", address }, provider: "test" });
    const o2 = await placeOrder({ site: siteA, cart: [{ id: shelf, q: 1 }], details: { name: "Priya", email: "priya@example.com", address }, provider: "test" });
    expect([o1.number, o2.number]).toEqual([1001, 1002]);
    expect(o1).toMatchObject({ paymentStatus: "pending", status: "new", email: "ella@example.com", total: 58000, currency: "AUD" });
    first = o1.id;
  });

  test("paying happens once: stock comes down, the one-off is sold, the customer becomes a contact", async () => {
    const a = await markOrderPaid({ siteId: siteA.id, orderId: first });
    const b = await markOrderPaid({ siteId: siteA.id, orderId: first });
    expect([a.first, b.first]).toEqual([true, false]);
    expect(a.order.paymentStatus).toBe("paid");
    expect(a.order.contactId).toBeTruthy();
    expect((await getProduct({ actorId: ann, siteId: siteA.id, productId: shelf })).stock).toBe(1); // 2 - 1, not 2 - 2
    expect((await getProduct({ actorId: ann, siteId: siteA.id, productId: oneOff })).availability).toBe("sold");
    // The one-off can't go in another cart now.
    expect((await priceCart({ site: siteA, cart: [{ id: oneOff, q: 1 }] })).dropped).toEqual(["One off"]);
  });

  test("another site can't see or pay this site's orders", async () => {
    expect(await orderForCustomer({ siteId: siteBId, orderId: first })).toBeNull();
    await expect(markOrderPaid({ siteId: siteBId, orderId: first })).rejects.toThrow(/doesn't exist/);
    expect(await orderForCustomer({ siteId: siteA.id, orderId: "not-a-uuid" })).toBeNull();
  });
});

describe("orders for the team", () => {
  test("only paid orders are listed; moving one along keeps its tracking", async () => {
    const { listOrders, orderCounts, newOrderCount, getOrder, moveOrder, draftEmail, trackingUrl } = await import("@/modules/orders/admin");
    const list = await listOrders({ actorId: ann, siteId: siteA.id });
    expect(list.map((o) => o.number)).toEqual([1001]); // 1002 was never paid
    expect(await orderCounts({ actorId: ann, siteId: siteA.id })).toMatchObject({ all: 1, new: 1, inProgress: 0 });
    expect(await newOrderCount({ siteId: siteA.id })).toBe(1);

    const o = list[0];
    await expect(getOrder({ actorId: ann, siteId: siteA.id, orderId: (await placeOrder({ site: siteA, cart: [{ id: shelf, q: 1 }], details: { name: "X", email: "x@example.com", address }, provider: "test" })).id })).rejects.toThrow(/doesn't exist/);
    await moveOrder({ actorId: ann, siteId: siteA.id, orderId: o.id, change: { status: "inProgress", email: draftEmail(o, "inProgress", "Orders A") } });
    const sent = await moveOrder({ actorId: ann, siteId: siteA.id, orderId: o.id, change: { status: "sent", tracking: { carrier: "Australia Post", number: "33ANJ482019" } } });
    expect(sent).toMatchObject({ status: "sent", tracking: { carrier: "Australia Post", number: "33ANJ482019" } });
    expect(trackingUrl(sent.tracking as { carrier: string; number: string })).toBe("https://auspost.com.au/mypost/track/details/33ANJ482019");
    expect(draftEmail(sent, "sent", "Orders A", { carrier: "Australia Post", number: "33ANJ482019" }).message).toContain("Australia Post tracking: 33ANJ482019");
    expect(await newOrderCount({ siteId: siteA.id })).toBe(0);
    await expect(moveOrder({ actorId: ann, siteId: siteA.id, orderId: o.id, change: { status: "lost" } })).rejects.toThrow();
    await expect(moveOrder({ actorId: ann, siteId: siteA.id, orderId: o.id, change: { status: "done", email: { subject: "", message: "Hi" } } })).rejects.toThrow(/subject/);
  });
});

describe("delivery", () => {
  test("the rate is checked on the server, added to the total, and a pickup needs no address", async () => {
    const shipping = {
      zones: [
        { id: "au", name: "Australia", countries: ["AU"], rates: [{ id: "std", kind: "post", name: "Standard", price: 1200, estimate: "3–5 days" }, { id: "pick", kind: "pickup", name: "Pick up from the studio", price: 0 }] },
      ],
    };
    await owner.query(`update sites set shipping = $1 where id = $2`, [JSON.stringify(shipping), siteA.id]);
    await updateProduct({ actorId: ann, siteId: siteA.id, productId: shelf, edit: { stock: 10 } });
    const site = (await siteFromHost("orders-a.localhost"))!;
    const cart = [{ id: shelf, q: 1 }];
    const who = { name: "Tara", email: "tara@example.com" };

    await expect(placeOrder({ site, cart, details: { ...who, address: { ...address, country: "NZ" }, rate: "std" }, provider: "test" })).rejects.toThrow(/don't send to that country/);
    await expect(placeOrder({ site, cart, details: { ...who, address, rate: "made-up" }, provider: "test" })).rejects.toThrow(/delivered/);
    const posted = await placeOrder({ site, cart, details: { ...who, address, rate: "std" }, provider: "test" });
    expect(posted).toMatchObject({ subtotal: 8000, shippingPrice: 1200, total: 9200, tax: 836, shipping: { name: "Standard", kind: "post" } });
    const picked = await placeOrder({ site, cart, details: { ...who, address: { country: "AU", line1: "", city: "", postcode: "" }, rate: "pick" }, provider: "test" });
    expect(picked).toMatchObject({ shippingPrice: 0, total: 8000, address: { country: "AU" }, shipping: { kind: "pickup" } });
  });
});

describe("discount codes at checkout", () => {
  test("a code comes off the order, counts when paid, and keeps to its limits", async () => {
    const { saveCode, listCodes } = await import("@/modules/discounts/server");
    await saveCode({ actorId: ann, siteId: siteA.id, edit: { code: "welcome10", kind: "percent", value: 10, perPerson: 1 } });
    await saveCode({ actorId: ann, siteId: siteA.id, edit: { code: "POSTFREE", kind: "freeShipping", minSpend: 5000 } });
    await expect(saveCode({ actorId: ann, siteId: siteA.id, edit: { code: "WELCOME10", kind: "amount", value: 100 } })).rejects.toThrow(/already a code/);

    const site = (await siteFromHost("orders-a.localhost"))!;
    const cart = [{ id: shelf, q: 1 }]; // $80, standard post $12 (from the delivery test)
    const who = { name: "Jade", email: "jade@example.com", address, rate: "std" };
    await expect(placeOrder({ site, cart, details: { ...who, code: "NOPE" }, provider: "test" })).rejects.toThrow(/isn't a code here/);
    const o = await placeOrder({ site, cart, details: { ...who, code: "welcome10" }, provider: "test" });
    expect(o).toMatchObject({ discountCode: "WELCOME10", discount: 800, shippingPrice: 1200, total: 8400 });
    const free = await placeOrder({ site, cart, details: { ...who, code: "postfree" }, provider: "test" });
    expect(free).toMatchObject({ discount: 0, shippingPrice: 0, total: 8000 });

    await markOrderPaid({ siteId: site.id, orderId: o.id });
    expect((await listCodes({ actorId: ann, siteId: site.id })).find((c) => c.code === "WELCOME10")?.uses).toBe(1);
    // One per person: Jade has had hers.
    await expect(placeOrder({ site, cart, details: { ...who, code: "WELCOME10" }, provider: "test" })).rejects.toThrow(/already used/);
  });
});
