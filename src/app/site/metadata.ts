import type { Metadata } from "next";
import { headers } from "next/headers";
import type { Section, Site } from "@/db/schema";
import { mediaUrl } from "@/modules/media/server";
import { imageRef, type ImageRef } from "@/modules/pages/registry";
import { readSeo, summarise, type Seo } from "@/modules/pages/seo";
import { siteFromHost, siteSearch } from "@/modules/sites/server";
import { pageTitle } from "@/modules/sites/search";

/**
 * What a storefront page tells Google and a shared link: the words the
 * client wrote under Search and sharing, or sensible ones from the
 * content. The root layout says "don't index" for the admin; a live
 * storefront page says the opposite unless the client hid it.
 */
export function storefrontMetadata(p: { site: Site; seo: unknown; title: string; fallbackDescription: string; fallbackImage: ImageRef | null; path: string; host: string }): Metadata {
  const seo: Seo = readSeo(p.seo);
  const search = siteSearch(p.site);
  const title = seo.title || pageTitle(search.titlePattern, p.title, p.site.name);
  const description = seo.description || summarise(p.fallbackDescription) || undefined;
  const image = seo.image ?? p.fallbackImage ?? search.shareImage;
  const imageUrl = image ? mediaUrl(image.key) : "";
  const url = `https://${p.host}${p.path}`;
  const hidden = seo.noindex || search.hideFromSearch;
  return {
    title,
    description,
    alternates: { canonical: url },
    robots: hidden ? { index: false, follow: false } : { index: true, follow: true },
    ...(search.searchConsole ? { verification: { google: search.searchConsole } } : {}),
    openGraph: {
      title,
      description,
      url,
      siteName: p.site.name,
      type: "website",
      ...(imageUrl && image ? { images: [{ url: imageUrl, width: image.width, height: image.height, alt: image.alt }] } : {}),
    },
    twitter: { card: imageUrl ? "summary_large_image" : "summary" },
  };
}

/** The first words and the first image a page's sections carry, for a page nobody described. */
export function fallbacksFromSections(sections: Section[]): { description: string; image: ImageRef | null } {
  let description = "";
  let image: ImageRef | null = null;
  for (const s of sections) {
    const d = (s.data ?? {}) as Record<string, unknown>;
    if (!description) description = [d.text, d.body, d.heading].find((v): v is string => typeof v === "string" && v.trim().length > 0) ?? "";
    if (!image) {
      const r = imageRef.safeParse(d.image);
      if (r.success) image = r.data;
    }
    if (description && image) break;
  }
  return { description, image };
}

export async function hostAndSite(): Promise<{ host: string; site: Site | null }> {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  return { host, site: await siteFromHost(host) };
}
