import { z } from "zod";
import { CURRENCIES } from "@/modules/sites/shop";

/**
 * A site's plan (Carl, Oct 2026): set by output/input in ops, shown to the
 * site's Owners in Settings · Plan (design/admin.html, "Your arrangement
 * with us"). A name and its words, a monthly price, and the limits usage is
 * measured against. A limit left empty is "no limit". Pure, for the tests.
 */

const limit = (msg: string) => z.number().int(msg).positive(msg).nullable();

export const planSchema = z.object({
  name: z.string().trim().min(1, "Give the plan a name.").max(60, "Keep the name under 60 characters."),
  description: z.string().trim().max(400, "Keep it under 400 characters.").default(""),
  /** Cents a month. */
  price: z.number().int("A price in whole cents.").min(0, "A price can't be below zero."),
  currency: z.enum(CURRENCIES, "Choose a currency."),
  limits: z.object({
    storageGb: z.number().positive("Storage has to be more than nothing.").max(10000),
    products: limit("A whole number above zero, or empty for no limit."),
    people: limit("A whole number above zero, or empty for no limit."),
    visits: limit("A whole number above zero, or empty for no limit."),
  }),
});

export type Plan = z.infer<typeof planSchema>;

/** The stored plan, or null when there isn't one yet. */
export function readPlan(raw: unknown): Plan | null {
  const r = planSchema.safeParse(raw ?? {});
  return r.success ? r.data : null;
}

export type UsageLevel = "ok" | "close" | "over";

/** From 80% it's "getting close"; past the limit, over. No limit is always fine. */
export function usageLevel(used: number, max: number | null): UsageLevel {
  if (max === null) return "ok";
  if (used > max) return "over";
  return used >= max * 0.8 ? "close" : "ok";
}

/** "450 MB", "1.8 GB", "12 GB". */
export function formatBytes(n: number): string {
  const gb = n / 1024 ** 3;
  if (gb >= 1) return `${gb >= 10 ? Math.round(gb) : Math.round(gb * 10) / 10} GB`;
  return `${Math.round(n / 1024 ** 2)} MB`;
}
