import { z } from "zod";

/**
 * What a form is made of. A client picks field types and writes labels;
 * the storefront draws the inputs and this file checks what comes back.
 *
 * A field's id is minted when it is added and never changes, so answers
 * stay matched to their question even after the label is reworded.
 */
export const FIELD_TYPES = {
  text: { label: "Short text", description: "A name, a town, one line" },
  longText: { label: "Long text", description: "A message, a few paragraphs" },
  email: { label: "Email", description: "Checked to look like an address" },
  phone: { label: "Phone", description: "Digits, spaces and a plus sign" },
  choice: { label: "Single choice", description: "Pick one from a list you write" },
  date: { label: "Date", description: "A day, picked from a calendar" },
} as const;
export type FieldType = keyof typeof FIELD_TYPES;
export const FIELD_TYPE_LIST = Object.keys(FIELD_TYPES) as FieldType[];

export const fieldSchema = z.object({
  id: z.string().min(1).max(40),
  type: z.enum(FIELD_TYPE_LIST as [FieldType, ...FieldType[]]),
  label: z.string().trim().min(1, "Give the field a label.").max(120),
  help: z.string().trim().max(200).default(""),
  required: z.boolean().default(false),
  /** Only for `choice`. */
  options: z.array(z.string().trim().min(1).max(80)).max(30).default([]),
});
export type Field = z.infer<typeof fieldSchema>;

export const fieldsSchema = z.array(fieldSchema).max(40);

/** What the editor saves: everything about a form but its id. */
export const formSettingsSchema = z.object({
  name: z.string().trim().min(1, "Give the form a name.").max(80),
  fields: fieldsSchema,
  buttonText: z.string().trim().min(1).max(40),
  afterMessage: z.string().trim().min(1).max(600),
  /** Comma separated; each must be an address. Empty means the site's owners. */
  notifyEmails: z
    .string()
    .trim()
    .max(600)
    .refine((s) => splitEmails(s).every((e) => z.string().email().safeParse(e).success), "One of the addresses doesn't look right."),
  /** Whether a submission with an email address makes (or updates) a contact. */
  createContact: z.boolean().default(true),
  /** Reply to the sender straight away. Needs an email field to go anywhere. */
  autoReply: z.boolean().default(false),
  replySubject: z.string().trim().max(200).default(""),
  replyMessage: z.string().trim().max(5_000).default(""),
});
export type FormSettings = z.infer<typeof formSettingsSchema>;

export function splitEmails(s: string): string[] {
  return s
    .split(/[,\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/** A new field of a type, with a label to start from. */
export function newField(type: FieldType): Field {
  const label = { text: "Your name", longText: "Your message", email: "Email", phone: "Phone", choice: "Pick one", date: "Date" }[type];
  return fieldSchema.parse({ id: crypto.randomUUID().slice(0, 8), type, label, options: type === "choice" ? ["Option 1", "Option 2"] : [] });
}

/** The words under a field in the editor: "Short text · required". */
export function fieldSummary(f: Field): string {
  const t = f.type === "choice" ? `Single choice, ${f.options.length} option${f.options.length === 1 ? "" : "s"}` : FIELD_TYPES[f.type].label;
  return f.required ? `${t} · required` : t;
}

const PHONE = /^[+\d][\d\s().-]{4,29}$/;

/**
 * The validator for one form's answers, built from its fields. Every
 * answer is a string keyed by field id; empty strings are "not answered",
 * which is only an error for a required field.
 */
export function answersSchema(fields: Field[]) {
  const shape: Record<string, z.ZodType<string>> = {};
  for (const f of fields) {
    const base = z.string().trim().max(f.type === "longText" ? 5_000 : 300);
    const check = (v: string): string | null => {
      if (v === "") return f.required ? "This one's needed." : null;
      if (f.type === "email" && !z.string().email().safeParse(v).success) return "That doesn't look like an email address.";
      if (f.type === "phone" && !PHONE.test(v)) return "That doesn't look like a phone number.";
      if (f.type === "choice" && !f.options.includes(v)) return "Pick one of the options.";
      if (f.type === "date" && !/^\d{4}-\d{2}-\d{2}$/.test(v)) return "Pick a date.";
      return null;
    };
    shape[f.id] = base.default("").superRefine((v, ctx) => {
      const problem = check(v);
      if (problem) ctx.addIssue({ code: "custom", message: `${f.label}: ${problem}` });
    });
  }
  return z.object(shape);
}

/** The answer most worth showing in a list: the first long text, else the first text, else the first anything. */
export function headlineAnswer(fields: Field[], answers: Record<string, string>): string {
  const pick = (t: FieldType) => fields.find((f) => f.type === t && answers[f.id]);
  const f = pick("longText") ?? pick("text") ?? fields.find((f) => answers[f.id]);
  return f ? answers[f.id] : "";
}

/** Who sent it: the first email answer, with the first name-ish text answer in front when there is one. */
export function senderOf(fields: Field[], answers: Record<string, string>): { name: string; email: string } {
  const email = fields.find((f) => f.type === "email" && answers[f.id]);
  const name = fields.find((f) => f.type === "text" && answers[f.id]);
  return { name: name ? answers[name.id] : "", email: email ? answers[email.id] : "" };
}

/**
 * Fill-ins: {name} is the first short-text answer, and any field goes in
 * by its label, {Email} or {What are you after?}. Case doesn't matter.
 * An unanswered field fills in as nothing, so a sentence still reads.
 */
export function fillIn(template: string, fields: Field[], answers: Record<string, string>): string {
  const name = fields.find((f) => f.type === "text" && answers[f.id]);
  return template.replace(/\{([^{}]{1,120})\}/g, (whole, key: string) => {
    const k = key.trim().toLowerCase();
    if (k === "name") return name ? answers[name.id] : "";
    const f = fields.find((x) => x.label.trim().toLowerCase() === k);
    return f ? (answers[f.id] ?? "") : whole;
  });
}

/** The fill-ins a form offers, for the editor's hint. */
export function fillIns(fields: Field[]): string[] {
  return ["{name}", ...fields.map((f) => `{${f.label}}`)];
}
