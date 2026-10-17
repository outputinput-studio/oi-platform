import { describe, expect, test } from "vitest";
import { duplicatePairs, phoneKey, mergedValues } from "@/modules/contacts/duplicates";

const c = (id: string, name: string, phone = "", notSame: string[] = []) => ({
  id,
  name,
  phone,
  notSame,
});

describe("possible duplicates", () => {
  test("a phone number is the same however it's written", () => {
    expect(phoneKey("0425 779 122")).toBe(phoneKey("+61 425-779-122"));
    expect(phoneKey("(02) 9876 5432")).toBe(phoneKey("+61 2 9876 5432"));
    expect(phoneKey("123")).toBeNull();
    expect(phoneKey("")).toBeNull();
  });

  test("sharing a phone number, or the same full name; never one they've said are different", () => {
    const rows = [
      c("1", "Amelia Frost", "0425 779 122"),
      c("2", "A. Frost", "+61 425 779 122"),
      c("3", "Jo Bloggs"),
      c("4", "jo  bloggs"),
      c("5", "Kim", "0400 000 001", ["6"]),
      c("6", "Kimberley", "0400000001"),
      c("7", "Sam"),
      c("8", "Sam"),
    ];
    expect(duplicatePairs(rows)).toEqual([
      { a: "1", b: "2", reason: "These two share a phone number." },
      { a: "3", b: "4", reason: "These two have the same name." },
    ]);
  });

  test("what the merged contact keeps: the picked value, or the only one there is", () => {
    const a = { name: "Amelia Frost", email: "amelia.frost@gmail.com", phone: "" };
    const b = { name: "A. Frost", email: "a.frost@work.com.au", phone: "0425 779 122" };
    expect(mergedValues(a, b, { name: "a", email: "b", phone: "a" })).toEqual({
      name: "Amelia Frost",
      email: "a.frost@work.com.au",
      phone: "0425 779 122",
    });
    expect(mergedValues(a, b, { name: "b", email: "a", phone: "b" })).toEqual({
      name: "A. Frost",
      email: "amelia.frost@gmail.com",
      phone: "0425 779 122",
    });
  });
});
