import { z } from "zod";
import { CURRENCIES, formatPrice } from "@/modules/sites/shop";
import type { Plan } from "@/modules/plans/plan";

/**
 * Add-ons (Stage 39c, Carl): extras a site adds to its plan. Capacity —
 * more GB for photos and files, more visits a month, one more person —
 * works the minute it's added. A feature add-on is listed as "Ask us" until
 * its module is built. Pure, for the tests.
 */

export const ADDON_KINDS = ["storage", "visits", "people", "feature"] as const;
export type AddonKind = (typeof ADDON_KINDS)[number];

export const addonSchema = z
  .object({
    name: z.string().trim().min(1, "Give the add-on a name.").max(60, "Keep the name under 60 characters."),
    description: z.string().trim().max(300, "Keep it under 300 characters.").default(""),
    /** Cents a month. */
    price: z.number().int("A price in whole cents.").min(0, "A price can't be below zero."),
    currency: z.enum(CURRENCIES, "Choose a currency."),
    kind: z.enum(ADDON_KINDS, "Choose what it adds."),
    /** GB, visits or people; nothing for a feature. */
    amount: z.number().int("A whole number.").positive("More than nothing.").nullable(),
    selfServe: z.boolean(),
  })
  .superRefine((a, ctx) => {
    if (a.kind !== "feature" && a.amount === null) ctx.addIssue({ code: "custom", path: ["amount"], message: "How much does it add?" });
  })
  .transform((a) => ({ ...a, amount: a.kind === "feature" ? null : a.amount }));

export type Addon = z.infer<typeof addonSchema>;

/** The plan with a site's add-ons on top: more GB, visits or people. No limit stays no limit. */
export function withAddons(plan: Plan | null, added: Pick<Addon, "kind" | "amount">[]): Plan | null {
  if (!plan) return null;
  const sum = (k: AddonKind) => added.filter((a) => a.kind === k).reduce((n, a) => n + (a.amount ?? 0), 0);
  const up = (v: number | null, k: AddonKind) => (v === null ? null : v + sum(k));
  return {
    ...plan,
    limits: { ...plan.limits, storageGb: plan.limits.storageGb + sum("storage"), visits: up(plan.limits.visits, "visits"), people: up(plan.limits.people, "people") },
  };
}

/** "Takes you to 15 GB." — what it does to their plan, in the design's words. */
export function addonEffect(a: Pick<Addon, "kind" | "amount">, plan: Plan | null): string | null {
  if (a.kind === "feature" || !a.amount || !plan) return null;
  if (a.kind === "storage") return `Takes you to ${plan.limits.storageGb + a.amount} GB.`;
  if (a.kind === "visits") return plan.limits.visits === null ? null : `Takes you to ${(plan.limits.visits + a.amount).toLocaleString("en-AU")} a month.`;
  return plan.limits.people === null ? null : `Takes you to ${plan.limits.people + a.amount} people.`;
}

/** "$15/mo" */
export function perMonth(a: Pick<Addon, "price" | "currency">): string {
  return `${formatPrice(a.price, a.currency)}/mo`;
}
