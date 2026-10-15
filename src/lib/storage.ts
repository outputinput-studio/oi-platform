import { mkdir, readFile, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { AwsClient } from "aws4fetch";
import { env, environmentName, r2Config, type R2Config } from "./env";

/**
 * Where image bytes go. Two backends behind one small interface:
 *
 * - R2: one Cloudflare bucket, S3-compatible, signed with aws4fetch. The
 *   bucket is public-read, so the storefront links straight to it and no
 *   bytes ever pass through our servers on the way out.
 * - Local disk: when R2 isn't configured outside production. Tests and
 *   bucket-less previews use it; /api/media-local serves the files.
 *
 * Keys are `<site_id>/<media_id>.<ext>` — see uploadMedia() — so every site
 * has its own folder and a key can't be guessed across sites.
 */
export type Storage = {
  kind: "r2" | "local";
  put(key: string, bytes: Uint8Array, contentType: string): Promise<void>;
  remove(key: string): Promise<void>;
  /** The public address of a stored object. */
  url(key: string): string;
};

/** `<site_id>/<id>.<ext>` for the library; `<site_id>/forms/<id>.<ext>` for what visitors send through forms. */
const KEY = /^[0-9a-f-]{36}\/(forms\/)?[0-9a-f-]{36}\.[a-z0-9]{1,5}$/;
function checkKey(key: string) {
  if (!KEY.test(key)) throw new Error("Bad storage key.");
}

function r2Storage(cfg: R2Config): Storage {
  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: "s3",
    region: "auto",
  });
  const objectUrl = (key: string) => `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${key}`;
  return {
    kind: "r2",
    async put(key, bytes, contentType) {
      checkKey(key);
      const res = await client.fetch(objectUrl(key), {
        method: "PUT",
        body: bytes as unknown as BodyInit,
        headers: { "content-type": contentType, "content-length": String(bytes.byteLength) },
      });
      if (!res.ok) throw new Error(`R2 refused the upload (${res.status}). Check the R2_* settings.`);
    },
    async remove(key) {
      checkKey(key);
      const res = await client.fetch(objectUrl(key), { method: "DELETE" });
      if (!res.ok && res.status !== 404) throw new Error(`R2 refused the delete (${res.status}).`);
    },
    url: (key) => `${cfg.publicUrl}/${key}`,
  };
}

export function localMediaDir(): string {
  return path.resolve(env().MEDIA_LOCAL_DIR ?? ".media-local");
}

function localStorage(): Storage {
  const dir = localMediaDir();
  return {
    kind: "local",
    async put(key, bytes) {
      checkKey(key);
      const file = path.join(dir, key);
      await mkdir(path.dirname(file), { recursive: true });
      await writeFile(file, bytes);
    },
    async remove(key) {
      checkKey(key);
      await unlink(path.join(dir, key)).catch(() => undefined);
    },
    url: (key) => `/api/media-local/${key}`,
  };
}

/** Read a locally stored object; null if it isn't there. Used by /api/media-local only. */
export async function readLocalObject(key: string): Promise<Uint8Array | null> {
  if (!KEY.test(key)) return null;
  return readFile(path.join(localMediaDir(), key)).catch(() => null);
}

let cached: Storage | null | undefined;

/**
 * The configured storage, or null when images can't be stored here:
 * production without R2, or R2 only partly set. A half-set R2 is logged
 * once and treated as "off", so a missing setting takes images away,
 * never the whole admin. Callers turn null into a plain message.
 */
export function storage(): Storage | null {
  if (cached !== undefined) return cached;
  let cfg: R2Config | null;
  try {
    cfg = r2Config();
  } catch (err) {
    console.error("storage:", err instanceof Error ? err.message : err);
    cached = null;
    return cached;
  }
  if (cfg) cached = r2Storage(cfg);
  else if (environmentName() === "production") cached = null;
  else cached = localStorage();
  return cached;
}
