import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { forms, memberships, submissions, users, type Form, type Submission, type SubmissionStatus } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { sendEmail } from "@/lib/email";
import { upsertFromSubmission } from "@/modules/contacts/server";
import { answersSchema, fieldsSchema, fillIn, formSettingsSchema, headlineAnswer, senderOf, splitEmails, type Field, type FormSettings } from "./fields";

/**
 * Forms and what comes through them.
 *
 * The team side (list, create, edit, inbox) authorises the actor first,
 * like every module. The public side — submitForm — has no actor: it's a
 * visitor on the storefront, and the site is the one the hostname named.
 * Everything still runs under withSite(), so a form id from another site
 * is simply not found.
 */

export type FormWithFields = Omit<Form, "fields"> & { fields: Field[] };
export type SubmissionRow = Omit<Submission, "fields"> & { fields: Field[]; formName: string };

function parsed(f: Form): FormWithFields {
  const r = fieldsSchema.safeParse(f.fields);
  return { ...f, fields: r.success ? r.data : [] };
}

export async function listForms(p: { actorId: string; siteId: string }): Promise<(FormWithFields & { newCount: number })[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    const rows = await tx.select().from(forms).where(isNull(forms.deletedAt)).orderBy(asc(forms.createdAt));
    const counts = await tx
      .select({ formId: submissions.formId, n: count() })
      .from(submissions)
      .where(eq(submissions.status, "new"))
      .groupBy(submissions.formId);
    const byForm = new Map(counts.map((c) => [c.formId, Number(c.n)]));
    return rows.map((f) => ({ ...parsed(f), newCount: byForm.get(f.id) ?? 0 }));
  });
}

export async function getForm(p: { actorId: string; siteId: string; formId: string }): Promise<FormWithFields> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) => tx.select().from(forms).where(and(eq(forms.id, p.formId), isNull(forms.deletedAt))).limit(1));
  if (!row) throw new AccessError("That form doesn't exist.");
  return parsed(row);
}

/** A form for the storefront: no actor, the site from the hostname. Null when it isn't this site's. */
export async function publicForm(p: { siteId: string; formId: string }): Promise<FormWithFields | null> {
  if (!z.string().uuid().safeParse(p.formId).success) return null;
  const [row] = await withSite(p.siteId, (tx) => tx.select().from(forms).where(and(eq(forms.id, p.formId), isNull(forms.deletedAt))).limit(1));
  return row ? parsed(row) : null;
}

/** A new form starts with the three fields nearly every form has. */
export async function createForm(p: { actorId: string; siteId: string; name: string }): Promise<FormWithFields> {
  await assertAccess(p.actorId, p.siteId);
  const name = z.string().trim().min(1, "Give the form a name.").max(80).parse(p.name);
  const fields: Field[] = [
    { id: "name", type: "text", label: "Your name", help: "", required: true, options: [] },
    { id: "email", type: "email", label: "Email", help: "", required: true, options: [] },
    { id: "message", type: "longText", label: "Your message", help: "", required: true, options: [] },
  ];
  const [row] = await withSite(p.siteId, (tx) => tx.insert(forms).values({ siteId: p.siteId, name, fields }).returning());
  return parsed(row);
}

export async function updateForm(p: { actorId: string; siteId: string; formId: string; settings: unknown }): Promise<FormWithFields> {
  await assertAccess(p.actorId, p.siteId);
  const s: FormSettings = formSettingsSchema.parse(p.settings);
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(forms)
      .set({ ...s, updatedAt: new Date() })
      .where(and(eq(forms.id, p.formId), isNull(forms.deletedAt)))
      .returning(),
  );
  if (!row) throw new AccessError("That form doesn't exist.");
  return parsed(row);
}

/** Soft delete. Submissions stay in the inbox under the form's name. */
export async function deleteForm(p: { actorId: string; siteId: string; formId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx.update(forms).set({ deletedAt: new Date() }).where(and(eq(forms.id, p.formId), isNull(forms.deletedAt))).returning(),
  );
  if (!row) throw new AccessError("That form doesn't exist.");
}

// ───────────────────────── the public side ─────────────────────────

/**
 * A visitor sends a form. Answers are checked against the form's fields
 * as they are right now, and a copy of those fields is stored with the
 * answers so the inbox can label them for ever. Then the team is told by
 * email; a failed email never loses the submission.
 *
 * `trap` is a field the page keeps hidden; a bot that fills it in gets a
 * thank-you and nothing is stored.
 */
export async function submitForm(p: { siteId: string; formId: string; answers: unknown; trap?: string; siteName: string; inboxUrl: string }): Promise<{ ok: true; message: string }> {
  const form = await publicForm({ siteId: p.siteId, formId: p.formId });
  if (!form) throw new AccessError("That form isn't on this site.");
  if (p.trap) return { ok: true, message: form.afterMessage };
  const answers: Record<string, string> = answersSchema(form.fields).parse(p.answers ?? {});

  const sender = senderOf(form.fields, answers);
  const row = await withSite(p.siteId, async (tx) => {
    // The person first, so the submission can point at them.
    const phoneField = form.fields.find((f) => f.type === "phone" && answers[f.id]);
    const contactId = form.createContact ? await upsertFromSubmission(tx, { siteId: p.siteId, name: sender.name, email: sender.email, phone: phoneField ? answers[phoneField.id] : "" }) : null;
    const [r] = await tx.insert(submissions).values({ siteId: p.siteId, formId: form.id, answers, fields: form.fields, contactId }).returning();
    return r;
  });

  try {
    const to = splitEmails(form.notifyEmails);
    const recipients = to.length ? to : await ownerEmails(p.siteId);
    const who = sender.name || sender.email || "Someone";
    const lines = form.fields.map((f) => `${f.label}\n${answers[f.id] || "—"}`).join("\n\n");
    await Promise.all(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `${who} sent ${form.name} on ${p.siteName}`,
          text: `${lines}\n\nSee it in your inbox: ${p.inboxUrl}/${row.id}${sender.email ? `\nReply to them: ${sender.email}` : ""}`,
        }),
      ),
    );
  } catch (err) {
    console.error("submission email failed", err);
  }

  // The reply to them, if the form sends one and they left an address.
  if (form.autoReply && sender.email) {
    try {
      await sendEmail({
        to: sender.email,
        subject: fillIn(form.replySubject, form.fields, answers) || `Thanks for writing to ${p.siteName}`,
        text: fillIn(form.replyMessage, form.fields, answers) || `We have your message and will be in touch.\n\n${p.siteName}`,
      });
    } catch (err) {
      console.error("auto-reply failed", err);
    }
  }
  return { ok: true, message: fillIn(form.afterMessage, form.fields, answers) };
}

/** Owners' addresses, for a form with no "send to". Platform tables, so outside withSite(). */
async function ownerEmails(siteId: string): Promise<string[]> {
  const rows = await db
    .select({ email: users.email })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.siteId, siteId), eq(memberships.role, "owner")));
  return rows.map((r) => r.email);
}

// ───────────────────────── the inbox ─────────────────────────

export async function listSubmissions(p: { actorId: string; siteId: string; formId?: string; status?: SubmissionStatus }): Promise<SubmissionRow[]> {
  await assertAccess(p.actorId, p.siteId);
  const status = p.status ?? "new";
  return withSite(p.siteId, async (tx) => {
    const rows = await tx
      .select({ s: submissions, formName: forms.name })
      .from(submissions)
      .innerJoin(forms, eq(forms.id, submissions.formId))
      .where(and(eq(submissions.status, status), p.formId ? eq(submissions.formId, p.formId) : undefined))
      .orderBy(desc(submissions.createdAt))
      .limit(200);
    return rows.map(({ s, formName }) => ({ ...s, fields: safeFields(s.fields), formName }));
  });
}

export async function getSubmission(p: { actorId: string; siteId: string; submissionId: string }): Promise<SubmissionRow> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx.select({ s: submissions, formName: forms.name }).from(submissions).innerJoin(forms, eq(forms.id, submissions.formId)).where(eq(submissions.id, p.submissionId)).limit(1),
  );
  if (!row) throw new AccessError("That submission doesn't exist.");
  return { ...row.s, fields: safeFields(row.s.fields), formName: row.formName };
}

export async function setSubmissionStatus(p: { actorId: string; siteId: string; submissionId: string; status: SubmissionStatus }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(submissions)
      .set({ status: p.status, doneAt: p.status === "done" ? new Date() : null })
      .where(eq(submissions.id, p.submissionId))
      .returning({ id: submissions.id }),
  );
  if (!row) throw new AccessError("That submission doesn't exist.");
}

/** How many are waiting: the badge on Inbox. */
export async function newSubmissionCount(p: { siteId: string }): Promise<number> {
  const [r] = await withSite(p.siteId, (tx) => tx.select({ n: count() }).from(submissions).where(eq(submissions.status, "new")));
  return Number(r?.n ?? 0);
}

function safeFields(raw: unknown): Field[] {
  const r = fieldsSchema.safeParse(raw);
  return r.success ? r.data : [];
}

export { headlineAnswer, senderOf };
