import { and, eq } from "drizzle-orm";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { db, withSite } from "@/db/client";
import { memberships, sites, type MembershipRole, type Site, type User } from "@/db/schema";
import { secretsAvailable } from "@/lib/secrets";
import { auth } from "./server";
import { atLeast } from "./roles";
import { signInState } from "./two-factor";

/**
 * Authorisation lives here, not in proxy.ts. Routing only decides which
 * tree of pages answers; these functions decide what a signed-in person
 * may touch. Every admin page and action goes through one of them.
 */

export type SiteAccess = { user: User; site: Site; role: MembershipRole; sessionId: string };

/** Thrown by module functions when the actor may not do this. Pages turn it into a message. */
export class AccessError extends Error {
  constructor(message = "You can't do that here.") {
    super(message);
    this.name = "AccessError";
  }
}

/**
 * The check every module function starts with: is this person a member
 * of this site, with at least role `min`? A Manager unless said otherwise,
 * so a new function is closed to Staff until someone decides they need it:
 * pass "staff" for orders, the inbox and contacts, "owner" for the team,
 * payment keys, the domain, custom code and going live (roles.ts). Pure
 * database, no cookies, so modules stay testable and the rule lives in
 * exactly one place.
 */
export async function assertAccess(actorId: string, siteId: string, min: MembershipRole = "manager"): Promise<MembershipRole> {
  const role = await membershipFor(actorId, siteId);
  if (!role) throw new AccessError("You're not a member of this site.");
  if (!atLeast(role, min)) throw new AccessError(min === "owner" ? "Only an owner can do that." : "Only an owner or a manager can do that.");
  return role;
}

/** Cookie naming the site the person is currently working in. */
export const ACTIVE_SITE_COOKIE = "oi_site";

/** The session cookie's person and session, or null. Half-way (still owing the app code) counts here. */
async function currentSession(): Promise<{ user: User; sessionId: string } | null> {
  const s = await auth.api.getSession({ headers: await headers() });
  return s ? { user: s.user as User, sessionId: s.session.id } : null;
}

/** The signed-in user, or null (including someone still owing the app code). */
export async function currentUser(): Promise<User | null> {
  return (await currentSession())?.user ?? null;
}

/**
 * Signed in all the way: the emailed code, then the authenticator app if
 * they use one (Stage 38). Checked on every request from the session row,
 * so a session that only got as far as the email can't do anything but
 * finish signing in or sign out — whichever way it was made.
 */
export async function requireSignIn(): Promise<{ user: User; sessionId: string; twoFactorOn: boolean }> {
  const s = await currentSession();
  if (!s) redirect("/sign-in");
  const state = await signInState(s.sessionId);
  if (!state) redirect("/sign-in");
  if (state.twoFactorOn && !state.passed) redirect("/sign-in/app");
  return { ...s, twoFactorOn: state.twoFactorOn };
}

/** The signed-in user, or a redirect to sign-in (or to the app-code step). */
export async function requireUser(): Promise<User> {
  return (await requireSignIn()).user;
}

/** The app-code step: signed in with the emailed code, still owing the app's. Anyone else goes on. */
export async function requireHalfSignIn(): Promise<{ user: User; sessionId: string }> {
  const s = await currentSession();
  if (!s) redirect("/sign-in");
  const state = await signInState(s.sessionId);
  if (!state) redirect("/sign-in");
  if (!state.twoFactorOn || state.passed) redirect("/sites");
  return s;
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
 * picker, which is also where someone with no sites at all ends up. A
 * screen for a higher role than theirs (`min`) sends them Home: the nav
 * never shows it, so this is someone following an old link. An Owner
 * without the authenticator app sets it up before anything else (Carl:
 * "Required for Owners") — once the server can keep its key (OI_SECRETS_KEY).
 */
export async function requireSiteAccess(min: MembershipRole = "staff"): Promise<SiteAccess> {
  const { user, sessionId, twoFactorOn } = await requireSignIn();
  const siteId = (await cookies()).get(ACTIVE_SITE_COOKIE)?.value;
  if (!siteId) redirect("/sites");
  const role = await membershipFor(user.id, siteId);
  if (!role) redirect("/sites");
  if (role === "owner" && !twoFactorOn && secretsAvailable()) redirect("/two-factor");
  if (!atLeast(role, min)) redirect("/");
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1));
  if (!site) redirect("/sites");
  return { user, site, role, sessionId };
}
