import { describe, expect, test } from "vitest";
import { formatWeight, parcelOf, parseWeight, quoteFor, ratesFor, readShipping, whyNoRates, zoneFor, zoneGaps, type Shipping } from "@/modules/sites/shipping";

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
  test("checkout can say why there's nothing to pick, and the editor sees the gaps first", () => {
    expect(whyNoRates(s, { country: "AU" }, 15000)).toBeNull();
    expect(whyNoRates(readShipping({ zones: [s.zones[0]] }), { country: "TH" }, 1000)).toEqual({ why: "noZone" });
    const capped = readShipping({ zones: [{ id: "au", name: "AU", countries: ["AU"], rates: [rate("std", 1200, { maxTotal: 20000 }), rate("free", 0, { minTotal: 20000, maxTotal: 100000 })] }] });
    expect(whyNoRates(capped, { country: "AU" }, 1252300)).toEqual({ why: "total" });
    expect(zoneGaps(capped.zones[0])).toEqual({ noRates: false, localOnly: false, from: 100000, below: null });
    const local = readShipping({ zones: [{ id: "au", name: "AU", countries: ["AU"], rates: [rate("local", 500, { kind: "local", postcodes: ["6000"] })] }] });
    expect(whyNoRates(local, { country: "AU" }, 1000)).toEqual({ why: "postcode", typed: false });
    expect(whyNoRates(local, { country: "AU", postcode: "2000" }, 1000)).toEqual({ why: "postcode", typed: true });
    expect(zoneGaps(local.zones[0]).localOnly).toBe(true);
    expect(zoneGaps(readShipping({ zones: [{ id: "x", name: "X", countries: ["NZ"], rates: [] }] }).zones[0]).noRates).toBe(true);
    expect(zoneGaps(readShipping({ zones: [{ id: "x", name: "X", countries: ["NZ"], rates: [rate("free", 0, { minTotal: 20000 })] }] }).zones[0]).below).toBe(20000);
    expect(zoneGaps(s.zones[0])).toEqual({ noRates: false, localOnly: false, from: null, below: null });
  });
  test("junk settings fall back rather than break checkout", () => {
    expect(readShipping({ zones: "nope" })).toEqual({ dispatchDays: 2, zones: [] });
  });
});

describe("weight, oversized and pieces that ship free", () => {
  const rate = (id: string, price: number, extra: object = {}) => ({ id, kind: "post" as const, name: id, price, estimate: "", minTotal: null, maxTotal: null, postcodes: [], ...extra });
  const s: Shipping = readShipping({
    zones: [
      { id: "au", name: "AU", countries: ["AU"], rates: [rate("small", 900, { maxWeight: 1000 }), rate("heavy", 2400, { minWeight: 1000 }), rate("freight", 15000, { oversized: true }), rate("pickup", 0, { kind: "pickup" })] },
      { id: "row", name: "Rest", everywhere: true, quote: true, rates: [] },
    ],
  });
  const line = (extra: object) => ({ digital: false, qty: 1, weight: null, shipsFree: false, oversized: false, ...extra });

  test("the parcel: weights add up, free pieces and digital ones don't count", () => {
    expect(parcelOf([line({ weight: 180, qty: 3 }), line({ weight: 5000, shipsFree: true }), line({ digital: true, weight: 99 })])).toEqual({ weight: 540, oversized: false, allFree: false });
    expect(parcelOf([line({ shipsFree: true, oversized: true }), line({ digital: true })])).toEqual({ weight: 0, oversized: false, allFree: true });
    expect(parcelOf([line({ digital: true })]).allFree).toBe(false); // nothing to send at all
  });

  test("weight bands pick the rate; something oversized only gets the rates that take it, and pickup", () => {
    expect(ratesFor(s, { country: "AU" }, 10000, { weight: 400, oversized: false, allFree: false }).map((r) => r.id)).toEqual(["pickup", "small", "freight"]);
    expect(ratesFor(s, { country: "AU" }, 10000, { weight: 1000, oversized: false, allFree: false }).map((r) => r.id)).toEqual(["pickup", "heavy", "freight"]);
    expect(ratesFor(s, { country: "AU" }, 10000, { weight: 400, oversized: true, allFree: false }).map((r) => r.id)).toEqual(["pickup", "freight"]);
  });

  test("everything shipping free: free delivery wherever a zone reaches, quoted zones too", () => {
    const free = { weight: 0, oversized: false, allFree: true };
    expect(ratesFor(s, { country: "AU" }, 10000, free)).toEqual([expect.objectContaining({ name: "Free delivery", price: 0 })]);
    expect(quoteFor(s, "TH", "Thailand", free)).toBeNull();
    expect(ratesFor(s, { country: "TH" }, 10000, free)).toHaveLength(1);
    expect(ratesFor(readShipping({ zones: [s.zones[0]] }), { country: "TH" }, 10000, free)).toEqual([]); // still nowhere it doesn't go
  });

  test("why nothing fits: too big, too heavy", () => {
    const only = readShipping({ zones: [{ id: "au", name: "AU", countries: ["AU"], rates: [rate("small", 900, { maxWeight: 1000 })] }] });
    expect(whyNoRates(only, { country: "AU" }, 100, { weight: 5000, oversized: false, allFree: false })).toEqual({ why: "weight" });
    expect(whyNoRates(only, { country: "AU" }, 100, { weight: 10, oversized: true, allFree: false })).toEqual({ why: "oversized" });
  });

  test("weights read and write the way people type them", () => {
    expect(parseWeight("180")).toBe(180);
    expect(parseWeight("180 g")).toBe(180);
    expect(parseWeight("1.2kg")).toBe(1200);
    expect(parseWeight("1,500 g")).toBe(1500);
    expect(parseWeight(" ")).toBeNull();
    expect(() => parseWeight("heavy")).toThrow(/180 g/);
    expect(formatWeight(180)).toBe("180 g");
    expect(formatWeight(1250)).toBe("1.25 kg");
  });
});
