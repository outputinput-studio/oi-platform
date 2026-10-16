import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSurface } from "@/lib/surface";
import { environmentName } from "@/lib/env";
import { siteFromHost, siteSearch } from "@/modules/sites/server";

export const dynamic = "force-dynamic";

/** Storefronts in production may be crawled; the admin, ops, staging and previews never. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const { surface, host } = resolveSurface(h.get("x-forwarded-host") ?? h.get("host") ?? "");
  const closed = { rules: { userAgent: "*", disallow: "/" } };
  if (surface !== "site" || environmentName() !== "production") return closed;
  const site = await siteFromHost(host);
  if (!site) return closed;
  const search = siteSearch(site);
  if (search.hideFromSearch) return closed;
  const extra = search.robotsExtra
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => /^(dis)?allow:\s*\S/i.test(l));
  const disallow = extra.filter((l) => /^disallow/i.test(l)).map((l) => l.replace(/^disallow:\s*/i, ""));
  const allow = extra.filter((l) => /^allow/i.test(l)).map((l) => l.replace(/^allow:\s*/i, ""));
  return { rules: { userAgent: "*", allow: allow.length ? allow : "/", ...(disallow.length ? { disallow } : {}) }, sitemap: `https://${host}/sitemap.xml` };
}
