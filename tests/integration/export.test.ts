/**
 * Export everything (Stage 40, Carl): an Owner asks, we email a link that
 * lasts 7 days and only opens for an Owner of that site, signed in; the zip
 * holds the whole site. Contacts · Export this list is for Managers and
 * Owners. Photos come from the local-disk storage fallback (no R2 in tests).
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { listActivity } from "@/modules/activity/server";
import { addNote, createContact } from "@/modules/contacts/server";
import { uploadMedia } from "@/modules/media/server";
import { createProduct } from "@/modules/products/server";
import { exportContacts, ExportLinkError, openExport, requestExport, writeArchive } from "@/modules/export/server";
import { ZipWriter } from "@/modules/export/zip";
import { collector, readZip } from "../zip-reader";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ids = { owen: "test-exp-owen", mia: "test-exp-mia", sam: "test-exp-sam", bo: "test-exp-bo" };
const adminOrigin = "https://admin.example.test";
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");
const tokenOf = (devLink: string | undefined) => devLink!.split("/").pop()!;

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('exp-a','exp-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('exp-a','Export A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('exp-b','Export B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Owen','owen@export.invalid',true,now()), ($2,'Mia','mia@export.invalid',true,now()), ($3,'Sam','sam@export.invalid',true,now()), ($4,'Bo','bo@export.invalid',true,now())`,
    Object.values(ids),
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$5,'owner'), ($2,$5,'manager'), ($3,$5,'staff'), ($4,$6,'owner')`, [...Object.values(ids), siteA, siteB]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('exp-a','exp-b')`);
  await db.end();
});

describe("the link", () => {
  test("only an Owner asks; the link is emailed, only its hash is kept, and it lasts 7 days", async () => {
    await expect(requestExport({ actorId: ids.mia, siteId: siteA, adminOrigin })).rejects.toThrow(AccessError);
    await expect(requestExport({ actorId: ids.bo, siteId: siteA, adminOrigin })).rejects.toThrow(AccessError);
    const r = await requestExport({ actorId: ids.owen, siteId: siteA, adminOrigin });
    expect(r.email).toBe("owen@export.invalid");
    expect(r.devLink).toMatch(new RegExp(`^${adminOrigin}/export/${siteA}/[A-Za-z0-9_-]{43}$`));
    const token = tokenOf(r.devLink);
    const { rows } = await db.query(`select token_hash, expires_at - created_at as life from export_links where site_id = $1`, [siteA]);
    expect(rows).toHaveLength(1);
    expect(rows[0].token_hash).not.toContain(token);
    expect(rows[0].token_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(rows[0].life.days).toBe(7);
    const log = await listActivity({ actorId: ids.owen, siteId: siteA });
    expect(log.map((l) => `${l.who} ${l.before}${l.subject}${l.after}`)).toContain("Owen asked for a download of everything");
  });

  test("it opens for an Owner of that site only, and not once it's run out", async () => {
    const token = tokenOf((await requestExport({ actorId: ids.owen, siteId: siteA, adminOrigin })).devLink);
    await expect(openExport({ actorId: ids.mia, siteId: siteA, token })).rejects.toThrow(AccessError); // a Manager with the forwarded email
    await expect(openExport({ actorId: ids.bo, siteId: siteA, token })).rejects.toThrow(AccessError); // another site's Owner
    await expect(openExport({ actorId: ids.bo, siteId: siteB, token })).rejects.toThrow(ExportLinkError); // the link is for A, not B
    await expect(openExport({ actorId: ids.owen, siteId: siteA, token: token.slice(0, -1) + (token.endsWith("A") ? "B" : "A") })).rejects.toMatchObject({ reason: "wrong" });
    expect(await openExport({ actorId: ids.owen, siteId: siteA, token })).toEqual({ filename: `exp-a-${new Date().toISOString().slice(0, 10)}.zip` });
    await db.query(`update export_links set expires_at = now() - interval '1 minute' where site_id = $1`, [siteA]);
    await expect(openExport({ actorId: ids.owen, siteId: siteA, token })).rejects.toMatchObject({ reason: "expired" });
  });

  test("five a day at most", async () => {
    await db.query(`delete from export_links where site_id = $1`, [siteB]);
    for (let i = 0; i < 5; i++) await requestExport({ actorId: ids.bo, siteId: siteB, adminOrigin });
    await expect(requestExport({ actorId: ids.bo, siteId: siteB, adminOrigin })).rejects.toThrow("a few times today");
  });
});

describe("the zip", () => {
  test("photos, products, orders, contacts and pages — and nothing from another site", async () => {
    const photo = await uploadMedia({ actorId: ids.owen, siteId: siteA, filename: "Sauna front.png", contentType: "image/png", bytes: new Uint8Array(PNG), width: 1, height: 1 });
    await uploadMedia({ actorId: ids.bo, siteId: siteB, filename: "Not theirs.png", contentType: "image/png", bytes: new Uint8Array(PNG), width: 1, height: 1 });
    const p = await createProduct({ actorId: ids.owen, siteId: siteA, name: "Barrel sauna" });
    await db.query(`update products set price = 1250000, photos = $2 where id = $1`, [p.id, JSON.stringify([{ key: photo.key, alt: "", width: 1, height: 1 }])]);
    await createProduct({ actorId: ids.bo, siteId: siteB, name: "Someone else's sauna" });
    const amelia = await createContact({ actorId: ids.owen, siteId: siteA, details: { name: "=Amelia Frost", email: "amelia@export.invalid", phone: "" } });
    await addNote({ actorId: ids.owen, siteId: siteA, contactId: amelia.id, text: "Wants the big one" });
    await db.query(
      `insert into orders (site_id, number, name, email, currency, subtotal, total, provider, payment_status, contact_id, items) values ($1, 1001, 'Amelia Frost', 'amelia@export.invalid', 'AUD', 1250000, 1250000, 'test', 'paid', $2, $3)`,
      [siteA, amelia.id, JSON.stringify([{ name: "Barrel sauna", qty: 1, unit: 1250000 }])],
    );

    const out = collector();
    await writeArchive(siteA, new ZipWriter(out.write));
    const files = readZip(out.bytes());
    const names = [...files.keys()];
    expect(names).toEqual(expect.arrayContaining(["photos/Sauna front.png", "products.csv", "orders.csv", "order-items.csv", "contacts.csv", "inbox.csv", "README.txt"]));
    expect(files.get("photos/Sauna front.png")!.equals(PNG)).toBe(true);
    const text = (n: string) => files.get(n)!.toString("utf8");
    expect(text("products.csv")).toContain("Barrel sauna");
    expect(text("products.csv")).toContain("12500.00");
    expect(text("products.csv")).toContain("photos/Sauna front.png");
    expect(text("orders.csv")).toMatch(/1001,.*,Amelia Frost,amelia@export\.invalid/);
    expect(text("order-items.csv")).toContain("1001,Barrel sauna,1,12500.00,12500.00");
    expect(text("contacts.csv")).toContain("'=Amelia Frost,amelia@export.invalid,,");
    expect(text("contacts.csv")).toMatch(/Wants the big one,1,12500\.00,0,/);
    expect(names.join(" ") + Array.from(files.values()).join(" ")).not.toMatch(/Not theirs|Someone else's sauna/);
  });
});

describe("Contacts · Export this list", () => {
  test("Managers and Owners; Staff see contacts but can't take them away", async () => {
    await expect(exportContacts({ actorId: ids.sam, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(exportContacts({ actorId: ids.bo, siteId: siteA })).rejects.toThrow(AccessError);
    const all = await exportContacts({ actorId: ids.mia, siteId: siteA });
    expect(all).toContain("amelia@export.invalid");
  });

  test("what's on screen: a search, or one contact", async () => {
    const tom = await createContact({ actorId: ids.owen, siteId: siteA, details: { name: "Tom Reed", email: "", phone: "+61 400 111 222" } });
    const search = await exportContacts({ actorId: ids.mia, siteId: siteA, q: "reed" });
    expect(search).toContain("Tom Reed");
    expect(search).not.toContain("Amelia");
    const one = await exportContacts({ actorId: ids.owen, siteId: siteA, contactId: tom.id });
    expect(one.trim().split("\r\n")).toHaveLength(2);
    expect(one).toContain("'+61 400 111 222");
    const log = await listActivity({ actorId: ids.owen, siteId: siteA });
    expect(log.map((l) => `${l.who} ${l.before}${l.subject}${l.after}`)).toEqual(expect.arrayContaining(["Owen exported a contact"]));
  });
});
