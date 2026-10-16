import { env } from "@/lib/env";

/**
 * The one way the platform sends email.
 *
 * With RESEND_API_KEY and EMAIL_FROM set, mail goes out through Resend's
 * HTTP API (no SDK needed, it is one POST). Without them, the message is
 * logged instead, which is what local, CI and a fresh staging want.
 *
 * Returns whether the message was actually delivered to a provider, so the
 * caller can decide what to show (sign-in uses this to reveal the code on
 * screen outside production).
 */
export type Email = {
  /** One address, or several on the same email (they see each other). */
  to: string | string[];
  subject: string;
  text: string;
  /** Shown as who it's from, in front of the platform's sending address. Header-safe (see senderFor). */
  fromName?: string;
  /** The client's own address on a sending domain they've verified (orders@kinikouture.com.au); otherwise the platform's. */
  fromAddress?: string;
  /** Where a reply goes: the business, or the customer on a note to the team. */
  replyTo?: string;
  /** Copied in, visibly. */
  cc?: string[];
  /** Blind copies, e.g. the business keeping a copy of what customers get. */
  bcc?: string[];
};

/** "Kini Kouture <orders@outputinput.co>" from EMAIL_FROM's address (or the client's own) and a display name. */
export function fromLine(emailFrom: string, name?: string, ownAddress?: string): string {
  const address = ownAddress && /^[^\s<>@"]+@[^\s<>@"]+$/.test(ownAddress) ? ownAddress : (emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim());
  if (!name) return ownAddress ? address : emailFrom;
  const safe = name.replace(/[<>"\\,;:\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return safe ? `${safe} <${address}>` : ownAddress ? address : emailFrom;
}

export function emailDelivery(): "resend" | "console" {
  const e = env();
  return e.RESEND_API_KEY && e.EMAIL_FROM ? "resend" : "console";
}

export async function sendEmail(message: Email): Promise<{ delivered: boolean }> {
  const e = env();
  if (emailDelivery() === "console") {
    const meta = [message.fromName && `from ${message.fromName}${message.fromAddress ? ` <${message.fromAddress}>` : ""}`, message.replyTo && `reply-to ${message.replyTo}`, message.cc?.length && `cc ${message.cc.join(", ")}`, message.bcc?.length && `bcc ${message.bcc.join(", ")}`].filter(Boolean).join(" · ");
    console.log(`[email → ${[message.to].flat().join(", ")}${meta ? ` · ${meta}` : ""}] ${message.subject}\n${message.text}`);
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromLine(e.EMAIL_FROM!, message.fromName, message.fromAddress),
      to: [message.to].flat(),
      subject: message.subject,
      text: message.text,
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(message.cc?.length ? { cc: message.cc } : {}),
      ...(message.bcc?.length ? { bcc: message.bcc } : {}),
    }),
  });
  if (!res.ok) {
    throw new Error(`email: provider answered ${res.status} ${await res.text()}`);
  }
  return { delivered: true };
}

// ───────────────────────── sending domains ─────────────────────────

/**
 * A client's own sending domain, set up in the platform's Resend account:
 * Resend gives the DNS records (SPF and DKIM) that let it send as that
 * domain; once they're in, emails go out from it. Needs RESEND_API_KEY
 * with full access (sending-only keys can't manage domains).
 */
export type SendingRecord = { record: string; name: string; type: string; value: string; priority?: number; status: string };
export type SendingDomain = { id: string; name: string; status: string; records: SendingRecord[] };

export class ResendError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export function canManageSendingDomains(): boolean {
  return !!env().RESEND_API_KEY && !!env().EMAIL_FROM;
}

async function resend<T>(method: string, path: string, body?: unknown): Promise<T> {
  const key = env().RESEND_API_KEY;
  if (!key) throw new ResendError(0, "Email isn't set up on the platform yet.");
  const res = await fetch(`https://api.resend.com${path}`, {
    method,
    headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(15_000),
  });
  const json = (await res.json().catch(() => ({}))) as { message?: string } & T;
  if (!res.ok) throw new ResendError(res.status, json.message ?? `Resend answered ${res.status}`);
  return json;
}

const shape = (d: Partial<SendingDomain>): SendingDomain => ({ id: String(d.id ?? ""), name: String(d.name ?? ""), status: String(d.status ?? "not_started"), records: Array.isArray(d.records) ? d.records : [] });

export async function createSendingDomain(name: string): Promise<SendingDomain> {
  return shape(await resend<SendingDomain>("POST", "/domains", { name }));
}

export async function getSendingDomain(id: string): Promise<SendingDomain> {
  return shape(await resend<SendingDomain>("GET", `/domains/${encodeURIComponent(id)}`));
}

export async function verifySendingDomain(id: string): Promise<void> {
  await resend("POST", `/domains/${encodeURIComponent(id)}/verify`);
}

export async function deleteSendingDomain(id: string): Promise<void> {
  try {
    await resend("DELETE", `/domains/${encodeURIComponent(id)}`);
  } catch (err) {
    if (err instanceof ResendError && err.status === 404) return;
    throw err;
  }
}
