import { and, eq, inArray, max, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { MEMBERSHIP_ROLES, memberships, sessions, users, type MembershipRole } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { roleWords, sortByRole } from "@/modules/auth/roles";
import { sendEmail } from "@/lib/email";
import { z } from "zod";
import { named } from "@/lib/form-error";
import { logActivity } from "@/modules/activity/server";

/**
 * A site's team: who belongs, as what. Memberships and users are platform
 * tables, so these run outside withSite(); every function authorises the
 * actor first, which is the rule that keeps that safe.
 *
 * Adding someone by email is the only way anyone ever gets an account:
 * sign-in is invite-only, and this is the invite.
 */

export type Member = {
  userId: string;
  name: string;
  email: string;
  role: MembershipRole;
  since: Date;
  /** The last time they signed in or came back (a session renews when used); null if they never have. */
  lastSignedIn: Date | null;
};

const emailSchema = z.string().trim().toLowerCase().email();
const roleSchema = z.enum(MEMBERSHIP_ROLES);

/** The team, owners first. Managers can look; only owners change it. */
export async function listMembers(p: { actorId: string; siteId: string }): Promise<Member[]> {
  await assertAccess(p.actorId, p.siteId);
  const rows = await db
    .select({
      userId: users.id,
      name: users.name,
      email: users.email,
      role: memberships.role,
      since: memberships.createdAt,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(eq(memberships.siteId, p.siteId));
  const seen = rows.length
    ? await db
        .select({ userId: sessions.userId, at: max(sessions.updatedAt) })
        .from(sessions)
        .where(inArray(sessions.userId, rows.map((r) => r.userId)))
        .groupBy(sessions.userId)
    : [];
  const last = new Map(seen.map((s) => [s.userId, s.at]));
  return sortByRole(rows.map((r) => ({ ...r, lastSignedIn: last.get(r.userId) ?? null })));
}

/** What the invitation email needs to say: who added them, to what, and where to sign in. */
export type Invitation = { siteName: string; byName: string; signInUrl: string };

export async function addMember(p: {
  actorId: string;
  siteId: string;
  email: string;
  role?: MembershipRole;
  /** When given, a newly added member is told by email. Left out in tests and scripts. */
  invitation?: Invitation;
}): Promise<Omit<Member, "lastSignedIn"> & { accountCreated: boolean; added: boolean; emailed: boolean }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const email = named("email", emailSchema, p.email);
  const role = named("role", roleSchema, p.role ?? "staff");

  const result = await db.transaction(async (tx) => {
    let [user] = await tx.select().from(users).where(eq(users.email, email)).limit(1);
    const accountCreated = !user;
    if (!user) {
      [user] = await tx
        .insert(users)
        .values({ id: crypto.randomUUID(), name: email.split("@")[0], email, emailVerified: true, updatedAt: new Date() })
        .returning();
    }
    const existing = await tx
      .select({ role: memberships.role, since: memberships.createdAt })
      .from(memberships)
      .where(and(eq(memberships.userId, user.id), eq(memberships.siteId, p.siteId)))
      .limit(1);
    if (existing[0]) {
      return { userId: user.id, name: user.name, email: user.email, role: existing[0].role, since: existing[0].since, accountCreated, added: false };
    }
    const [m] = await tx.insert(memberships).values({ userId: user.id, siteId: p.siteId, role }).returning();
    return { userId: user.id, name: user.name, email: user.email, role: m.role, since: m.createdAt, accountCreated, added: true };
  });

  if (result.added) await logActivity(p.siteId, p.actorId, { action: `added {s} to the team as ${roleWords(result.role)}`, subject: result.email, href: "/team" });

  // The invitation goes after the membership is in: a failed email never
  // undoes the add, it just tells the owner to pass the word on themselves.
  let emailed = false;
  if (result.added && p.invitation) {
    try {
      emailed = (await sendEmail(invitationEmail(result.email, p.invitation))).delivered;
    } catch (err) {
      console.error("invitation email failed", err);
    }
  }
  return { ...result, emailed };
}

/** Plain words, no links to click but the one they need. Exported so the wording can be tested. */
export function invitationEmail(to: string, inv: Invitation): { to: string; subject: string; text: string } {
  return {
    to,
    subject: `${inv.byName} added you to ${inv.siteName}`,
    text: [
      `${inv.byName} has added you to the team for ${inv.siteName}.`,
      ``,
      `To sign in, go to ${inv.signInUrl} and enter this email address. We'll send you a six-digit code; there's no password.`,
      ``,
      `If you weren't expecting this, you can ignore it.`,
    ].join("\n"),
  };
}

export async function setRole(p: { actorId: string; siteId: string; userId: string; role: MembershipRole }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const role = named("role", roleSchema, p.role);
  const changed = await db.transaction(async (tx) => {
    const [now] = await tx
      .select({ role: memberships.role })
      .from(memberships)
      .where(and(eq(memberships.userId, p.userId), eq(memberships.siteId, p.siteId)))
      .limit(1)
      .for("update");
    if (!now) throw new AccessError("That person isn't on this site.");
    if (now.role === role) return false;
    if (role !== "owner") await assertNotLastOwner(tx, p.siteId, p.userId);
    await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.userId, p.userId), eq(memberships.siteId, p.siteId)));
    return true;
  });
  if (changed) await logActivity(p.siteId, p.actorId, { action: `made {s} ${roleWords(role)}`, subject: await personName(p.userId), href: "/team" });
}

/** Who someone is, in Activity: their name, or their email when they haven't given one. */
async function personName(userId: string): Promise<string> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return u ? u.name || u.email : "someone";
}

export async function removeMember(p: { actorId: string; siteId: string; userId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const who = await personName(p.userId);
  const gone = await db.transaction(async (tx) => {
    await assertNotLastOwner(tx, p.siteId, p.userId);
    return tx.delete(memberships).where(and(eq(memberships.userId, p.userId), eq(memberships.siteId, p.siteId))).returning({ id: memberships.id });
  });
  if (gone.length) await logActivity(p.siteId, p.actorId, { action: "took {s} off the team", subject: who, href: "/team" });
}

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

/** A site must always have an owner, or nobody could ever fix it. */
async function assertNotLastOwner(tx: Tx, siteId: string, userId: string) {
  const [target] = await tx
    .select({ role: memberships.role })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.siteId, siteId)))
    .limit(1);
  if (target?.role !== "owner") return;
  const [{ n }] = await tx
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.siteId, siteId), eq(memberships.role, "owner")));
  if (n <= 1) throw new AccessError("This is the site's last owner. Make someone else an owner first.");
}
