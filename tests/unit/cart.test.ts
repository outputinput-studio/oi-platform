import { describe, expect, test } from "vitest";
import { addLine, cartCount, lineKey, readCart, setLine, taxOn, writeCart, MAX_QTY } from "@/modules/orders/cart";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

describe("cart", () => {
  test("a cookie that isn't a cart reads as empty", () => {
    expect(readCart(undefined)).toEqual([]);
    expect(readCart("not json")).toEqual([]);
    expect(readCart(JSON.stringify([{ id: "x", q: 1 }]))).toEqual([]);
    expect(readCart(JSON.stringify([{ id: A, q: 0 }]))).toEqual([]);
    expect(readCart(writeCart([{ id: A, q: 2 }]))).toEqual([{ id: A, q: 2 }]);
  });
  test("adding, changing and removing", () => {
    let c = addLine([], A);
    c = addLine(c, A);
    c = addLine(c, B, 3);
    expect(c).toEqual([
      { id: A, q: 2 },
      { id: B, q: 3 },
    ]);
    expect(cartCount(c)).toBe(5);
    expect(addLine(c, A, 100).find((l) => l.id === A)?.q).toBe(MAX_QTY);
    expect(setLine(c, lineKey({ id: A }), 0)).toEqual([{ id: B, q: 3 }]);
  });
  test("a combination and what was filled in make their own line", () => {
    let c = addLine([], { id: A, v: "8 / Print" });
    c = addLine(c, { id: A, v: "8 / Print" });
    c = addLine(c, { id: A, v: "10 / Print" });
    c = addLine(c, { id: A, v: "10 / Print", f: { m: "92" } });
    c = addLine(c, { id: A, v: "10 / Print", f: { m: "92" } });
    expect(c.map((l) => l.q)).toEqual([2, 1, 2]);
    expect(lineKey({ id: A, f: { b: "1", a: "2" } })).toBe(lineKey({ id: A, f: { a: "2", b: "1" } }));
    expect(setLine(c, lineKey({ id: A, v: "10 / Print" }), 5).map((l) => l.q)).toEqual([2, 5, 2]);
    expect(readCart(writeCart(c))).toEqual(c);
    // A cookie that tries to smuggle in something long is thrown out whole.
    expect(readCart(JSON.stringify([{ id: A, q: 1, f: { m: "x".repeat(500) } }]))).toEqual([]);
  });
  test("tax: worked out of an inclusive price, or added on", () => {
    expect(taxOn(42000, 10, true)).toEqual({ tax: 3818, total: 42000 });
    expect(taxOn(42000, 10, false)).toEqual({ tax: 4200, total: 46200 });
    expect(taxOn(10000, 7, true)).toEqual({ tax: 654, total: 10000 });
    expect(taxOn(10000, 0, true)).toEqual({ tax: 0, total: 10000 });
  });
});
