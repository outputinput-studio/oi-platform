import { z } from "zod";

/**
 * What a site knows about its own Stripe account, refreshed from Stripe
 * whenever the team comes back from it. Never card details or keys:
 * Stripe holds those.
 */
export const paymentsSettingsSchema = z.object({
  stripeAccountId: z.string().default(""),
  /** Stripe says the account can take money. */
  chargesEnabled: z.boolean().default(false),
  /** They finished Stripe's questions. */
  detailsSubmitted: z.boolean().default(false),
  /** Live money or Stripe test mode. */
  livemode: z.boolean().default(false),
  businessName: z.string().default(""),
  /** Last four of the bank account payouts go to, when Stripe shares it. */
  bankLast4: z.string().default(""),
});
export type PaymentsSettings = z.infer<typeof paymentsSettingsSchema>;

export function readPayments(raw: unknown): PaymentsSettings {
  const r = paymentsSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : paymentsSettingsSchema.parse({});
}

/** Which way money is taken here: the client's Stripe, test payments (never in production), or not at all yet. */
export type Provider = "stripe" | "test";
