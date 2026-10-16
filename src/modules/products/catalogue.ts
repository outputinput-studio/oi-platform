import { z } from "zod";
import { PRODUCT_AVAILABILITY, PRODUCT_MAKES, type ProductAvailability, type ProductMake } from "./kinds";
import { imageRef, type ImageRef } from "@/modules/pages/registry";
import { seoSchema } from "@/modules/pages/seo";
import { formatPrice, type Currency } from "@/modules/sites/shop";

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
  visible: z.boolean().optional(),
  photos: z.array(imageRef).max(MAX_PHOTOS, `Up to ${MAX_PHOTOS} photos.`).optional(),
  code: z.string().trim().max(60).optional(),
  seo: seoSchema.optional(),
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
  price: number | null;
  salePrice: number | null;
  visible: boolean;
};

/** Counted stock that has run out makes a piece sold out on its own. */
export function effectiveAvailability(p: Shape): ProductAvailability {
  if (p.availability === "forSale" && p.make === "ready" && p.stock !== null && p.stock <= 0) return "soldOut";
  return p.availability;
}

/** "Made to order · 6 weeks", "Ready to ship · 2 left", "One only". */
export function makeLine(p: Shape): string {
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
  return a === "forSale" ? null : AVAILABILITY_LABEL[a];
}

export type CustomerView = {
  /** "$420", or the sale price when there is one. Null when no price is set. */
  price: string | null;
  /** The old price, struck through, when on sale. */
  was: string | null;
  /** The line under the price: "Made to order — around 6 weeks", "Sold out". */
  note: string;
  /** Whether the cart could take it (once checkout is on). */
  buyable: boolean;
};

/** What a customer sees on the shop and the product page. */
export function customerView(p: Shape, currency: Currency): CustomerView {
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
  return { price, was, note, buyable: a === "forSale" && p.price !== null };
}

function unit(n: number, u: "weeks" | "days") {
  return n === 1 ? u.slice(0, -1) : u;
}
