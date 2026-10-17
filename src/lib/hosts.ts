import { platformBases } from "@/lib/env";
import { hostsFor } from "@/lib/domains";

/**
 * Addresses between the surfaces. A storefront can be on its slug address
 * (kini.outputinput.co) or the client's own domain (kinikouture.com.au);
 * the admin is always admin.<platform domain>.
 */

/** The platform domain a host sits under (outputinput.co for kini.outputinput.co), or null for a client's own domain. */
export function platformBaseOf(host: string, bases = platformBases()): string | null {
  const h = host.toLowerCase().split(":")[0];
  return bases.find((b) => h === b || h.endsWith(`.${b}`)) ?? null;
}

/** https://admin.<platform domain>, from a storefront host of either kind. */
export function adminOriginFor(storefrontHost: string, bases = platformBases()): string {
  const base = platformBaseOf(storefrontHost, bases);
  if (base) return `https://${storefrontHost.split(":")[0].replace(/^[^.]+\./, "admin.")}`;
  // A client's own domain: the admin is on the platform's first domain.
  const first = bases.find((b) => b !== "localhost") ?? "localhost";
  return `https://admin.${first}`;
}

/** The slug address of a site, as seen from the admin's own host: admin.outputinput.co → kini.outputinput.co. */
export function slugHost(adminHost: string, slug: string): string {
  return adminHost.split(":")[0].replace(/^admin\./, `${slug}.`);
}

/**
 * Where the public should find the site: its own domain's main address
 * once that's been seen working, otherwise the address they came in on.
 */
export function publicHost(site: { domain: string | null; domainWww: boolean; domainOkAt: Date | null }, requestHost: string): string {
  if (site.domain && site.domainOkAt) return hostsFor(site.domain, site.domainWww).primary;
  return requestHost.split(":")[0];
}

/** From the admin: where the public finds this site (its own domain once working, else its slug address). */
export function siteAddress(site: { slug: string; domain: string | null; domainWww: boolean; domainOkAt: Date | null }, adminHost: string): string {
  return publicHost(site, slugHost(adminHost, site.slug));
}
