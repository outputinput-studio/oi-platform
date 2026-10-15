"use client";

import { uploadMediaAction } from "@/modules/media/actions";
import type { MediaItem } from "@/modules/media/server";
import { prepareForUpload } from "@/lib/shrink-image";

export { MAX_SIDE, prepareForUpload, type Prepared } from "@/lib/shrink-image";

export async function uploadImage(file: File): Promise<MediaItem> {
  const p = await prepareForUpload(file);
  const ext = p.type === "image/png" ? "png" : p.type === "image/gif" ? "gif" : "jpg";
  const name = file.name.replace(/\.[^.]+$/, "") || "image";
  const form = new FormData();
  form.set("file", new File([p.blob], `${name}.${ext}`, { type: p.type }));
  form.set("width", String(p.width));
  form.set("height", String(p.height));
  const r = await uploadMediaAction(form);
  if (!r.ok) throw new Error(r.error);
  return r.value;
}
