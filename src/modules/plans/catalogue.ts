import { asc, eq, max, sql } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { plans, sites, type PlanRow } from "@/db/schema";
import { AccessError } from "@/modules/auth/access";
import { isSupportUser } from "@/modules/auth/support";
import { planSchema, type Plan } from "./plan";
import { putPlan } from "./server";
import { checkPlanChange } from "@/modules/billing/server";

/**
 * Our default plans (Carl, Oct 2026): ops · Plans keeps output/input's price
 * list, and each site is put on one of them — or given a custom plan of its
 * own when needed. Edit a default plan and every site on it follows ("they
 * all follow"): its copy in `sites.plan` is updated, and a new price applies
 * from each paying site's next bill. Only O/I support, checked here.
 */

export type DefaultPlan = Plan & { id: string; sites: number };

async function assertSupport(actorId: string): Promise<void> {
  if (!(await isSupportUser(actorId))) throw new AccessError("Only output/input changes plans.");
}

const asPlan = (r: PlanRow): Plan => planSchema.parse({ name: r.name, description: r.description, price: r.price, currency: r.currency, limits: r.limits });

/** Which sites are on each default plan. Every site is looked at in its own lock (RLS), as ops does. */
async function sitesByPlan(): Promise<Map<string, string[]>> {
  const ids = (await db.execute<{ id: string }>(sql`select all_site_ids() as id`)).rows.map((r) => r.id);
  const out = new Map<string, string[]>();
  for (const id of ids) {
    const [s] = await withSite(id, (tx) => tx.select({ planId: sites.planId }).from(sites).limit(1));
    if (s?.planId) out.set(s.planId, [...(out.get(s.planId) ?? []), id]);
  }
  return out;
}

/** ops · Plans, in their order, with how many sites are on each. */
export async function listDefaultPlans(p: { actorId: string }): Promise<DefaultPlan[]> {
  await assertSupport(p.actorId);
  const [rows, on] = await Promise.all([db.select().from(plans).orderBy(asc(plans.position), asc(plans.createdAt)), sitesByPlan()]);
  return rows.map((r) => ({ ...asPlan(r), id: r.id, sites: on.get(r.id)?.length ?? 0 }));
}

/** One default plan, for its edit screen. */
export async function defaultPlan(p: { actorId: string; id: string }): Promise<DefaultPlan | null> {
  await assertSupport(p.actorId);
  if (!/^[0-9a-f-]{36}$/i.test(p.id)) return null;
  const [r] = await db.select().from(plans).where(eq(plans.id, p.id)).limit(1);
  if (!r) return null;
  return { ...asPlan(r), id: r.id, sites: (await sitesByPlan()).get(r.id)?.length ?? 0 };
}

/**
 * Add a default plan, or change one. A change goes to every site on it:
 * each paying site's currency is checked first (all of them, before
 * anything is saved), then each site's copy is updated and its next bill
 * set. Returns the plan's id and how many sites followed.
 */
export async function saveDefaultPlan(p: { actorId: string; id?: string; plan: unknown }): Promise<{ id: string; sites: number }> {
  await assertSupport(p.actorId);
  const plan = planSchema.parse(p.plan);
  const row = { name: plan.name, description: plan.description, price: plan.price, currency: plan.currency, limits: plan.limits, updatedAt: new Date() };

  if (!p.id) {
    const [{ last }] = await db.select({ last: max(plans.position) }).from(plans);
    const [made] = await db.insert(plans).values({ ...row, position: (last ?? -1) + 1 }).returning({ id: plans.id });
    return { id: made.id, sites: 0 };
  }

  const [found] = await db.select({ id: plans.id }).from(plans).where(eq(plans.id, p.id)).limit(1);
  if (!found) throw new Error("That plan doesn't exist any more.");
  const on = (await sitesByPlan()).get(p.id) ?? [];
  // Check every site before changing any, so a refusal leaves them all as they were.
  for (const siteId of on) await checkPlanChange(siteId, plan);
  await db.update(plans).set(row).where(eq(plans.id, p.id));
  for (const siteId of on) await putPlan(siteId, plan, p.id, p.actorId, "updated the plan {s}");
  return { id: p.id, sites: on.length };
}

/** Take a default plan away. Only once no site is on it. */
export async function deleteDefaultPlan(p: { actorId: string; id: string }): Promise<void> {
  await assertSupport(p.actorId);
  const n = (await sitesByPlan()).get(p.id)?.length ?? 0;
  if (n) throw new Error(`${n} ${n === 1 ? "site is" : "sites are"} on this plan. Move ${n === 1 ? "it" : "them"} to another plan first.`);
  await db.delete(plans).where(eq(plans.id, p.id));
}

/** Put a site on one of our default plans. */
export async function assignPlan(p: { actorId: string; siteId: string; planId: string }): Promise<Plan> {
  await assertSupport(p.actorId);
  const [r] = /^[0-9a-f-]{36}$/i.test(p.planId) ? await db.select().from(plans).where(eq(plans.id, p.planId)).limit(1) : [];
  if (!r) throw new Error("That plan doesn't exist any more.");
  const plan = asPlan(r);
  await putPlan(p.siteId, plan, r.id, p.actorId, "set the plan to {s}");
  return plan;
}
