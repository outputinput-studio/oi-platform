import { z } from "zod";
import { readSending, senderFor, sendingSchema } from "./business";

/**
 * Settings · Customer emails and Settings · Who gets notified, as in
 * design/admin.html. Pure: the admin, the order screens and the emails all
 * read templates and recipients from here.
 *
 * Templates are the four order emails. Empty means the default wording;
 * {fill-ins} are swapped in when an email is drafted. The confirmation
 * always carries the receipt and, with a business number, the tax-invoice
 * lines: wording can change, those can't be lost.
 *
 * Who gets notified covers the emails that come to the team. Empty "Goes
 * to" means the site's owners, as it always has; each event can be
 * switched off.
 */

export const TEMPLATE_KEYS = ["confirmed", "inProgress", "sent", "done"] as const;
export type TemplateKey = (typeof TEMPLATE_KEYS)[number];
export type Template = { subject: string; body: string };

export const DEFAULT_TEMPLATES: Record<TemplateKey, Template> = {
  confirmed: {
    subject: "Thanks {name}, we have your order ({order})",
    body: "Hi {name},\n\nThanks for your order from {business}. Here's what you bought:\n\n{receipt}\n\nWe'll be in touch as it moves along.\n\n{business}",
  },
  inProgress: {
    subject: "I've started on your {product}",
    body: "Hi {name},\n\nJust letting you know I've started on your {product}. I'll be in touch when it's on its way.\n\n{business}",
  },
  sent: {
    subject: "Your {product} is on its way",
    body: "Hi {name},\n\nYour {product} went out today.\n\n{tracking}\n\n{business}",
  },
  done: {
    subject: "Thanks again, {name}",
    body: "Hi {name},\n\nThanks again for your order. I hope you love it.\n\n{business}",
  },
};

/** The fill-ins each email offers, for the editor's hint. */
export const FILL_INS: Record<TemplateKey, string[]> = {
  confirmed: ["{name}", "{full name}", "{order}", "{product}", "{business}", "{receipt}"],
  inProgress: ["{name}", "{full name}", "{order}", "{product}", "{business}"],
  sent: ["{name}", "{full name}", "{order}", "{product}", "{business}", "{tracking}"],
  done: ["{name}", "{full name}", "{order}", "{product}", "{business}"],
};

/**
 * Swap {fill-ins} in: case and spacing inside the braces don't matter; one
 * that isn't known stays as typed, so a mistake shows rather than vanishes.
 * Empty fill-ins leave no stack of blank lines behind.
 */
export function fillTemplate(text: string, vars: Record<string, string>): string {
  const known = Object.fromEntries(Object.entries(vars).map(([k, v]) => [k.toLowerCase(), v]));
  return text
    .replace(/\{([^{}]{1,40})\}/g, (whole, key: string) => {
      const k = key.trim().toLowerCase().replace(/\s+/g, " ");
      return k in known ? known[k] : whole;
    })
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

const templateSchema = z.object({
  subject: z.string().trim().max(200).default(""),
  body: z.string().trim().max(5000).default(""),
});

const emailList = z
  .string()
  .trim()
  .max(600)
  .refine(
    (s) =>
      splitList(s).every((e) => z.string().email().safeParse(e).success),
    "One of the addresses doesn't look right.",
  )
  .refine((s) => splitList(s).length <= 10, "Ten addresses at most.")
  .default("");

export const recipientsSchema = z.object({
  /** Off: nobody is emailed (it still lands where it lands: Orders, Inbox). */
  on: z.boolean().default(true),
  /** Comma separated. Empty: the site's owners. */
  to: emailList,
  cc: emailList,
  bcc: emailList,
});
export type Recipients = z.infer<typeof recipientsSchema>;

export const NOTIFY_EVENTS = ["newOrder", "lowStock", "paymentFailed"] as const;
export type NotifyEvent = (typeof NOTIFY_EVENTS)[number];

const noRecipients: Recipients = { on: true, to: "", cc: "", bcc: "" };
export const templatesSchema = z.object({
  confirmed: templateSchema.default({ subject: "", body: "" }),
  inProgress: templateSchema.default({ subject: "", body: "" }),
  sent: templateSchema.default({ subject: "", body: "" }),
  done: templateSchema.default({ subject: "", body: "" }),
});
export const notifySchema = z.object({
  newOrder: recipientsSchema.default(noRecipients),
  lowStock: recipientsSchema.default(noRecipients),
  paymentFailed: recipientsSchema.default(noRecipients),
});

export const messagesSchema = z.object({
  sending: sendingSchema.default({ fromName: "", replyTo: "" }),
  /** Every email to a customer is blind copied to the business's reply address. */
  keepCopy: z.boolean().default(false),
  templates: templatesSchema.default({ confirmed: { subject: "", body: "" }, inProgress: { subject: "", body: "" }, sent: { subject: "", body: "" }, done: { subject: "", body: "" } }),
  notify: notifySchema.default({ newOrder: noRecipients, lowStock: noRecipients, paymentFailed: noRecipients }),
});
export type Messages = z.infer<typeof messagesSchema>;

/** Each part read on its own, so one bad part falls back without taking the others with it. */
export function readMessages(raw: unknown): Messages {
  const r = (raw ?? {}) as Record<string, unknown>;
  const part = <T>(schema: z.ZodType<T>, v: unknown, fallback: T): T => {
    const p = schema.safeParse(v ?? undefined);
    return p.success ? p.data : fallback;
  };
  const base = messagesSchema.parse({});
  return {
    sending: readSending(raw),
    keepCopy: r.keepCopy === true,
    templates: part(templatesSchema, r.templates, base.templates),
    notify: part(notifySchema, r.notify, base.notify),
  };
}

/** The wording to use: the site's own, or the default for any part left empty. */
export function templateFor(m: Messages, key: TemplateKey): Template {
  const t = m.templates[key];
  return { subject: t.subject || DEFAULT_TEMPLATES[key].subject, body: t.body || DEFAULT_TEMPLATES[key].body };
}

export function splitList(s: string): string[] {
  return s
    .split(/[,;\s]+/)
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Who a team email goes to: off is null; an empty "Goes to" is the
 * owners. CC and BCC never repeat someone already on it.
 */
export function recipientsFor(r: Recipients, owners: string[]): { to: string[]; cc: string[]; bcc: string[] } | null {
  if (!r.on) return null;
  const to = splitList(r.to).length ? splitList(r.to) : owners;
  if (to.length === 0) return null;
  const cc = splitList(r.cc).filter((e) => !to.includes(e));
  const bcc = splitList(r.bcc).filter((e) => !to.includes(e) && !cc.includes(e));
  return { to, cc, bcc };
}

/** How an email to a customer goes out: the business's name, its reply address, and a copy for the business when it keeps one. */
export function customerMail(site: { name: string; business: unknown; messages: unknown; search?: unknown }): { fromName: string; replyTo?: string; fromAddress?: string; bcc?: string[] } {
  const s = senderFor(site);
  const keep = readMessages(site.messages).keepCopy;
  return keep && s.replyTo ? { ...s, bcc: [s.replyTo] } : s;
}
