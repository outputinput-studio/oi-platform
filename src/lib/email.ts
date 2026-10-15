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
export type Email = { to: string; subject: string; text: string };

export function emailDelivery(): "resend" | "console" {
  const e = env();
  return e.RESEND_API_KEY && e.EMAIL_FROM ? "resend" : "console";
}

export async function sendEmail(message: Email): Promise<{ delivered: boolean }> {
  const e = env();
  if (emailDelivery() === "console") {
    console.log(`[email → ${message.to}] ${message.subject}\n${message.text}`);
    return { delivered: false };
  }
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${e.RESEND_API_KEY}`, "content-type": "application/json" },
    body: JSON.stringify({ from: e.EMAIL_FROM, to: [message.to], subject: message.subject, text: message.text }),
  });
  if (!res.ok) {
    throw new Error(`email: provider answered ${res.status} ${await res.text()}`);
  }
  return { delivered: true };
}
