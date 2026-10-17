import { eq, sql } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { memberships, sites, users, type MembershipRole, type Site } from "@/db/schema";
import { AccessError } from "@/modules/auth/access";
import { sortByRole } from "@/modules/auth/roles";
import { isSupportUser } from "@/modules/auth/support";
import { readPlan, type Plan } from "@/modules/plans/plan";
import { siteUsage, type Usage } from "@/modules/plans/server";

/**
 * Operations (design/operations.html): output/input's own surface, every
 * site at once. Only O/I support (OI_SUPPORT_EMAILS) gets in, always with
 * the authenticator app. Each function checks that first, like any module.
 */

async function assertOps(actorId: string): Promise<void> {
  if (!(await isSupportUser(actorId))) throw new AccessError("Operations is for output/input only.");
}

async function allSiteIds(): Promise<string[]> {
  return (await db.execute<{ id: string }>(sql`select all_site_ids() as id`)).rows.map((r) => r.id);
}

export type OpsSiteRow = { id: string; name: string; slug: string; domain: string | null; launchedAt: Date | null; planName: string | null; storageBytes: number };

/** Sites, A–Z, with their plan and how much they store. */
export async function opsSites(p: { actorId: string }): Promise<OpsSiteRow[]> {
  await assertOps(p.actorId);
  const out: OpsSiteRow[] = [];
  for (const id of await allSiteIds()) {
    const [s] = await withSite(id, (tx) => tx.select().from(sites).limit(1));
    if (!s) continue;
    const usage = await siteUsage(id);
    out.push({ id, name: s.name, slug: s.slug, domain: s.domain, launchedAt: s.launchedAt, planName: readPlan(s.plan)?.name ?? null, storageBytes: usage.storageBytes });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

export type OpsPerson = { name: string; email: string; role: MembershipRole };

/** One site: its plan, its usage, and who can sign in (read-only — it mirrors their own Team). */
export async function opsSite(p: { actorId: string; siteId: string }): Promise<{ site: Site; plan: Plan | null; usage: Usage; people: OpsPerson[] }> {
  await assertOps(p.actorId);
  const [site] = /^[0-9a-f-]{36}$/.test(p.siteId) ? await withSite(p.siteId, (tx) => tx.select().from(sites).limit(1)) : [];
  if (!site) throw new AccessError("That site doesn't exist.");
  const people = await db
    .select({ name: users.name, email: users.email, role: memberships.role })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.siteId, site.id));
  return { site, plan: readPlan(site.plan), usage: await siteUsage(site.id), people: sortByRole(people) };
}
