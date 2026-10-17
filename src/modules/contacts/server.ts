import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { contacts, forms, orders, submissions, type Contact } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { fieldsSchema, headlineAnswer, type Field } from "@/modules/forms/fields";
import { FieldError, named } from "@/lib/form-error";
import { recordActivity } from "@/modules/activity/server";
import { differing, duplicatePairs, mergedValues, type ContactValues } from "./duplicates";

/**
 * Contacts: the people who have written to the site. Most arrive through
 * a form (see upsertFromSubmission, called by the forms module with no
 * actor, inside the site's transaction); the team can also add one by
 * hand. Everything here is locked to the site like every client table.
 */

export type ContactRow = Contact & {
  /** The latest thing they sent, for the list. */
  lastSubmissionAt: Date | null;
  newCount: number;
};

const emailSchema = z.string().trim().toLowerCase().max(200).refine((s) => s === "" || z.string().email().safeParse(s).success, "That doesn't look like an email address.");
export const contactDetailsSchema = z.object({
  name: z.string().trim().max(120),
  email: emailSchema,
  phone: z.string().trim().max(40),
});
export type ContactDetails = z.infer<typeof contactDetailsSchema>;

export async function listContacts(p: { actorId: string; siteId: string; q?: string }): Promise<ContactRow[]> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const q = (p.q ?? "").trim();
  return withSite(p.siteId, async (tx) => {
    const rows = await tx
      .select({
        c: contacts,
        lastSubmissionAt: sql<Date | null>`max(${submissions.createdAt})`,
        newCount: sql<number>`count(*) filter (where ${submissions.status} = 'new')`,
      })
      .from(contacts)
      .leftJoin(submissions, eq(submissions.contactId, contacts.id))
      .where(
        and(
          isNull(contacts.deletedAt),
          q ? or(ilike(contacts.name, `%${q}%`), ilike(contacts.email, `%${q}%`), ilike(contacts.phone, `%${q}%`), sql`${contacts.notes}::text ilike ${"%" + q + "%"}`) : undefined,
        ),
      )
      .groupBy(contacts.id)
      .orderBy(desc(sql`greatest(max(${submissions.createdAt}), ${contacts.updatedAt})`))
      .limit(500);
    return rows.map((r) => ({ ...r.c, lastSubmissionAt: r.lastSubmissionAt ? new Date(r.lastSubmissionAt) : null, newCount: Number(r.newCount) }));
  });
}

export type ContactSubmission = { id: string; formName: string; status: "new" | "done"; createdAt: Date; fields: Field[]; answers: Record<string, string>; headline: string };

export async function getContact(p: { actorId: string; siteId: string; contactId: string }): Promise<Contact & { submissions: ContactSubmission[] }> {
  await assertAccess(p.actorId, p.siteId, "staff");
  return withSite(p.siteId, async (tx) => {
    const [c] = await tx.select().from(contacts).where(and(eq(contacts.id, p.contactId), isNull(contacts.deletedAt))).limit(1);
    if (!c) throw new AccessError("That contact doesn't exist.");
    const subs = await tx
      .select({ s: submissions, formName: forms.name })
      .from(submissions)
      .innerJoin(forms, eq(forms.id, submissions.formId))
      .where(eq(submissions.contactId, c.id))
      .orderBy(desc(submissions.createdAt))
      .limit(50);
    return {
      ...c,
      submissions: subs.map(({ s, formName }) => {
        const r = fieldsSchema.safeParse(s.fields);
        const fields = r.success ? r.data : [];
        return { id: s.id, formName, status: s.status, createdAt: s.createdAt, fields, answers: s.answers, headline: headlineAnswer(fields, s.answers) };
      }),
    };
  });
}

export async function createContact(p: { actorId: string; siteId: string; details: unknown }): Promise<Contact> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const d = contactDetailsSchema.parse(p.details);
  if (!d.name && !d.email && !d.phone) throw new FieldError("name", "Give them a name, an email or a phone number.");
  return withSite(p.siteId, async (tx) => {
    if (d.email) {
      const [existing] = await tx.select().from(contacts).where(and(eq(contacts.email, d.email), isNull(contacts.deletedAt))).limit(1);
      if (existing) throw new FieldError("email", `${d.email} is already a contact${existing.name ? ` (${existing.name})` : ""}.`);
    }
    const [row] = await tx.insert(contacts).values({ siteId: p.siteId, ...d }).returning();
    await recordActivity(tx, p.siteId, p.actorId, { action: "added {s} to contacts", subject: label(row), href: `/contacts/${row.id}` });
    return row;
  });
}

export async function updateContact(p: { actorId: string; siteId: string; contactId: string; details: unknown }): Promise<Contact> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const d = contactDetailsSchema.parse(p.details);
  return withSite(p.siteId, async (tx) => {
    if (d.email) {
      const [clash] = await tx
        .select({ id: contacts.id, name: contacts.name })
        .from(contacts)
        .where(and(eq(contacts.email, d.email), isNull(contacts.deletedAt), sql`${contacts.id} <> ${p.contactId}`))
        .limit(1);
      if (clash) throw new FieldError("email", `${d.email} already belongs to ${clash.name || "another contact"}.`);
    }
    const [row] = await tx
      .update(contacts)
      .set({ ...d, updatedAt: new Date() })
      .where(and(eq(contacts.id, p.contactId), isNull(contacts.deletedAt)))
      .returning();
    if (!row) throw new AccessError("That contact doesn't exist.");
    await recordActivity(tx, p.siteId, p.actorId, { action: "edited the contact {s}", subject: label(row), href: `/contacts/${row.id}`, key: `contact:${row.id}` });
    return row;
  });
}

export async function addNote(p: { actorId: string; siteId: string; contactId: string; text: string }): Promise<Contact> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const text = named("text", z.string().trim().min(1, "Write something first.").max(2_000), p.text);
  return withSite(p.siteId, async (tx) => {
    const [c] = await tx.select().from(contacts).where(and(eq(contacts.id, p.contactId), isNull(contacts.deletedAt))).limit(1);
    if (!c) throw new AccessError("That contact doesn't exist.");
    const notes = [...c.notes, { at: new Date().toISOString(), text }].slice(-200);
    const [row] = await tx.update(contacts).set({ notes, updatedAt: new Date() }).where(eq(contacts.id, c.id)).returning();
    return row;
  });
}

export async function deleteContact(p: { actorId: string; siteId: string; contactId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const [row] = await withSite(p.siteId, async (tx) => {
    const rows = await tx.update(contacts).set({ deletedAt: new Date() }).where(and(eq(contacts.id, p.contactId), isNull(contacts.deletedAt))).returning();
    if (rows[0]) await recordActivity(tx, p.siteId, p.actorId, { action: "removed {s} from contacts", subject: label(rows[0]) });
    return rows;
  });
  if (!row) throw new AccessError("That contact doesn't exist.");
}

/**
 * Called by the forms module when a submission arrives: one contact per
 * address. A known address gets a name filled in if it had none, and a
 * phone likewise; what the team has typed is never overwritten by a form.
 * Runs inside the submission's own transaction, so there's no actor.
 */
export async function upsertFromSubmission(tx: Tx, p: { siteId: string; name: string; email: string; phone: string }): Promise<string | null> {
  const email = p.email.trim().toLowerCase();
  if (!email) return null;
  const [existing] = await tx.select().from(contacts).where(and(eq(contacts.email, email), isNull(contacts.deletedAt))).limit(1);
  if (existing) {
    const patch: Partial<Contact> = {};
    if (!existing.name && p.name) patch.name = p.name.trim().slice(0, 120);
    if (!existing.phone && p.phone) patch.phone = p.phone.trim().slice(0, 40);
    if (Object.keys(patch).length) await tx.update(contacts).set({ ...patch, updatedAt: new Date() }).where(eq(contacts.id, existing.id));
    return existing.id;
  }
  const [row] = await tx
    .insert(contacts)
    .values({ siteId: p.siteId, name: p.name.trim().slice(0, 120), email, phone: p.phone.trim().slice(0, 40) })
    .returning({ id: contacts.id });
  return row.id;
}

const label = (c: Pick<Contact, "name" | "email" | "phone">) => c.name || c.email || c.phone || "someone";

/** A merged-away contact's id leads to the one it became (old links, bookmarks). Null when there's nothing to go to. */
export async function resolveContactId(p: { actorId: string; siteId: string; contactId: string }): Promise<string | null> {
  await assertAccess(p.actorId, p.siteId, "staff");
  return withSite(p.siteId, async (tx) => {
    let id = p.contactId;
    for (let hop = 0; hop < 5; hop++) {
      const [c] = await tx.select({ id: contacts.id, deletedAt: contacts.deletedAt, mergedInto: contacts.mergedInto }).from(contacts).where(eq(contacts.id, id)).limit(1);
      if (!c) return null;
      if (!c.deletedAt) return c.id;
      if (!c.mergedInto) return null;
      id = c.mergedInto;
    }
    return null;
  });
}

export type DuplicatePair = { a: Contact; b: Contact; reason: string };

/** Possible duplicates: the same phone or the same full name, minus pairs the team said are different people. */
export async function findDuplicates(p: { actorId: string; siteId: string }): Promise<DuplicatePair[]> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const rows = await withSite(p.siteId, (tx) => tx.select().from(contacts).where(isNull(contacts.deletedAt)).orderBy(desc(contacts.updatedAt)).limit(5000));
  const byId = new Map(rows.map((r) => [r.id, r]));
  return duplicatePairs(rows.map((r) => ({ id: r.id, name: r.name, phone: r.phone, notSame: r.notSame ?? [] }))).map((d) => ({ a: byId.get(d.a)!, b: byId.get(d.b)!, reason: d.reason }));
}

export type MergeSide = ContactValues & { id: string; kind: "Customer" | "Enquiry" | "Added by hand"; since: Date; orders: number; enquiries: number; notes: number };

async function side(tx: Tx, id: string): Promise<MergeSide> {
  const [c] = await tx.select().from(contacts).where(and(eq(contacts.id, id), isNull(contacts.deletedAt))).limit(1);
  if (!c) throw new AccessError("That contact doesn't exist.");
  const [{ n: orderCount }] = await tx.select({ n: sql<number>`count(*)` }).from(orders).where(eq(orders.contactId, id));
  const [{ n: enquiryCount }] = await tx.select({ n: sql<number>`count(*)` }).from(submissions).where(eq(submissions.contactId, id));
  const o = Number(orderCount);
  const e = Number(enquiryCount);
  return { id: c.id, name: c.name, email: c.email, phone: c.phone, kind: o ? "Customer" : e ? "Enquiry" : "Added by hand", since: c.createdAt, orders: o, enquiries: e, notes: c.notes.length };
}

/** The two side by side, the fields where they differ, and why they were suggested (if they were). */
export async function mergePreview(p: { actorId: string; siteId: string; aId: string; bId: string }): Promise<{ a: MergeSide; b: MergeSide; differ: (keyof ContactValues)[]; reason: string }> {
  await assertAccess(p.actorId, p.siteId, "staff");
  if (p.aId === p.bId) throw new Error("Pick two different people to merge.");
  return withSite(p.siteId, async (tx) => {
    const a = await side(tx, p.aId);
    const b = await side(tx, p.bId);
    const [pair] = duplicatePairs([
      { id: a.id, name: a.name, phone: a.phone, notSame: [] },
      { id: b.id, name: b.name, phone: b.phone, notSame: [] },
    ]);
    return { a, b, differ: differing(a, b), reason: pair?.reason ?? "" };
  });
}

const pickSchema = z.object({ name: z.enum(["a", "b"]).default("a"), email: z.enum(["a", "b"]).default("a"), phone: z.enum(["a", "b"]).default("a") });

/**
 * Two become one: `keepId` stays (its link, its history), with the values
 * picked where they differ, every enquiry and order and note from both,
 * and both sets of "different people". The other is soft deleted and
 * points at it. Can't be undone.
 */
export async function mergeContacts(p: { actorId: string; siteId: string; keepId: string; otherId: string; pick: unknown }): Promise<string> {
  await assertAccess(p.actorId, p.siteId, "staff");
  if (p.keepId === p.otherId) throw new Error("Pick two different people to merge.");
  const pick = pickSchema.parse(p.pick ?? {});
  return withSite(p.siteId, async (tx) => {
    const [a] = await tx.select().from(contacts).where(and(eq(contacts.id, p.keepId), isNull(contacts.deletedAt))).limit(1);
    const [b] = await tx.select().from(contacts).where(and(eq(contacts.id, p.otherId), isNull(contacts.deletedAt))).limit(1);
    if (!a || !b) throw new AccessError("That contact doesn't exist.");
    const values = mergedValues(a, b, pick);
    const notes = [...a.notes, ...b.notes].sort((x, y) => x.at.localeCompare(y.at)).slice(-200);
    const notSame = [...new Set([...(a.notSame ?? []), ...(b.notSame ?? [])])].filter((id) => id !== a.id && id !== b.id);
    await tx.update(submissions).set({ contactId: a.id }).where(eq(submissions.contactId, b.id));
    await tx.update(orders).set({ contactId: a.id }).where(eq(orders.contactId, b.id));
    // The other goes first, so its email is free for the one that stays.
    await tx.update(contacts).set({ deletedAt: new Date(), mergedInto: a.id, updatedAt: new Date() }).where(eq(contacts.id, b.id));
    await tx.update(contacts).set({ ...values, notes, notSame, updatedAt: new Date() }).where(eq(contacts.id, a.id));
    await recordActivity(tx, p.siteId, p.actorId, { action: "merged {s}", subject: `${label(a)} and ${label(b)}`, href: `/contacts/${a.id}` });
    return a.id;
  });
}

/** "They are different people": never suggested as a pair again. */
export async function markNotSame(p: { actorId: string; siteId: string; aId: string; bId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "staff");
  if (p.aId === p.bId) return;
  await withSite(p.siteId, async (tx) => {
    const rows = await tx.select({ id: contacts.id, notSame: contacts.notSame }).from(contacts).where(and(isNull(contacts.deletedAt), sql`${contacts.id} in (${p.aId}, ${p.bId})`));
    if (rows.length !== 2) throw new AccessError("That contact doesn't exist.");
    for (const r of rows) {
      const other = r.id === p.aId ? p.bId : p.aId;
      if (!(r.notSame ?? []).includes(other)) await tx.update(contacts).set({ notSame: [...(r.notSame ?? []), other] }).where(eq(contacts.id, r.id));
    }
  });
}
