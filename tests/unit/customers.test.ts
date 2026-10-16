import { describe, expect, test } from "vitest";
import { codeHash, hashPassword, lockMinutes, newCode, sameHex, tokenHash, verifyPassword } from "@/modules/customers/secrets";
import { waitText } from "@/lib/time";
import { readAccountSettings } from "@/modules/customers/settings";
import { orderLine, timeline } from "@/modules/customers/timeline";
import type { Order } from "@/db/schema";

describe("secrets", () => {
  test("codes are six digits; a code's hash belongs to one site and one email", () => {
    for (let i = 0; i < 50; i++) expect(newCode()).toMatch(/^\d{6}$/);
    const a = codeHash("s", "site-a", "a@example.com", "123456");
    expect(sameHex(a, codeHash("s", "site-a", "a@example.com", "123456"))).toBe(true);
    expect(sameHex(a, codeHash("s", "site-b", "a@example.com", "123456"))).toBe(false);
    expect(sameHex(a, codeHash("s", "site-a", "b@example.com", "123456"))).toBe(false);
    expect(sameHex(a, codeHash("other secret", "site-a", "a@example.com", "123456"))).toBe(false);
    expect(sameHex(a, "")).toBe(false);
    expect(tokenHash("x")).toHaveLength(64);
  });

  test("passwords: salted scrypt, checked in constant time", async () => {
    const h = await hashPassword("wattle garden");
    expect(h).toMatch(/^scrypt\$16384\$8\$1\$/);
    expect(h).not.toBe(await hashPassword("wattle garden")); // a new salt each time
    expect(await verifyPassword("wattle garden", h)).toBe(true);
    expect(await verifyPassword("wattle gardens", h)).toBe(false);
    expect(await verifyPassword("wattle garden", "bcrypt$nope")).toBe(false);
  });

  test("lock-outs double from 2 minutes to an hour; waits read as words", () => {
    expect([1, 2, 3, 4, 5, 6, 7].map(lockMinutes)).toEqual([2, 4, 8, 16, 32, 60, 60]);
    expect([24, 1, 60, 61, 120, 3600].map(waitText)).toEqual(["24 seconds", "1 second", "1 minute", "2 minutes", "2 minutes", "an hour"]);
  });

  test("accounts are off unless turned on; junk reads as off", () => {
    expect(readAccountSettings(undefined)).toEqual({ enabled: false, passwords: false });
    expect(readAccountSettings({ enabled: "yes" })).toEqual({ enabled: false, passwords: false });
    expect(readAccountSettings({ enabled: true })).toEqual({ enabled: true, passwords: false });
  });
});

describe("where an order is, in the customer's words", () => {
  const base = {
    status: "new",
    paymentStatus: "paid",
    createdAt: new Date("2026-08-28T01:14:00Z"),
    paidAt: new Date("2026-08-28T01:14:00Z"),
    statusTimes: {},
    shipping: { name: "Standard", kind: "post", estimate: "3–5 business days" },
    tracking: {},
    items: [{ digital: false }],
    refunded: 0,
    total: 19200,
  } as unknown as Order;

  test("posted: placed, getting it ready, posted with the carrier, delivered expected", () => {
    const t = timeline({ ...base, status: "sent", statusTimes: { sent: "2026-08-30T00:00:00.000Z" }, tracking: { carrier: "Australia Post", number: "33ANJ482019" } });
    expect(t.headline).toBe("On its way to you");
    expect(t.steps).toEqual([
      { key: "new", label: "Order placed", done: true, at: "2026-08-28T01:14:00.000Z" },
      { key: "inProgress", label: "Getting it ready", done: true, at: undefined },
      { key: "sent", label: "Posted", done: true, at: "2026-08-30T00:00:00.000Z", detail: "Australia Post" },
      { key: "done", label: "Delivered", done: false, at: undefined, detail: "Expected 3–5 business days" },
    ]);
    expect(t.tracking).toEqual({ carrier: "Australia Post", number: "33ANJ482019", url: "https://auspost.com.au/mypost/track/details/33ANJ482019" });
    expect(orderLine({ ...base, status: "sent" })).toBe("On its way");
  });

  test("a pickup is ready to collect, then collected; digital is just ready; refunds say so", () => {
    const pickup = timeline({ ...base, status: "sent", shipping: { name: "Pick up", kind: "pickup", estimate: "" } });
    expect(pickup.headline).toBe("Ready to collect");
    expect(pickup.steps.map((s) => s.label)).toEqual(["Order placed", "Getting it ready", "Ready to collect", "Collected"]);
    const digital = timeline({ ...base, shipping: null, items: [{ digital: true }] } as unknown as Order);
    expect(digital.steps.map((s) => s.label)).toEqual(["Order placed", "Ready for you"]);
    expect(timeline({ ...base, paymentStatus: "refunded" }).headline).toBe("Refunded");
    expect(orderLine(base)).toBe("Order placed");
  });
});
