import { and, desc, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { withSite, type Tx } from "@/db/client";
import { notFoundHits, redirects, type NotFoundHit, type Redirect } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { FieldError, named } from "@/lib/form-error";

/**
 * Redirects and the not-found log. The team side authorises first; the
 * storefront side (lookup, recording a miss) has no actor and runs inside
 * the site's lock like everything else.
 */

/** "/Shop/Teal-Bikini.html/" → "/shop/teal-bikini.html". The front page is "/". */
export function normalisePath(raw: string): string {
  let p = raw.trim().split("?")[0].split("#")[0];
  if (!p.startsWith("/")) p = "/" + p;
  p = p.replace(/\/{2,}/g, "/").replace(/\/+$/, "").toLowerCase();
  return p || "/";
}

const fromSchema = z
  .string()
  .trim()
  .min(1, "Which address should be redirected?")
  .max(300)
  .transform(normalisePath)
  .refine((p) => p !== "/", "The front page can't be redirected.");
const toSchema = z
  .string()
  .trim()
  .min(1, "Where should it go?")
  .max(600)
  .refine((s) => s.startsWith("/") || /^https?:\/\/\S+$/.test(s), "A path on your site, like /about, or a full address starting with https://")
  .transform((s) => (s.startsWith("/") ? normalisePath(s) : s));

export async function listRedirects(p: { actorId: string; siteId: string }): Promise<Redirect[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, (tx) => tx.select().from(redirects).orderBy(desc(redirects.createdAt)));
}

export async function addRedirect(p: { actorId: string; siteId: string; from: string; to: string }): Promise<Redirect> {
  await assertAccess(p.actorId, p.siteId);
  const from = named("from", fromSchema, p.from);
  const to = named("to", toSchema, p.to);
  if (from === to) throw new FieldError("to", "That would send people round in a circle.");
  return withSite(p.siteId, async (tx) => {
    const [row] = await tx
      .insert(redirects)
      .values({ siteId: p.siteId, fromPath: from, toPath: to, source: "manual" })
      .onConflictDoUpdate({ target: [redirects.siteId, redirects.fromPath], set: { toPath: to, source: "manual" } })
      .returning();
    // A redirected address is no longer "not found".
    await tx.delete(notFoundHits).where(eq(notFoundHits.path, from));
    return row;
  });
}

export async function removeRedirect(p: { actorId: string; siteId: string; redirectId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  const [row] = await withSite(p.siteId, (tx) => tx.delete(redirects).where(eq(redirects.id, p.redirectId)).returning({ id: redirects.id }));
  if (!row) throw new AccessError("That rule doesn't exist.");
}

/**
 * Called by the pages and articles modules inside their own transaction
 * when a live thing is renamed: the old address keeps working. Never
 * overwrites a rule the team made by hand.
 */
export async function autoRedirect(tx: Tx, p: { siteId: string; from: string; to: string }): Promise<void> {
  const from = normalisePath(p.from);
  const to = normalisePath(p.to);
  if (from === to || from === "/") return;
  await tx
    .insert(redirects)
    .values({ siteId: p.siteId, fromPath: from, toPath: to, source: "auto" })
    .onConflictDoNothing({ target: [redirects.siteId, redirects.fromPath] });
  // Anything that pointed at the old address now points at the new one, so a rename of a rename still lands.
  await tx.update(redirects).set({ toPath: to }).where(and(eq(redirects.toPath, from), eq(redirects.source, "auto")));
}

// ───────────────────────── storefront ─────────────────────────

/** Where an address should go, if anywhere. Counts the hit. */
export async function redirectFor(p: { siteId: string; path: string }): Promise<string | null> {
  const from = normalisePath(p.path);
  const [row] = await withSite(p.siteId, (tx) =>
    tx
      .update(redirects)
      .set({ hits: sql`${redirects.hits} + 1` })
      .where(eq(redirects.fromPath, from))
      .returning({ toPath: redirects.toPath }),
  );
  return row?.toPath ?? null;
}

/** A visitor landed somewhere that doesn't exist. Remembered so the team can point it somewhere. */
export async function recordNotFound(p: { siteId: string; path: string; referrer?: string | null }): Promise<void> {
  const path = normalisePath(p.path);
  if (path === "/" || path.length > 300) return;
  let referrer = "";
  try {
    if (p.referrer) referrer = new URL(p.referrer).hostname.replace(/^www\./, "");
  } catch {
    referrer = "";
  }
  await withSite(p.siteId, (tx) =>
    tx
      .insert(notFoundHits)
      .values({ siteId: p.siteId, path, referrer })
      .onConflictDoUpdate({ target: [notFoundHits.siteId, notFoundHits.path], set: { hits: sql`${notFoundHits.hits} + 1`, lastSeen: new Date(), referrer } }),
  );
}

// ───────────────────────── the not-found log ─────────────────────────

const KEEP_DAYS = 90;

export async function listNotFound(p: { actorId: string; siteId: string }): Promise<NotFoundHit[]> {
  await assertAccess(p.actorId, p.siteId);
  return withSite(p.siteId, async (tx) => {
    await tx.delete(notFoundHits).where(lt(notFoundHits.lastSeen, new Date(Date.now() - KEEP_DAYS * 86_400_000)));
    return tx.select().from(notFoundHits).orderBy(desc(notFoundHits.hits), desc(notFoundHits.lastSeen)).limit(200);
  });
}

export async function dismissNotFound(p: { actorId: string; siteId: string; path: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId);
  await withSite(p.siteId, (tx) => tx.delete(notFoundHits).where(eq(notFoundHits.path, normalisePath(p.path))));
}
