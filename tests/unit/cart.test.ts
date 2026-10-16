import { describe, expect, test } from "vitest";
import { addLine, cartCount, readCart, setLine, taxOn, writeCart, MAX_QTY } from "@/modules/orders/cart";

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
    expect(setLine(c, A, 0)).toEqual([{ id: B, q: 3 }]);
  });
  test("tax: worked out of an inclusive price, or added on", () => {
    expect(taxOn(42000, 10, true)).toEqual({ tax: 3818, total: 42000 });
    expect(taxOn(42000, 10, false)).toEqual({ tax: 4200, total: 46200 });
    expect(taxOn(10000, 7, true)).toEqual({ tax: 654, total: 10000 });
    expect(taxOn(10000, 0, true)).toEqual({ tax: 0, total: 10000 });
  });
});
