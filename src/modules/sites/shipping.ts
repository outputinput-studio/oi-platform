import { z } from "zod";

/**
 * Settings · Shipping, as in design/admin.html: how long until it's
 * posted, then zones (places) each with rates (what the customer picks).
 * An address matches the first zone it falls in, so specific zones go
 * first and "everywhere else" last. Pure, so checkout in the browser
 * and the server agree on the price.
 */
export const RATE_KINDS = ["post", "pickup", "local"] as const;
export type RateKind = (typeof RATE_KINDS)[number];

const cents = z.number().int().min(0).max(10_000_000);

export const rateSchema = z.object({
  id: z.string().min(1).max(40),
  kind: z.enum(RATE_KINDS).default("post"),
  /** What the customer reads: "Standard", "Express", "Pick up from the studio". */
  name: z.string().trim().min(1, "Give the rate a name customers will read.").max(60),
  price: cents.default(0),
  /** Plain words: "3–5 business days". */
  estimate: z.string().trim().max(80).default(""),
  /** Only offered when the order total is at least / under these (cents). How "free over $200" is made. */
  minTotal: cents.nullable().default(null),
  maxTotal: cents.nullable().default(null),
  /** Local delivery: the postcodes it covers. */
  postcodes: z.array(z.string().trim().min(1).max(12)).max(500).default([]),
});
export type Rate = z.infer<typeof rateSchema>;

export const zoneSchema = z.object({
  id: z.string().min(1).max(40),
  /** Only the team sees this. */
  name: z.string().trim().min(1, "Give the zone a name.").max(60),
  /** ISO country codes. Empty with `everywhere` on means every other country. */
  countries: z.array(z.string().length(2)).max(250).default([]),
  everywhere: z.boolean().default(false),
  rates: z.array(rateSchema).max(20).default([]),
  /** Quote individually: no payment at checkout; their details come through as an enquiry so the team can price the postage. */
  quote: z.boolean().default(false),
  /** What they read at checkout. Empty: "We'll work out delivery to <country> and send you a quote." */
  quoteMessage: z.string().trim().max(300).default(""),
});
export type Zone = z.infer<typeof zoneSchema>;

export const shippingSchema = z.object({
  /** "Posted within N business days" for ready-to-ship pieces. 0 hides it. */
  dispatchDays: z.number().int().min(0).max(60).default(2),
  zones: z.array(zoneSchema).max(30).default([]),
});
export type Shipping = z.infer<typeof shippingSchema>;

export function readShipping(raw: unknown): Shipping {
  const r = shippingSchema.safeParse(raw ?? {});
  return r.success ? r.data : shippingSchema.parse({});
}

/** Nobody has set shipping up: delivery is free everywhere, rather than checkout refusing everyone. */
export const FREE_DELIVERY: Rate = { id: "free", kind: "post", name: "Delivery", price: 0, estimate: "", minTotal: null, maxTotal: null, postcodes: [] };

/** The zone an address falls in: the first that lists its country, else the first "everywhere else". */
export function zoneFor(s: Shipping, country: string): Zone | null {
  const c = country.toUpperCase();
  return s.zones.find((z) => z.countries.includes(c)) ?? s.zones.find((z) => z.everywhere) ?? null;
}

/** What a customer can pick for this address and order total, cheapest first. Empty: we don't send there. */
export function ratesFor(s: Shipping, where: { country: string; postcode?: string }, subtotal: number): Rate[] {
  if (s.zones.length === 0) return [FREE_DELIVERY];
  const zone = zoneFor(s, where.country);
  if (!zone || zone.quote) return [];
  const pc = (where.postcode ?? "").trim().toUpperCase();
  return zone.rates
    .filter((r) => (r.minTotal === null || subtotal >= r.minTotal) && (r.maxTotal === null || subtotal < r.maxTotal))
    .filter((r) => r.kind !== "local" || (pc !== "" && r.postcodes.map((x) => x.toUpperCase()).includes(pc)))
    .sort((a, b) => a.price - b.price);
}

/**
 * Why an address has nothing to pick from, so checkout can say so rather
 * than just greying the button: no zone for the country; only local
 * delivery and the postcode isn't covered (or not typed yet); or every
 * rate has a total limit this order falls outside.
 */
export type NoRates = { why: "noZone" } | { why: "postcode"; typed: boolean } | { why: "total" } | { why: "empty" };
export function whyNoRates(s: Shipping, where: { country: string; postcode?: string }, subtotal: number): NoRates | null {
  if (ratesFor(s, where, subtotal).length > 0) return null;
  const zone = zoneFor(s, where.country);
  if (!zone) return { why: "noZone" };
  if (zone.rates.length === 0) return { why: "empty" };
  const fitsTotal = zone.rates.filter((r) => (r.minTotal === null || subtotal >= r.minTotal) && (r.maxTotal === null || subtotal < r.maxTotal));
  if (fitsTotal.length > 0 && fitsTotal.every((r) => r.kind === "local")) return { why: "postcode", typed: (where.postcode ?? "").trim() !== "" };
  return { why: "total" };
}

/**
 * What a zone can't deliver, for the shipping editor: the order total from
 * which no rate applies (every post or pickup rate has an upper limit), or
 * that it has no rates at all. Local delivery depends on the postcode, so
 * it doesn't count as covering everyone.
 */
export function zoneGaps(z: Zone): { noRates: boolean; localOnly: boolean; from: number | null; below: number | null } {
  const none = { noRates: false, localOnly: false, from: null, below: null };
  if (z.quote) return none;
  if (z.rates.length === 0) return { ...none, noRates: true };
  const open = z.rates.filter((r) => r.kind !== "local");
  if (open.length === 0) return { ...none, localOnly: true };
  const from = open.some((r) => r.maxTotal === null) ? null : Math.max(...open.map((r) => r.maxTotal ?? 0));
  const below = open.some((r) => !r.minTotal) ? null : Math.min(...open.map((r) => r.minTotal ?? 0));
  return { noRates: false, localOnly: false, from, below };
}

/** When delivery to this country is quoted individually: what the customer reads instead of rates. Null when it isn't. */
export function quoteFor(s: Shipping, country: string, countryName: string): string | null {
  const zone = zoneFor(s, country);
  if (!zone?.quote) return null;
  return zone.quoteMessage || `We'll work out delivery to ${countryName} and send you a quote.`;
}

/** "Included" rather than $0, as the design asks. */
export function ratePriceLabel(price: number, format: (c: number) => string): string {
  return price === 0 ? "Included" : format(price);
}
