import { z } from "zod";

/**
 * A site's own Stripe account. The client puts in their own keys; we keep
 * them encrypted (src/lib/secrets.ts) and never show them again — only the
 * last four characters, to tell which key it is.
 */
export const paymentsSettingsSchema = z.object({
  /** Encrypted secret (or restricted) key. Empty: not set up. */
  secretKey: z.string().default(""),
  /** Encrypted webhook signing secret. Empty: no webhook (payments still confirm when the customer comes back). */
  webhookSecret: z.string().default(""),
  keyLast4: z.string().default(""),
  /** Live money, or Stripe test mode (an sk_test_/rk_test_ key). */
  livemode: z.boolean().default(false),
  accountId: z.string().default(""),
  businessName: z.string().default(""),
  /** Stripe says the account can take money. */
  chargesEnabled: z.boolean().default(false),
});
export type PaymentsSettings = z.infer<typeof paymentsSettingsSchema>;

export function readPayments(raw: unknown): PaymentsSettings {
  const r = paymentsSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : paymentsSettingsSchema.parse({});
}

/** Which way money is taken here: the client's own Stripe, or test payments (never in production). */
export type Provider = "stripe" | "test";

/** sk_live_…, sk_test_…, rk_live_…, rk_test_… */
export const secretKeySchema = z
  .string()
  .trim()
  .regex(/^(sk|rk)_(live|test)_[A-Za-z0-9]{10,}$/, "That isn't a Stripe secret key. It starts sk_live_ or rk_live_ (or _test_ for testing).");
export const webhookSecretSchema = z
  .string()
  .trim()
  .regex(/^whsec_[A-Za-z0-9]{10,}$/, "A webhook signing secret starts whsec_.")
  .or(z.literal(""));
