import { and, count, eq, gt } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { activity, sites, users } from "@/db/schema";
import { assertAccess } from "@/modules/auth/access";
import { supportContact } from "@/modules/auth/support";
import { logActivity } from "@/modules/activity/server";
import { env } from "@/lib/env";
import { sendEmail } from "@/lib/email";

/**
 * Get help (Stage 41, design/admin.html "Ask us"): anyone on the team writes
 * to output/input from the admin. "We can see which screen you were on" —
 * the screen, the site and who they are go with the message, to the
 * OI_SUPPORT_EMAILS inbox, with their address to reply to.
 */
export const HELP_TOPICS = ["broken", "question"] as const;
const PER_DAY = 10;

export const helpSchema = z.object({
  topic: z.enum(HELP_TOPICS, { error: "Pick what it's about." }),
  message: z.string().trim().min(1, "Write a line or two first.").max(4000, "That's a lot — keep it under 4,000 characters, or email us."),
  /** The admin screen they came from, as a public path. Anything else is dropped. */
  from: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[A-Za-z0-9/_\-.?=&%]*$/)
    .optional()
    .catch(undefined),
});

/** Shown under "Or reach us directly": only what's set in Vercel. Never the support sign-in addresses. */
export function helpContact(): { email?: string; phone?: string; hours?: string } {
  const e = env();
  return { email: e.OI_HELP_EMAIL, phone: e.OI_HELP_PHONE, hours: e.OI_HELP_HOURS };
}

export async function askForHelp(p: { actorId: string; siteId: string; input: unknown }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const d = helpSchema.parse(p.input);
  const since = new Date(Date.now() - 86_400_000);
  const [{ n }] = await withSite(p.siteId, (tx) =>
    tx
      .select({ n: count() })
      .from(activity)
      .where(and(eq(activity.actorId, p.actorId), eq(activity.action, "asked us for help"), gt(activity.createdAt, since))),
  );
  if (n >= PER_DAY) throw new Error("You've sent us a lot today. Email us instead and we'll pick it up.");

  const to = supportContact()?.emails ?? [];
  if (!to.length) throw new Error("Messages to us aren't set up here yet. Email us instead.");
  const [who] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, p.actorId)).limit(1);
  const [site] = await withSite(p.siteId, (tx) => tx.select({ name: sites.name, slug: sites.slug }).from(sites).limit(1));
  const what = d.topic === "broken" ? "Something's broken" : "A question";
  await sendEmail({
    to,
    replyTo: who?.email,
    subject: `${what} — ${site?.name ?? "a site"}`,
    text: [
      d.message,
      "",
      "—",
      `From ${who?.name || who?.email} (${who?.email})`,
      `Site ${site?.name} (${site?.slug})`,
      `Screen ${d.from ?? "not known"}`,
    ].join("\n"),
  });
  await logActivity(p.siteId, p.actorId, { action: "asked us for help", href: "/help" });
}
