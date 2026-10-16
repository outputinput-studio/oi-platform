/**
 * Enquiries: the one form people use to ask about something. Owners pick
 * it, from their own site's forms; enquire-only products name themselves
 * in what's sent; quote-only delivery zones file the cart in the Inbox
 * instead of taking payment.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { createForm, getSubmission, listSubmissions, submitForm, updateForm } from "@/modules/forms/server";
import { createProduct, updateProduct } from "@/modules/products/server";
import { placeOrder } from "@/modules/orders/server";
import { requestQuote } from "@/modules/orders/quote";
import { setEnquiryForm, siteFromHost, siteShop, updateShopSettings } from "@/modules/sites/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteId = "";
let otherSiteId = "";
let formId = "";
let otherForm = "";
let costume = "";
const own = "test-enquiries-owner";
const staff = "test-enquiries-staff";
const inboxUrl = "https://admin.enquiries-a.localhost/inbox";
const nz = { line1: "4 Ponsonby Road", city: "Auckland", postcode: "1011", country: "NZ" };

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('enquiries-a','enquiries-b')`);
  siteId = (await owner.query(`insert into sites (slug, name) values ('enquiries-a','Enquiries A') returning id`)).rows[0].id;
  otherSiteId = (await owner.query(`insert into sites (slug, name) values ('enquiries-b','Enquiries B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@enquiries.invalid',true,now()), ($2,'Staff','staff@enquiries.invalid',true,now())`, [own, staff]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'staff'), ($1,$4,'owner')`, [own, staff, siteId, otherSiteId]);
  formId = (await createForm({ actorId: own, siteId, name: "Commission enquiry" })).id;
  await updateForm({
    actorId: own,
    siteId,
    formId,
    settings: {
      name: "Commission enquiry",
      fields: [
        { id: "n", type: "text", label: "Name", required: true },
        { id: "e", type: "email", label: "Email", required: true },
        { id: "m", type: "longText", label: "What are you after?" },
      ],
      buttonText: "Send",
      afterMessage: "Thanks {name}.",
      notifyEmails: "",
    },
  });
  otherForm = (await createForm({ actorId: own, siteId: otherSiteId, name: "Theirs" })).id;
  costume = (await createProduct({ actorId: own, siteId, name: "Feather set" })).id;
  await updateProduct({ actorId: own, siteId, productId: costume, edit: { price: 128000, availability: "enquire", visible: true } });
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('enquiries-a','enquiries-b')`);
  await owner.end();
});

describe("the enquiry form", () => {
  test("an owner picks one of their own site's forms; tax settings leave it alone", async () => {
    await expect(setEnquiryForm({ actorId: staff, siteId, formId })).rejects.toBeInstanceOf(AccessError);
    await expect(setEnquiryForm({ actorId: own, siteId, formId: otherForm })).rejects.toThrow(/isn't on this site/);
    expect((await setEnquiryForm({ actorId: own, siteId, formId })).enquiryFormId).toBe(formId);
    await updateShopSettings({ actorId: own, siteId, settings: { currency: "NZD", pricesIncludeTax: true, taxName: "GST", taxRate: 15 } });
    expect(siteShop((await siteFromHost("enquiries-a.localhost"))!)).toMatchObject({ currency: "NZD", enquiryFormId: formId });
  });

  test("sent from a product page, the product is named at the top — looked up here, never taken from the browser", async () => {
    const answers = { n: "Amelia Frost", e: "amelia@example.com", m: "Stage costume for October" };
    expect((await submitForm({ siteId, formId, answers, about: costume, siteName: "Enquiries A", inboxUrl })).message).toBe("Thanks Amelia Frost.");
    // Not a product of this site, not visible, or not an id at all: sent without an About.
    const theirs = (await createProduct({ actorId: own, siteId: otherSiteId, name: "Theirs" })).id;
    await updateProduct({ actorId: own, siteId: otherSiteId, productId: theirs, edit: { visible: true } });
    await submitForm({ siteId, formId, answers: { ...answers, m: "second" }, about: theirs, siteName: "Enquiries A", inboxUrl });
    await submitForm({ siteId, formId, answers: { ...answers, m: "third" }, about: "<script>", siteName: "Enquiries A", inboxUrl });

    const list = await listSubmissions({ actorId: own, siteId });
    const first = list.find((s) => s.answers.m === "Stage costume for October")!;
    expect(first.fields[0]).toMatchObject({ id: "_about", label: "About" });
    expect(first.answers._about).toBe("Feather set (/shop/feather-set)");
    for (const m of ["second", "third"]) expect(list.find((s) => s.answers.m === m)!.answers._about).toBeUndefined();
    // The sender is still the person, not the product.
    const { senderOf } = await import("@/modules/forms/fields");
    expect(senderOf(first.fields, first.answers)).toEqual({ name: "Amelia Frost", email: "amelia@example.com" });
  });
});

describe("delivery quoted individually", () => {
  test("no payment: the cart and their details land in the Inbox, and checkout can't charge for it", async () => {
    const shelf = (await createProduct({ actorId: own, siteId, name: "Bikini" })).id;
    await updateProduct({ actorId: own, siteId, productId: shelf, edit: { price: 32000, stock: 3, visible: true } });
    await owner.query(`update sites set shipping = $1 where id = $2`, [
      JSON.stringify({ zones: [{ id: "au", name: "Australia", countries: ["AU"], rates: [{ id: "std", name: "Standard", price: 1200 }] }, { id: "row", name: "Rest of world", everywhere: true, quote: true }] }),
      siteId,
    ]);
    const site = (await siteFromHost("enquiries-a.localhost"))!;
    const cart = [{ id: shelf, q: 2 }];
    const details = { name: "Bec Tolhurst", email: "bec@example.com", phone: "021 555 123", note: "Two sizes", address: nz };

    await expect(placeOrder({ site, cart, details: { ...details, rate: "std" }, provider: "test" })).rejects.toThrow(/quoted separately/);
    await expect(requestQuote({ site, cart, details: { ...details, address: { ...nz, country: "AU", postcode: "6008" } }, inboxUrl })).rejects.toThrow(/has a price at checkout/);
    await expect(requestQuote({ site, cart, details: { ...details, email: "nope" }, inboxUrl })).rejects.toThrow(/email/);

    const r = await requestQuote({ site, cart, details, inboxUrl });
    expect(r.ok).toMatch(/Thanks, Bec\. We'll work out delivery to New Zealand/);
    expect((await owner.query(`select count(*)::int as n from orders where site_id = $1`, [siteId])).rows[0].n).toBe(0);
    const s = (await listSubmissions({ actorId: own, siteId })).find((x) => x.answers._request)!;
    const full = await getSubmission({ actorId: own, siteId, submissionId: s.id });
    expect(full.formName).toBe("Commission enquiry");
    expect(full.answers).toMatchObject({ _request: "Delivery quote to New Zealand", _name: "Bec Tolhurst", _email: "bec@example.com", _note: "Two sizes" });
    expect(full.answers._cart).toContain("2 × Bikini — $640");
    expect(full.answers._address).toContain("Auckland 1011");

    // No enquiry form chosen: nowhere for it to go, so it says so.
    await setEnquiryForm({ actorId: own, siteId, formId: null });
    await expect(requestQuote({ site: (await siteFromHost("enquiries-a.localhost"))!, cart, details, inboxUrl })).rejects.toThrow(/can't take quote requests/);
  });
});

describe("Email quote on a product", () => {
  test("a quote-only product never reaches the cart; its quote request lands in the Inbox", async () => {
    await setEnquiryForm({ actorId: own, siteId, formId });
    const site = (await siteFromHost("enquiries-a.localhost"))!;
    const bath = (await createProduct({ actorId: own, siteId, name: "Ice bath" })).id;
    await updateProduct({ actorId: own, siteId, productId: bath, edit: { price: 450000, buyWith: "quote", visible: true } });
    const { priceCart } = await import("@/modules/orders/server");
    const { requestProductQuote } = await import("@/modules/orders/quote");
    const priced = await priceCart({ site, cart: [{ id: bath, q: 1 }] });
    expect(priced.lines).toEqual([]);
    expect(priced.tidy).toEqual([]);

    const details = { name: "Sam Cold", email: "sam@example.com", country: "TH", city: "Bang Saen", postcode: "20130", qty: "2", note: "Ground floor" };
    await expect(requestProductQuote({ site, productId: bath, details: { ...details, qty: "0" }, inboxUrl })).rejects.toThrow(/At least one/);
    await expect(requestProductQuote({ site, productId: costume, details, inboxUrl })).rejects.toThrow(/doesn't take quote requests/); // enquire only
    const r = await requestProductQuote({ site, productId: bath, details, inboxUrl });
    expect(r.ok).toBe("Thanks, Sam. We'll email a quote for Ice bath, delivered to Thailand, to sam@example.com.");
    const s = (await listSubmissions({ actorId: own, siteId })).find((x) => x.answers._request === "Quote for Ice bath")!;
    expect(s.answers).toMatchObject({ _name: "Sam Cold", _email: "sam@example.com", _address: "Bang Saen 20130\nThailand", _product: "2 × Ice bath (/shop/ice-bath) — listed at $4,500 each", _note: "Ground floor" });

    // Hidden, or switched back to the cart: no quotes.
    await updateProduct({ actorId: own, siteId, productId: bath, edit: { buyWith: "cart" } });
    await expect(requestProductQuote({ site, productId: bath, details, inboxUrl })).rejects.toThrow(/doesn't take quote requests/);
    await updateProduct({ actorId: own, siteId, productId: bath, edit: { buyWith: "both", visible: false } });
    await expect(requestProductQuote({ site, productId: bath, details, inboxUrl })).rejects.toThrow(/doesn't take quote requests/);
  });

  test("the cart is kept tidy: gone things out, no more than there is, held things kept", async () => {
    const site = (await siteFromHost("enquiries-a.localhost"))!;
    const { priceCart, placeOrder } = await import("@/modules/orders/server");
    const two = (await createProduct({ actorId: own, siteId, name: "Two left" })).id;
    await updateProduct({ actorId: own, siteId, productId: two, edit: { price: 1000, stock: 2, visible: true } });
    const one = (await createProduct({ actorId: own, siteId, name: "One off" })).id;
    await updateProduct({ actorId: own, siteId, productId: one, edit: { price: 1000, make: "oneOnly", visible: true } });
    await owner.query(`update sites set shipping = '{}' where id = $1`, [siteId]);
    await placeOrder({ site, cart: [{ id: one, q: 1 }], cartRef: "someone-else", details: { name: "X", email: "x@example.com", address: { line1: "1 A St", city: "Perth", postcode: "6000", country: "AU" } }, provider: "test" });
    const p = await priceCart({ site, cart: [{ id: two, q: 5 }, { id: costume, q: 1 }, { id: one, q: 1 }], cartRef: "mine" });
    expect(p.lines.map((l) => [l.name, l.qty])).toEqual([["Two left", 2]]);
    expect(p.dropped).toEqual(["Feather set"]);
    expect(p.held).toEqual(["One off"]);
    expect(p.tidy).toEqual([{ id: two, q: 2 }, { id: one, q: 1 }]);
  });
});
