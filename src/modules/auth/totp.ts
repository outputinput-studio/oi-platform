import { createHash, createHmac, randomBytes, randomInt } from "node:crypto";

/**
 * Codes from an authenticator app (Google Authenticator, 1Password, Authy…):
 * TOTP as in RFC 6238 — HMAC-SHA1, six digits, a new code every 30
 * seconds — with nothing but Node's crypto. Pure: the module that stores
 * the secret is two-factor.ts.
 */

const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP_SECONDS = 30;
const ISSUER = "output/input";

export function base32Encode(buf: Buffer): string {
  let bits = 0;
  let value = 0;
  let out = "";
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += ALPHABET[(value << (5 - bits)) & 31];
  return out;
}

/** Spaces, lower case and padding are forgiven: people type these. */
export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[\s=-]/g, "");
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error("That key has a character that doesn't belong in it.");
    value = (value << 5) | i;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** RFC 4226: the code for one counter value. */
export function hotp(key: Buffer, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", key).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}

/** The six digits an app shows at a moment (seconds since 1970). */
export function totpAt(secret: string, unixSeconds: number): string {
  return hotp(base32Decode(secret), Math.floor(unixSeconds / STEP_SECONDS));
}

/**
 * Is this the app's code now, or half a minute either side (phone clocks
 * drift)? Returns the step it matched, to be remembered: a step at or
 * before `lastStep` has been used and is refused, so a code works once.
 */
export function checkTotp(secret: string, typed: string, now: Date, lastStep: number | null): number | null {
  const code = typed.replace(/\s/g, "");
  if (!/^\d{6}$/.test(code)) return null;
  const key = base32Decode(secret);
  const step = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  for (const s of [step - 1, step, step + 1]) {
    if (lastStep !== null && s <= lastStep) continue;
    if (hotp(key, s) === code) return s;
  }
  return null;
}

/** Was this code right for a step that's already been used? (For a clearer message.) */
export function wasUsed(secret: string, typed: string, now: Date, lastStep: number | null): boolean {
  if (lastStep === null) return false;
  const code = typed.replace(/\s/g, "");
  const step = Math.floor(now.getTime() / 1000 / STEP_SECONDS);
  const key = base32Decode(secret);
  return [step - 1, step, step + 1].some((s) => s <= lastStep && hotp(key, s) === code);
}

/** 160 random bits, the size RFC 4226 recommends for SHA-1. */
export function newSecret(): string {
  return base32Encode(randomBytes(20));
}

/** "GEZD GNBV GY3T …": easier to type into an app by hand. */
export function groupKey(secret: string): string {
  return secret.replace(/(.{4})(?=.)/g, "$1 ");
}

/** What the QR code holds; on a phone it also opens the app directly. */
export function otpauthUri(p: { secret: string; email: string }): string {
  const issuer = encodeURIComponent(ISSUER);
  return `otpauth://totp/${issuer}:${encodeURIComponent(p.email)}?secret=${p.secret}&issuer=${issuer}&algorithm=SHA1&digits=6&period=${STEP_SECONDS}`;
}

/* ───────────────────────── recovery codes ───────────────────────── */

// No 0/o, 1/l/i: these get read off paper.
const RECOVERY_ALPHABET = "abcdefghjkmnpqrstuvwxyz23456789";
export const RECOVERY_COUNT = 10;

function recoveryCode(): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += RECOVERY_ALPHABET[randomInt(RECOVERY_ALPHABET.length)];
  return `${s.slice(0, 4)}-${s.slice(4)}`;
}

export function newRecoveryCodes(): string[] {
  const codes = new Set<string>();
  while (codes.size < RECOVERY_COUNT) codes.add(recoveryCode());
  return [...codes];
}

/** "ABCD EFGH", "abcdefgh", " abcd-efgh " → "abcd-efgh"; anything else isn't one. */
export function normaliseRecovery(typed: string): string | null {
  const s = typed.toLowerCase().replace(/[\s-]/g, "");
  return /^[a-z0-9]{8}$/.test(s) ? `${s.slice(0, 4)}-${s.slice(4)}` : null;
}

/** Recovery codes carry ~40 random bits each and work once, so a plain SHA-256 is enough to keep them unreadable. */
export function recoveryHash(code: string): string {
  return createHash("sha256").update(`oi-recovery:${code}`).digest("hex");
}
