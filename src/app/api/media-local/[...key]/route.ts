import { NextResponse } from "next/server";
import { readLocalObject, storage } from "@/lib/storage";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = { jpg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", svg: "image/svg+xml", pdf: "application/pdf" };

/**
 * Serves pictures from the local-disk fallback. Only answers when that
 * fallback is in use (never in production, never beside R2).
 */
export async function GET(_req: Request, ctx: { params: Promise<{ key: string[] }> }) {
  if (storage()?.kind !== "local") return new NextResponse("Not found", { status: 404 });
  const key = (await ctx.params).key.join("/");
  const bytes = await readLocalObject(key);
  if (!bytes) return new NextResponse("Not found", { status: 404 });
  const ext = key.split(".").pop() ?? "";
  return new NextResponse(bytes as BodyInit, {
    headers: {
      "content-type": TYPES[ext] ?? "application/octet-stream",
      "cache-control": "public, max-age=3600",
      // As in the bucket: an SVG opened on its own downloads, and could run nothing anyway.
      ...(ext === "svg" ? { "content-disposition": "attachment", "content-security-policy": "default-src 'none'; style-src 'unsafe-inline'; img-src data:" } : {}),
    },
  });
}
