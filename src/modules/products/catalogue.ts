import { z } from "zod";
import { PRODUCT_AVAILABILITY, PRODUCT_BUY_WITH, PRODUCT_MAKES, type ProductAvailability, type ProductBuyWith, type ProductMake } from "./kinds";
import { imageRef, type ImageRef } from "@/modules/pages/registry";
import { seoSchema } from "@/modules/pages/seo";
import { formatPrice, type Currency } from "@/modules/sites/shop";
import { productDetailsSchema } from "./details";
import { optionsSchema, readOptions, readVariants, unitPrice, variantPatchSchema, variantsFor, variantState, type Variant } from "./options";

/**
 * The catalogue's rules, pure: what the editor may change, how a piece
 * reads in the admin list, and what a customer sees on the shop. The
 * words follow design/admin.html.
 */

export const MAX_PHOTOS = 12;
const cents = z.number().int().min(0, "A price can't be below zero.").max(100_000_000);

export const productSlugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "An address is lower-case words joined by dashes, like teal-crystal-bikini.")
  .max(80);
export const productNameSchema = z.string().trim().min(1, "Give it a name.").max(160);

/** Addresses under /shop kept for what's coming (the cart, checkout, collections). */
export const RESERVED_SHOP_SLUGS = ["cart", "checkout", "sale", "new-in", "search", "account"];

/** What the editor autosaves. Everything optional: only what's sent changes. */
export const productEditSchema = z.object({
  name: productNameSchema.optional(),
  slug: productSlugSchema.optional(),
  description: z.string().max(20_000).optional(),
  price: cents.nullable().optional(),
  salePrice: cents.nullable().optional(),
  categoryId: z.string().uuid().nullable().optional(),
  digital: z.boolean().optional(),
  make: z.enum(PRODUCT_MAKES).optional(),
  stock: z.number().int().min(0, "Stock can't be below zero.").max(1_000_000).nullable().optional(),
  leadTime: z.number().int().min(1, "At least 1.").max(520).nullable().optional(),
  leadUnit: z.enum(["weeks", "days"]).optional(),
  availability: z.enum(PRODUCT_AVAILABILITY).optional(),
  buyWith: z.enum(PRODUCT_BUY_WITH).optional(),
  visible: z.boolean().optional(),
  photos: z.array(imageRef).max(MAX_PHOTOS, `Up to ${MAX_PHOTOS} photos.`).optional(),
  code: z.string().trim().max(60).optional(),
  seo: seoSchema.optional(),
  /** Product details rows changed or hidden here, by row id. */
  details: productDetailsSchema.optional(),
  /** Its options, whole: the combinations follow (see options.ts). */
  options: optionsSchema.optional(),
  /** One combination's sheet: which one, and what changed on it. */
  variant: variantPatchSchema.optional(),
});
export type ProductEdit = z.infer<typeof productEditSchema>;

/** Stored photos, dropping anything that isn't a library reference any more. */
export function readPhotos(raw: unknown): ImageRef[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r) => {
    const p = imageRef.safeParse(r);
    return p.success ? [p.data] : [];
  });
}

type Shape = {
  make: ProductMake;
  stock: number | null;
  leadTime: number | null;
  leadUnit: "weeks" | "days";
  availability: ProductAvailability;
  /** Missing reads as "cart". */
  buyWith?: ProductBuyWith;
  price: number | null;
  salePrice: number | null;
  visible: boolean;
  /** Stored options and combinations (raw); none means the product's own stock and make apply. */
  options?: unknown;
  variants?: unknown;
};

/** The combinations on offer: none unless a list option makes them. */
export function liveVariants(p: Pick<Shape, "options" | "variants" | "make">): Variant[] {
  return variantsFor(readOptions(p.options), readVariants(p.variants), p.make).filter((v) => v.on);
}

/** Counted stock that has run out makes a piece sold out on its own; with combinations, when none can be had. */
export function effectiveAvailability(p: Shape): ProductAvailability {
  const vs = liveVariants(p);
  if (p.availability === "forSale" && vs.length > 0) return vs.some((v) => variantState(v) === "available") ? "forSale" : "soldOut";
  if (p.availability === "forSale" && readOptions(p.options).some((o) => o.kind === "list")) return "soldOut"; // every combination switched off
  if (p.availability === "forSale" && p.make === "ready" && p.stock !== null && p.stock <= 0) return "soldOut";
  return p.availability;
}

/** "Made to order · 6 weeks", "Ready to ship · 2 left", "One only"; with combinations, "6 combinations · 4 available". */
export function makeLine(p: Shape): string {
  const vs = liveVariants(p);
  if (vs.length > 0) {
    const n = vs.filter((v) => variantState(v) === "available").length;
    return `${vs.length} combination${vs.length === 1 ? "" : "s"} · ${n === vs.length ? "all" : n} available`;
  }
  if (p.make === "madeToOrder") return p.leadTime ? `Made to order · ${p.leadTime} ${unit(p.leadTime, p.leadUnit)}` : "Made to order";
  if (p.make === "oneOnly") return "One only";
  if (p.stock !== null && p.stock > 0 && p.stock <= 5) return `Ready to ship · ${p.stock} left`;
  return "Ready to ship";
}

export const AVAILABILITY_LABEL: Record<ProductAvailability, string> = {
  forSale: "For sale",
  sold: "Sold",
  soldOut: "Sold out",
  enquire: "Enquire only",
  comingSoon: "Coming soon",
};

/** The tag on the admin list: nothing for an ordinary piece on sale, otherwise what's different. */
export function adminTag(p: Shape): string | null {
  if (!p.visible) return "Hidden";
  const a = effectiveAvailability(p);
  if (a === "forSale") return p.buyWith === "quote" ? "Email quote" : null;
  return AVAILABILITY_LABEL[a];
}

export const BUY_WITH_LABEL: Record<ProductBuyWith, [string, string]> = {
  cart: ["Add to cart", "They pay at checkout."],
  quote: ["Email quote", "No cart. They send their details and you email a price — handy when freight varies."],
  both: ["Both", "Add to cart, with Email quote beside it."],
};

export type CustomerView = {
  /** "$420", or the sale price when there is one. Null when no price is set. */
  price: string | null;
  /** The old price, struck through, when on sale. */
  was: string | null;
  /** The line under the price: "Made to order — around 6 weeks", "Sold out". */
  note: string;
  /** Whether the cart could take it (once checkout is on). */
  buyable: boolean;
  /** Whether it shows Email quote (once there's an enquiry form). Needs no price: the team names one. */
  quotable: boolean;
};

/** What a customer sees on the shop and the product page. */
export function customerView(p: Shape, currency: Currency): CustomerView {
  const vs = liveVariants(p);
  if (vs.length > 0) return variantsView(p, vs, currency);
  const onSale = p.salePrice !== null && p.price !== null && p.salePrice < p.price;
  const price = onSale ? formatPrice(p.salePrice!, currency) : p.price !== null ? formatPrice(p.price, currency) : null;
  const was = onSale ? formatPrice(p.price!, currency) : null;
  const a = effectiveAvailability(p);
  const note =
    a === "sold"
      ? "Sold. Get in touch for something similar."
      : a === "soldOut"
        ? "Sold out"
        : a === "enquire"
          ? "Enquire to order"
          : a === "comingSoon"
            ? "Coming soon"
            : p.make === "madeToOrder"
              ? p.leadTime
                ? `Made to order — around ${p.leadTime} ${unit(p.leadTime, p.leadUnit)}`
                : "Made to order"
              : p.make === "oneOnly"
                ? "One of a kind"
                : p.stock !== null && p.stock <= 5
                  ? `Ready to ship · ${p.stock} left`
                  : "Ready to ship";
  const buyWith = p.buyWith ?? "cart";
  return { price, was, note, buyable: a === "forSale" && p.price !== null && buyWith !== "quote", quotable: a === "forSale" && buyWith !== "cart" };
}

/**
 * A product with combinations, before one is picked: "From $420" when they
 * cost different amounts, and how they're made when they all agree.
 */
function variantsView(p: Shape, vs: Variant[], currency: Currency): CustomerView {
  const a = effectiveAvailability(p);
  const open = vs.filter((v) => variantState(v) === "available");
  const prices = (open.length ? open : vs).map((v) => unitPrice(p, v)).filter((x): x is number => x !== null);
  const low = prices.length ? Math.min(...prices) : null;
  const same = prices.every((x) => x === low);
  const inherit = vs.every((v) => v.price === null);
  const onSale = inherit && p.salePrice !== null && p.price !== null && p.salePrice < p.price;
  const price = low === null ? null : `${same ? "" : "From "}${formatPrice(low, currency)}`;
  const makes = new Set(open.map((v) => v.make));
  const note =
    a !== "forSale"
      ? customerView({ ...p, options: [], variants: [] }, currency).note
      : makes.size === 1 && makes.has("madeToOrder")
        ? p.leadTime
          ? `Made to order — around ${p.leadTime} ${unit(p.leadTime, p.leadUnit)}`
          : "Made to order"
        : makes.size === 1 && makes.has("ready")
          ? "Ready to ship"
          : "Choose below";
  const buyWith = p.buyWith ?? "cart";
  return {
    price,
    was: onSale && same ? formatPrice(p.price!, currency) : null,
    note: a === "soldOut" ? "Sold out" : note,
    buyable: a === "forSale" && low !== null && buyWith !== "quote",
    quotable: a === "forSale" && buyWith !== "cart",
  };
}

/** What one combination says under the price once it's picked. */
export function variantNote(v: Variant, p: Pick<Shape, "leadTime" | "leadUnit">): string {
  const s = variantState(v);
  if (s === "off") return "Not available";
  if (s === "sold") return "Sold";
  if (s === "soldOut") return "Sold out";
  if (v.make === "madeToOrder") return p.leadTime ? `Made to order — around ${p.leadTime} ${unit(p.leadTime, p.leadUnit)}` : "Made to order";
  if (v.make === "oneOnly") return "One of a kind";
  return v.stock !== null && v.stock <= 5 ? `Ready to ship · ${v.stock} left` : "Ready to ship";
}

function unit(n: number, u: "weeks" | "days") {
  return n === 1 ? u.slice(0, -1) : u;
}
