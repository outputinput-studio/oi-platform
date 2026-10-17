import { eq } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { sites } from "@/db/schema";
import { platformBases } from "@/lib/env";
import { cleanDomain } from "@/lib/domains";
import { canManageSendingDomains, createSendingDomain, deleteSendingDomain, getSendingDomain, ResendError, verifySendingDomain, type SendingDomain } from "@/lib/email";
import { FieldError, named } from "@/lib/form-error";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { readSendDomain, type SendDomain } from "./business";
import { logActivity } from "@/modules/activity/server";

/**
 * Settings · Sending, your own domain: emails to customers come from
 * orders@kinikouture.com.au instead of the platform's address. Set up in
 * the platform's Resend account (it gives the SPF and DKIM records to add);
 * nothing changes for customers until Resend has seen them.
 */

export type SendDomainView = { setUp: SendDomain | null; available: boolean };

const localSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9._-]{0,40}$/, "Letters, numbers, dots and dashes before the @, like orders.");

async function current(siteId: string) {
  const [s] = await withSite(siteId, (tx) => tx.select({ messages: sites.messages }).from(sites).where(eq(sites.id, siteId)).limit(1));
  if (!s) throw new AccessError("That site doesn't exist.");
  return s.messages ?? {};
}

async function store(siteId: string, value: SendDomain | null) {
  await withSite(siteId, async (tx) => {
    const [s] = await tx.select({ messages: sites.messages }).from(sites).where(eq(sites.id, siteId)).limit(1);
    const next: Record<string, unknown> = { ...(s?.messages ?? {}) };
    if (value) next.sendDomain = value;
    else delete next.sendDomain;
    await tx.update(sites).set({ messages: next }).where(eq(sites.id, siteId));
  });
}

const fromResend = (d: SendingDomain, prev: Pick<SendDomain, "local" | "name">): SendDomain => ({
  name: prev.name,
  local: prev.local,
  resendId: d.id,
  status: d.status,
  records: d.records.map((r) => ({ record: r.record, name: r.name, type: r.type, value: r.value, ...(typeof r.priority === "number" ? { priority: r.priority } : {}), status: r.status })),
  checkedAt: new Date().toISOString(),
});

/** Where it stands; refreshed from Resend when email is set up. */
export async function sendingDomainStatus(p: { actorId: string; siteId: string }): Promise<SendDomainView> {
  await assertAccess(p.actorId, p.siteId);
  const own = readSendDomain(await current(p.siteId));
  const available = canManageSendingDomains();
  if (!own || !available) return { setUp: own, available };
  try {
    const fresh = fromResend(await getSendingDomain(own.resendId), own);
    await store(p.siteId, fresh);
    return { setUp: fresh, available };
  } catch (err) {
    console.error("resend domain check failed", err);
    return { setUp: own, available };
  }
}

/** Owners start it: Resend makes the records to add. */
export async function setUpSendingDomain(p: { actorId: string; siteId: string; domain: string; local: string }): Promise<SendDomainView> {
  await assertAccess(p.actorId, p.siteId, "owner");
  if (!canManageSendingDomains()) throw new Error("Email isn't set up on the platform yet, so this has to wait.");
  const clean = cleanDomain(p.domain, platformBases());
  if (!clean.ok) throw new FieldError("domain", clean.message);
  const local = named("local", localSchema, p.local || "orders");
  if (readSendDomain(await current(p.siteId))) throw new FieldError("domain", "There's a sending domain already. Remove it first to use another.");
  let d: SendingDomain;
  try {
    d = await createSendingDomain(clean.domain);
  } catch (err) {
    if (err instanceof ResendError && (err.status === 403 || err.status === 409 || /already/i.test(err.message))) throw new FieldError("domain", "That domain is already set up for sending on output/input. If it's yours, get in touch and we'll sort it out.");
    if (err instanceof ResendError && err.status === 422) throw new FieldError("domain", "Resend won't take that domain. Check it's spelt right.");
    throw err;
  }
  const value = fromResend(d, { name: clean.domain, local });
  await store(p.siteId, value);
  await logActivity(p.siteId, p.actorId, { action: "started sending from {s}", subject: `${local}@${clean.domain}`, href: "/settings/sending" });
  return { setUp: value, available: true };
}

/** "Check now": Resend looks for the records again. */
export async function checkSendingDomain(p: { actorId: string; siteId: string }): Promise<SendDomainView> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const own = readSendDomain(await current(p.siteId));
  if (!own) throw new Error("There's no sending domain to check.");
  await verifySendingDomain(own.resendId);
  return sendingDomainStatus(p);
}

/** Owners remove it: emails go back to coming from the platform's address. */
export async function removeSendingDomain(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const own = readSendDomain(await current(p.siteId));
  if (!own) return;
  if (canManageSendingDomains()) await deleteSendingDomain(own.resendId);
  await store(p.siteId, null);
  await logActivity(p.siteId, p.actorId, { action: "stopped sending from {s}", subject: own.name, href: "/settings/sending" });
}
