import { z } from "zod";
import { ratePriceLabel, type Shipping } from "@/modules/sites/shipping";
import { formatPrice, type Currency, type DetailRow } from "@/modules/sites/shop";
import { COUNTRIES } from "@/lib/countries";

/**
 * Product details, as in design/admin.html: the rows that open up on
 * every product page. The site writes them once (Settings · Product
 * details); a product uses each as it is, changes it for itself, or hides
 * it. A delivery row writes itself from Settings · Shipping. Pure: the
 * editor, the settings screen and the storefront all read it the same.
 */

export const overrideSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("custom"), text: z.string().trim().max(2000) }),
  z.object({ mode: z.literal("hidden") }),
]);
export type Override = z.infer<typeof overrideSchema>;
export const productDetailsSchema = z.record(z.string().min(1).max(40), overrideSchema).refine((r) => Object.keys(r).length <= 24, "Too many rows.");
export type ProductDetails = z.infer<typeof productDetailsSchema>;

/** Stored changes; anything that no longer reads right is dropped rather than breaking the page. */
export function readProductDetails(raw: unknown): ProductDetails {
  if (!raw || typeof raw !== "object") return {};
  const out: ProductDetails = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const r = overrideSchema.safeParse(v);
    if (r.success && k.length <= 40) out[k] = r.data;
  }
  return out;
}

/** Quick starts for the settings screen. */
export const DETAIL_SUGGESTIONS: { kind: DetailRow["kind"]; title: string }[] = [
  { kind: "text", title: "Materials" },
  { kind: "text", title: "Sizing" },
  { kind: "text", title: "Care" },
  { kind: "delivery", title: "Delivery" },
  { kind: "text", title: "Returns" },
];

type ProductShape = { digital: boolean; make: string; leadTime: number | null; leadUnit: "weeks" | "days" };

/**
 * The delivery row, written from Shipping: how soon it goes, then what it
 * costs where. Zone names are the team's own, so places are named instead.
 */
export function deliveryText(s: Shipping, currency: Currency, p: ProductShape): string {
  if (p.digital) return "A digital product: nothing is posted.";
  const when =
    p.make === "madeToOrder"
      ? p.leadTime
        ? `Made to order, then posted: around ${p.leadTime} ${p.leadTime === 1 ? p.leadUnit.slice(0, -1) : p.leadUnit}.`
        : "Made to order, then posted."
      : s.dispatchDays > 0
        ? `Posted within ${s.dispatchDays} business day${s.dispatchDays === 1 ? "" : "s"}.`
        : "";
  if (s.zones.length === 0) return [when, "Delivery is included."].filter(Boolean).join("\n\n");
  const fmt = (c: number) => formatPrice(c, currency);
  const lines = s.zones.map((z) => {
    const names = z.countries.map((c) => COUNTRIES.find((x) => x.code === c)?.name ?? c);
    const place = z.everywhere ? (s.zones.length === 1 ? "Everywhere" : "Everywhere else") : names.length > 3 ? `${names.slice(0, 3).join(", ")} and ${names.length - 3} more` : names.join(", ");
    if (z.quote) return `${place}: quoted for your address before you pay.`;
    const rates = z.rates.map((r) => {
      const cond = r.minTotal ? ` on orders of ${fmt(r.minTotal)} or more` : r.maxTotal ? ` under ${fmt(r.maxTotal)}` : "";
      const price = r.kind === "pickup" ? "free" : ratePriceLabel(r.price, fmt).replace("Included", "free");
      // "Free shipping, free" says it twice.
      const label = price === "free" && /free/i.test(r.name) ? r.name : `${r.name}, ${price}`;
      return `${label}${cond}${r.estimate ? ` (${r.estimate})` : ""}${r.kind === "local" ? " in some postcodes" : ""}`;
    });
    return `${place}: ${rates.join("; ") || "ask us"}.`;
  });
  return [when, lines.join("\n")].filter(Boolean).join("\n\n");
}

/** What a product page shows: each row in order, as the site wrote it or as this product changed it, minus hidden and empty ones. */
export function resolveDetails(rows: DetailRow[], overrides: ProductDetails, delivery: string): { id: string; title: string; text: string }[] {
  return rows.flatMap((r) => {
    const o = overrides[r.id];
    if (o?.mode === "hidden") return [];
    const text = o?.mode === "custom" ? o.text : r.kind === "delivery" ? delivery : r.text;
    return text.trim() ? [{ id: r.id, title: r.title, text }] : [];
  });
}
