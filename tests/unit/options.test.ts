import { describe, expect, test } from "vitest";
import { customerView, effectiveAvailability, makeLine, variantNote } from "@/modules/products/catalogue";
import {
  checkAnswers,
  combinations,
  describeChoice,
  MAX_COMBINATIONS,
  optionsSchema,
  readOptions,
  unitPrice,
  upsertVariant,
  variantKey,
  variantMax,
  variantsFor,
  variantState,
  withChoice,
  type ProductOption,
  type Variant,
} from "@/modules/products/options";

const opt = (id: string, name: string, values: string[], extra: Partial<ProductOption> = {}): ProductOption => ({ id, name, kind: "list", values, answer: "text", help: "", required: true, ...extra });
const size = opt("s", "Size", ["6", "8", "10"]);
const colour = opt("c", "Colour", ["Print", "Black"]);
const measure = opt("m", "Made to size", [], { kind: "fill", answer: "number", help: "Bust in cm" });
const v = (values: string[], extra: Partial<Variant> = {}): Variant => ({ values, on: true, price: null, code: "", make: "ready", stock: null, ...extra });

describe("options and combinations", () => {
  test("every mix of the list values, in order; a fill-in makes none", () => {
    expect(combinations([size, colour]).map((x) => x.join(" "))).toEqual(["6 Print", "6 Black", "8 Print", "8 Black", "10 Print", "10 Black"]);
    expect(combinations([measure])).toEqual([]);
    expect(combinations([size, measure])).toEqual([["6"], ["8"], ["10"]]);
  });

  test("the rules: two at most, values for a list, choices for a choice, each once, not too many mixes", () => {
    expect(optionsSchema.safeParse([size, colour, opt("x", "Fit", ["Slim"])]).success).toBe(false);
    expect(optionsSchema.safeParse([opt("s", "Size", [])]).error?.issues[0]).toMatchObject({ path: [0, "values"] });
    expect(optionsSchema.safeParse([opt("s", "Size", ["8", "8"])]).success).toBe(false);
    expect(optionsSchema.safeParse([size, opt("t", "size", ["A"])]).error?.issues[0]).toMatchObject({ message: "Give each option its own name.", path: [1, "name"] });
    expect(optionsSchema.safeParse([{ ...measure, answer: "choice", values: ["Short"] }]).success).toBe(false);
    const many = Array.from({ length: 20 }, (_, i) => String(i));
    expect(optionsSchema.safeParse([opt("a", "A", many), opt("b", "B", many.slice(0, 6))]).error?.issues[0].message).toMatch(String(MAX_COMBINATIONS));
    expect(readOptions([{ junk: true }, size])).toEqual([size]);
  });

  test("settings are kept by values: a value taken out and put back finds its price again", () => {
    const stored = [v(["8", "Print"], { price: 44000, stock: 2 })];
    const all = variantsFor([size, colour], stored, "madeToOrder");
    expect(all).toHaveLength(6);
    expect(all.find((x) => variantKey(x.values) === "8 / Print")).toMatchObject({ price: 44000, stock: 2 });
    expect(all.find((x) => variantKey(x.values) === "6 / Print")).toMatchObject({ make: "madeToOrder", price: null });
    // 8 goes from the list, then comes back.
    expect(variantsFor([{ ...size, values: ["6", "10"] }, colour], stored, "ready").some((x) => x.values[0] === "8")).toBe(false);
    expect(variantsFor([size, colour], stored, "ready").find((x) => variantKey(x.values) === "8 / Print")?.price).toBe(44000);
    // Old settings for mixes no longer offered go, oldest first, past twice the most a product can have.
    const old = Array.from({ length: MAX_COMBINATIONS * 2 + 5 }, (_, i) => v([`old${i}`]));
    const kept = upsertVariant(old, v(["6"], { price: 1 }), [size]);
    expect(kept).toHaveLength(MAX_COMBINATIONS * 2);
    expect(kept.at(-1)).toMatchObject({ values: ["6"], price: 1 });
    expect(kept[0].values[0]).toBe("old6");
  });

  test("state, how many one cart can take, and price", () => {
    expect(variantState(v(["6"], { on: false }))).toBe("off");
    expect(variantState(v(["6"], { stock: 0 }))).toBe("soldOut");
    expect(variantState(v(["6"], { make: "oneOnly", stock: 0 }))).toBe("sold");
    expect(variantState(v(["6"], { make: "oneOnly" }))).toBe("available");
    expect(variantMax(v(["6"], { stock: 3 }), 1)).toBe(2);
    expect(variantMax(v(["6"], { make: "oneOnly" }), 1)).toBe(0);
    expect(variantMax(v(["6"], { make: "madeToOrder" }), 5)).toBe(20);
    const p = { price: 42000, salePrice: 38000 };
    expect(unitPrice(p, v(["6"]))).toBe(38000);
    expect(unitPrice(p, v(["6"], { price: 45000 }))).toBe(45000);
    expect(unitPrice({ price: null, salePrice: null }, null)).toBeNull();
  });

  test("fill-ins: required, numbers, choices; then what was chosen, in order", () => {
    expect(checkAnswers([size, measure], {})).toEqual({ ok: false, field: "opt-m", message: "Made to size: fill this in." });
    expect(checkAnswers([measure], { m: "ninety" })).toMatchObject({ ok: false });
    expect(checkAnswers([measure], { m: " 92.5 " })).toEqual({ ok: true, answers: { m: "92.5" } });
    expect(checkAnswers([{ ...measure, required: false }], {})).toEqual({ ok: true, answers: {} });
    const pick = { ...measure, id: "l", name: "Length", answer: "choice" as const, values: ["Short", "Long"] };
    expect(checkAnswers([pick], { l: "Medium" })).toMatchObject({ ok: false });
    const chosen = describeChoice([size, measure], ["8"], { m: "92" });
    expect(chosen).toEqual([
      { name: "Size", value: "8" },
      { name: "Made to size", value: "92" },
    ]);
    expect(withChoice("Teal bikini", chosen)).toBe("Teal bikini (Size: 8, Made to size: 92)");
    expect(withChoice("Teal bikini", [])).toBe("Teal bikini");
  });
});

describe("a product with combinations, as customers see it", () => {
  const base = { make: "ready" as const, stock: null, leadTime: 6, leadUnit: "weeks" as const, availability: "forSale" as const, buyWith: "cart" as const, price: 42000, salePrice: null, visible: true, options: [size, colour] };
  test("from the lowest price when they differ; sold out when none can be had", () => {
    const view = customerView({ ...base, variants: [v(["10", "Print"], { price: 44000 })] }, "AUD");
    expect(view).toMatchObject({ price: "From $420", buyable: true, note: "Ready to ship" });
    const allGone = variantsFor([size, colour], [], "ready").map((x) => ({ ...x, stock: 0 }));
    expect(effectiveAvailability({ ...base, variants: allGone })).toBe("soldOut");
    expect(customerView({ ...base, variants: allGone }, "AUD")).toMatchObject({ note: "Sold out", buyable: false });
    expect(makeLine({ ...base, variants: [v(["6", "Print"], { stock: 0 })] })).toBe("6 combinations · 5 available");
  });
  test("all made to order: the lead time shows; one picked says its own state", () => {
    expect(customerView({ ...base, make: "madeToOrder", variants: [] }, "AUD").note).toBe("Made to order — around 6 weeks");
    expect(variantNote(v(["8", "Black"], { stock: 2 }), base)).toBe("Ready to ship · 2 left");
    expect(variantNote(v(["8", "Black"], { make: "oneOnly", stock: 0 }), base)).toBe("Sold");
  });
});
