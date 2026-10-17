/**
 * The authenticator app (Carl, Oct 2026): TOTP as in RFC 6238, with
 * nothing but Node's crypto; ten one-time recovery codes; and the words
 * for each device someone is signed in on.
 */
import { describe, expect, test } from "vitest";
import {
  base32Decode,
  base32Encode,
  checkTotp,
  groupKey,
  hotp,
  newRecoveryCodes,
  newSecret,
  normaliseRecovery,
  otpauthUri,
  recoveryHash,
  totpAt,
} from "@/modules/auth/totp";
import { describeDevice } from "@/modules/auth/devices";

const RFC_KEY = "12345678901234567890"; // the RFC 6238 test key (SHA-1)
const RFC_B32 = base32Encode(Buffer.from(RFC_KEY));

describe("TOTP", () => {
  test("base32 both ways", () => {
    expect(RFC_B32).toBe("GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ");
    expect(base32Decode(RFC_B32).toString()).toBe(RFC_KEY);
    expect(base32Decode("gezd gnbv gy3t qojq gezd gnbv gy3t qojq").toString()).toBe(RFC_KEY);
  });

  test("the RFC 6238 vectors", () => {
    const key = Buffer.from(RFC_KEY);
    for (const [t, code] of [
      [59, "94287082"],
      [1111111109, "07081804"],
      [1111111111, "14050471"],
      [1234567890, "89005924"],
      [2000000000, "69279037"],
    ] as const) {
      expect(hotp(key, Math.floor(t / 30), 8)).toBe(code);
      expect(totpAt(RFC_B32, t)).toBe(code.slice(2));
    }
  });

  test("a code is good for its own 30 seconds and one either side, once", () => {
    const now = new Date(1234567890 * 1000);
    const step = Math.floor(1234567890 / 30);
    expect(checkTotp(RFC_B32, "005924", now, null)).toBe(step);
    expect(checkTotp(RFC_B32, totpAt(RFC_B32, 1234567890 - 30), now, null)).toBe(step - 1);
    expect(checkTotp(RFC_B32, totpAt(RFC_B32, 1234567890 + 30), now, null)).toBe(step + 1);
    expect(checkTotp(RFC_B32, totpAt(RFC_B32, 1234567890 - 90), now, null)).toBeNull();
    // Used once: that step and anything before it are spent.
    expect(checkTotp(RFC_B32, "005924", now, step)).toBeNull();
    expect(checkTotp(RFC_B32, totpAt(RFC_B32, 1234567890 + 30), now, step)).toBe(step + 1);
    // Spaces are fine; anything else that isn't six digits isn't.
    expect(checkTotp(RFC_B32, "005 924", now, null)).toBe(step);
    expect(checkTotp(RFC_B32, "5924", now, null)).toBeNull();
    expect(checkTotp(RFC_B32, "abcdef", now, null)).toBeNull();
  });

  test("a new secret is 160 random bits, shown in groups of four", () => {
    const s = newSecret();
    expect(s).toMatch(/^[A-Z2-7]{32}$/);
    expect(base32Decode(s)).toHaveLength(20);
    expect(newSecret()).not.toBe(s);
    expect(groupKey("GEZDGNBVGY3TQOJQ")).toBe("GEZD GNBV GY3T QOJQ");
  });

  test("the address an app reads from the QR code", () => {
    const uri = otpauthUri({ secret: RFC_B32, email: "michelle@kini.example" });
    expect(uri).toBe(`otpauth://totp/output%2Finput:michelle%40kini.example?secret=${RFC_B32}&issuer=output%2Finput&algorithm=SHA1&digits=6&period=30`);
  });
});

describe("recovery codes", () => {
  test("ten, different, easy to read out", () => {
    const codes = newRecoveryCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const c of codes) expect(c).toMatch(/^[a-hjkmnp-z2-9]{4}-[a-hjkmnp-z2-9]{4}$/);
  });

  test("typed however, they match; stored only as a hash", () => {
    expect(normaliseRecovery("ABCD EFGH")).toBe("abcd-efgh");
    expect(normaliseRecovery(" abcd-efgh ")).toBe("abcd-efgh");
    expect(normaliseRecovery("abcdefgh")).toBe("abcd-efgh");
    expect(normaliseRecovery("123456")).toBeNull();
    expect(recoveryHash("abcd-efgh")).toMatch(/^[0-9a-f]{64}$/);
    expect(recoveryHash("abcd-efgh")).not.toContain("abcd");
  });
});

describe("devices", () => {
  test("in words a person recognises", () => {
    expect(describeDevice("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("iPhone · Safari");
    expect(describeDevice("Mozilla/5.0 (iPad; CPU OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1")).toBe("iPad · Safari");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36")).toBe("Mac · Chrome");
    expect(describeDevice("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36 Edg/130.0.0.0")).toBe("Windows · Edge");
    expect(describeDevice("Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36")).toBe("Android · Chrome");
    expect(describeDevice("Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:131.0) Gecko/20100101 Firefox/131.0")).toBe("Mac · Firefox");
    expect(describeDevice("")).toBe("A browser");
    expect(describeDevice(null)).toBe("A browser");
  });
});
