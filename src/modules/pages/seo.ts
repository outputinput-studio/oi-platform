import { z } from "zod";
import { imageRef } from "./registry";

/**
 * Search and sharing: how a page or article looks in Google and when its
 * link is pasted into a chat. Everything optional; what's left empty is
 * worked out from the content at render time, so a client who never
 * opens this still gets sensible results.
 */
export const seoSchema = z.object({
  /** Up to 60 characters shows in full on a results page. */
  title: z.string().trim().max(120).default(""),
  /** Up to 160 shows in full. */
  description: z.string().trim().max(320).default(""),
  /** The sharing image; the cover or first image when empty. */
  image: imageRef.nullable().default(null),
  /** The page stays live but asks search engines to leave it out. */
  noindex: z.boolean().default(false),
});
export type Seo = z.infer<typeof seoSchema>;

export function readSeo(raw: unknown): Seo {
  const r = seoSchema.safeParse(raw ?? {});
  return r.success ? r.data : seoSchema.parse({});
}

/** The first sentence or two of some words, for a description nobody wrote. */
export function summarise(text: string, max = 160): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const end = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf(" "));
  return (end > 60 ? cut.slice(0, end) : cut).trim() + "…";
}
