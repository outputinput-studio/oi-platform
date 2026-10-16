import { describe, expect, test } from "vitest";
import { adminTag, customerView, makeLine } from "@/modules/products/catalogue";
import { formatPrice, parsePrice, priceInput, readShopSettings } from "@/modules/sites/shop";

const base = { make: "ready" as const, stock: null, leadTime: null, leadUnit: "weeks" as const, availability: "forSale" as const, price: 42000, salePrice: null, visible: true };

describe("catalogue", () => {
  test("prices read the way people write them", () => {
    expect(formatPrice(42000, "AUD")).toBe("$420");
    expect(formatPrice(128050, "AUD")).toBe("$1,280.50");
    expect(formatPrice(150000, "THB")).toBe("฿1,500");
    expect(parsePrice("$1,280.50")).toBe(128050);
    expect(parsePrice("")).toBeNull();
    expect(() => parsePrice("4.2.0")).toThrow();
    expect(() => parsePrice("abc")).toThrow();
    expect(parsePrice("A$ 1 280")).toBe(128000);
    expect(priceInput(42000)).toBe("420");
    expect(priceInput(42050)).toBe("420.50");
    expect(readShopSettings({ currency: "nope" })).toMatchObject({ currency: "AUD", taxName: "GST" });
  });

  test("what a customer sees", () => {
    expect(customerView({ ...base, make: "madeToOrder", leadTime: 6 }, "AUD")).toEqual({ price: "$420", was: null, note: "Made to order — around 6 weeks", buyable: true, quotable: false });
    expect(customerView({ ...base, salePrice: 38000 }, "AUD")).toMatchObject({ price: "$380", was: "$420" });
    expect(customerView({ ...base, stock: 0 }, "AUD")).toMatchObject({ note: "Sold out", buyable: false });
    expect(customerView({ ...base, stock: 2 }, "AUD").note).toBe("Ready to ship · 2 left");
    expect(customerView({ ...base, availability: "enquire" }, "AUD")).toMatchObject({ note: "Enquire to order", buyable: false });
    expect(customerView({ ...base, price: null }, "AUD")).toMatchObject({ price: null, buyable: false });
  });

  test("Add to cart, Email quote, or both", () => {
    expect(customerView({ ...base, buyWith: "quote" }, "AUD")).toMatchObject({ buyable: false, quotable: true });
    expect(customerView({ ...base, buyWith: "quote", price: null }, "AUD")).toMatchObject({ price: null, quotable: true }); // the team names the price
    expect(customerView({ ...base, buyWith: "both" }, "AUD")).toMatchObject({ buyable: true, quotable: true });
    expect(customerView({ ...base, buyWith: "both", availability: "comingSoon" }, "AUD")).toMatchObject({ buyable: false, quotable: false });
    expect(customerView({ ...base, buyWith: "both", stock: 0 }, "AUD")).toMatchObject({ buyable: false, quotable: false });
    expect(adminTag({ ...base, buyWith: "quote" })).toBe("Email quote");
    expect(adminTag({ ...base, buyWith: "both" })).toBeNull();
  });

  test("the admin list's lines", () => {
    expect(makeLine({ ...base, make: "madeToOrder", leadTime: 1 })).toBe("Made to order · 1 week");
    expect(makeLine({ ...base, make: "oneOnly" })).toBe("One only");
    expect(adminTag(base)).toBeNull();
    expect(adminTag({ ...base, visible: false })).toBe("Hidden");
    expect(adminTag({ ...base, stock: 0 })).toBe("Sold out");
    expect(adminTag({ ...base, availability: "comingSoon" })).toBe("Coming soon");
  });
});
