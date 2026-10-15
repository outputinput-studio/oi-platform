import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { media, type Media } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { storage } from "@/lib/storage";

/**
 * The media library: a site's images. Bytes go to storage (src/lib/storage),
 * the row goes in `media`, locked to the site like everything else.
 *
 * The browser shrinks images before sending them (see the admin's
 * upload code), so what arrives here is already web-sized; the limits
 * below are the backstop, not the normal case.
 */
export const MAX_BYTES = 4 * 1024 * 1024; // Vercel's request limit is 4.5 MB
/** What a site gets before we talk: the storage bar on the Images screen measures against this. */
export const STORAGE_LIMIT_BYTES = 5 * 1024 * 1024 * 1024;
export const MAX_SIDE = 4000;

const CONTENT_TYPES: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};

export type MediaItem = Media & { url: string };

const altSchema = z.string().trim().max(300);

function withUrl(row: Media): MediaItem {
  const s = storage();
  return { ...row, url: s ? s.url(row.key) : "" };
}

/** Whether images can be stored here. False only in production without R2. */
export function mediaAvailable(): boolean {
  return storage() !== null;
}

export async function listMedia(p: { actorId: string; siteId: string }): Promise<MediaItem[]> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await withSite(p.siteId, (tx) =>
    tx.select().from(media).where(isNull(media.deletedAt)).orderBy(desc(media.createdAt)),
  );
  return rows.map(withUrl);
}

export async function getMedia(p: { actorId: string; siteId: string; mediaId: string }): Promise<MediaItem> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx.select().from(media).where(and(eq(media.id, p.mediaId), isNull(media.deletedAt))).limit(1),
  );
  if (!row) throw new AccessError("That image doesn't exist.");
  return withUrl(row);
}

export async function uploadMedia(p: {
  actorId: string;
  siteId: string;
  filename: string;
  contentType: string;
  bytes: Uint8Array;
  width: number;
  height: number;
  alt?: string;
}): Promise<MediaItem> {
  await assertAccess(p.actorId, p.siteId);
  const s = storage();
  if (!s) throw new Error("Images aren't set up on this site yet. Ask us to switch them on.");

  const ext = CONTENT_TYPES[p.contentType];
  if (!ext) throw new Error("Use a JPG, PNG, WebP or GIF image.");
  if (p.bytes.byteLength === 0) throw new Error("That file is empty.");
  if (p.bytes.byteLength > MAX_BYTES) throw new Error("That image is too big. Keep it under 4 MB.");
  const side = z.number().int().min(1).max(MAX_SIDE);
  const width = side.parse(p.width);
  const height = side.parse(p.height);
  const filename = z.string().trim().min(1).max(200).parse(p.filename || "image");
  const alt = altSchema.parse(p.alt ?? "");

  const id = crypto.randomUUID();
  const key = `${p.siteId}/${id}.${ext}`;
  await s.put(key, p.bytes, p.contentType);

  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .insert(media)
      .values({
        id,
        siteId: p.siteId,
        key,
        filename,
        contentType: p.contentType,
        sizeBytes: p.bytes.byteLength,
        width,
        height,
        alt,
        createdBy: p.actorId,
      })
      .returning(),
  );
  return withUrl(row);
}

/** "Describe this photo": the words shown to people who can't see it. */
export async function describeMedia(p: { actorId: string; siteId: string; mediaId: string; alt: string }): Promise<MediaItem> {
  await assertAccess(p.actorId, p.siteId);
  const alt = altSchema.parse(p.alt);
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(media)
      .set({ alt })
      .where(and(eq(media.id, p.mediaId), isNull(media.deletedAt)))
      .returning(),
  );
  if (!row) throw new AccessError("That image doesn't exist.");
  return withUrl(row);
}

/**
 * Soft delete. The bytes are removed from storage too; pages that still
 * point at the key simply show no image, which is what "removed" means.
 */
export async function deleteMedia(p: { actorId: string; siteId: string; mediaId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(media)
      .set({ deletedAt: new Date() })
      .where(and(eq(media.id, p.mediaId), isNull(media.deletedAt)))
      .returning(),
  );
  if (!row) throw new AccessError("That image doesn't exist.");
  await storage()?.remove(row.key);
}

/** The public address for a key, for rendering. Empty when storage is off. */
export function mediaUrl(key: string): string {
  return storage()?.url(key) ?? "";
}
