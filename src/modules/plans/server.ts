import { count, eq, gte, sql, sum } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { media, memberships, products, sites, visits } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { isSupportUser } from "@/modules/auth/support";
import { logActivity } from "@/modules/activity/server";
import { planSchema, readPlan, type Plan } from "./plan";

/**
 * Plans and what a site uses against them. output/input sets a plan (ops);
 * the site's Owners see it (Settings · Plan). Usage is counted, never
 * enforced here: "Nothing will stop working — we will let you know before
 * it matters."
 */

export type Usage = { storageBytes: number; products: number; people: number; visits: number };

/** Today in UTC, as the visits table keys it. */
const today = () => new Date().toISOString().slice(0, 10);

/** What a site is using: photos and files, products, people who can sign in, visits this month. */
export async function siteUsage(siteId: string): Promise<Usage> {
  const monthStart = today().slice(0, 8) + "01";
  const [stored, made, seen] = await withSite(siteId, (tx) =>
    Promise.all([
      tx.select({ n: sum(media.sizeBytes) }).from(media),
      tx.select({ n: count() }).from(products).where(sql`${products.deletedAt} is null`),
      tx.select({ n: sum(visits.count) }).from(visits).where(gte(visits.day, monthStart)),
    ]),
  );
  const [people] = await db.select({ n: count() }).from(memberships).where(eq(memberships.siteId, siteId));
  return { storageBytes: Number(stored[0]?.n ?? 0), products: Number(made[0]?.n ?? 0), people: Number(people?.n ?? 0), visits: Number(seen[0]?.n ?? 0) };
}

/** Settings · Plan: Owners only (Carl: the Owner looks after "the team and the plan"). */
export async function planView(p: { actorId: string; siteId: string }): Promise<{ plan: Plan | null; usage: Usage }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const [site] = await withSite(p.siteId, (tx) => tx.select({ plan: sites.plan }).from(sites).limit(1));
  return { plan: readPlan(site?.plan), usage: await siteUsage(p.siteId) };
}

/** Set a site's plan. output/input only, from ops — a site's own Owners can't. */
export async function setPlan(p: { actorId: string; siteId: string; plan: unknown }): Promise<Plan> {
  if (!(await isSupportUser(p.actorId))) throw new AccessError("Only output/input changes plans.");
  const plan = planSchema.parse(p.plan);
  await withSite(p.siteId, (tx) => tx.update(sites).set({ plan }).where(eq(sites.id, p.siteId)));
  await logActivity(p.siteId, p.actorId, { action: "set the plan to {s}", subject: plan.name, href: "/settings/plan" });
  return plan;
}

/** One visit to a storefront, today. Called by the visit beacon; no one is identified. */
export async function countVisit(siteId: string): Promise<void> {
  await withSite(siteId, (tx) =>
    tx
      .insert(visits)
      .values({ siteId, day: today(), count: 1 })
      .onConflictDoUpdate({ target: [visits.siteId, visits.day], set: { count: sql`${visits.count} + 1` } }),
  );
}

