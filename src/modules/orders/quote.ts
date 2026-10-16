import type { Site } from "@/db/schema";
import { countryName } from "@/lib/countries";
import { publicForm, recordSubmission } from "@/modules/forms/server";
import type { Field } from "@/modules/forms/fields";
import { quoteFor, readShipping } from "@/modules/sites/shipping";
import { formatPrice, readShopSettings } from "@/modules/sites/shop";
import type { CartLine } from "./cart";
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
  if (!priced.needsAddress || quoteFor(readShipping(p.site.shipping), address.country, where) === null) throw new Error("Delivery there has a price at checkout. Go back and pick how it gets to you.");

  const formId = readShopSettings(p.site.shop).enquiryFormId;
  const form = formId ? await publicForm({ siteId: p.site.id, formId }) : null;
  if (!form) throw new Error("This shop can't take quote requests online yet. Get in touch and we'll sort something out.");

  const fmt = (c: number) => formatPrice(c, priced.currency);
  const f = (id: string, type: Field["type"], label: string): Field => ({ id, type, label, help: "", required: false, options: [] });
  // The request is the first long answer, so the Inbox lists it as "Delivery quote to New Zealand".
  const fields = [f("_request", "longText", "Request"), f("_name", "text", "Name"), f("_email", "email", "Email"), f("_phone", "phone", "Phone"), f("_address", "longText", "Deliver to"), f("_cart", "longText", "Their cart"), f("_note", "longText", "Their note")];
  const answers: Record<string, string> = {
    _request: `Delivery quote to ${where}`,
    _name: details.name,
    _email: details.email,
    _phone: details.phone,
    _address: [address.line1, address.line2, [address.city, address.state, address.postcode].filter(Boolean).join(" "), where].filter(Boolean).join("\n"),
    _cart: [...priced.lines.map((l) => `${l.qty} × ${l.name} — ${fmt(l.unit * l.qty)}`), `Subtotal ${fmt(priced.subtotal)} before delivery`].join("\n"),
    _note: details.note,
  };
  await recordSubmission({ siteId: p.site.id, form, fields, answers, siteName: p.site.name, inboxUrl: p.inboxUrl, autoReply: false, subject: "asked for a delivery quote" });
  return { ok: `Thanks, ${details.name.split(" ")[0]}. We'll work out delivery to ${where} and email you a quote at ${details.email}.` };
}
