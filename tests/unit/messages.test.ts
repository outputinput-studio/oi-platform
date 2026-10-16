import { describe, expect, test } from "vitest";
import { customerMail, DEFAULT_TEMPLATES, fillTemplate, readMessages, recipientsFor, recipientsSchema, templateFor } from "@/modules/sites/messages";
import { draftFrom, orderVars, trackingText } from "@/modules/orders/emails";
import { receiptEmail } from "@/modules/orders/server";
import type { Order } from "@/db/schema";

const order = {
  number: 1042,
  name: "Dee  Buyer",
  currency: "AUD",
  items: [{ productId: "p", name: "Teal bikini", slug: "teal", unit: 38000, qty: 1, photo: null, note: "", digital: false }],
  discount: 0,
  discountCode: "",
  shipping: { name: "Standard", kind: "post", estimate: "" },
  shippingPrice: 1200,
  total: 39200,
  tax: 3564,
  taxName: "GST",
  address: { line1: "1 Hay St", city: "Perth", postcode: "6000", country: "AU" },
  paidAt: new Date("2026-10-16T03:00:00Z"),
  createdAt: new Date("2026-10-16T03:00:00Z"),
} as unknown as Order;

describe("customer emails", () => {
  test("fill-ins: any case and spacing, unknown ones left showing, no stack of blank lines", () => {
    expect(fillTemplate("Hi {Name}, order { ORDER } for {nope}", { name: "Dee", order: "1042" })).toBe("Hi Dee, order 1042 for {nope}");
    expect(fillTemplate("Went out today.\n\n{tracking}\n\nKini", { tracking: "" })).toBe("Went out today.\n\nKini");
    expect(fillTemplate("{Full  Name}", { "full name": "Dee Buyer" })).toBe("Dee Buyer");
  });

  test("the default wording, or the site's own; one bad part doesn't take the rest with it", () => {
    expect(templateFor(readMessages({}), "sent")).toEqual(DEFAULT_TEMPLATES.sent);
    const m = readMessages({ keepCopy: true, templates: { sent: { subject: "Shipped!", body: "" } }, notify: "junk" });
    expect(templateFor(m, "sent")).toEqual({ subject: "Shipped!", body: DEFAULT_TEMPLATES.sent.body });
    expect(m.keepCopy).toBe(true);
    expect(m.notify.newOrder).toEqual({ on: true, to: "", cc: "", bcc: "" });
  });

  test("the on-its-way draft carries the tracking line and link", () => {
    const vars = { ...orderVars(order, "Kini Kouture"), tracking: trackingText({ carrier: "Australia Post", number: "33ANJ482019" }) };
    expect(vars).toMatchObject({ name: "Dee", "full name": "Dee  Buyer", order: "1042", product: "Teal bikini" });
    const d = draftFrom(DEFAULT_TEMPLATES.sent, vars);
    expect(d.subject).toBe("Your Teal bikini is on its way");
    expect(d.message).toBe("Hi Dee,\n\nYour Teal bikini went out today.\n\nAustralia Post tracking: 33ANJ482019\nhttps://auspost.com.au/mypost/track/details/33ANJ482019\n\nKini Kouture");
    expect(draftFrom(DEFAULT_TEMPLATES.sent, { ...vars, tracking: trackingText() }).message).toBe("Hi Dee,\n\nYour Teal bikini went out today.\n\nKini Kouture");
  });

  test("the receipt can't be written out of the confirmation", () => {
    const site = { name: "Kini", business: {}, search: {}, messages: { templates: { confirmed: { subject: "Got it, {name}!", body: "Cheers {name}." } } } };
    const r = receiptEmail(site, order);
    expect(r.subject).toBe("Got it, Dee!");
    expect(r.text).toMatch(/^Cheers Dee\.\n\n1 × Teal bikini — \$380\n/);
    expect(r.text).toContain("Total — $392 (includes GST $35.64)");
  });

  test("who a team email goes to: off is nobody, empty is the owners, copies never repeat", () => {
    const owners = ["own@example.com"];
    expect(recipientsFor({ on: false, to: "", cc: "", bcc: "" }, owners)).toBeNull();
    expect(recipientsFor({ on: true, to: "", cc: "", bcc: "" }, owners)).toEqual({ to: owners, cc: [], bcc: [] });
    expect(recipientsFor({ on: true, to: "a@x.com, B@x.com", cc: "b@x.com c@x.com", bcc: "c@x.com;d@x.com" }, owners)).toEqual({ to: ["a@x.com", "b@x.com"], cc: ["c@x.com"], bcc: ["d@x.com"] });
    expect(() => recipientsSchema.parse({ to: "a@x.com, nope" })).toThrow(/doesn't look right/);
  });

  test("keeping a copy blind copies the business's reply address, when there is one", () => {
    expect(customerMail({ name: "Kini", business: { email: "hi@kini.example" }, messages: { keepCopy: true } })).toEqual({ fromName: "Kini", replyTo: "hi@kini.example", bcc: ["hi@kini.example"] });
    expect(customerMail({ name: "Kini", business: {}, messages: { keepCopy: true } })).toEqual({ fromName: "Kini" });
  });
});
