"use client";

import { uploadMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";

/**
 * Pictures are shrunk on the phone before they leave it. A 12-megapixel
 * photo is 4–8 MB; nobody needs that on a web page. We cap the long side
 * at MAX_SIDE and re-encode, which turns it into a few hundred kilobytes.
 * That keeps uploads quick on a cafe's wifi and the bucket cheap.
 *
 * JPG and WebP become JPG. PNG stays PNG (it may have transparency).
 * GIF is sent as it is, because resizing would lose the animation.
 */
export const MAX_SIDE = 2000;
const JPEG_QUALITY = 0.85;
const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;

export type Prepared = { blob: Blob; width: number; height: number; type: string };

export async function prepareForUpload(file: File): Promise<Prepared> {
  if (!file.type.startsWith("image/")) throw new Error("That isn't a picture.");
  if (file.type === "image/svg+xml") throw new Error("Use a JPG, PNG, WebP or GIF picture.");

  if (file.type === "image/gif") {
    if (file.size > MAX_UPLOAD_BYTES) throw new Error("That GIF is too big. Keep it under 4 MB.");
    const { width, height } = await dimensions(file);
    return { blob: file, width, height, type: file.type };
  }

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Couldn't read that picture. Try a JPG or PNG.");
  }
  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't prepare that picture.");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const type = file.type === "image/png" ? "image/png" : "image/jpeg";
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, type, type === "image/jpeg" ? JPEG_QUALITY : undefined),
  );
  if (!blob) throw new Error("Couldn't prepare that picture.");
  if (blob.size > MAX_UPLOAD_BYTES) throw new Error("That picture is too big even after shrinking. Try a smaller one.");
  return { blob, width, height, type };
}

function dimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Couldn't read that picture."));
    };
    img.src = url;
  });
}

/** Shrink, then send. Returns the library item or throws with a plain message. */
export async function uploadPicture(file: File): Promise<MediaItem> {
  const p = await prepareForUpload(file);
  const ext = p.type === "image/png" ? "png" : p.type === "image/gif" ? "gif" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") || "picture";
  const form = new FormData();
  form.set("file", new File([p.blob], `${name}.${ext}`, { type: p.type }));
  form.set("width", String(p.width));
  form.set("height", String(p.height));
  const r = await uploadMediaAction(form);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
