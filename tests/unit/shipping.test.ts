import { describe, expect, test } from "vitest";
import { quoteFor, ratesFor, readShipping, zoneFor, type Shipping } from "@/modules/sites/shipping";

const rate = (id: string, price: number, extra: object = {}) => ({ id, kind: "post" as const, name: id, price, estimate: "", minTotal: null, maxTotal: null, postcodes: [], ...extra });
const s: Shipping = readShipping({
  dispatchDays: 2,
  zones: [
    { id: "au", name: "Australia", countries: ["AU"], rates: [rate("standard", 1200, { maxTotal: 20000 }), rate("free", 0, { minTotal: 20000 }), rate("express", 2500), rate("local", 500, { kind: "local", postcodes: ["6008", "6000"] }), rate("pickup", 0, { kind: "pickup" })] },
    { id: "nz", name: "New Zealand", countries: ["NZ"], rates: [rate("nz", 3000)] },
    { id: "row", name: "Rest of world", everywhere: true, rates: [rate("intl", 6000)] },
  ],
});

describe("shipping", () => {
  test("nobody set it up: free delivery everywhere", () => {
    expect(ratesFor(readShipping({}), { country: "TH" }, 1000).map((r) => r.id)).toEqual(["free"]);
  });
  test("the first zone that names the country wins; everywhere else catches the rest", () => {
    expect(zoneFor(s, "nz")?.id).toBe("nz");
    expect(zoneFor(s, "TH")?.id).toBe("row");
    const noRest = readShipping({ zones: [s.zones[0]] });
    expect(ratesFor(noRest, { country: "TH" }, 1000)).toEqual([]);
  });
  test("order totals and postcodes decide which rates show, cheapest first", () => {
    expect(ratesFor(s, { country: "AU" }, 15000).map((r) => r.id)).toEqual(["pickup", "standard", "express"]);
    expect(ratesFor(s, { country: "AU" }, 20000).map((r) => r.id)).toEqual(["free", "pickup", "express"]);
    expect(ratesFor(s, { country: "AU", postcode: "6008" }, 15000).map((r) => r.id)).toEqual(["pickup", "local", "standard", "express"]);
  });
  test("a zone quoted individually has no rates at checkout, only its message", () => {
    const q = readShipping({ zones: [s.zones[0], { ...s.zones[1], quote: true }, { ...s.zones[2], quote: true, quoteMessage: "We'll price it and email you." }] });
    expect(quoteFor(q, "AU", "Australia")).toBeNull();
    expect(ratesFor(q, { country: "AU" }, 15000).length).toBeGreaterThan(0);
    expect(ratesFor(q, { country: "NZ" }, 15000)).toEqual([]);
    expect(quoteFor(q, "NZ", "New Zealand")).toBe("We'll work out delivery to New Zealand and send you a quote.");
    expect(quoteFor(q, "TH", "Thailand")).toBe("We'll price it and email you.");
    expect(readShipping({ zones: [s.zones[0]] }).zones[0]).toMatchObject({ quote: false, quoteMessage: "" });
  });
  test("junk settings fall back rather than break checkout", () => {
    expect(readShipping({ zones: "nope" })).toEqual({ dispatchDays: 2, zones: [] });
  });
});
