import { z } from "zod";
import { readSearchSettings } from "./search";

/**
 * Settings · Business profile and Settings · Sending, as in
 * design/admin.html. Pure, so the admin and the emails read them the same.
 *
 * The profile is who the business is: it signs customer emails, makes the
 * order confirmation a tax invoice (with the business number), tells
 * pickup customers where to come, and tells Google who runs the site.
 *
 * Sending is how its email reads: the name it comes from and where
 * replies go. Mail still leaves from the platform's address until the
 * site's own sending domain is set up (Settings · Domain, later).
 */

const optionalEmail = z
  .string()
  .trim()
  .toLowerCase()
  .max(200)
  .refine((s) => s === "" || z.string().email().safeParse(s).success, "That email address doesn't look right.");

export const businessSchema = z.object({
  /** The name customers know: "Kini Kouture". Empty: the site's name. */
  tradingName: z.string().trim().max(120).default(""),
  /** Printed as typed: "ABN 48 219 774 301", "Tax ID 0105561234567". */
  businessNumber: z.string().trim().max(60).default(""),
  phone: z.string().trim().max(40).default(""),
  email: optionalEmail.default(""),
  /** Lines as typed. Pickup orders show it, with the hours. */
  address: z.string().trim().max(400).default(""),
  hours: z.string().trim().max(120).default(""),
});
export type Business = z.infer<typeof businessSchema>;

export function readBusiness(raw: unknown): Business {
  const r = businessSchema.safeParse(raw ?? {});
  return r.success ? r.data : businessSchema.parse({});
}

/**
 * A display name can't carry anything an email header would read as
 * structure: no angle brackets, quotes, commas, semicolons or line breaks.
 */
const displayName = z
  .string()
  .trim()
  .max(80)
  .transform((s) => s.replace(/[<>"\\,;:\r\n\t]/g, " ").replace(/\s+/g, " ").trim());

export const sendingSchema = z.object({
  /** "Shown as from". Empty: the trading name, else the site's name. */
  fromName: displayName.default(""),
  /** "Replies go to". Empty: the business email; with neither, replies go nowhere useful. */
  replyTo: optionalEmail.default(""),
});
export type Sending = z.infer<typeof sendingSchema>;

/** The whole messages column: sending now; templates and who's told arrive with later screens. */
export const messagesSchema = z.object({ sending: sendingSchema.default({ fromName: "", replyTo: "" }) }).passthrough();

export function readSending(raw: unknown): Sending {
  const r = sendingSchema.safeParse((raw as { sending?: unknown } | null)?.sending ?? {});
  return r.success ? r.data : sendingSchema.parse({});
}

type SiteLike = { name: string; business: unknown; search?: unknown };

/**
 * The profile, with what an older site put in Search engines (name, phone,
 * email) standing in until the profile is first saved — saving it takes
 * those over.
 */
export function businessOf(site: SiteLike): Business {
  const b = readBusiness(site.business);
  const old = readSearchSettings(site.search ?? {}).business;
  return { ...b, tradingName: b.tradingName || old.name, phone: b.phone || old.phone, email: b.email || old.email.toLowerCase() };
}

/** How a customer email from this site is addressed: the name it's from and where a reply lands. */
export function senderFor(site: SiteLike & { messages: unknown }): { fromName: string; replyTo?: string } {
  const b = businessOf(site);
  const s = readSending(site.messages);
  const fromName = displayName.parse(s.fromName || b.tradingName || site.name);
  const replyTo = s.replyTo || b.email;
  return replyTo ? { fromName, replyTo } : { fromName };
}

/** The name to sign with and show customers. */
export function tradingName(site: SiteLike): string {
  return businessOf(site).tradingName || site.name;
}
