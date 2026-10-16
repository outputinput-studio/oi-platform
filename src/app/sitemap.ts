import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSurface } from "@/lib/surface";
import { siteFromHost, siteSearch } from "@/modules/sites/server";
import { HOME_SLUG, publishedPages, publishedPage } from "@/modules/pages/server";
import { articlePath, publishedArticles } from "@/modules/articles/server";
import { publishedCategories } from "@/modules/articles/categories";
import { readSeo } from "@/modules/pages/seo";
import { productPath, publishedProducts } from "@/modules/products/server";
import { publishedProductCategories } from "@/modules/products/categories";

export const dynamic = "force-dynamic";

/**
 * /sitemap.xml for a storefront: every live page, article and product the client
 * hasn't hidden from search. The admin and ops hosts get an empty one.
 * Lives at the app root because the proxy leaves dotted paths alone.
 */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const h = await headers();
  const hostHeader = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const { surface, host } = resolveSurface(hostHeader);
  if (surface !== "site") return [];
  const site = await siteFromHost(host);
  if (!site || siteSearch(site).hideFromSearch) return [];
  const base = `https://${host}`;
  const [pages, articles, products] = await Promise.all([publishedPages({ siteId: site.id }), publishedArticles({ siteId: site.id }), publishedProducts({ siteId: site.id })]);
  const out: MetadataRoute.Sitemap = [];
  for (const p of pages) {
    const full = await publishedPage({ siteId: site.id, slug: p.slug });
    if (!full || readSeo(full.seo).noindex) continue;
    out.push({ url: p.slug === HOME_SLUG ? `${base}/` : `${base}/${p.slug}`, lastModified: full.updatedAt });
  }
  if (articles.length) {
    out.push({ url: `${base}/journal`, lastModified: articles[0].updatedAt });
    for (const c of await publishedCategories({ siteId: site.id })) out.push({ url: `${base}/journal/${c.slug}`, lastModified: articles[0].updatedAt });
  }
  for (const a of articles) {
    if (readSeo(a.seo).noindex) continue;
    out.push({ url: `${base}${articlePath(a)}`, lastModified: a.updatedAt });
  }
  if (products.length) {
    const newest = products.reduce((m, p) => (p.updatedAt > m ? p.updatedAt : m), products[0].updatedAt);
    out.push({ url: `${base}/shop`, lastModified: newest });
    for (const c of await publishedProductCategories({ siteId: site.id })) out.push({ url: `${base}/shop/${c.slug}`, lastModified: newest });
  }
  for (const p of products) {
    if (readSeo(p.seo).noindex) continue;
    out.push({ url: `${base}${productPath(p)}`, lastModified: p.updatedAt });
  }
  return out;
}
