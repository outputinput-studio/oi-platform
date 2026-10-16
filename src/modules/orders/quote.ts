import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { products, type Site } from "@/db/schema";
import { COUNTRY_CODES } from "@/lib/countries";
import { countryName } from "@/lib/countries";
import { publicForm, recordSubmission } from "@/modules/forms/server";
import type { Field } from "@/modules/forms/fields";
import { quoteFor, readShipping } from "@/modules/sites/shipping";
import { customerView } from "@/modules/products/catalogue";
import { formatPrice, readShopSettings } from "@/modules/sites/shop";
import type { CartLine } from "./cart";
import { withChoice } from "@/modules/products/options";
import { checkoutSchema, priceCart } from "./server";

/**
 * A delivery zone the team quotes individually (Settings · Shipping): no
 * payment at checkout. The customer's details and cart come through as an
 * enquiry, under the site's enquiry form, so it lands in the Inbox rather
 * than Orders. The team replies with a price and takes payment when they
 * agree. Prices are worked out here from the products table, as for an
 * order; nothing is held or charged.
 */
export async function requestQuote(p: { site: Site; cart: CartLine[]; cartRef?: string; details: unknown; inboxUrl: string }): Promise<{ ok: string }> {
  const priced = await priceCart({ site: p.site, cart: p.cart, cartRef: p.cartRef });
  if (priced.lines.length === 0) throw new Error("Your cart is empty — nothing in it can be bought right now.");
  const details = checkoutSchema.parse(p.details);
  const address = details.address;
  if (!address) throw new Error("Where should it go? Fill in the address.");
  const where = countryName(address.country);
  if (!priced.needsAddress || quoteFor(readShipping(p.site.shipping), address.country, where, priced.parcel) === null) throw new Error("Delivery there has a price at checkout. Go back and pick how it gets to you.");

  const formId = readShopSettings(p.site.shop).enquiryFormId;
  const form = formId ? await publicForm({ siteId: p.site.id, formId }) : null;
  if (!form) throw new Error("This shop can't take quote requests online yet. Get in touch and we'll sort something out.");

  const fmt = (c: number) => formatPrice(c, priced.currency);
  // The request is the first long answer, so the Inbox lists it as "Delivery quote to New Zealand".
  const fields = [f("_request", "longText", "Request"), f("_name", "text", "Name"), f("_email", "email", "Email"), f("_phone", "phone", "Phone"), f("_address", "longText", "Deliver to"), f("_cart", "longText", "Their cart"), f("_note", "longText", "Their note")];
  const answers: Record<string, string> = {
    _request: `Delivery quote to ${where}`,
    _name: details.name,
    _email: details.email,
    _phone: details.phone,
    _address: [address.line1, address.line2, [address.city, address.state, address.postcode].filter(Boolean).join(" "), where].filter(Boolean).join("\n"),
    _cart: [...priced.lines.map((l) => `${l.qty} × ${withChoice(l.name, l.choices)} — ${fmt(l.unit * l.qty)}`), `Subtotal ${fmt(priced.subtotal)} before delivery`].join("\n"),
    _note: details.note,
  };
  await recordSubmission({ siteId: p.site.id, form, fields, answers, siteName: p.site.name, inboxUrl: p.inboxUrl, autoReply: false, subject: "asked for a delivery quote" });
  return { ok: `Thanks, ${details.name.split(" ")[0]}. We'll work out delivery to ${where} and email you a quote at ${details.email}.` };
}

const f = (id: string, type: Field["type"], label: string): Field => ({ id, type, label, help: "", required: false, options: [] });

export const productQuoteSchema = z.object({
  name: z.string().trim().min(1, "Your name, please.").max(120),
  email: z.string().trim().toLowerCase().email("That email address doesn't look right.").max(200),
  phone: z.string().trim().max(40).default(""),
  country: z
    .string()
    .trim()
    .toUpperCase()
    .refine((c) => COUNTRY_CODES.has(c), "Pick a country."),
  city: z.string().trim().max(100).default(""),
  postcode: z.string().trim().min(2, "What's the postcode?").max(20),
  qty: z.coerce.number().int().min(1, "At least one.").max(999, "Up to 999 — get in touch for more."),
  note: z.string().trim().max(1000).default(""),
  /** What they'd picked on the page: "Size: 8, Colour: Print". Read as their words, nothing more. */
  choice: z.string().trim().max(300).default(""),
});

/**
 * Email quote on a product (Add to cart's alternative, or beside it): the
 * customer says who they are, where it's going and how many; the team
 * emails a price, freight and all. Lands in the Inbox through the site's
 * enquiry form. The product is looked up here and must offer a quote.
 */
export async function requestProductQuote(p: { site: Site; productId: string; details: unknown; inboxUrl: string }): Promise<{ ok: string }> {
  const productId = z.string().uuid().parse(p.productId);
  const [prod] = await withSite(p.site.id, (tx) =>
    tx
      .select()
      .from(products)
      .where(and(eq(products.id, productId), eq(products.visible, true), isNull(products.deletedAt)))
      .limit(1),
  );
  const shop = readShopSettings(p.site.shop);
  if (!prod || !customerView(prod, shop.currency).quotable) throw new Error("This product doesn't take quote requests.");
  const d = productQuoteSchema.parse(p.details);
  const form = shop.enquiryFormId ? await publicForm({ siteId: p.site.id, formId: shop.enquiryFormId }) : null;
  if (!form) throw new Error("This shop can't take quote requests online yet. Get in touch and we'll sort something out.");

  const where = countryName(d.country);
  const v = customerView(prod, shop.currency);
  // The request is the first long answer, so the Inbox lists it as "Quote for <product>".
  const fields = [f("_request", "longText", "Request"), f("_name", "text", "Name"), f("_email", "email", "Email"), f("_phone", "phone", "Phone"), f("_address", "longText", "Deliver to"), f("_product", "longText", "Product"), f("_note", "longText", "Their note")];
  const answers: Record<string, string> = {
    _request: `Quote for ${prod.name}`,
    _name: d.name,
    _email: d.email,
    _phone: d.phone,
    _address: [[d.city, d.postcode].filter(Boolean).join(" "), where].join("\n"),
    _product: `${d.qty} × ${prod.name}${d.choice ? ` — ${d.choice}` : ""} (/shop/${prod.slug})${v.price ? ` — listed at ${v.price} each` : ""}`,
    _note: d.note,
  };
  await recordSubmission({ siteId: p.site.id, form, fields, answers, siteName: p.site.name, inboxUrl: p.inboxUrl, autoReply: false, subject: `asked for a quote for ${prod.name}` });
  return { ok: `Thanks, ${d.name.split(" ")[0]}. We'll email a quote for ${prod.name}, delivered to ${where}, to ${d.email}.` };
}
