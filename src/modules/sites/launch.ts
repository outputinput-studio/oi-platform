import { createHmac, timingSafeEqual } from "node:crypto";
import { eq } from "drizzle-orm";
import { withSite } from "@/db/client";
import { sites, type Site } from "@/db/schema";
import { env } from "@/lib/env";
import { AccessError, assertAccess } from "@/modules/auth/access";

/**
 * Going live (Settings · Domain). Until an owner launches a site, visitors
 * see a holding page; the team — and anyone they send a preview link to —
 * sees the real site. The link carries a pass signed with the server's
 * secret for that one site, good for 30 days; the storefront keeps it in a
 * cookie on its own address.
 */

export const PASS_COOKIE = "oi_pass";
export const PASS_DAYS = 30;

function sign(siteId: string, expires: number): string {
  return createHmac("sha256", env().BETTER_AUTH_SECRET).update(`preview-pass\n${siteId}\n${expires}`).digest("base64url");
}

/** A pass for this site: "<expiry ms>.<signature>". */
export function previewPass(siteId: string, now = Date.now()): string {
  const expires = now + PASS_DAYS * 86_400_000;
  return `${expires}.${sign(siteId, expires)}`;
}

/** Whether a pass is this site's, and still in date. */
export function passValid(siteId: string, pass: string | undefined, now = Date.now()): boolean {
  if (!pass || pass.length > 120) return false;
  const [exp, sig] = pass.split(".");
  const expires = Number(exp);
  if (!Number.isFinite(expires) || expires < now || !sig) return false;
  const want = Buffer.from(sign(siteId, expires));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Whether the public may see the site: launched, or this browser has a pass for it. */
export function siteVisible(site: Pick<Site, "id" | "launchedAt">, pass: string | undefined, now = Date.now()): boolean {
  return !!site.launchedAt || passValid(site.id, pass, now);
}

/** Owners hide a live site again: visitors get the holding page, search engines are kept out, previews still work. */
export async function hideSite(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  await withSite(p.siteId, (tx) => tx.update(sites).set({ launchedAt: null }).where(eq(sites.id, p.siteId)));
}

/** Owners launch the site: from now on everyone sees it. Launching twice keeps the first date; after hiding, it starts afresh. */
export async function launchSite(p: { actorId: string; siteId: string }): Promise<Date> {
  await assertAccess(p.actorId, p.siteId, "owner");
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ launchedAt: sites.launchedAt }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    if (cur.launchedAt) return cur.launchedAt;
    const [s] = await tx.update(sites).set({ launchedAt: new Date() }).where(eq(sites.id, p.siteId)).returning({ launchedAt: sites.launchedAt });
    return s.launchedAt!;
  });
}

/** A preview link's pass, for someone on the team. */
export async function teamPreviewPass(p: { actorId: string; siteId: string }): Promise<string> {
  await assertAccess(p.actorId, p.siteId);
  return previewPass(p.siteId);
}
