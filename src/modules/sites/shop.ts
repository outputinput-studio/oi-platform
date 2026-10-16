import { z } from "zod";

/**
 * Settings · Tax and currency: what prices are in, and whether they
 * already include tax. Prices are stored as whole cents; this is how
 * they read.
 */
export const CURRENCIES = ["AUD", "NZD", "THB", "USD", "EUR", "GBP", "SGD"] as const;
export type Currency = (typeof CURRENCIES)[number];

export const shopSettingsSchema = z.object({
  currency: z.enum(CURRENCIES).default("AUD"),
  /** Prices as entered already include tax (the way most small shops in AU, NZ and TH price). */
  pricesIncludeTax: z.boolean().default(true),
  /** What the tax is called on the site and on receipts: GST, VAT. */
  taxName: z.string().trim().min(1, "Give the tax a name, like GST.").max(20).default("GST"),
  /** Percent, for working the tax out of a price later. */
  taxRate: z.coerce.number().min(0, "0 to 50.").max(50, "0 to 50.").default(10),
  /**
   * The form people use to ask about something: enquire-only and sold
   * products, and delivery zones that are quoted individually. Null: none
   * chosen, so those show no button.
   */
  enquiryFormId: z.string().uuid().nullable().default(null),
});
export type ShopSettings = z.infer<typeof shopSettingsSchema>;

/** Read stored settings, filling in defaults; a bad value falls back rather than breaking the shop. */
export function readShopSettings(raw: unknown): ShopSettings {
  const r = shopSettingsSchema.safeParse(raw ?? {});
  return r.success ? r.data : shopSettingsSchema.parse({});
}

/** 42000 → "$420"; 42050 → "$420.50". Whole amounts drop the cents. */
export function formatPrice(cents: number, currency: Currency): string {
  const whole = cents % 100 === 0;
  return new Intl.NumberFormat("en-AU", { style: "currency", currency, currencyDisplay: "narrowSymbol", minimumFractionDigits: whole ? 0 : 2, maximumFractionDigits: 2 }).format(cents / 100);
}

/** What someone typed in a price box → whole cents, or null for empty. "$1,280.50" → 128050. */
export function parsePrice(raw: string): number | null {
  // Currency signs, thousands commas and spaces are fine; anything else isn't a price.
  const t = raw.replace(/[\s,$฿€£]|^(A|NZ|S|US)(?=\$)/g, "");
  if (t === "") return null;
  if (!/^\d+(\.\d{0,2})?$/.test(t)) throw new Error("A price is a number, like 420 or 420.50.");
  return Math.round(Number(t) * 100);
}

/** Whole cents → what goes back in the price box: 42000 → "420", 42050 → "420.50". */
export function priceInput(cents: number | null): string {
  if (cents === null) return "";
  return cents % 100 === 0 ? String(cents / 100) : (cents / 100).toFixed(2);
}

/** The country a shop most likely sells to first, from its currency: where address forms start. */
export function homeCountry(currency: Currency): string {
  return { AUD: "AU", NZD: "NZ", THB: "TH", USD: "US", EUR: "DE", GBP: "GB", SGD: "SG" }[currency];
}
