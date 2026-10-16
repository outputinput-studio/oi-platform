import { describe, expect, test } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/secrets";

describe("secrets", () => {
  test("round trip, a fresh sealing every time, and tampering is caught", () => {
    const key = "rk_live_abcdefghijklmnop1234";
    const a = encryptSecret(key);
    const b = encryptSecret(key);
    expect(a).not.toBe(b);
    expect(a).not.toContain(key);
    expect(decryptSecret(a)).toBe(key);
    const [v, iv, tag, data] = a.split(":");
    const flipped = Buffer.from(data, "base64");
    flipped[0] ^= 1;
    expect(() => decryptSecret([v, iv, tag, flipped.toString("base64")].join(":"))).toThrow();
    expect(() => decryptSecret("nonsense")).toThrow();
  });
});
