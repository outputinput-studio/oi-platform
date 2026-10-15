/**
 * Forms and submissions: building a form, what a visitor can send, and
 * the site lock on both sides.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { answersSchema, newField } from "@/modules/forms/fields";
import {
  createForm,
  deleteForm,
  getSubmission,
  listForms,
  listSubmissions,
  newSubmissionCount,
  publicForm,
  setSubmissionStatus,
  submitForm,
  updateForm,
} from "@/modules/forms/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-forms-ann"; // staff at A
const bob = "test-forms-bob"; // owner of B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('forms-a','forms-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('forms-a','Forms A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('forms-b','Forms B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@forms.invalid',true,now()), ($2,'Bob','bob@forms.invalid',true,now())`,
    [ann, bob],
  );
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'staff'), ($2,$4,'owner')`, [ann, bob, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [ann, bob]);
  await owner.query(`delete from sites where slug in ('forms-a','forms-b')`);
  await owner.end();
});

describe("fields", () => {
  test("the validator follows the fields", () => {
    const fields = [newField("text"), { ...newField("email"), required: true }, { ...newField("choice"), options: ["A", "B"] }];
    const s = answersSchema(fields);
    expect(() => s.parse({})).toThrow(/Email/);
    expect(() => s.parse({ [fields[1].id]: "nope" })).toThrow(/email address/);
    expect(() => s.parse({ [fields[1].id]: "a@b.co", [fields[2].id]: "C" })).toThrow(/Pick one/);
    const ok = s.parse({ [fields[1].id]: " A@B.co ", [fields[2].id]: "B", stray: "ignored" });
    expect(ok[fields[1].id]).toBe("A@B.co");
    expect(ok[fields[0].id]).toBe("");
    expect("stray" in ok).toBe(false);
  });
});

describe("forms", () => {
  let formId = "";
  test("a new form starts with name, email and message", async () => {
    const f = await createForm({ actorId: ann, siteId: siteA, name: "Contact" });
    formId = f.id;
    expect(f.fields.map((x) => x.type)).toEqual(["text", "email", "longText"]);
    expect((await listForms({ actorId: ann, siteId: siteA })).map((x) => x.name)).toEqual(["Contact"]);
  });
  test("editing checks every field, and a bad address is refused", async () => {
    const f = await updateForm({
      actorId: ann,
      siteId: siteA,
      formId,
      settings: { name: "Enquiry", fields: [newField("text"), { ...newField("date"), label: "Needed by" }], buttonText: "Send enquiry", afterMessage: "Ta.", notifyEmails: "hello@forms.invalid, b@forms.invalid" },
    });
    expect(f.name).toBe("Enquiry");
    expect(f.fields[1].label).toBe("Needed by");
    await expect(updateForm({ actorId: ann, siteId: siteA, formId, settings: { name: "x", fields: [], buttonText: "Send", afterMessage: "Ta.", notifyEmails: "not-an-email" } })).rejects.toThrow(/addresses/);
    await expect(updateForm({ actorId: ann, siteId: siteA, formId, settings: { name: "x", fields: [{ id: "a", type: "sparkle", label: "?" }], buttonText: "Send", afterMessage: "Ta.", notifyEmails: "" } })).rejects.toThrow();
  });
  test("another site can't see or edit it, and the public lookup is by site too", async () => {
    await expect(updateForm({ actorId: bob, siteId: siteA, formId, settings: {} })).rejects.toThrow(AccessError);
    await expect(updateForm({ actorId: bob, siteId: siteB, formId, settings: { name: "x", fields: [], buttonText: "Send", afterMessage: "Ta.", notifyEmails: "" } })).rejects.toThrow(AccessError);
    expect(await publicForm({ siteId: siteB, formId })).toBeNull();
    expect(await publicForm({ siteId: siteB, formId: "not-a-uuid" })).toBeNull();
    expect((await publicForm({ siteId: siteA, formId }))?.name).toBe("Enquiry");
  });
});

describe("submissions", () => {
  let formId = "";
  let fieldIds: string[] = [];
  beforeAll(async () => {
    const f = await createForm({ actorId: ann, siteId: siteA, name: "Contact" });
    formId = f.id;
    fieldIds = f.fields.map((x) => x.id);
  });
  const base = { siteName: "Forms A", inboxUrl: "https://admin.example.test/inbox" };

  test("a visitor's answers are checked against the form", async () => {
    await expect(submitForm({ ...base, siteId: siteA, formId, answers: {} })).rejects.toThrow(/needed/);
    await expect(submitForm({ ...base, siteId: siteA, formId, answers: { [fieldIds[0]]: "Dee", [fieldIds[1]]: "dee", [fieldIds[2]]: "hi" } })).rejects.toThrow(/email/);
    const r = await submitForm({ ...base, siteId: siteA, formId, answers: { [fieldIds[0]]: "Dee", [fieldIds[1]]: "dee@x.invalid", [fieldIds[2]]: "Do you ship to NZ?" } });
    expect(r.ok).toBe(true);
  });
  test("the trap field swallows bots quietly", async () => {
    const before = await newSubmissionCount({ siteId: siteA });
    const r = await submitForm({ ...base, siteId: siteA, formId, answers: {}, trap: "http://spam" });
    expect(r.ok).toBe(true);
    expect(await newSubmissionCount({ siteId: siteA })).toBe(before);
  });
  test("a form id from another site is not found", async () => {
    await expect(submitForm({ ...base, siteId: siteB, formId, answers: {} })).rejects.toThrow(/isn't on this site/);
  });
  test("the inbox lists it with the form's fields of the day, and done moves it", async () => {
    const list = await listSubmissions({ actorId: ann, siteId: siteA, formId });
    expect(list).toHaveLength(1);
    expect(list[0].formName).toBe("Contact");
    expect(list[0].fields.map((f) => f.label)).toEqual(["Your name", "Email", "Your message"]);
    const one = await getSubmission({ actorId: ann, siteId: siteA, submissionId: list[0].id });
    expect(one.answers[fieldIds[2]]).toBe("Do you ship to NZ?");
    // Rewording the form later doesn't relabel what was already sent.
    await updateForm({ actorId: ann, siteId: siteA, formId, settings: { name: "Contact", fields: [{ ...one.fields[0], label: "Name" }], buttonText: "Send", afterMessage: "Ta.", notifyEmails: "" } });
    expect((await getSubmission({ actorId: ann, siteId: siteA, submissionId: one.id })).fields[0].label).toBe("Your name");

    await setSubmissionStatus({ actorId: ann, siteId: siteA, submissionId: one.id, status: "done" });
    expect(await listSubmissions({ actorId: ann, siteId: siteA })).toHaveLength(0);
    expect((await listSubmissions({ actorId: ann, siteId: siteA, status: "done" })).map((s) => s.id)).toEqual([one.id]);
    expect(await newSubmissionCount({ siteId: siteA })).toBe(0);
    // Bob, on site B, can't touch it.
    await expect(getSubmission({ actorId: bob, siteId: siteB, submissionId: one.id })).rejects.toThrow(AccessError);
  });
  test("deleting the form keeps what was sent", async () => {
    await deleteForm({ actorId: ann, siteId: siteA, formId });
    expect((await listSubmissions({ actorId: ann, siteId: siteA, status: "done" })).length).toBe(1);
    expect(await publicForm({ siteId: siteA, formId })).toBeNull();
  });
});
