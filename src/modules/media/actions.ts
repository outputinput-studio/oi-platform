"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireSiteAccess } from "@/modules/auth/access";
import { deleteMedia, describeMedia, listMedia, uploadMedia, type MediaItem } from "./server";

/**
 * Thin server actions for the media library. The browser has already
 * shrunk the picture (see upload.ts in the admin); these read the form,
 * call the module, and return something the UI can show.
 */
type Result<T> = { ok: true; value: T } | { ok: false; error: string };

function message(err: unknown): string {
  if (err instanceof z.ZodError) return err.issues[0]?.message ?? "That doesn't look right.";
  if (err instanceof Error) return err.message;
  return "Something went wrong. Try again.";
}

export async function listMediaAction(): Promise<Result<MediaItem[]>> {
  const { user, site } = await requireSiteAccess();
  try {
    return { ok: true, value: await listMedia({ actorId: user.id, siteId: site.id }) };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function uploadMediaAction(form: FormData): Promise<Result<MediaItem>> {
  const { user, site } = await requireSiteAccess();
  const file = form.get("file");
  if (!(file instanceof File)) return { ok: false, error: "Choose a picture first." };
  try {
    const item = await uploadMedia({
      actorId: user.id,
      siteId: site.id,
      filename: file.name,
      contentType: file.type,
      bytes: new Uint8Array(await file.arrayBuffer()),
      width: Number(form.get("width")),
      height: Number(form.get("height")),
      alt: String(form.get("alt") ?? ""),
    });
    revalidatePath("/media");
    return { ok: true, value: item };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function describeMediaAction(mediaId: string, alt: string): Promise<Result<MediaItem>> {
  const { user, site } = await requireSiteAccess();
  try {
    const item = await describeMedia({ actorId: user.id, siteId: site.id, mediaId, alt });
    revalidatePath("/media");
    return { ok: true, value: item };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}

export async function deleteMediaAction(mediaId: string): Promise<Result<null>> {
  const { user, site } = await requireSiteAccess();
  try {
    await deleteMedia({ actorId: user.id, siteId: site.id, mediaId });
    revalidatePath("/media");
    return { ok: true, value: null };
  } catch (err) {
    return { ok: false, error: message(err) };
  }
}
