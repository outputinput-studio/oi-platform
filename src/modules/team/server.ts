import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { MEMBERSHIP_ROLES, memberships, users, type MembershipRole } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { sendEmail } from "@/lib/email";
import { z } from "zod";
import { named } from "@/lib/form-error";

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
};

const emailSchema = z.string().trim().toLowerCase().email();
const roleSchema = z.enum(MEMBERSHIP_ROLES);

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
  // Owners first, then by name.
  return rows.sort((a, b) => (a.role === b.role ? a.name.localeCompare(b.name) : a.role === "owner" ? -1 : 1));
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
}): Promise<Member & { accountCreated: boolean; added: boolean; emailed: boolean }> {
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
  await db.transaction(async (tx) => {
    if (role === "staff") await assertNotLastOwner(tx, p.siteId, p.userId);
    const r = await tx
      .update(memberships)
      .set({ role })
      .where(and(eq(memberships.userId, p.userId), eq(memberships.siteId, p.siteId)))
      .returning({ id: memberships.id });
    if (!r.length) throw new AccessError("That person isn't on this site.");
  });
}

export async function removeMember(p: { actorId: string; siteId: string; userId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  await db.transaction(async (tx) => {
    await assertNotLastOwner(tx, p.siteId, p.userId);
    await tx.delete(memberships).where(and(eq(memberships.userId, p.userId), eq(memberships.siteId, p.siteId)));
  });
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
