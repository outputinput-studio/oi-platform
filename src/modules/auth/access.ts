import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, withSite } from "@/db/client";
import { memberships, sites, type MembershipRole, type Site, type User } from "@/db/schema";
import { auth } from "./server";

/**
 * Authorisation lives here, not in proxy.ts. Routing only decides which
 * tree of pages answers; these functions decide what a signed-in person
 * may touch. Every admin page and action goes through one of them.
 */

export type SiteAccess = { user: User; site: Site; role: MembershipRole };

/** Thrown by module functions when the actor may not do this. Pages turn it into a message. */
export class AccessError extends Error {
  constructor(message = "You can't do that here.") {
    super(message);
    this.name = "AccessError";
  }
}

/**
 * The check every module function starts with: is this person a member
 * of this site, and (when `atLeast` is "owner") do they own it? Pure
 * database, no cookies, so modules stay testable and the rule lives in
 * exactly one place.
 */
export async function assertAccess(
  actorId: string,
  siteId: string,
  atLeast: MembershipRole = "staff",
): Promise<MembershipRole> {
  const role = await membershipFor(actorId, siteId);
  if (!role) throw new AccessError("You're not a member of this site.");
  if (atLeast === "owner" && role !== "owner") throw new AccessError("Only an owner can do that.");
  return role;
}

/** Cookie naming the site the person is currently working in. */
export const ACTIVE_SITE_COOKIE = "oi_site";

/** The signed-in user, or null. */
export async function currentUser(): Promise<User | null> {
  const session = await auth.api.getSession({ headers: await headers() });
  return (session?.user as User | undefined) ?? null;
}

/** The signed-in user, or a redirect to sign-in. */
export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) redirect("/sign-in");
  return user;
}

/**
 * The membership a user holds on a site, or null. Pure database, no
 * cookies, so it is what the integration tests exercise directly.
 */
export async function membershipFor(userId: string, siteId: string): Promise<MembershipRole | null> {
  const rows = await db
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.siteId, siteId)))
    .limit(1);
  return rows[0]?.role ?? null;
}

/**
 * Every site a user belongs to, with its name. Memberships are a platform
 * table; the site rows behind them are locked, so each one is read inside
 * its own withSite(). People belong to a handful of sites at most.
 */
export async function sitesFor(userId: string): Promise<Array<{ site: Site; role: MembershipRole }>> {
  const rows = await db
    .select({ siteId: memberships.siteId, role: memberships.role })
    .from(memberships)
    .where(eq(memberships.userId, userId));
  const out: Array<{ site: Site; role: MembershipRole }> = [];
  for (const row of rows) {
    const [site] = await withSite(row.siteId, (tx) => tx.select().from(sites).limit(1));
    if (site) out.push({ site, role: row.role });
  }
  return out.sort((a, b) => a.site.name.localeCompare(b.site.name));
}

/**
 * The site the person is working in right now: signed in, cookie set, and
 * a membership that says they may. Anything less redirects to the site
 * picker, which is also where someone with no sites at all ends up.
 */
export async function requireSiteAccess(): Promise<SiteAccess> {
  const user = await requireUser();
  const siteId = (await cookies()).get(ACTIVE_SITE_COOKIE)?.value;
  if (!siteId) redirect("/sites");
  const role = await membershipFor(user.id, siteId);
  if (!role) redirect("/sites");
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1));
  if (!site) redirect("/sites");
  return { user, site, role };
}
