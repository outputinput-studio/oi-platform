/**
 * Merge contacts (design/admin.html): possible duplicates found by phone
 * or full name; two become one, keeping the values picked and every
 * enquiry, order and note from both; "they are different people" stops
 * the suggestion. Locked to the site like everything else.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import {
  addNote,
  createContact,
  findDuplicates,
  getContact,
  listContacts,
  markNotSame,
  mergeContacts,
  mergePreview,
  resolveContactId,
  updateContact,
} from "@/modules/contacts/server";
import { createForm, submitForm } from "@/modules/forms/server";
import { listActivity } from "@/modules/activity/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const kay = "test-merge-kay"; // staff at A
const lou = "test-merge-lou"; // owner of B
let amelia = "";
let frost = "";

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [kay, lou]);
  await owner.query(`delete from sites where slug in ('merge-a','merge-b')`);
  siteA = (
    await owner.query(`insert into sites (slug, name) values ('merge-a','Merge A') returning id`)
  ).rows[0].id;
  siteB = (
    await owner.query(`insert into sites (slug, name) values ('merge-b','Merge B') returning id`)
  ).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Kay Lim','kay@merge.invalid',true,now()), ($2,'Lou','lou@merge.invalid',true,now())`,
    [kay, lou],
  );
  await owner.query(
    `insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`,
    [kay, lou, siteA, siteB],
  );

  // Amelia wrote through a form and has notes; "A. Frost" bought something, with the same phone written another way.
  amelia = (
    await createContact({
      actorId: kay,
      siteId: siteA,
      details: { name: "Amelia Frost", email: "amelia.frost@gmail.com", phone: "0425 779 122" },
    })
  ).id;
  const f = await createForm({ actorId: kay, siteId: siteA, name: "Commission enquiry" });
  const [name, email, msg] = f.fields.map((x) => x.id);
  await submitForm({
    siteId: siteA,
    siteName: "Merge A",
    inboxUrl: "https://admin.example.test/inbox",
    formId: f.id,
    answers: {
      [name]: "Amelia",
      [email]: "amelia.frost@gmail.com",
      [msg]: "A two-piece for Nationals?",
    },
  });
  await addNote({ actorId: kay, siteId: siteA, contactId: amelia, text: "Prefers teal" });
  frost = (
    await createContact({
      actorId: kay,
      siteId: siteA,
      details: { name: "A. Frost", email: "a.frost@work.com.au", phone: "+61 425 779 122" },
    })
  ).id;
  await addNote({ actorId: kay, siteId: siteA, contactId: frost, text: "Paid by card" });
  await owner.query(
    `insert into orders (site_id, number, name, email, currency, subtotal, total, provider, contact_id) values ($1, 1041, 'A. Frost', 'a.frost@work.com.au', 'AUD', 12000, 12000, 'test', $2)`,
    [siteA, frost],
  );
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [kay, lou]);
  await owner.query(`delete from sites where slug in ('merge-a','merge-b')`);
  await owner.end();
});

describe("possible duplicates", () => {
  test("the same phone, written two ways, is a possible duplicate", async () => {
    const pairs = await findDuplicates({ actorId: kay, siteId: siteA });
    expect(pairs).toHaveLength(1);
    expect([pairs[0].a.id, pairs[0].b.id].sort()).toEqual([amelia, frost].sort());
    expect(pairs[0].reason).toBe("These two share a phone number.");
  });

  test("the two side by side: what each brings, and only what differs is asked", async () => {
    const m = await mergePreview({ actorId: kay, siteId: siteA, aId: amelia, bId: frost });
    expect(m.a).toMatchObject({
      name: "Amelia Frost",
      kind: "Enquiry",
      orders: 0,
      enquiries: 1,
      notes: 1,
    });
    expect(m.b).toMatchObject({
      name: "A. Frost",
      kind: "Customer",
      orders: 1,
      enquiries: 0,
      notes: 1,
    });
    expect(m.differ).toEqual(["name", "email"]);
    expect(m.reason).toBe("These two share a phone number.");
  });

  test("another site can't see them, or merge them", async () => {
    await expect(findDuplicates({ actorId: lou, siteId: siteA })).rejects.toBeInstanceOf(
      AccessError,
    );
    await expect(
      mergePreview({ actorId: lou, siteId: siteB, aId: amelia, bId: frost }),
    ).rejects.toBeInstanceOf(AccessError);
    await expect(
      mergeContacts({ actorId: lou, siteId: siteB, keepId: amelia, otherId: frost, pick: {} }),
    ).rejects.toBeInstanceOf(AccessError);
  });
});

describe("merging", () => {
  test("not with themselves", async () => {
    await expect(
      mergeContacts({ actorId: kay, siteId: siteA, keepId: amelia, otherId: amelia, pick: {} }),
    ).rejects.toThrow(/two different people/);
  });

  test("one contact with the values picked and everything from both; the other's link lands on it", async () => {
    const kept = await mergeContacts({
      actorId: kay,
      siteId: siteA,
      keepId: amelia,
      otherId: frost,
      pick: { name: "a", email: "b" },
    });
    expect(kept).toBe(amelia);
    const c = await getContact({ actorId: kay, siteId: siteA, contactId: amelia });
    expect(c).toMatchObject({
      name: "Amelia Frost",
      email: "a.frost@work.com.au",
      phone: "0425 779 122",
    });
    expect(c.submissions).toHaveLength(1);
    expect(c.notes.map((n) => n.text)).toEqual(["Prefers teal", "Paid by card"]);
    const order = (
      await owner.query(`select contact_id from orders where site_id = $1 and number = 1041`, [
        siteA,
      ])
    ).rows[0];
    expect(order.contact_id).toBe(amelia);
    expect((await listContacts({ actorId: kay, siteId: siteA })).map((x) => x.id)).toEqual([
      amelia,
    ]);
    expect(await resolveContactId({ actorId: kay, siteId: siteA, contactId: frost })).toBe(amelia);
    await expect(
      getContact({ actorId: kay, siteId: siteA, contactId: frost }),
    ).rejects.toBeInstanceOf(AccessError);
    expect(await findDuplicates({ actorId: kay, siteId: siteA })).toEqual([]);
  });

  test("the address given up is free again", async () => {
    const back = await createContact({
      actorId: kay,
      siteId: siteA,
      details: { name: "Old Amelia", email: "amelia.frost@gmail.com", phone: "" },
    });
    expect(back.email).toBe("amelia.frost@gmail.com");
  });

  test("it's in Activity, under who did it", async () => {
    const lines = await listActivity({ actorId: kay, siteId: siteA });
    expect(lines.find((l) => l.before === "merged ")).toMatchObject({
      who: "Kay",
      subject: "Amelia Frost and A. Frost",
      href: `/contacts/${amelia}`,
    });
  });
});

describe("they are different people", () => {
  test("said once, never suggested again", async () => {
    const jo1 = (
      await createContact({
        actorId: kay,
        siteId: siteA,
        details: { name: "Jo Bloggs", email: "", phone: "" },
      })
    ).id;
    const jo2 = (
      await createContact({
        actorId: kay,
        siteId: siteA,
        details: { name: "jo bloggs", email: "", phone: "0400 111 222" },
      })
    ).id;
    expect((await findDuplicates({ actorId: kay, siteId: siteA })).map((p) => p.reason)).toEqual([
      "These two have the same name.",
    ]);
    await markNotSame({ actorId: kay, siteId: siteA, aId: jo1, bId: jo2 });
    expect(await findDuplicates({ actorId: kay, siteId: siteA })).toEqual([]);
    // Editing one doesn't bring the pair back.
    await updateContact({
      actorId: kay,
      siteId: siteA,
      contactId: jo2,
      details: { name: "Jo Bloggs", email: "", phone: "0400 111 222" },
    });
    expect(await findDuplicates({ actorId: kay, siteId: siteA })).toEqual([]);
  });
});
