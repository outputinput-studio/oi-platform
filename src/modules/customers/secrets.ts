import { createHash, createHmac, randomBytes, randomInt, scrypt as scryptCb, timingSafeEqual, type ScryptOptions } from "node:crypto";

/**
 * The secret-handling parts of customer sign-in, with nothing but Node's
 * own crypto. What's stored is never what's typed or sent:
 *
 * - codes: an HMAC keyed with the server's secret, so a copy of the
 *   database can't be used to work six digits back out;
 * - session tokens: a SHA-256 of 32 random bytes (the bytes live only in
 *   the customer's cookie);
 * - passwords: scrypt with a random salt per password.
 */

export const CODE_MINUTES = 10;
export const SESSION_DAYS = 30;

/** Six digits, leading zeros kept. */
export function newCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

export function codeHash(secret: string, siteId: string, email: string, code: string): string {
  return createHmac("sha256", secret).update(`${siteId}\n${email}\n${code}`).digest("hex");
}

/** Constant-time comparison of two hex strings. */
export function sameHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "hex");
  const y = Buffer.from(b, "hex");
  return x.length === y.length && x.length > 0 && timingSafeEqual(x, y);
}

export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Who asked, without keeping who: a hash of their connection's address. */
export function requesterHash(secret: string, address: string): string {
  return address ? createHmac("sha256", secret).update(`requester\n${address}`).digest("hex").slice(0, 32) : "";
}

const SCRYPT = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function scrypt(password: string, salt: Buffer, keylen: number, opts: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => scryptCb(password, salt, keylen, opts, (err, key) => (err ? reject(err) : resolve(key))));
}

/** "scrypt$16384$8$1$<salt>$<key>", all base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await scrypt(password.normalize("NFKC"), salt, 64, SCRYPT);
  return ["scrypt", SCRYPT.N, SCRYPT.r, SCRYPT.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [kind, n, r, p, salt, key] = stored.split("$");
  if (kind !== "scrypt" || !salt || !key) return false;
  const want = Buffer.from(key, "base64url");
  const got = await scrypt(password.normalize("NFKC"), Buffer.from(salt, "base64url"), want.length, { N: Number(n), r: Number(r), p: Number(p), maxmem: SCRYPT.maxmem });
  return got.length === want.length && timingSafeEqual(got, want);
}

/**
 * How long a lock-out lasts, in minutes: 2 the first time, doubling each
 * time after, never more than an hour.
 */
export function lockMinutes(strikes: number): number {
  return Math.min(2 * 2 ** Math.max(0, strikes - 1), 60);
}
