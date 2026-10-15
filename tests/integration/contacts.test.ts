/**
 * Contacts: one per address, made by forms or by hand, with notes.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { addNote, createContact, deleteContact, getContact, listContacts, updateContact } from "@/modules/contacts/server";
import { createForm, submitForm, updateForm } from "@/modules/forms/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-contacts-ann"; // staff at A
const bob = "test-contacts-bob"; // owner of B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('contacts-a','contacts-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('contacts-a','Contacts A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('contacts-b','Contacts B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@contacts.invalid',true,now()), ($2,'Bob','bob@contacts.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('contacts-a','contacts-b')`);
  await owner.end();
});

const base = { siteName: "Contacts A", inboxUrl: "https://admin.example.test/inbox" };

describe("from a form", () => {
  test("a submission with an email makes a contact; a second one from the same address joins it", async () => {
    const f = await createForm({ actorId: ann, siteId: siteA, name: "Contact" });
    const [name, email, msg] = f.fields.map((x) => x.id);
    await submitForm({ ...base, siteId: siteA, formId: f.id, answers: { [name]: "Dee Visitor", [email]: "Dee@X.invalid", [msg]: "First" } });
    await submitForm({ ...base, siteId: siteA, formId: f.id, answers: { [name]: "Someone Else", [email]: "dee@x.invalid", [msg]: "Second" } });
    const list = await listContacts({ actorId: ann, siteId: siteA });
    expect(list).toHaveLength(1);
    expect(list[0].email).toBe("dee@x.invalid");
    expect(list[0].name).toBe("Dee Visitor"); // the first name stays; a form never overwrites what's there
    expect(list[0].newCount).toBe(2);
    const c = await getContact({ actorId: ann, siteId: siteA, contactId: list[0].id });
    expect(c.submissions.map((s) => s.headline)).toEqual(["Second", "First"]);
  });
  test("a form with contacts switched off makes none", async () => {
    const f = await createForm({ actorId: ann, siteId: siteA, name: "Newsletter" });
    await updateForm({ actorId: ann, siteId: siteA, formId: f.id, settings: { name: "Newsletter", fields: f.fields, buttonText: "Join", afterMessage: "Ta.", notifyEmails: "", createContact: false } });
    const [name, email, msg] = f.fields.map((x) => x.id);
    await submitForm({ ...base, siteId: siteA, formId: f.id, answers: { [name]: "Nu", [email]: "nu@x.invalid", [msg]: "Hi" } });
    expect((await listContacts({ actorId: ann, siteId: siteA })).map((c) => c.email)).toEqual(["dee@x.invalid"]);
  });
});

describe("by hand", () => {
  let id = "";
  test("needs at least one thing; an address already in use is refused", async () => {
    await expect(createContact({ actorId: ann, siteId: siteA, details: { name: "", email: "", phone: "" } })).rejects.toThrow(/name, an email/);
    await expect(createContact({ actorId: ann, siteId: siteA, details: { name: "Dee again", email: "DEE@x.invalid", phone: "" } })).rejects.toThrow(/already a contact/);
    id = (await createContact({ actorId: ann, siteId: siteA, details: { name: "Mali", email: "", phone: "081 234 5678" } })).id;
  });
  test("details, notes, search", async () => {
    await updateContact({ actorId: ann, siteId: siteA, contactId: id, details: { name: "Mali S", email: "mali@x.invalid", phone: "081 234 5678" } });
    await expect(updateContact({ actorId: ann, siteId: siteA, contactId: id, details: { name: "Mali S", email: "dee@x.invalid", phone: "" } })).rejects.toThrow(/already belongs/);
    await addNote({ actorId: ann, siteId: siteA, contactId: id, text: "Prefers Line over email." });
    await expect(addNote({ actorId: ann, siteId: siteA, contactId: id, text: "  " })).rejects.toThrow(/Write something/);
    const c = await getContact({ actorId: ann, siteId: siteA, contactId: id });
    expect(c.notes.map((n) => n.text)).toEqual(["Prefers Line over email."]);
    expect((await listContacts({ actorId: ann, siteId: siteA, q: "line over" })).map((c) => c.id)).toEqual([id]);
    expect((await listContacts({ actorId: ann, siteId: siteA, q: "5678" })).map((c) => c.id)).toEqual([id]);
    expect(await listContacts({ actorId: ann, siteId: siteA, q: "zzz" })).toEqual([]);
  });
  test("another site can't see them; removing keeps what they sent", async () => {
    await expect(getContact({ actorId: bob, siteId: siteB, contactId: id })).rejects.toThrow(AccessError);
    expect(await listContacts({ actorId: bob, siteId: siteB })).toEqual([]);
    await deleteContact({ actorId: ann, siteId: siteA, contactId: id });
    await expect(getContact({ actorId: ann, siteId: siteA, contactId: id })).rejects.toThrow(AccessError);
    // The address is free again.
    await createContact({ actorId: ann, siteId: siteA, details: { name: "Mali back", email: "mali@x.invalid", phone: "" } });
  });
});
