import { fillTemplate, type Template } from "@/modules/sites/messages";

/**
 * The order emails' fill-ins, pure so the order screen can redraft the
 * "on its way" email in the browser as a tracking number is typed.
 */

export type ParcelTracking = { carrier?: string; number?: string };

/** A link to follow a parcel, for the carriers we know. */
export function trackingUrl(t: ParcelTracking): string | null {
  const n = encodeURIComponent((t.number ?? "").trim());
  if (!n) return null;
  const c = (t.carrier ?? "").toLowerCase();
  if (c.includes("australia post") || c === "auspost") return `https://auspost.com.au/mypost/track/details/${n}`;
  if (c.includes("thailand post")) return `https://track.thailandpost.co.th/?trackNumber=${n}`;
  if (c.includes("dhl")) return `https://www.dhl.com/global-en/home/tracking.html?tracking-id=${n}`;
  if (c.includes("fedex")) return `https://www.fedex.com/fedextrack/?trknbr=${n}`;
  if (c.includes("ups")) return `https://www.ups.com/track?tracknum=${n}`;
  if (c.includes("nz post")) return `https://www.nzpost.co.nz/tools/tracking?trackid=${n}`;
  return null;
}

/** {tracking}: "Australia Post tracking: 33ANJ482019" and the link, or nothing. */
export function trackingText(t?: ParcelTracking): string {
  if (!t?.number?.trim()) return "";
  const url = trackingUrl(t);
  return `${t.carrier?.trim() ? `${t.carrier.trim()} tracking` : "Tracking"}: ${t.number.trim()}${url ? `\n${url}` : ""}`;
}

/** The fill-ins every order email has. */
export function orderVars(o: { name: string; number: number; items: unknown }, business: string): Record<string, string> {
  const items = (Array.isArray(o.items) ? o.items : []) as { name: string }[];
  return {
    name: o.name.trim().split(/\s+/)[0] ?? "",
    "full name": o.name.trim(),
    order: String(o.number),
    product: items.length === 1 ? items[0].name : `order ${o.number}`,
    business,
  };
}

/** A template with its fill-ins swapped in. */
export function draftFrom(t: Template, vars: Record<string, string>): { subject: string; message: string } {
  return { subject: fillTemplate(t.subject, vars).replace(/\s+/g, " "), message: fillTemplate(t.body, vars) };
}
