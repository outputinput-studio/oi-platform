/**
 * Customer accounts and Track my order, against the database: a code to
 * sign in (the email becomes the account), the waits that stop guessing
 * and inbox-flooding, passwords only where the shop allows them, orders
 * joining the account, addresses, a new email proved by a code, the
 * waiting list — and one shop's accounts never reaching another's.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Pool } from "pg";
import type { Email } from "@/lib/email";
import type { Site } from "@/db/schema";

const sent: Email[] = [];
vi.mock("@/lib/email", async (orig) => ({
  ...(await orig<typeof import("@/lib/email")>()),
  sendEmail: async (m: Email) => {
    sent.push(m);
    return { delivered: false };
  },
}));

const { AccessError } = await import("@/modules/auth/access");
const { siteFromHost, updateMessages } = await import("@/modules/sites/server");
const { createProduct, updateProduct } = await import("@/modules/products/server");
const { markOrderPaid, placeOrder } = await import("@/modules/orders/server");
const { moveOrder } = await import("@/modules/orders/admin");
const { joinWaiting } = await import("@/modules/waiting/server");
const { updateAccountSettings, customerCount } = await import("@/modules/customers/admin");
const c = await import("@/modules/customers/server");
const { trackOrder } = await import("@/modules/customers/track");

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let site: Site;
let other: Site;
const own = "test-customers-owner";
const staff = "test-customers-staff";
const address = { line1: "8 Bay View Terrace", city: "Claremont", state: "WA", postcode: "6010", country: "AU" };
const amelia = "amelia@example.com";
let suit = "";
let firstOrder = { id: "", number: 0 };

const fresh = async () => (site = (await siteFromHost("cust-a.localhost"))!);
const at = (base: Date, seconds: number) => new Date(base.getTime() + seconds * 1000);
const codeOf = (r: Awaited<ReturnType<typeof c.sendCode>>) => (r.ok ? r.devCode! : "");

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('cust-a','cust-b')`);
  const a = (await owner.query(`insert into sites (slug, name) values ('cust-a','Kini Test') returning id`)).rows[0].id;
  const b = (await owner.query(`insert into sites (slug, name) values ('cust-b','Other Shop') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@cust.invalid',true,now()), ($2,'Staff','staff@cust.invalid',true,now())`, [own, staff]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($1,$4,'owner'), ($2,$3,'staff')`, [own, staff, a, b]);
  await fresh();
  other = (await siteFromHost("cust-b.localhost"))!;
  suit = (await createProduct({ actorId: own, siteId: site.id, name: "Swimsuit" })).id;
  await updateProduct({ actorId: own, siteId: site.id, productId: suit, edit: { price: 18000, stock: 10, visible: true } });
  // A guest order, before there's any account.
  const o = await placeOrder({ site, cart: [{ id: suit, q: 1 }], details: { name: "Amelia Frost", email: "Amelia@Example.com", phone: "0400 000 111", address }, provider: "test" });
  await markOrderPaid({ siteId: site.id, orderId: o.id });
  firstOrder = { id: o.id, number: o.number };
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('cust-a','cust-b')`);
  await owner.end();
});

beforeEach(() => {
  sent.length = 0;
});

describe("settings", () => {
  test("off until an owner turns it on; passwords only with accounts", async () => {
    await expect(c.beginSignIn({ site, email: amelia })).rejects.toThrow(/aren't on/);
    await expect(updateAccountSettings({ actorId: staff, siteId: site.id, settings: { enabled: true } })).rejects.toBeInstanceOf(AccessError);
    expect(await updateAccountSettings({ actorId: own, siteId: site.id, settings: { enabled: false, passwords: true } })).toEqual({ enabled: false, passwords: false });
    expect(await updateAccountSettings({ actorId: own, siteId: site.id, settings: { enabled: true } })).toEqual({ enabled: true, passwords: false });
    await fresh();
  });
});

describe("signing in with a code", () => {
  const t0 = new Date(Date.now() + 1000);
  let token = "";

  test("a code goes to the email, from the shop's name, and never copied to the shop", async () => {
    await updateMessages({ actorId: own, siteId: site.id, keepCopy: true });
    await owner.query(`update sites set business = '{"email":"hello@kini.example"}' where id = $1`, [site.id]);
    await fresh();
    const r = await c.beginSignIn({ site, email: " Amelia@Example.com ", requester: "203.0.113.9", now: t0 });
    expect(r).toMatchObject({ step: "code", email: amelia, sent: { ok: true, resendIn: 30 } });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ to: amelia, fromName: "Kini Test", replyTo: "hello@kini.example" });
    expect(sent[0].bcc).toBeUndefined();
    const code = r.step === "code" ? codeOf(r.sent) : "";
    expect(sent[0].subject).toBe(`${code} is your code for Kini Test`);
  });

  test("another code waits 30 seconds; then the newest one is the one that works", async () => {
    expect(await c.sendCode({ site, email: amelia, now: at(t0, 10) })).toEqual({ ok: false, why: "resend", wait: 20 });
    const older = codeOf(await c.sendCode({ site, email: amelia, now: at(t0, 31) }));
    const newer = codeOf(await c.sendCode({ site, email: amelia, now: at(t0, 62) }));
    if (older !== newer) expect(await c.signInWithCode({ site, email: amelia, code: older, now: at(t0, 70) })).toEqual({ ok: false, why: "wrong" });
    const ok = await c.signInWithCode({ site, email: amelia, code: newer, now: at(t0, 71) });
    expect(ok.ok).toBe(true);
    if (ok.ok) token = ok.token;
  });

  test("the email is now an account: named from their order, and the guest order is theirs", async () => {
    const me = (await c.currentCustomer({ site, token }))!;
    expect(me).toMatchObject({ email: amelia, name: "Amelia Frost", phone: "0400 000 111" });
    expect((await c.customerOrders({ siteId: site.id, customer: me })).map((o) => o.number)).toEqual([firstOrder.number]);
    expect(await customerCount({ actorId: own, siteId: site.id })).toBe(1);
  });

  test("the session is this shop's alone, and ends with sign out or when accounts go off", async () => {
    expect(await c.currentCustomer({ site: other, token })).toBeNull();
    expect(await c.currentCustomer({ site, token: "made-up" })).toBeNull();
    expect(await c.currentCustomer({ site, token, now: new Date(Date.now() + 31 * 86_400_000) })).toBeNull(); // thirty days
    await owner.query(`update sites set accounts = '{"enabled":false}' where id = $1`, [site.id]);
    expect(await c.currentCustomer({ site: (await siteFromHost("cust-a.localhost"))!, token })).toBeNull();
    await owner.query(`update sites set accounts = '{"enabled":true}' where id = $1`, [site.id]);
    expect(await c.currentCustomer({ site, token })).not.toBeNull();
    await c.signOut({ siteId: site.id, token });
    expect(await c.currentCustomer({ site, token })).toBeNull();
  });

  test("a code runs out after ten minutes", async () => {
    const t = at(t0, 200);
    const code = codeOf(await c.sendCode({ site, email: amelia, now: t }));
    expect(await c.signInWithCode({ site, email: amelia, code, now: at(t, 601) })).toEqual({ ok: false, why: "expired" });
  });

  test("five wrong codes lock it: 2 minutes, then 4; the code is finished; the account is fine", async () => {
    const t = at(t0, 4000); // past the hour of earlier codes: five an hour to one email
    const code = codeOf(await c.sendCode({ site, email: amelia, now: t }));
    const wrong = code === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) expect(await c.signInWithCode({ site, email: amelia, code: wrong, now: at(t, 1) })).toEqual({ ok: false, why: "wrong" });
    expect(await c.signInWithCode({ site, email: amelia, code: wrong, now: at(t, 2) })).toEqual({ ok: false, why: "locked", wait: 120 });
    expect(await c.signInWithCode({ site, email: amelia, code, now: at(t, 3) })).toMatchObject({ ok: false, why: "locked" });
    expect(await c.sendCode({ site, email: amelia, now: at(t, 60) })).toMatchObject({ ok: false, why: "locked" });
    // After the wait: the old code is finished, a new one works… and the next lock-out is longer.
    const t2 = at(t, 130);
    expect(await c.signInWithCode({ site, email: amelia, code, now: t2 })).toEqual({ ok: false, why: "expired" });
    const again = codeOf(await c.sendCode({ site, email: amelia, now: t2 }));
    const bad = again === "000000" ? "111111" : "000000";
    for (let i = 0; i < 4; i++) await c.signInWithCode({ site, email: amelia, code: bad, now: at(t2, 1) });
    expect(await c.signInWithCode({ site, email: amelia, code: bad, now: at(t2, 2) })).toEqual({ ok: false, why: "locked", wait: 240 });
    // Right code after the wait: in, and the slate is clean.
    const t3 = at(t2, 250);
    const last = codeOf(await c.sendCode({ site, email: amelia, now: t3 }));
    expect((await c.signInWithCode({ site, email: amelia, code: last, now: at(t3, 5) })).ok).toBe(true);
  });

  test("no inbox flooding: five codes an hour to one email, ten from one connection", async () => {
    const t = at(t0, 8000);
    const email = "flood@example.com";
    for (let i = 0; i < 5; i++) expect((await c.sendCode({ site, email, now: at(t, i * 31) })).ok).toBe(true);
    expect(await c.sendCode({ site, email, now: at(t, 200) })).toMatchObject({ ok: false, why: "busy" });
    const from = "198.51.100.7";
    for (let i = 0; i < 10; i++) expect((await c.sendCode({ site, email: `n${i}@example.com`, requester: from, now: at(t, 300 + i) })).ok).toBe(true);
    expect(await c.sendCode({ site, email: "n10@example.com", requester: from, now: at(t, 320) })).toMatchObject({ ok: false, why: "busy" });
    expect((await c.sendCode({ site, email: "n10@example.com", requester: "198.51.100.8", now: at(t, 321) })).ok).toBe(true);
  });

  test("another shop knows nothing of this account", async () => {
    await owner.query(`update sites set accounts = '{"enabled":true}' where id = $1`, [other.id]);
    other = (await siteFromHost("cust-b.localhost"))!;
    const r = await c.sendCode({ site: other, email: amelia, now: at(t0, 12000) });
    const signed = await c.signInWithCode({ site: other, email: amelia, code: codeOf(r), now: at(t0, 12001) });
    expect(signed.ok && (await c.customerOrders({ siteId: other.id, customer: signed.customer }))).toEqual([]);
  });
});

describe("passwords, where the shop allows them", () => {
  test("refused until allowed; then asked for after the email, wrong ones counted, codes still fine", async () => {
    const t = new Date(Date.now() + 20_000_000);
    const r = await c.signInWithCode({ site, email: amelia, code: codeOf(await c.sendCode({ site, email: amelia, now: t })), now: at(t, 1) });
    if (!r.ok) throw new Error("expected to sign in");
    await expect(c.setPassword({ site, customer: r.customer, password: "wattle garden" })).rejects.toThrow(/with a code/);
    await updateAccountSettings({ actorId: own, siteId: site.id, settings: { enabled: true, passwords: true } });
    await fresh();
    await expect(c.setPassword({ site, customer: r.customer, password: "short" })).rejects.toThrow(/Eight characters/);
    await c.setPassword({ site, customer: r.customer, password: "wattle garden" });
    const raw = (await owner.query(`select password_hash from customers where id = $1`, [r.customer.id])).rows[0].password_hash;
    expect(raw).toMatch(/^scrypt\$/);
    expect(raw).not.toContain("wattle");
    expect(await c.beginSignIn({ site, email: amelia })).toEqual({ step: "password", email: amelia });
    expect((await c.beginSignIn({ site, email: "new@example.com", now: at(t, 100) })).step).toBe("code"); // no password, no account: a code
    expect(await c.signInWithPassword({ site, email: amelia, password: "wattle gardens", now: at(t, 2) })).toEqual({ ok: false, why: "wrong" });
    expect((await c.signInWithPassword({ site, email: amelia, password: "wattle garden", now: at(t, 3) })).ok).toBe(true);
    expect(await c.signInWithPassword({ site, email: "nobody@example.com", password: "wattle garden", now: at(t, 4) })).toEqual({ ok: false, why: "wrong" });
  });
});

describe("their things", () => {
  let me: Awaited<ReturnType<typeof c.currentCustomer>>;
  beforeAll(async () => {
    const t = new Date(Date.now() + 40_000_000);
    const r = await c.signInWithCode({ site, email: amelia, code: codeOf(await c.sendCode({ site, email: amelia, now: t })), now: at(t, 1) });
    if (!r.ok) throw new Error("expected to sign in");
    me = r.customer;
  });

  test("details: name and phone", async () => {
    expect(await c.updateDetails({ siteId: site.id, customer: me!, name: "Amelia J Frost", phone: "" })).toMatchObject({ name: "Amelia J Frost", phone: "" });
  });

  test("addresses: the first is the default; one default at a time; deleting the default passes it on; only their own", async () => {
    const home = await c.saveAddress({ siteId: site.id, customer: me!, input: { name: "Amelia Frost", ...address } });
    const work = await c.saveAddress({ siteId: site.id, customer: me!, input: { label: "work", name: "Amelia Frost", line1: "Level 2, 118 Rokeby Road", city: "Subiaco", postcode: "6008", country: "au" } });
    expect([home.isDefault, work.isDefault]).toEqual([true, false]);
    await expect(c.saveAddress({ siteId: site.id, customer: me!, input: { name: "", ...address } })).rejects.toThrow(/Who's it for/);
    await c.makeDefaultAddress({ siteId: site.id, customer: me!, id: work.id });
    expect((await c.listAddresses({ siteId: site.id, customer: me! })).map((a) => [a.label, a.isDefault])).toEqual([["work", true], ["", false]]);
    await c.deleteAddress({ siteId: site.id, customer: me!, id: work.id });
    expect((await c.listAddresses({ siteId: site.id, customer: me! })).map((a) => [a.label, a.isDefault])).toEqual([["", true]]);
    const stranger = (await c.signInWithCode({ site, email: "s@example.com", code: codeOf(await c.sendCode({ site, email: "s@example.com", now: new Date(Date.now() + 50_000_000) })), now: new Date(Date.now() + 50_000_001) })) as { customer: NonNullable<typeof me> };
    await expect(c.deleteAddress({ siteId: site.id, customer: stranger.customer, id: home.id })).rejects.toThrow(/isn't on your account/);
    await expect(c.saveAddress({ siteId: site.id, customer: stranger.customer, id: home.id, input: { name: "Me", ...address } })).rejects.toThrow(/isn't on your account/);
  });

  test("checkout while signed in: the order joins the account", async () => {
    const o = await placeOrder({ site, cart: [{ id: suit, q: 1 }], details: { name: "Amelia Frost", email: "different@example.com", address }, provider: "test", customerId: me!.id });
    await markOrderPaid({ siteId: site.id, orderId: o.id });
    expect((await c.customerOrders({ siteId: site.id, customer: me! })).map((x) => x.number)).toEqual([o.number, firstOrder.number]);
    expect(await c.customerOrder({ siteId: site.id, customer: me!, number: o.number })).toMatchObject({ id: o.id });
  });

  test("the waiting list: theirs, and they can step off it", async () => {
    await updateProduct({ actorId: own, siteId: site.id, productId: suit, edit: { stock: 0 } });
    await joinWaiting({ siteId: site.id, productId: suit, email: "Amelia@Example.com" });
    const list = await c.customerWaiting({ siteId: site.id, customer: me! });
    expect(list.map((w) => w.name)).toEqual(["Swimsuit"]);
    await c.leaveWaiting({ siteId: site.id, customer: me!, id: list[0].id });
    expect(await c.customerWaiting({ siteId: site.id, customer: me! })).toEqual([]);
  });

  test("a new email only once its code is typed in", async () => {
    const t = new Date(Date.now() + 60_000_000);
    await expect(c.startEmailChange({ site, customer: me!, email: amelia, now: t })).rejects.toThrow(/already the email/);
    const r = await c.startEmailChange({ site, customer: me!, email: "amelia.frost@example.com", now: t });
    expect(sent.at(-1)!.to).toBe("amelia.frost@example.com");
    expect(await c.finishEmailChange({ site, customer: me!, email: "amelia.frost@example.com", code: "999999" === codeOf(r) ? "000000" : "999999", now: at(t, 1) })).toEqual({ ok: false, why: "wrong" });
    // Someone else's address: only its owner gets far enough to hear it's taken.
    const taken = await c.startEmailChange({ site, customer: me!, email: "s@example.com", now: at(t, 40) });
    await expect(c.finishEmailChange({ site, customer: me!, email: "s@example.com", code: codeOf(taken), now: at(t, 41) })).rejects.toThrow(/its own account/);
    const again = await c.startEmailChange({ site, customer: me!, email: "amelia.frost@example.com", now: at(t, 80) });
    const done = await c.finishEmailChange({ site, customer: me!, email: "amelia.frost@example.com", code: codeOf(again), now: at(t, 81) });
    expect(done).toMatchObject({ ok: true, customer: { email: "amelia.frost@example.com" } });
  });
});

describe("Track my order", () => {
  test("number and email: where it is, from the team's moves; nothing for a wrong pair; five misses wait", async () => {
    const r = await trackOrder({ siteId: site.id, number: `#${firstOrder.number}`, email: "AMELIA@example.com" });
    expect(r.found && r.order.timeline.headline).toBe("We've got your order");
    await moveOrder({ actorId: own, siteId: site.id, orderId: firstOrder.id, change: { status: "sent", tracking: { carrier: "Australia Post", number: "33ANJ482019" } } });
    const sentNow = await trackOrder({ siteId: site.id, number: String(firstOrder.number), email: amelia });
    if (!sentNow.found) throw new Error("expected the order");
    expect(sentNow.order.timeline).toMatchObject({
      headline: "On its way to you",
      tracking: { carrier: "Australia Post", number: "33ANJ482019", url: "https://auspost.com.au/mypost/track/details/33ANJ482019" },
    });
    expect(sentNow.order.timeline.steps.map((s) => [s.label, s.done])).toEqual([
      ["Order placed", true],
      ["Getting it ready", true],
      ["Posted", true],
      ["Delivered", false],
    ]);
    expect(sentNow.order.timeline.steps[2].at).toMatch(/^\d{4}-/);
    // What it doesn't say: no address, no pieces.
    expect(JSON.stringify(sentNow)).not.toMatch(/Bay View|Swimsuit/);

    await expect(trackOrder({ siteId: site.id, number: "abc", email: amelia })).rejects.toThrow(/numbers/);
    const t = new Date(Date.now() + 70_000_000);
    for (let i = 0; i < 4; i++) expect(await trackOrder({ siteId: site.id, number: 1, email: "nosy@example.com", now: t })).toEqual({ found: false });
    expect(await trackOrder({ siteId: site.id, number: 2, email: "nosy@example.com", now: t })).toEqual({ found: false, wait: 120 });
    expect(await trackOrder({ siteId: other.id, number: firstOrder.number, email: amelia })).toEqual({ found: false });
  });
});
