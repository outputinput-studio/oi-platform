import { describe, expect, test } from "vitest";
import { deliveryText, productDetailsSchema, readProductDetails, resolveDetails } from "@/modules/products/details";
import { readShipping } from "@/modules/sites/shipping";
import { detailRowsSchema, type DetailRow } from "@/modules/sites/shop";

const rate = (id: string, price: number, extra: object = {}) => ({ id, kind: "post" as const, name: id, price, estimate: "", minTotal: null, maxTotal: null, postcodes: [], ...extra });
const shipping = readShipping({
  dispatchDays: 2,
  zones: [
    {
      id: "au",
      name: "Aus",
      countries: ["AU"],
      rates: [rate("Standard", 1200, { maxTotal: 20000, estimate: "3–5 days" }), rate("Free shipping", 0, { minTotal: 20000 }), rate("Courier", 500, { kind: "local", postcodes: ["6000"] }), rate("Pick up", 0, { kind: "pickup" })],
    },
    { id: "eu", name: "EU", countries: ["DE", "FR", "IT", "ES", "NL"], rates: [rate("Air", 6000)] },
    { id: "row", name: "Rest", everywhere: true, quote: true, rates: [] },
  ],
});
const ready = { digital: false, make: "ready", leadTime: null, leadUnit: "weeks" as const };

describe("the delivery row", () => {
  test("is written from Shipping: when it goes, then each place by name with its rates", () => {
    const text = deliveryText(shipping, "AUD", ready);
    expect(text.split("\n\n")[0]).toBe("Posted within 2 business days.");
    expect(text).toContain("Australia: Standard, $12 under $200 (3–5 days); Free shipping on orders of $200 or more; Courier, $5 in some postcodes; Pick up, free.");
    // Zone names are the team's own; customers see the places, the long lists cut short.
    expect(text).toContain("Germany, France, Italy and 2 more: Air, $60.");
    expect(text).not.toContain("Aus:");
    expect(text).toContain("Everywhere else: quoted for your address before you pay.");
  });

  test("made to order says how long; digital says nothing is posted; no zones means it's included", () => {
    expect(deliveryText(shipping, "AUD", { ...ready, make: "madeToOrder", leadTime: 1 })).toMatch(/^Made to order, then posted: around 1 week\./);
    expect(deliveryText(shipping, "AUD", { ...ready, make: "madeToOrder", leadTime: 6 })).toMatch(/^Made to order, then posted: around 6 weeks\./);
    expect(deliveryText(shipping, "AUD", { ...ready, digital: true })).toBe("A digital product: nothing is posted.");
    expect(deliveryText(readShipping({ dispatchDays: 0 }), "AUD", ready)).toBe("Delivery is included.");
  });

  test("one zone for everywhere is just Everywhere", () => {
    expect(deliveryText(readShipping({ dispatchDays: 0, zones: [{ id: "all", name: "World", everywhere: true, rates: [rate("Tracked", 2500)] }] }), "AUD", ready)).toBe("Everywhere: Tracked, $25.");
  });
});

describe("product details", () => {
  const rows: DetailRow[] = detailRowsSchema.parse([
    { id: "materials", title: "Materials", text: "Thermo-pine." },
    { id: "care", title: "Care", text: "Oil once a year." },
    { id: "delivery", kind: "delivery", title: "Delivery" },
    { id: "returns", title: "Returns", text: "" },
  ]);

  test("each row as the site wrote it, changed here, or hidden here; empty rows don't show", () => {
    const out = resolveDetails(rows, { care: { mode: "custom", text: "Wipe down after use." }, materials: { mode: "hidden" } }, "Posted within 2 business days.");
    expect(out).toEqual([
      { id: "care", title: "Care", text: "Wipe down after use." },
      { id: "delivery", title: "Delivery", text: "Posted within 2 business days." },
    ]);
    // A product can give a row the site left empty its own words.
    expect(resolveDetails(rows, { returns: { mode: "custom", text: "Final sale." } }, "").map((r) => r.id)).toEqual(["materials", "care", "returns"]);
  });

  test("stored changes are read leniently: junk and changes for rows that no longer exist are harmless", () => {
    expect(readProductDetails({ care: { mode: "custom", text: "Ok" }, bad: { mode: "explode" }, worse: 5 })).toEqual({ care: { mode: "custom", text: "Ok" } });
    expect(readProductDetails(null)).toEqual({});
    expect(resolveDetails(rows, { gone: { mode: "hidden" } }, "x")).toHaveLength(3);
    expect(productDetailsSchema.safeParse({ care: { mode: "custom", text: "x".repeat(2001) } }).success).toBe(false);
  });

  test("rows need a title; twelve at most", () => {
    expect(detailRowsSchema.safeParse([{ id: "a", title: " " }]).success).toBe(false);
    expect(detailRowsSchema.safeParse(Array.from({ length: 13 }, (_, i) => ({ id: `r${i}`, title: `Row ${i}` }))).success).toBe(false);
  });
});
