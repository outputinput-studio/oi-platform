/**
 * A site's plan (Carl, Oct 2026: set by us in ops): its name and words,
 * the monthly price, and the limits Settings · Plan measures against.
 */
import { describe, expect, test } from "vitest";
import { formatBytes, planSchema, readPlan, usageLevel } from "@/modules/plans/plan";

describe("plan", () => {
  test("nothing set is no plan yet", () => {
    expect(readPlan({})).toBeNull();
    expect(readPlan(null)).toBeNull();
    expect(readPlan({ name: "" })).toBeNull();
  });

  test("a plan with no limit on products or visits", () => {
    const p = planSchema.parse({ name: " Shop and journal ", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: 10000 } });
    expect(p).toEqual({ name: "Shop and journal", description: "", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: 10000 } });
    expect(readPlan(p)).toEqual(p);
  });

  test("bad values point at their field", () => {
    const r = planSchema.safeParse({ name: "", price: -1, currency: "XYZ", limits: { storageGb: 0, products: 0, people: 0, visits: 1.5 } });
    expect(r.success).toBe(false);
    const paths = r.error!.issues.map((i) => i.path.join("."));
    expect(paths).toEqual(expect.arrayContaining(["name", "price", "currency", "limits.storageGb", "limits.products", "limits.people", "limits.visits"]));
  });
});

describe("usage", () => {
  test("fine, getting close from 80%, over the limit; no limit is always fine", () => {
    expect(usageLevel(10, 100)).toBe("ok");
    expect(usageLevel(80, 100)).toBe("close");
    expect(usageLevel(101, 100)).toBe("over");
    expect(usageLevel(999999, null)).toBe("ok");
  });

  test("bytes in words", () => {
    expect(formatBytes(0)).toBe("0 MB");
    expect(formatBytes(450 * 1024 * 1024)).toBe("450 MB");
    expect(formatBytes(1.84 * 1024 ** 3)).toBe("1.8 GB");
    expect(formatBytes(12 * 1024 ** 3)).toBe("12 GB");
  });
});

describe("limits on one line", () => {
  test("numbers, and no limit where there's none", async () => {
    const { limitsLine } = await import("@/modules/plans/plan");
    expect(limitsLine({ name: "x", description: "", price: 0, currency: "AUD", limits: { storageGb: 5, products: null, people: 1, visits: 10000 } })).toBe(
      "5 GB · no limit on products · 1 person · 10,000 visits a month",
    );
  });
});
