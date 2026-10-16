/**
 * A client's own domain, the pure parts: what they typed turned into a
 * clean host name, whether it's a domain of its own (kinikouture.com.au,
 * which also answers on www) or a subdomain (shop.kinikouture.com.au,
 * which doesn't), which address is the main one, and the DNS records it
 * needs to point at the platform.
 */

/** Two-part endings, so kinikouture.com.au reads as a domain of its own and not a subdomain of com.au. */
const TWO_PART = new Set([
  "com.au", "net.au", "org.au", "id.au", "asn.au",
  "co.nz", "net.nz", "org.nz", "ac.nz",
  "co.th", "in.th", "or.th", "ac.th", "go.th",
  "co.uk", "org.uk", "me.uk", "ltd.uk", "plc.uk",
  "com.sg", "net.sg", "org.sg",
  "co.id", "com.my", "com.hk", "com.ph", "com.vn", "co.jp", "co.kr", "co.in", "co.za", "com.br", "com.mx",
]);

/** Where a domain points: Vercel's address for the domain itself, its name for a www or a subdomain. */
export const DEFAULT_A = "76.76.21.21";
export const DEFAULT_CNAME = "cname.vercel-dns.com";

export type CleanDomain = { ok: true; domain: string; www: boolean } | { ok: false; message: string };

/**
 * "https://WWW.KiniKouture.com.au/shop" → kinikouture.com.au (and that they
 * typed www). Refused: an IP address, one word, the platform's own domains,
 * and admin./ops. at the front (those names belong to the platform's doors).
 */
export function cleanDomain(input: string, platform: string[] = []): CleanDomain {
  let raw = input.trim().toLowerCase();
  if (!raw) return { ok: false, message: "Type the domain, like kinikouture.com.au." };
  raw = raw.replace(/^[a-z]+:\/\//, "").split(/[/?#]/)[0].replace(/:\d+$/, "").replace(/\.$/, "");
  let host: string;
  try {
    host = new URL(`http://${raw}`).hostname; // punycode for non-Latin names
  } catch {
    return { ok: false, message: "That doesn't look like a domain. It's the part after www, like kinikouture.com.au." };
  }
  if (/^\d+(\.\d+){3}$/.test(host) || host.includes(":")) return { ok: false, message: "That's an address for a computer, not a domain. Use a name like kinikouture.com.au." };
  const www = host.startsWith("www.");
  if (www) host = host.slice(4);
  const labels = host.split(".");
  const label = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
  if (labels.length < 2 || !labels.every((l) => label.test(l)) || !/^([a-z]{2,63}|xn--[a-z0-9-]+)$/.test(labels.at(-1)!) || host.length > 253)
    return { ok: false, message: "That doesn't look like a domain. It's the part after www, like kinikouture.com.au." };
  if (TWO_PART.has(host)) return { ok: false, message: `${host} is an ending, not a domain. Add your name in front, like kinikouture.${host}.` };
  if (platform.some((b) => host === b || host.endsWith(`.${b}`)) || host.endsWith(".vercel.app"))
    return { ok: false, message: "That's one of the platform's own addresses. Use a domain you own." };
  if (labels.length > 2 && ["admin", "ops"].includes(labels[0])) return { ok: false, message: `Addresses starting ${labels[0]}. are kept for the platform. Use the domain itself, or another name in front.` };
  return { ok: true, domain: host, www };
}

/** A domain of its own (answers with and without www), as opposed to a subdomain. */
export function isApex(domain: string): boolean {
  const labels = domain.split(".");
  return labels.length === 2 || (labels.length === 3 && TWO_PART.has(labels.slice(1).join(".")));
}

/** The main address, and the other one that redirects to it (none for a subdomain). */
export function hostsFor(domain: string, www: boolean): { primary: string; other: string | null } {
  if (!isApex(domain)) return { primary: domain, other: null };
  return www ? { primary: `www.${domain}`, other: domain } : { primary: domain, other: `www.${domain}` };
}

export type DnsRecord = { type: "A" | "CNAME" | "TXT"; name: string; value: string; status: "found" | "waiting" | "wrong" };

/**
 * The records a domain needs, by what's there now: the domain itself
 * points at the platform's address (A); www, or a subdomain, at its name
 * (CNAME). `seen` is what DNS answered for each name, if anything.
 */
export function recordsFor(domain: string, seen: { a: string[]; cname: Record<string, string | null> }, want: { a: string[]; cname: string[] } = { a: [DEFAULT_A], cname: [DEFAULT_CNAME] }): DnsRecord[] {
  const norm = (x: string) => x.toLowerCase().replace(/\.$/, "");
  const status = (got: string[] | string | null | undefined, expected: string[]): DnsRecord["status"] => {
    const list = [got ?? []].flat().map(norm);
    if (list.length === 0) return "waiting";
    return list.some((x) => expected.map(norm).includes(x)) ? "found" : "wrong";
  };
  if (!isApex(domain)) return [{ type: "CNAME", name: domain, value: want.cname[0], status: status(seen.cname[domain], want.cname) }];
  return [
    { type: "A", name: domain, value: want.a[0], status: status(seen.a, want.a) },
    { type: "CNAME", name: `www.${domain}`, value: want.cname[0], status: status(seen.cname[`www.${domain}`], want.cname) },
  ];
}
