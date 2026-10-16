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
const grams = z.number().int().min(0).max(100_000_000);

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
  /** Only offered when the parcel weighs at least / under these (grams), from each product's weight. */
  minWeight: grams.nullable().default(null),
  maxWeight: grams.nullable().default(null),
  /** Takes oversized items: anything marked oversized is only offered rates with this on. A pickup always does. */
  oversized: z.boolean().default(false),
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
export const FREE_DELIVERY: Rate = { id: "free", kind: "post", name: "Delivery", price: 0, estimate: "", minTotal: null, maxTotal: null, postcodes: [], minWeight: null, maxWeight: null, oversized: true };

/**
 * What's being sent, from the products in the cart: its weight (grams,
 * products without one count as nothing), whether anything in it is
 * oversized, and whether everything physical ships free (the team covers
 * it: no rate to pick, no charge). Pieces that ship free don't count
 * towards the weight or make it oversized.
 */
export type Parcel = { weight: number; oversized: boolean; allFree: boolean };
export const PLAIN_PARCEL: Parcel = { weight: 0, oversized: false, allFree: false };

export function parcelOf(lines: { digital: boolean; qty: number; weight: number | null; shipsFree: boolean; oversized: boolean }[]): Parcel {
  const physical = lines.filter((l) => !l.digital);
  const charged = physical.filter((l) => !l.shipsFree);
  return {
    weight: charged.reduce((n, l) => n + (l.weight ?? 0) * l.qty, 0),
    oversized: charged.some((l) => l.oversized),
    allFree: physical.length > 0 && charged.length === 0,
  };
}

/** Whether a rate fits this order: its total and weight limits, and oversized items if there are any. */
function fits(r: Rate, subtotal: number, parcel: Parcel): boolean {
  return (
    (r.minTotal === null || subtotal >= r.minTotal) &&
    (r.maxTotal === null || subtotal < r.maxTotal) &&
    (r.minWeight === null || parcel.weight >= r.minWeight) &&
    (r.maxWeight === null || parcel.weight < r.maxWeight) &&
    (!parcel.oversized || r.oversized || r.kind === "pickup")
  );
}

/** "180 g", "1.2 kg". */
export function formatWeight(g: number): string {
  return g >= 1000 ? `${Number((g / 1000).toFixed(2))} kg` : `${g} g`;
}

/** "180", "180 g", "1.2kg", "1,200 g" → grams. Empty → null. A bare number is grams. */
export function parseWeight(raw: string): number | null {
  const t = raw.trim().toLowerCase().replace(/,/g, "");
  if (t === "") return null;
  const m = /^(\d+(?:\.\d+)?)\s*(g|kg|grams?|kilos?)?$/.exec(t);
  if (!m) throw new Error("A weight is a number, like 180 g or 1.2 kg.");
  const n = Number(m[1]) * (m[2]?.startsWith("k") ? 1000 : 1);
  return Math.round(n);
}

/** The zone an address falls in: the first that lists its country, else the first "everywhere else". */
export function zoneFor(s: Shipping, country: string): Zone | null {
  const c = country.toUpperCase();
  return s.zones.find((z) => z.countries.includes(c)) ?? s.zones.find((z) => z.everywhere) ?? null;
}

/**
 * What a customer can pick for this address, order total and parcel,
 * cheapest first. Empty: we don't send there (or not this). Everything
 * shipping free: free delivery wherever a zone reaches, quoted or not.
 */
export function ratesFor(s: Shipping, where: { country: string; postcode?: string }, subtotal: number, parcel: Parcel = PLAIN_PARCEL): Rate[] {
  if (s.zones.length === 0) return [FREE_DELIVERY];
  const zone = zoneFor(s, where.country);
  if (!zone) return [];
  if (parcel.allFree) return [{ ...FREE_DELIVERY, name: "Free delivery" }];
  if (zone.quote) return [];
  const pc = (where.postcode ?? "").trim().toUpperCase();
  return zone.rates
    .filter((r) => fits(r, subtotal, parcel))
    .filter((r) => r.kind !== "local" || (pc !== "" && r.postcodes.map((x) => x.toUpperCase()).includes(pc)))
    .sort((a, b) => a.price - b.price);
}

/**
 * Why an address has nothing to pick from, so checkout can say so rather
 * than just greying the button: no zone for the country; only local
 * delivery and the postcode isn't covered (or not typed yet); or every
 * rate has a total limit this order falls outside.
 */
export type NoRates = { why: "noZone" } | { why: "postcode"; typed: boolean } | { why: "total" } | { why: "weight" } | { why: "oversized" } | { why: "empty" };
export function whyNoRates(s: Shipping, where: { country: string; postcode?: string }, subtotal: number, parcel: Parcel = PLAIN_PARCEL): NoRates | null {
  if (ratesFor(s, where, subtotal, parcel).length > 0) return null;
  const zone = zoneFor(s, where.country);
  if (!zone) return { why: "noZone" };
  if (zone.rates.length === 0) return { why: "empty" };
  const fitting = zone.rates.filter((r) => fits(r, subtotal, parcel));
  if (fitting.length > 0 && fitting.every((r) => r.kind === "local")) return { why: "postcode", typed: (where.postcode ?? "").trim() !== "" };
  // Which limit shuts it out: oversized first (the plainest to act on), then weight, then the total.
  if (parcel.oversized && !zone.rates.some((r) => r.oversized || r.kind === "pickup")) return { why: "oversized" };
  if (zone.rates.some((r) => fits({ ...r, minWeight: null, maxWeight: null }, subtotal, parcel))) return { why: "weight" };
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

/** When delivery to this country is quoted individually: what the customer reads instead of rates. Null when it isn't (or it all ships free). */
export function quoteFor(s: Shipping, country: string, countryName: string, parcel: Parcel = PLAIN_PARCEL): string | null {
  const zone = zoneFor(s, country);
  if (!zone?.quote || parcel.allFree) return null;
  return zone.quoteMessage || `We'll work out delivery to ${countryName} and send you a quote.`;
}

/** "Included" rather than $0, as the design asks. */
export function ratePriceLabel(price: number, format: (c: number) => string): string {
  return price === 0 ? "Included" : format(price);
}
