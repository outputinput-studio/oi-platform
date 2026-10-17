import Stripe from "stripe";
import { asc, eq, max, sql } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { addons, siteAddons, sites, users, type AddonRow } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { isSupportUser, supportContact } from "@/modules/auth/support";
import { logActivity } from "@/modules/activity/server";
import { readPlan } from "@/modules/plans/plan";
import { billAddon, billedIn, repriceAddon, unbillAddon } from "@/modules/billing/server";
import { sendEmail } from "@/lib/email";
import { FieldError } from "@/lib/form-error";
import { addonSchema, type Addon } from "./addon";

/**
 * Add-ons (Stage 39c, Carl): ops keeps the list; a site's Owner adds one
 * with a tap when it's self-serve — on straight away, the part month on the
 * next bill — or asks us when it isn't. O/I support can add any of them for
 * a site. Change an add-on's price in ops and every site with it follows
 * from its next bill, like a plan.
 */

export type AddonItem = Addon & { id: string; sites: number };
export type SiteAddonView = Addon & { id: string; has: boolean };

const asAddon = (r: AddonRow): Addon =>
  addonSchema.parse({ name: r.name, description: r.description, price: r.price, currency: r.currency, kind: r.kind, amount: r.amount, selfServe: r.selfServe });

async function assertSupport(actorId: string): Promise<void> {
  if (!(await isSupportUser(actorId))) throw new AccessError("Only output/input changes add-ons.");
}

/** Which sites have each add-on (every site looked at in its own lock, as ops does). */
async function sitesByAddon(): Promise<Map<string, { siteId: string; itemId: string | null }[]>> {
  const ids = (await db.execute<{ id: string }>(sql`select all_site_ids() as id`)).rows.map((r) => r.id);
  const out = new Map<string, { siteId: string; itemId: string | null }[]>();
  for (const siteId of ids) {
    for (const r of await withSite(siteId, (tx) => tx.select().from(siteAddons))) out.set(r.addonId, [...(out.get(r.addonId) ?? []), { siteId, itemId: r.stripeItemId }]);
  }
  return out;
}

const uuid = (s: string) => /^[0-9a-f-]{36}$/i.test(s);

async function addonRow(id: string): Promise<AddonRow | null> {
  if (!uuid(id)) return null;
  const [r] = await db.select().from(addons).where(eq(addons.id, id)).limit(1);
  return r ?? null;
}

// ── ops ────────────────────────────────────────────────────────────────

/** ops · Add-ons, in order, with how many sites have each. */
export async function listAddons(p: { actorId: string }): Promise<AddonItem[]> {
  await assertSupport(p.actorId);
  const [rows, on] = await Promise.all([db.select().from(addons).orderBy(asc(addons.position), asc(addons.createdAt)), sitesByAddon()]);
  return rows.map((r) => ({ ...asAddon(r), id: r.id, sites: on.get(r.id)?.length ?? 0 }));
}

export async function getAddon(p: { actorId: string; id: string }): Promise<AddonItem | null> {
  await assertSupport(p.actorId);
  const r = await addonRow(p.id);
  return r ? { ...asAddon(r), id: r.id, sites: (await sitesByAddon()).get(r.id)?.length ?? 0 } : null;
}

/**
 * Add an add-on to the list, or change one. A new price reaches every site
 * that has it, from its next bill. Its currency can't change while anyone
 * has it. Returns its id and how many sites followed.
 */
export async function saveAddon(p: { actorId: string; id?: string; addon: unknown }): Promise<{ id: string; sites: number }> {
  await assertSupport(p.actorId);
  const a = addonSchema.parse(p.addon);
  const row = { ...a, updatedAt: new Date() };
  if (!p.id) {
    const [{ last }] = await db.select({ last: max(addons.position) }).from(addons);
    const [made] = await db.insert(addons).values({ ...row, position: (last ?? -1) + 1 }).returning({ id: addons.id });
    return { id: made.id, sites: 0 };
  }
  const before = await addonRow(p.id);
  if (!before) throw new Error("That add-on doesn't exist any more.");
  const on = (await sitesByAddon()).get(p.id) ?? [];
  if (on.length && before.currency !== a.currency) {
    throw new FieldError("currency", `${on.length} ${on.length === 1 ? "site has" : "sites have"} this add-on in ${before.currency}. Keep ${before.currency}.`);
  }
  // A new product name in Stripe isn't needed: the invoice line keeps the name it had when it was added.
  const [after] = await db.update(addons).set(row).where(eq(addons.id, p.id)).returning();
  if (before.price !== a.price) {
    for (const s of on) {
      try {
        await repriceAddon(s.siteId, s.itemId, after);
      } catch (err) {
        if (err instanceof Stripe.errors.StripeError) throw new Error("Saved, but Stripe didn't take the new price for every site. Save it again in a minute.");
        throw err;
      }
    }
  }
  return { id: p.id, sites: on.length };
}

/** Take an add-on off the list. Only once no site has it. */
export async function deleteAddon(p: { actorId: string; id: string }): Promise<void> {
  await assertSupport(p.actorId);
  const n = (await sitesByAddon()).get(p.id)?.length ?? 0;
  if (n) throw new Error(`${n} ${n === 1 ? "site has" : "sites have"} this add-on. Take it off ${n === 1 ? "that site" : "them"} first.`);
  await db.delete(addons).where(eq(addons.id, p.id));
}

// ── a site ─────────────────────────────────────────────────────────────

/** The site's add-ons, as kind and amount, for its limits. Anyone who can see the site's usage may read these. */
export async function addonsForLimits(siteId: string): Promise<Pick<Addon, "kind" | "amount">[]> {
  const ids = new Set((await withSite(siteId, (tx) => tx.select({ id: siteAddons.addonId }).from(siteAddons))).map((r) => r.id));
  if (!ids.size) return [];
  return (await db.select({ id: addons.id, kind: addons.kind, amount: addons.amount }).from(addons)).filter((r) => ids.has(r.id)).map((r) => ({ kind: r.kind as Addon["kind"], amount: r.amount }));
}

/**
 * Settings · Plan, "Add to your plan" (Owners): every add-on in the plan's
 * currency, whether they have it, and what the month comes to.
 */
export async function siteAddonsView(p: { actorId: string; siteId: string }): Promise<{ addons: SiteAddonView[]; extra: number }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const [site] = await withSite(p.siteId, (tx) => tx.select({ plan: sites.plan }).from(sites).limit(1));
  const plan = readPlan(site?.plan);
  const has = new Set((await withSite(p.siteId, (tx) => tx.select({ id: siteAddons.addonId }).from(siteAddons))).map((r) => r.id));
  const rows = await db.select().from(addons).orderBy(asc(addons.position), asc(addons.createdAt));
  const list = rows.map((r) => ({ ...asAddon(r), id: r.id, has: has.has(r.id) })).filter((a) => a.has || !plan || a.currency === plan.currency);
  return { addons: list, extra: list.filter((a) => a.has).reduce((n, a) => n + a.price, 0) };
}

/**
 * Add one. An Owner can add a self-serve add-on; O/I support can add any.
 * On straight away; when they're paying, the part month goes on the next
 * bill (Carl). It has to be in the currency they're billed in.
 */
export async function addAddon(p: { actorId: string; siteId: string; addonId: string }): Promise<Addon> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const r = await addonRow(p.addonId);
  if (!r) throw new Error("That add-on doesn't exist any more.");
  const a = asAddon(r);
  if (!a.selfServe && !(await isSupportUser(p.actorId))) throw new AccessError("Ask us about this one and we'll set it up.");
  const [already] = await withSite(p.siteId, (tx) => tx.select().from(siteAddons).where(eq(siteAddons.addonId, r.id)).limit(1));
  if (already) return a;
  const [site] = await withSite(p.siteId, (tx) => tx.select({ plan: sites.plan }).from(sites).limit(1));
  const currency = (await billedIn(p.siteId)) ?? readPlan(site?.plan)?.currency ?? null;
  if (currency && currency !== a.currency) throw new Error(`This add-on is priced in ${a.currency} and your plan is in ${currency}. Ask us and we'll sort it.`);
  const itemId = await billAddon(p.siteId, r);
  await withSite(p.siteId, (tx) => tx.insert(siteAddons).values({ siteId: p.siteId, addonId: r.id, addedBy: p.actorId, stripeItemId: itemId }).onConflictDoNothing());
  await logActivity(p.siteId, p.actorId, { action: "added {s} to the plan", subject: a.name, href: "/settings/plan" });
  return a;
}

/** Take one off: it stops now, and the unused part comes off the next bill. */
export async function removeAddon(p: { actorId: string; siteId: string; addonId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  if (!uuid(p.addonId)) return;
  const [row] = await withSite(p.siteId, (tx) => tx.select().from(siteAddons).where(eq(siteAddons.addonId, p.addonId)).limit(1));
  if (!row) return;
  await unbillAddon(row.stripeItemId);
  await withSite(p.siteId, (tx) => tx.delete(siteAddons).where(eq(siteAddons.addonId, p.addonId)));
  const r = await addonRow(p.addonId);
  await logActivity(p.siteId, p.actorId, { action: "took {s} off the plan", subject: r?.name ?? "an add-on", href: "/settings/plan" });
}

/** "Ask us": an email to O/I support with who's asking, for which site, about what. */
export async function askAboutAddon(p: { actorId: string; siteId: string; addonId: string | null; note?: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const r = p.addonId ? await addonRow(p.addonId) : null;
  const [site] = await withSite(p.siteId, (tx) => tx.select({ name: sites.name, slug: sites.slug }).from(sites).limit(1));
  const [who] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, p.actorId)).limit(1);
  const to = supportContact()?.emails ?? [];
  const what = r ? r.name : "something else";
  const note = (p.note ?? "").trim().slice(0, 1000);
  if (to.length) {
    await sendEmail({
      to,
      subject: `${site?.name ?? "A site"} asked about ${what}`,
      text: `${who?.name || who?.email} (${who?.email}) asked about ${what} for ${site?.name} (${site?.slug}).${note ? `\n\n${note}` : ""}`,
      replyTo: who?.email,
    });
  }
  await logActivity(p.siteId, p.actorId, { action: "asked us about {s}", subject: what, href: "/settings/plan" });
}
