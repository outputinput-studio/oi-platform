import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { env } from "./env";

/**
 * Secrets a client gives us (their Stripe keys) are kept encrypted in the
 * database with AES-256-GCM. The key lives only in the environment
 * (OI_SECRETS_KEY, 32 random bytes in base64), never in the database or
 * the code, so a copy of the database alone reveals nothing.
 */

function key(): Buffer {
  const raw = env().OI_SECRETS_KEY;
  if (!raw) throw new Error("Secure storage isn't set up here yet (OI_SECRETS_KEY). Output/Input needs to add it before keys can be saved.");
  const k = Buffer.from(raw, "base64");
  if (k.length !== 32) throw new Error("OI_SECRETS_KEY must be 32 bytes, base64 encoded.");
  return k;
}

export function secretsAvailable(): boolean {
  try {
    key();
    return true;
  } catch {
    return false;
  }
}

/** "v1:<iv>:<tag>:<ciphertext>", all base64. */
export function encryptSecret(plain: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key(), iv);
  const data = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return ["v1", iv.toString("base64"), cipher.getAuthTag().toString("base64"), data.toString("base64")].join(":");
}

/** The plain text, or an error if it was tampered with or made with another key. */
export function decryptSecret(sealed: string): string {
  const [v, iv, tag, data] = sealed.split(":");
  if (v !== "v1" || !iv || !tag || !data) throw new Error("That secret isn't in a form we can read.");
  const decipher = createDecipheriv("aes-256-gcm", key(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(data, "base64")), decipher.final()]).toString("utf8");
}
