/**
 * Who hears about what, end to end against the database: the team's
 * emails follow Settings · Who gets notified (and each form's own), the
 * customer's follow Settings · Customer emails, and only owners change them.
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
const { updateMessages, updateBusiness, siteFromHost } = await import("@/modules/sites/server");
const { createProduct, updateProduct } = await import("@/modules/products/server");
const { placeOrder, markOrderPaid, markOrderFailed } = await import("@/modules/orders/server");
const { createForm, submitForm } = await import("@/modules/forms/server");
const { sendTemplateTest } = await import("@/modules/orders/admin");

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteId = "";
let otherSiteId = "";
const own = "test-notify-owner";
const staff = "test-notify-staff";
const address = { line1: "1 Hay St", city: "Perth", postcode: "6000", country: "AU" };

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('notify-a','notify-b')`);
  siteId = (await owner.query(`insert into sites (slug, name) values ('notify-a','Notify A') returning id`)).rows[0].id;
  otherSiteId = (await owner.query(`insert into sites (slug, name) values ('notify-b','Notify B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@notify.invalid',true,now()), ($2,'Staff','staff@notify.invalid',true,now())`, [own, staff]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'staff'), ($1,$4,'owner')`, [own, staff, siteId, otherSiteId]);
});
afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('notify-a','notify-b')`);
  await owner.end();
});
beforeEach(() => void sent.splice(0));

describe("who gets notified", () => {
  test("only owners change it, addresses are checked, and a form must be this site's", async () => {
    await expect(updateMessages({ actorId: staff, siteId, keepCopy: true })).rejects.toBeInstanceOf(AccessError);
    await expect(updateMessages({ actorId: own, siteId, notify: { newOrder: { to: "nope" } } })).rejects.toThrow(/doesn't look right/);
    const theirs = (await createForm({ actorId: own, siteId: otherSiteId, name: "Theirs" })).id;
    await expect(updateMessages({ actorId: own, siteId, forms: [{ id: theirs, on: false, to: "", cc: "", bcc: "" }] })).rejects.toThrow(/isn't on this site/);
    // Saving the default wording keeps it following the default.
    const { DEFAULT_TEMPLATES } = await import("@/modules/sites/messages");
    const m = await updateMessages({ actorId: own, siteId, templates: { confirmed: DEFAULT_TEMPLATES.confirmed, sent: { subject: "Posted, {name}", body: DEFAULT_TEMPLATES.sent.body } } });
    expect(m.templates.confirmed).toEqual({ subject: "", body: "" });
    expect(m.templates.sent).toEqual({ subject: "Posted, {name}", body: "" });
  });

  test("an order: the team per the settings, the customer from the business with a copy kept; stock running low is flagged", async () => {
    await updateBusiness({ actorId: own, siteId, business: { tradingName: "Notify Co", email: "hello@notify.example", businessNumber: "ABN 1" } });
    await updateMessages({ actorId: own, siteId, keepCopy: true, notify: { newOrder: { to: "orders@notify.example", cc: "michelle@notify.example" }, lowStock: { to: "stock@notify.example" }, paymentFailed: { on: false } } });
    const site = (await siteFromHost("notify-a.localhost"))!;
    const p = (await createProduct({ actorId: own, siteId, name: "Last two" })).id;
    await updateProduct({ actorId: own, siteId, productId: p, edit: { price: 5000, stock: 3, visible: true } });
    const o = await placeOrder({ site, cart: [{ id: p, q: 1 }], details: { name: "Dee Buyer", email: "dee@example.com", address }, provider: "test" });
    await markOrderPaid({ siteId, orderId: o.id, adminUrl: "https://admin.notify-a.localhost" });

    const team = sent.find((m) => m.subject.startsWith("New order"))!;
    expect(team).toMatchObject({ to: ["orders@notify.example"], cc: ["michelle@notify.example"], replyTo: "dee@example.com" });
    const receipt = sent.find((m) => m.to === "dee@example.com")!;
    expect(receipt).toMatchObject({ fromName: "Notify Co", replyTo: "hello@notify.example", bcc: ["hello@notify.example"] });
    expect(receipt.text).toContain("Tax invoice · Notify Co · ABN 1");
    const low = sent.find((m) => m.subject.startsWith("Running low"))!;
    expect(low).toMatchObject({ to: ["stock@notify.example"], subject: "Running low: Last two" });
    expect(low.text).toContain("Last two — 2 left");

    // Switched off: a failed payment is recorded, nobody is emailed.
    sent.splice(0);
    const o2 = await placeOrder({ site, cart: [{ id: p, q: 1 }], details: { name: "Al", email: "al@example.com", address }, provider: "stripe" });
    await markOrderFailed({ siteId, orderId: o2.id });
    expect((await owner.query(`select payment_status from orders where id = $1`, [o2.id])).rows[0].payment_status).toBe("failed");
    expect(sent).toEqual([]);
    await updateMessages({ actorId: own, siteId, notify: { newOrder: { to: "orders@notify.example" }, lowStock: {}, paymentFailed: {} } });
    const o3 = await placeOrder({ site, cart: [{ id: p, q: 1 }], details: { name: "Bo", email: "bo@example.com", address }, provider: "stripe" });
    await markOrderFailed({ siteId, orderId: o3.id });
    expect(sent.find((m) => m.subject.startsWith("A payment didn't go through"))).toMatchObject({ to: ["own@notify.invalid"], replyTo: "bo@example.com" });
  });

  test("a form switched off emails nobody but still lands in the Inbox; its copies go out when it's on", async () => {
    const f = await createForm({ actorId: own, siteId, name: "Contact" });
    const answers = { name: "Sue", email: "sue@example.com", message: "Hello" };
    await updateMessages({ actorId: own, siteId, forms: [{ id: f.id, on: false, to: "", cc: "", bcc: "" }] });
    await submitForm({ siteId, formId: f.id, answers, siteName: "Notify A", inboxUrl: "https://admin/inbox" });
    expect(sent).toEqual([]);
    expect(Number((await owner.query(`select count(*) from submissions where form_id = $1`, [f.id])).rows[0].count)).toBe(1);
    await updateMessages({ actorId: own, siteId, forms: [{ id: f.id, on: true, to: "desk@notify.example", cc: "", bcc: "boss@notify.example" }] });
    await submitForm({ siteId, formId: f.id, answers, siteName: "Notify A", inboxUrl: "https://admin/inbox" });
    expect(sent[0]).toMatchObject({ to: ["desk@notify.example"], bcc: ["boss@notify.example"], replyTo: "sue@example.com" });
  });

  test("send me a test goes only to the person asking, filled in with a sample order", async () => {
    await sendTemplateTest({ actorId: staff, siteId, to: "staff@notify.invalid", key: "sent", template: { subject: "Posted, {name}", body: "Hi {name}, {tracking}" } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: "staff@notify.invalid", subject: "Test: Posted, Sam" });
    expect(sent[0].text).toContain("Australia Post tracking: 33ANJ482019");
    await expect(sendTemplateTest({ actorId: staff, siteId, to: "x@y.z", key: "nope", template: { subject: "", body: "" } })).rejects.toThrow();
  });
});
