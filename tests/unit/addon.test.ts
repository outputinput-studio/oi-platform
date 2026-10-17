/**
 * Add-ons (Stage 39c): what they add to a plan, in numbers and in words.
 */
import { describe, expect, test } from "vitest";
import { addonEffect, addonSchema, perMonth, withAddons } from "@/modules/addons/addon";
import type { Plan } from "@/modules/plans/plan";

const plan: Plan = { name: "Shop and journal", description: "", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: 10000 } };

describe("add-ons", () => {
  test("capacity needs a number; a feature has none", () => {
    expect(addonSchema.safeParse({ name: "10 GB", description: "", price: 1200, currency: "AUD", kind: "storage", amount: null, selfServe: true }).error?.issues[0].path).toEqual(["amount"]);
    expect(addonSchema.parse({ name: "Quotes", description: "", price: 1800, currency: "AUD", kind: "feature", amount: 5, selfServe: false }).amount).toBeNull();
    expect(addonSchema.safeParse({ name: "", description: "", price: -1, currency: "AUD", kind: "nope", amount: 1, selfServe: true }).error?.issues.map((i) => i.path[0])).toEqual(["name", "price", "kind"]);
  });

  test("on top of the plan; no limit stays no limit", () => {
    const up = withAddons(plan, [
      { kind: "storage", amount: 10 },
      { kind: "visits", amount: 20000 },
      { kind: "people", amount: 1 },
      { kind: "feature", amount: null },
    ]);
    expect(up?.limits).toEqual({ storageGb: 15, products: null, people: 3, visits: 30000 });
    expect(withAddons({ ...plan, limits: { ...plan.limits, visits: null } }, [{ kind: "visits", amount: 5 }])?.limits.visits).toBeNull();
    expect(withAddons(null, [{ kind: "storage", amount: 1 }])).toBeNull();
  });

  test("in the design's words", () => {
    expect(addonEffect({ kind: "storage", amount: 10 }, plan)).toBe("Takes you to 15 GB.");
    expect(addonEffect({ kind: "visits", amount: 20000 }, plan)).toBe("Takes you to 30,000 a month.");
    expect(addonEffect({ kind: "people", amount: 1 }, plan)).toBe("Takes you to 3 people.");
    expect(addonEffect({ kind: "feature", amount: null }, plan)).toBeNull();
    expect(perMonth({ price: 1500, currency: "AUD" })).toBe("$15/mo");
  });
});
