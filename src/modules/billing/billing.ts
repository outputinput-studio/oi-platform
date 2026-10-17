/**
 * Paying output/input for the plan (Stage 39b): the words and small rules,
 * kept pure for the tests. The Stripe side is in server.ts.
 *
 * Carl, Oct 2026: an Owner adds a card on Settings · Plan (Stripe's own
 * page, monthly from that day); a price we change in ops applies from the
 * next bill; no tax for now; a failed payment stops nothing — Stripe retries
 * and emails, the Owner is asked to update the card, and ops flags it.
 */

export type BillingStatus = "active" | "past_due" | "incomplete" | "canceled";

/** Stripe's subscription statuses, in ours. */
export function statusFromStripe(s: string): BillingStatus {
  if (s === "active" || s === "trialing") return "active";
  if (s === "past_due" || s === "unpaid" || s === "paused") return "past_due";
  if (s === "incomplete") return "incomplete";
  return "canceled";
}

/** "Visa ending 4417". */
export function cardWords(brand: string | null, last4: string | null): string | null {
  if (!last4) return null;
  const names: Record<string, string> = { visa: "Visa", mastercard: "Mastercard", amex: "Amex", eftpos_au: "eftpos", jcb: "JCB", unionpay: "UnionPay", discover: "Discover", diners: "Diners" };
  const name = brand ? (names[brand] ?? "Card") : "Card";
  return `${name} ending ${last4}`;
}

/** "09/28" from Stripe's month and year. */
export function cardExpiry(month: number | null | undefined, year: number | null | undefined): string | null {
  if (!month || !year) return null;
  return `${String(month).padStart(2, "0")}/${String(year % 100).padStart(2, "0")}`;
}

/** One month on from `from`, on the same day where the month has one (31 Jan → 28/29 Feb). */
export function nextMonth(from: Date): Date {
  const d = new Date(from);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + 1);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return d;
}

/** How ops and the Settings index say it, in a few words. */
export function billingLine(b: { status: string } | null): string {
  if (!b) return "Not paying yet";
  if (b.status === "active") return "Paying by card";
  if (b.status === "past_due") return "Last payment failed";
  if (b.status === "incomplete") return "Card not finished";
  return "Stopped";
}
