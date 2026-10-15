import type { MetadataRoute } from "next";
import { headers } from "next/headers";
import { resolveSurface } from "@/lib/surface";
import { environmentName } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Storefronts in production may be crawled; the admin, ops, staging and previews never. */
export default async function robots(): Promise<MetadataRoute.Robots> {
  const h = await headers();
  const { surface, host } = resolveSurface(h.get("x-forwarded-host") ?? h.get("host") ?? "");
  const open = surface === "site" && environmentName() === "production";
  return open
    ? { rules: { userAgent: "*", allow: "/" }, sitemap: `https://${host}/sitemap.xml` }
    : { rules: { userAgent: "*", disallow: "/" } };
}
