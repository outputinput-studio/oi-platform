import { and, asc, count, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { forms, memberships, products, sites, submissions, users, type Form, type Submission, type SubmissionStatus } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { sendEmail } from "@/lib/email";
import { upsertFromSubmission } from "@/modules/contacts/server";
import { senderFor } from "@/modules/sites/business";
import { storage } from "@/lib/storage";
import { answersSchema, fieldsSchema, filesIn, fillIn, formSettingsSchema, headlineAnswer, senderOf, splitEmails, uploadedFileSchema, type Field, type FormSettings, type UploadedFile } from "./fields";

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
    const rows = await tx.select().from(forms).where(isNull(forms.deletedAt)).orderBy(asc(forms.position), asc(forms.createdAt));
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
  const row = await withSite(p.siteId, async (tx) => {
    // New forms go last.
    const [last] = await tx.select({ n: count() }).from(forms).where(isNull(forms.deletedAt));
    const [r] = await tx.insert(forms).values({ siteId: p.siteId, name, fields, position: Number(last?.n ?? 0) }).returning();
    return r;
  });
  return parsed(row);
}

/** The whole order from a drag; must name every live form exactly once. */
export async function reorderForms(p: { actorId: string; siteId: string; order: string[] }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, async (tx) => {
    const live = await tx.select({ id: forms.id, position: forms.position }).from(forms).where(isNull(forms.deletedAt));
    const want = new Set(p.order);
    if (want.size !== p.order.length || live.length !== p.order.length || !live.every((f) => want.has(f.id))) {
      throw new Error("The list changed under you. Reload and try again.");
    }
    for (let i = 0; i < p.order.length; i++) {
      await tx.update(forms).set({ position: i }).where(eq(forms.id, p.order[i]));
    }
  });
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

const UPLOAD_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
};
export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

/**
 * A visitor's file, sent ahead of the form so each goes in its own
 * request (the platform caps a request at 4.5 MB). It only lands if the
 * form is this site's and has that file field. The bytes go under the
 * site's folder in the bucket, apart from the image library; the key
 * comes back for the answer. Nothing is written to the database until
 * the form itself is sent, so a stray upload is just an unreferenced
 * object.
 */
export async function uploadSubmissionFile(p: { siteId: string; formId: string; fieldId: string; filename: string; contentType: string; bytes: Uint8Array }): Promise<UploadedFile> {
  const form = await publicForm({ siteId: p.siteId, formId: p.formId });
  if (!form || !form.fields.some((f) => f.id === p.fieldId && f.type === "file")) throw new AccessError("That form doesn't take files.");
  const ext = UPLOAD_TYPES[p.contentType];
  if (!ext) throw new Error("Use a JPG, PNG, WebP, GIF or PDF.");
  if (p.bytes.byteLength === 0) throw new Error("That file is empty.");
  if (p.bytes.byteLength > MAX_UPLOAD_BYTES) throw new Error("That file is too big. Keep it under 4 MB.");
  const s = storage();
  if (!s) throw new Error("Uploads aren't available right now.");
  const key = `${p.siteId}/forms/${crypto.randomUUID()}.${ext}`;
  await s.put(key, p.bytes, p.contentType);
  return uploadedFileSchema.parse({ key, name: p.filename.trim().slice(0, 200) || `file.${ext}`, size: p.bytes.byteLength, type: p.contentType });
}

/** Where a visitor's file can be seen, for the inbox and the email. Empty when storage is off. */
export function fileUrl(key: string): string {
  return storage()?.url(key) ?? "";
}

/**
 * A visitor sends a form. Answers are checked against the form's fields
 * as they are right now, and a copy of those fields is stored with the
 * answers so the inbox can label them for ever. Then the team is told by
 * email; a failed email never loses the submission.
 *
 * `about` is a product id, when the form was opened from a product page
 * ("Enquire about this"). The product is looked up here, never taken from
 * the browser, and named in an extra "About" answer at the top.
 *
 * `trap` is a field the page keeps hidden; a bot that fills it in gets a
 * thank-you and nothing is stored.
 */
export async function submitForm(p: { siteId: string; formId: string; answers: unknown; about?: string; trap?: string; siteName: string; inboxUrl: string }): Promise<{ ok: true; message: string }> {
  const form = await publicForm({ siteId: p.siteId, formId: p.formId });
  if (!form) throw new AccessError("That form isn't on this site.");
  if (p.trap) return { ok: true, message: form.afterMessage };
  const answers: Record<string, string> = answersSchema(form.fields).parse(p.answers ?? {});
  // A file key must be one of this site's: the form can't be used to point at another site's objects.
  for (const f of form.fields) {
    if (f.type === "file" && filesIn(answers[f.id]).some((u) => !u.key.startsWith(`${p.siteId}/forms/`))) throw new AccessError("Those files aren't from this site.");
  }
  const about = p.about && z.string().uuid().safeParse(p.about).success ? await productNamed(p.siteId, p.about) : null;
  const extra: Field[] = about ? [ABOUT_FIELD] : [];
  await recordSubmission({ siteId: p.siteId, form, fields: [...extra, ...form.fields], answers: about ? { [ABOUT_FIELD.id]: about, ...answers } : answers, siteName: p.siteName, inboxUrl: p.inboxUrl, autoReply: true });
  return { ok: true, message: fillIn(form.afterMessage, form.fields, answers) };
}

/**
 * The "About" answer the site adds itself. A choice, so it is never taken
 * for the sender's name (the first short text) or their message.
 */
export const ABOUT_FIELD: Field = { id: "_about", type: "choice", label: "About", help: "", required: false, options: [] };

/** "Costume — blue feather set (/shop/costume-blue)": a visible product of this site, or null. */
async function productNamed(siteId: string, productId: string): Promise<string | null> {
  const [r] = await withSite(siteId, (tx) =>
    tx
      .select({ name: products.name, slug: products.slug })
      .from(products)
      .where(and(eq(products.id, productId), eq(products.visible, true), isNull(products.deletedAt)))
      .limit(1),
  );
  return r ? `${r.name} (/shop/${r.slug})` : null;
}

/**
 * Store a submission and tell the team: the shared second half of a form
 * being sent. Also how the shop files a delivery-quote request — fields and
 * answers it writes itself, under the site's enquiry form. `fields` is what
 * the inbox labels the answers with; `form` decides contacts, who's told
 * and the auto-reply.
 */
export async function recordSubmission(p: {
  siteId: string;
  form: FormWithFields;
  fields: Field[];
  answers: Record<string, string>;
  siteName: string;
  inboxUrl: string;
  /** Send the form's own auto-reply (when it has one). Off when the answers aren't the form's fields. */
  autoReply: boolean;
  /** "Amelia sent Commission enquiry" → "Amelia asked for a delivery quote". */
  subject?: string;
}): Promise<Submission> {
  const { form, fields, answers } = p;
  const sender = senderOf(fields, answers);
  const { row, site } = await withSite(p.siteId, async (tx) => {
    // The person first, so the submission can point at them.
    const phoneField = fields.find((f) => f.type === "phone" && answers[f.id]);
    const contactId = form.createContact ? await upsertFromSubmission(tx, { siteId: p.siteId, name: sender.name, email: sender.email, phone: phoneField ? answers[phoneField.id] : "" }) : null;
    const [r] = await tx.insert(submissions).values({ siteId: p.siteId, formId: form.id, answers, fields, contactId }).returning();
    const [s] = await tx.select({ name: sites.name, business: sites.business, messages: sites.messages, search: sites.search }).from(sites).limit(1);
    return { row: r, site: s };
  });

  try {
    const to = splitEmails(form.notifyEmails);
    const recipients = to.length ? to : await ownerEmails(p.siteId);
    const who = sender.name || sender.email || "Someone";
    const lines = fields
      .map((f) => `${f.label}\n${f.type === "file" ? filesIn(answers[f.id]).map((u) => `${u.name}: ${fileUrl(u.key)}`).join("\n") || "—" : answers[f.id] || "—"}`)
      .join("\n\n");
    await Promise.all(
      recipients.map((email) =>
        sendEmail({
          to: email,
          subject: `${who} ${p.subject ?? `sent ${form.name}`} on ${p.siteName}`,
          text: `${lines}\n\nSee it in your inbox: ${p.inboxUrl}/${row.id}${sender.email ? `\nReply to them: ${sender.email}` : ""}`,
          // Hitting reply writes to whoever sent it.
          ...(sender.email ? { replyTo: sender.email } : {}),
        }),
      ),
    );
  } catch (err) {
    console.error("submission email failed", err);
  }

  // The reply to them, if the form sends one and they left an address.
  if (p.autoReply && form.autoReply && sender.email) {
    try {
      await sendEmail({
        to: sender.email,
        subject: fillIn(form.replySubject, fields, answers) || `Thanks for writing to ${p.siteName}`,
        text: fillIn(form.replyMessage, fields, answers) || `We have your message and will be in touch.\n\n${p.siteName}`,
        ...(site ? senderFor(site) : {}),
      });
    } catch (err) {
      console.error("auto-reply failed", err);
    }
  }
  return row;
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
