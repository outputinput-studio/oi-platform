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
  /** Where a reply goes: the business, or the customer on a note to the team. */
  replyTo?: string;
  /** Copied in, visibly. */
  cc?: string[];
  /** Blind copies, e.g. the business keeping a copy of what customers get. */
  bcc?: string[];
};

/** "Kini Kouture <orders@outputinput.co>" from EMAIL_FROM's address and a display name. */
export function fromLine(emailFrom: string, name?: string): string {
  if (!name) return emailFrom;
  const address = emailFrom.match(/<([^>]+)>/)?.[1] ?? emailFrom.trim();
  const safe = name.replace(/[<>"\\,;:\r\n\t]/g, " ").replace(/\s+/g, " ").trim().slice(0, 80);
  return safe ? `${safe} <${address}>` : emailFrom;
}

export function emailDelivery(): "resend" | "console" {
  const e = env();
  return e.RESEND_API_KEY && e.EMAIL_FROM ? "resend" : "console";
}

export async function sendEmail(message: Email): Promise<{ delivered: boolean }> {
  const e = env();
  if (emailDelivery() === "console") {
    const meta = [message.fromName && `from ${message.fromName}`, message.replyTo && `reply-to ${message.replyTo}`, message.cc?.length && `cc ${message.cc.join(", ")}`, message.bcc?.length && `bcc ${message.bcc.join(", ")}`].filter(Boolean).join(" · ");
    console.log(`[email → ${[message.to].flat().join(", ")}${meta ? ` · ${meta}` : ""}] ${message.subject}\n${message.text}`);
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({
      from: fromLine(e.EMAIL_FROM!, message.fromName),
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
