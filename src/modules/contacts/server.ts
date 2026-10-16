import { and, desc, eq, ilike, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { contacts, forms, submissions, type Contact } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { fieldsSchema, headlineAnswer, type Field } from "@/modules/forms/fields";
import { FieldError, named } from "@/lib/form-error";

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
  await assertAccess(p.actorId, p.siteId);
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
  await assertAccess(p.actorId, p.siteId);
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
  await assertAccess(p.actorId, p.siteId);
  const d = contactDetailsSchema.parse(p.details);
  if (!d.name && !d.email && !d.phone) throw new FieldError("name", "Give them a name, an email or a phone number.");
  return withSite(p.siteId, async (tx) => {
    if (d.email) {
      const [existing] = await tx.select().from(contacts).where(and(eq(contacts.email, d.email), isNull(contacts.deletedAt))).limit(1);
      if (existing) throw new FieldError("email", `${d.email} is already a contact${existing.name ? ` (${existing.name})` : ""}.`);
    }
    const [row] = await tx.insert(contacts).values({ siteId: p.siteId, ...d }).returning();
    return row;
  });
}

export async function updateContact(p: { actorId: string; siteId: string; contactId: string; details: unknown }): Promise<Contact> {
  await assertAccess(p.actorId, p.siteId);
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
    return row;
  });
}

export async function addNote(p: { actorId: string; siteId: string; contactId: string; text: string }): Promise<Contact> {
  await assertAccess(p.actorId, p.siteId);
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
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx.update(contacts).set({ deletedAt: new Date() }).where(and(eq(contacts.id, p.contactId), isNull(contacts.deletedAt))).returning({ id: contacts.id }),
  );
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
