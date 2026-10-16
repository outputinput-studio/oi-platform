import { describe, expect, test } from "vitest";
import { businessOf, readBusiness, senderFor, sendingSchema, tradingName } from "@/modules/sites/business";
import { fromLine } from "@/lib/email";
import { markAs, readShopSettings, statusNames } from "@/modules/sites/shop";
import { receiptEmail } from "@/modules/orders/server";
import type { Order } from "@/db/schema";

const site = { name: "Demo site", business: {}, messages: {}, search: {} };

describe("business profile and sending", () => {
  test("the name and reply address fall back in order: Sending, the profile, the site", () => {
    expect(senderFor(site)).toEqual({ fromName: "Demo site" });
    expect(senderFor({ ...site, business: { tradingName: "Kini Kouture", email: "Hello@Kini.example" } })).toEqual({ fromName: "Kini Kouture", replyTo: "hello@kini.example" });
    expect(senderFor({ ...site, business: { tradingName: "Kini Kouture", email: "hello@kini.example" }, messages: { sending: { fromName: "Michelle at Kini", replyTo: "michelle@kini.example" } } })).toEqual({
      fromName: "Michelle at Kini",
      replyTo: "michelle@kini.example",
    });
  });

  test("an older site's Search engines details stand in until the profile has its own", () => {
    const older = { ...site, search: { business: { name: "Old Name", phone: "0400 000 000", email: "old@example.com" } } };
    expect(businessOf(older)).toMatchObject({ tradingName: "Old Name", phone: "0400 000 000", email: "old@example.com" });
    expect(tradingName({ ...older, business: { tradingName: "New Name" } })).toBe("New Name");
  });

  test("a from name can't carry anything an email header would read as structure", () => {
    expect(sendingSchema.parse({ fromName: 'Evil" <x@y.z>\r\nBcc: a@b.c' }).fromName).toBe("Evil x@y.z Bcc a@b.c");
    expect(fromLine("output/input <mail@outputinput.co>", "Kini Kouture")).toBe("Kini Kouture <mail@outputinput.co>");
    expect(fromLine("mail@outputinput.co", 'A "quoted"\nname')).toBe("A quoted name <mail@outputinput.co>");
    expect(fromLine("mail@outputinput.co")).toBe("mail@outputinput.co");
    expect(() => sendingSchema.parse({ replyTo: "not an email" })).toThrow(/doesn't look right/);
    expect(readBusiness({ email: "nope" })).toEqual(readBusiness({})); // junk falls back rather than breaking emails
  });

  test("order stages in the team's own words", () => {
    expect(statusNames(readShopSettings({}))).toEqual({ new: "New", inProgress: "In progress", sent: "Sent", done: "Done" });
    expect(statusNames(readShopSettings({ statusNames: { sent: "With the courier" } }))).toMatchObject({ sent: "With the courier", done: "Done" });
    expect(markAs("In progress")).toBe("Mark as in progress");
    expect(markAs("Sent via DHL")).toBe("Mark as sent via DHL");
  });

  test("the receipt is a tax invoice with a business number, and tells pickup customers where to come", () => {
    const order = {
      number: 1001,
      name: "Dee Buyer",
      currency: "AUD",
      items: [{ productId: "p", name: "Teal bikini", slug: "teal", unit: 38000, qty: 1, photo: null, note: "", digital: false }],
      discount: 0,
      discountCode: "",
      shipping: { name: "Pick up from the studio", kind: "pickup", estimate: "" },
      shippingPrice: 0,
      total: 38000,
      tax: 3455,
      taxName: "GST",
      address: { country: "AU" },
      paidAt: new Date("2026-10-16T03:00:00Z"),
      createdAt: new Date("2026-10-16T03:00:00Z"),
    } as unknown as Order;
    const plain = receiptEmail(site, order).text;
    expect(plain).not.toContain("Tax invoice");
    expect(plain).not.toContain("Pick up from:");
    const r = receiptEmail({ ...site, business: { tradingName: "Kini Kouture", businessNumber: "ABN 48 219 774 301", address: "Unit 4, 88 Guildford Road\nMount Lawley WA 6050", hours: "Tue–Sat", phone: "0413 220 118" } }, order);
    expect(r.text).toContain("Thanks for your order from Kini Kouture.");
    expect(r.text).toContain("Pick up from:\nUnit 4, 88 Guildford Road\nMount Lawley WA 6050\nTue–Sat");
    expect(r.text).toContain("Tax invoice · Kini Kouture · ABN 48 219 774 301\nOrder 1001 · 16 October 2026");
    expect(r.text).toContain("Total — $380 (includes GST $34.55)");
    expect(r.text.endsWith("Kini Kouture\n\nTax invoice · Kini Kouture · ABN 48 219 774 301\nOrder 1001 · 16 October 2026\n0413 220 118")).toBe(true);
  });
});
