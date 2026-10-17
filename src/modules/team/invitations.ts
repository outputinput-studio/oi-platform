import { randomBytes } from "node:crypto";
import { and, desc, eq, gt, isNull, or, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { invitations, memberships, MEMBERSHIP_ROLES, sites, users, type Invitation, type MembershipRole } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { FieldError, named } from "@/lib/form-error";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { ROLE_NAMES, roleWords } from "@/modules/auth/roles";
import { logActivity } from "@/modules/activity/server";
import { firstName } from "@/modules/activity/words";
import { INVITE_DAYS, inviteStatus, type InviteStatus } from "./invite-status";

/**
 * Invitations (Stage 38, design/admin.html Team). An Owner invites an
 * email as a role; the email holds a link (also on Team, to copy). The
 * link puts that address on the team — it can't do more: signing in still
 * takes the address's own emailed code, and the app if they use one.
 * Invitations last 14 days; an expired link asks for a new one itself,
 * sent to the invited address, never to whoever clicked.
 *
 * `invitations` is a client table (row-level security). The join page has
 * no site yet, so it finds one through resolve_invitation(token), which
 * answers only that.
 */

type Send = (m: { to: string; subject: string; text: string }) => Promise<{ delivered: boolean }>;

const emailSchema = z.string().trim().toLowerCase().email("That doesn't look like an email address.");
const roleSchema = z.enum(MEMBERSHIP_ROLES);
const DAY = 86_400_000;

export type InviteRow = {
  id: string;
  email: string;
  role: MembershipRole;
  status: InviteStatus;
  sentAt: Date;
  expiresAt: Date;
  openedAt: Date | null;
  acceptedAt: Date | null;
  link: string;
};

const linkFor = (host: string, token: string) => `https://${host}/join/${token}`;

function row(i: Invitation, host: string): InviteRow {
  return { id: i.id, email: i.email, role: i.role, status: inviteStatus(i), sentAt: i.sentAt, expiresAt: i.expiresAt, openedAt: i.openedAt, acceptedAt: i.acceptedAt, link: linkFor(host, i.token) };
}

/** Plain words: who, to what, as what, the link, how long it lasts. Exported so the wording can be tested. */
export function invitationEmail(p: { to: string; byName: string; siteName: string; role: MembershipRole; link: string }) {
  return {
    to: p.to,
    subject: `${p.byName} invited you to ${p.siteName}`,
    text: [
      `${p.byName} has invited you to help run ${p.siteName} as ${roleWords(p.role)}.`,
      ``,
      `Join here: ${p.link}`,
      ``,
      `The link works for ${INVITE_DAYS} days. After that it lets you ask for a new one. Signing in is a six-digit code we email you; there's no password.`,
      ``,
      `If you weren't expecting this, you can ignore it.`,
    ].join("\n"),
  };
}

async function siteName(siteId: string): Promise<string> {
  const [s] = await withSite(siteId, (tx) => tx.select({ name: sites.name }).from(sites).limit(1));
  return s?.name ?? "the site";
}

async function personFirstName(userId: string | null): Promise<string> {
  if (!userId) return "output/input";
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  return firstName(u ?? undefined);
}

async function mail(i: Invitation, host: string, send: Send): Promise<boolean> {
  try {
    const m = invitationEmail({ to: i.email, byName: await personFirstName(i.invitedBy), siteName: await siteName(i.siteId), role: i.role, link: linkFor(host, i.token) });
    return (await send(m)).delivered;
  } catch (err) {
    console.error("invitation email failed", err);
    return false;
  }
}

/** Sign-in is invite-only: an invited address needs an account to be sent a code once it's joined. */
async function ensureUser(email: string): Promise<void> {
  const local = email.split("@")[0];
  await db
    .insert(users)
    .values({ id: crypto.randomUUID(), name: local.charAt(0).toUpperCase() + local.slice(1), email, emailVerified: true, updatedAt: new Date() })
    .onConflictDoNothing({ target: users.email });
}

/**
 * Invite someone. Someone already on the team is pointed out on the email
 * field; an invitation already waiting for that address is updated and
 * sent again rather than doubled.
 */
export async function invite(p: { actorId: string; siteId: string; email: string; role: MembershipRole; host: string; send?: Send }): Promise<InviteRow & { emailed: boolean }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const email = named("email", emailSchema, p.email);
  const role = named("role", roleSchema, p.role);
  const [member] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .where(and(eq(memberships.siteId, p.siteId), eq(users.email, email)))
    .limit(1);
  if (member) throw new FieldError("email", `${email} is already on the team.`);
  await ensureUser(email);

  const now = new Date();
  const expiresAt = new Date(now.getTime() + INVITE_DAYS * DAY);
  const inv = await withSite(p.siteId, async (tx) => {
    const [waiting] = await tx
      .select()
      .from(invitations)
      .where(and(eq(invitations.email, email), isNull(invitations.acceptedAt), isNull(invitations.cancelledAt)))
      .orderBy(desc(invitations.sentAt))
      .limit(1);
    if (waiting) {
      const [u] = await tx.update(invitations).set({ role, sentAt: now, expiresAt, invitedBy: p.actorId }).where(eq(invitations.id, waiting.id)).returning();
      return u;
    }
    const [n] = await tx
      .insert(invitations)
      .values({ siteId: p.siteId, email, role, token: randomBytes(32).toString("base64url"), invitedBy: p.actorId, sentAt: now, expiresAt })
      .returning();
    return n;
  });
  await logActivity(p.siteId, p.actorId, { action: `invited {s} as ${roleWords(role)}`, subject: email, href: "/team" });
  const emailed = await mail(inv, p.host, p.send ?? sendEmail);
  return { ...row(inv, p.host), emailed };
}

/** Waiting, expired, and accepted in the last fortnight — newest first. Cancelled ones drop off. Managers can look. */
export async function listInvitations(p: { actorId: string; siteId: string; host: string }): Promise<InviteRow[]> {
  await assertAccess(p.actorId, p.siteId);
  const since = new Date(Date.now() - INVITE_DAYS * DAY);
  const rows = await withSite(p.siteId, (tx) =>
    tx
      .select()
      .from(invitations)
      .where(and(isNull(invitations.cancelledAt), or(isNull(invitations.acceptedAt), gt(invitations.acceptedAt, since))))
      .orderBy(desc(invitations.sentAt))
      .limit(100),
  );
  return rows.map((r) => row(r, p.host));
}

async function waitingInvite(siteId: string, inviteId: string): Promise<Invitation> {
  const [i] = z.string().uuid().safeParse(inviteId).success
    ? await withSite(siteId, (tx) => tx.select().from(invitations).where(eq(invitations.id, inviteId)).limit(1))
    : [];
  if (!i || i.acceptedAt || i.cancelledAt) throw new AccessError("That invitation isn't waiting any more. Reload and try again.");
  return i;
}

export async function setInviteRole(p: { actorId: string; siteId: string; inviteId: string; role: MembershipRole }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const role = named("role", roleSchema, p.role);
  const i = await waitingInvite(p.siteId, p.inviteId);
  if (i.role === role) return;
  await withSite(p.siteId, (tx) => tx.update(invitations).set({ role }).where(eq(invitations.id, i.id)));
  await logActivity(p.siteId, p.actorId, { action: `changed the invitation for {s} to ${roleWords(role)}`, subject: i.email, href: "/team" });
}

/** Send it again, good for another fourteen days from now. Same link. */
export async function resendInvite(p: { actorId: string; siteId: string; inviteId: string; host: string; send?: Send }): Promise<boolean> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const i = await waitingInvite(p.siteId, p.inviteId);
  const now = new Date();
  const [u] = await withSite(p.siteId, (tx) =>
    tx.update(invitations).set({ sentAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY) }).where(eq(invitations.id, i.id)).returning(),
  );
  return mail(u, p.host, p.send ?? sendEmail);
}

export async function cancelInvite(p: { actorId: string; siteId: string; inviteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const i = await waitingInvite(p.siteId, p.inviteId);
  await withSite(p.siteId, (tx) => tx.update(invitations).set({ cancelledAt: new Date() }).where(eq(invitations.id, i.id)));
  await logActivity(p.siteId, p.actorId, { action: "cancelled the invitation for {s}", subject: i.email, href: "/team" });
}

/* ───────────────────────── the join page (no site yet) ───────────────────────── */

async function byToken(token: string): Promise<Invitation | null> {
  if (!/^[\w-]{20,100}$/.test(token)) return null;
  const r = await db.execute<{ id: string | null }>(sql`select resolve_invitation(${token}) as id`);
  const siteId = r.rows[0]?.id;
  if (!siteId) return null;
  const [i] = await withSite(siteId, (tx) => tx.select().from(invitations).where(eq(invitations.token, token)).limit(1));
  return i ?? null;
}

export type JoinView = { siteName: string; byName: string; email: string; role: MembershipRole; roleName: string; status: InviteStatus };

/** What the join page shows. The first look marks it Opened on Team. Null for a link that isn't one. */
export async function openInvitation(token: string): Promise<JoinView | null> {
  const i = await byToken(token);
  if (!i) return null;
  const status = inviteStatus(i);
  if (status === "sent") await withSite(i.siteId, (tx) => tx.update(invitations).set({ openedAt: new Date() }).where(eq(invitations.id, i.id)));
  return { siteName: await siteName(i.siteId), byName: await personFirstName(i.invitedBy), email: i.email, role: i.role, roleName: ROLE_NAMES[i.role], status };
}

/** Join: the invited address goes on the team as the role it says. A second click changes nothing. */
export async function acceptInvitation(token: string): Promise<{ email: string; siteId: string }> {
  const i = await byToken(token);
  if (!i) throw new AccessError("That invitation link isn't right. Check you have the whole link, or ask whoever invited you.");
  const status = inviteStatus(i);
  if (status === "accepted") return { email: i.email, siteId: i.siteId };
  if (status === "cancelled") throw new AccessError("That invitation was cancelled. Ask whoever invited you.");
  if (status === "expired") throw new AccessError("That invitation has expired. Ask for a new link below.");
  await ensureUser(i.email);
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, i.email)).limit(1);
  await db.insert(memberships).values({ userId: u.id, siteId: i.siteId, role: i.role }).onConflictDoNothing();
  await withSite(i.siteId, (tx) => tx.update(invitations).set({ acceptedAt: new Date(), openedAt: i.openedAt ?? new Date() }).where(eq(invitations.id, i.id)));
  await logActivity(i.siteId, u.id, { action: `joined the team as ${roleWords(i.role)}`, subject: "", href: "/team" });
  return { email: i.email, siteId: i.siteId };
}

/**
 * An expired link asks for a new one itself (nobody has to call us). It
 * goes to the invited address, at most once an hour. True when one went.
 */
export async function askForNewLink(token: string, host: string, send: Send = sendEmail): Promise<boolean> {
  const i = await byToken(token);
  if (!i || inviteStatus(i) !== "expired") return false;
  const now = new Date();
  if (i.askedAgainAt && now.getTime() - i.askedAgainAt.getTime() < 3_600_000) return false;
  const [u] = await withSite(i.siteId, (tx) =>
    tx
      .update(invitations)
      .set({ sentAt: now, expiresAt: new Date(now.getTime() + INVITE_DAYS * DAY), askedAgainAt: now, openedAt: null })
      .where(eq(invitations.id, i.id))
      .returning(),
  );
  await mail(u, host, send);
  return true;
}
