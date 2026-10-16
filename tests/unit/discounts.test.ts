import { describe, expect, test } from "vitest";
import { applyCode, codeEditSchema, codeState, describeCode, type CodeRules } from "@/modules/discounts/rules";

const C1 = "11111111-1111-4111-8111-111111111111";
const P1 = "22222222-2222-4222-8222-222222222222";
const base: CodeRules = { code: "WELCOME10", kind: "percent", value: 10, appliesTo: "all", categoryId: null, productIds: [], minSpend: null, maxUses: null, startsAt: null, endsAt: null, active: true, uses: 0 };
const lines = [
  { productId: P1, categoryId: C1, unit: 42000, qty: 1 },
  { productId: "33333333-3333-4333-8333-333333333333", categoryId: null, unit: 18000, qty: 2 },
];

describe("discount codes", () => {
  test("percent, amount and free postage", () => {
    expect(applyCode(base, lines, "AUD")).toEqual({ ok: true, off: 7800, freeShipping: false });
    expect(applyCode({ ...base, kind: "amount", value: 5000 }, lines, "AUD")).toEqual({ ok: true, off: 5000, freeShipping: false });
    expect(applyCode({ ...base, kind: "freeShipping" }, lines, "AUD")).toEqual({ ok: true, off: 0, freeShipping: true });
  });
  test("only the pieces it's for", () => {
    expect(applyCode({ ...base, appliesTo: "category", categoryId: C1 }, lines, "AUD")).toMatchObject({ off: 4200 });
    expect(applyCode({ ...base, appliesTo: "products", productIds: [P1], kind: "amount", value: 100000 }, lines, "AUD")).toMatchObject({ off: 42000 });
    expect(applyCode({ ...base, appliesTo: "products", productIds: ["44444444-4444-4444-8444-444444444444"] }, lines, "AUD")).toMatchObject({ ok: false, reason: expect.stringMatching(/doesn't apply/) });
  });
  test("when it doesn't work, it says why", () => {
    const now = new Date("2026-10-16T00:00:00Z");
    expect(applyCode({ ...base, minSpend: 100000 }, lines, "AUD")).toMatchObject({ ok: false, reason: "WELCOME10 needs a spend of at least $1,000 before postage." });
    expect(codeState({ ...base, startsAt: new Date("2026-11-01") }, now)).toBe("scheduled");
    expect(codeState({ ...base, endsAt: new Date("2026-10-01") }, now)).toBe("expired");
    expect(codeState({ ...base, maxUses: 40, uses: 40 }, now)).toBe("usedUp");
    expect(codeState({ ...base, active: false }, now)).toBe("off");
    expect(applyCode({ ...base, active: false }, lines, "AUD")).toMatchObject({ ok: false });
  });
  test("what the list says, and what the editor accepts", () => {
    expect(describeCode({ ...base, kind: "amount", value: 5000, minSpend: 40000 }, "AUD")).toBe("$50 off everything, minimum spend $400");
    expect(describeCode({ ...base, kind: "freeShipping" }, "AUD")).toBe("Free postage");
    expect(codeEditSchema.safeParse({ code: "welcome 10", kind: "percent", value: 10 }).success).toBe(false);
    expect(codeEditSchema.parse({ code: "welcome10", kind: "percent", value: 10 }).code).toBe("WELCOME10");
    expect(codeEditSchema.safeParse({ code: "BIG", kind: "percent", value: 150 }).success).toBe(false);
    expect(codeEditSchema.safeParse({ code: "CAT", kind: "percent", value: 10, appliesTo: "category" }).success).toBe(false);
  });
});
