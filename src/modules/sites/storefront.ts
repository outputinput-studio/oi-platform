import { cookies, headers } from "next/headers";
import type { Site } from "@/db/schema";
import { siteFromHost } from "./server";
import { PASS_COOKIE, siteVisible } from "./launch";

/**
 * The site a storefront request is for, as the public may see it: null
 * when no site answers on this host, or when it hasn't launched and this
 * browser has no preview pass (`hidden` is then the site, for the holding
 * page). Every storefront page, its <head>, and the storefront's actions go
 * through this, so a site that isn't live shows nothing but the holding page.
 */
export async function storefrontSite(): Promise<{ host: string; site: Site | null; hidden: Site | null }> {
  const h = await headers();
  const host = h.get("x-oi-host") ?? h.get("host") ?? "";
  const found = await siteFromHost(host);
  if (!found) return { host, site: null, hidden: null };
  const visible = siteVisible(found, (await cookies()).get(PASS_COOKIE)?.value);
  return visible ? { host, site: found, hidden: null } : { host, site: null, hidden: found };
}

/** For actions that already have the host: the site, if the public (or this browser's pass) may use it. */
export async function visibleSiteFromHost(host: string): Promise<Site | null> {
  const site = await siteFromHost(host);
  return site && siteVisible(site, (await cookies()).get(PASS_COOKIE)?.value) ? site : null;
}
