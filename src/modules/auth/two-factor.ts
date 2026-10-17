import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships, sessions, twoFactors, users, type TwoFactor } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/secrets";
import { FieldError } from "@/lib/form-error";
import { waitText } from "@/lib/time";
import { lockMinutes } from "@/modules/customers/secrets";
import { logActivity } from "@/modules/activity/server";
import { AccessError, assertAccess } from "./access";
import { isSupportUser } from "./support";
import { checkTotp, newRecoveryCodes, newSecret, normaliseRecovery, otpauthUri, recoveryHash, wasUsed } from "./totp";

/**
 * Two-factor for the team (Carl, Oct 2026): after the emailed code, a code
 * from an authenticator app. Required for Owners; anyone else can turn it
 * on. Ten one-time recovery codes for a lost phone, and an Owner can reset
 * it for someone on their site.
 *
 * `two_factors` is a platform table (one row per person, never per site),
 * so these work outside withSite(). Every function takes the person whose
 * row it is; the actions pass the signed-in user, never an id from a form.
 * Which session got past the app is kept on the session itself
 * (`sessions.two_factor_at`), so access.ts can check it on every request.
 */

const MAX_MISSES = 5;

export type TwoFactorStatus = { on: boolean; required: boolean; recoveryLeft: number };

async function load(userId: string): Promise<TwoFactor | undefined> {
  const [r] = await db.select().from(twoFactors).where(eq(twoFactors.userId, userId)).limit(1);
  return r;
}

/** Owners must have it on (Carl: "Required for Owners"), and so must O/I support. Owner of any site counts: it's one sign-in. */
export async function requiredFor(userId: string): Promise<boolean> {
  if (await isSupportUser(userId)) return true;
  const [r] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(memberships)
    .where(and(eq(memberships.userId, userId), eq(memberships.role, "owner")));
  return (r?.n ?? 0) > 0;
}

export async function twoFactorStatus(userId: string): Promise<TwoFactorStatus> {
  const [row, required] = await Promise.all([load(userId), requiredFor(userId)]);
  const on = !!row?.confirmedAt;
  return { on, required, recoveryLeft: on ? row!.recovery.length : 0 };
}

/**
 * Where a session stands: does its person use the app, and has this session
 * got past it? One query, run on every signed-in request. Null when the
 * session doesn't exist.
 */
export async function signInState(sessionId: string): Promise<{ twoFactorOn: boolean; passed: boolean } | null> {
  const [r] = await db
    .select({ at: sessions.twoFactorAt, confirmed: twoFactors.confirmedAt })
    .from(sessions)
    .leftJoin(twoFactors, eq(twoFactors.userId, sessions.userId))
    .where(eq(sessions.id, sessionId))
    .limit(1);
  if (!r) return null;
  return { twoFactorOn: !!r.confirmed, passed: !!r.at };
}

/** This session is past the app: setting it up, or a code at sign-in. */
async function markPassed(userId: string, sessionId: string): Promise<void> {
  await db.update(sessions).set({ twoFactorAt: new Date() }).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

/**
 * The key to put in the app. Kept, unconfirmed, until a code from the app
 * proves it's in there; reloading the page shows the same one.
 */
export async function startSetup(userId: string): Promise<{ secret: string; uri: string }> {
  const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, userId)).limit(1);
  if (!user) throw new AccessError("That account doesn't exist.");
  const row = await load(userId);
  if (row?.confirmedAt) throw new AccessError("Two-factor is already on.");
  let secret: string;
  if (row) secret = decryptSecret(row.secret);
  else {
    secret = newSecret();
    await db.insert(twoFactors).values({ userId, secret: encryptSecret(secret) }).onConflictDoNothing();
    secret = decryptSecret((await load(userId))!.secret); // whoever got there first
  }
  return { secret, uri: otpauthUri({ secret, email: user.email }) };
}

/**
 * Check a code against someone's row, with the throttle around it. An app
 * code works once (its step is remembered); a recovery code, if allowed,
 * is used up. Wrong codes count towards a lock.
 */
async function check(row: TwoFactor, typed: string, opts: { recovery: boolean }): Promise<void> {
  const now = new Date();
  if (row.lockedUntil && row.lockedUntil > now) {
    throw new FieldError("code", `Too many tries. Try again in ${waitText((row.lockedUntil.getTime() - now.getTime()) / 1000)}.`);
  }
  const secret = decryptSecret(row.secret);
  const step = checkTotp(secret, typed, now, row.lastStep);
  if (step !== null) {
    await db.update(twoFactors).set({ lastStep: step, misses: 0, strikes: 0, lockedUntil: null, updatedAt: now }).where(eq(twoFactors.userId, row.userId));
    return;
  }
  const recovery = opts.recovery ? normaliseRecovery(typed) : null;
  if (recovery) {
    const hash = recoveryHash(recovery);
    if (row.recovery.includes(hash)) {
      // Used up in the same statement that checks it, so two tabs can't both spend it.
      const spent = await db
        .update(twoFactors)
        .set({ recovery: sql`${twoFactors.recovery} - ${hash}::text`, misses: 0, strikes: 0, lockedUntil: null, updatedAt: now })
        .where(and(eq(twoFactors.userId, row.userId), sql`${twoFactors.recovery} ? ${hash}::text`))
        .returning({ userId: twoFactors.userId });
      if (spent.length) return;
    }
  }
  const used = wasUsed(secret, typed, now, row.lastStep);
  const misses = row.misses + 1;
  const lock = misses >= MAX_MISSES;
  const minutes = lockMinutes(row.strikes + 1);
  await db
    .update(twoFactors)
    .set({
      misses: lock ? 0 : misses,
      strikes: lock ? row.strikes + 1 : row.strikes,
      lockedUntil: lock ? new Date(now.getTime() + minutes * 60_000) : row.lockedUntil,
      updatedAt: now,
    })
    .where(eq(twoFactors.userId, row.userId));
  if (lock) throw new FieldError("code", `Too many tries. Try again in ${waitText(minutes * 60)}.`);
  if (used) throw new FieldError("code", "That code has already been used. Wait for the next one in your app.");
  throw new FieldError("code", opts.recovery ? "That code didn't work. Check your app, or use a recovery code." : "That code didn't work. Check your app and try the one showing now.");
}

/** The first code from the app turns it on. Returns the ten recovery codes, shown once. */
export async function confirmSetup(userId: string, code: string, sessionId?: string): Promise<string[]> {
  const row = await load(userId);
  if (!row) throw new FieldError("code", "Start again: there's no key waiting to be confirmed.");
  if (row.confirmedAt) throw new AccessError("Two-factor is already on.");
  await check(row, code, { recovery: false });
  const codes = newRecoveryCodes();
  await db
    .update(twoFactors)
    .set({ confirmedAt: new Date(), recovery: codes.map(recoveryHash), updatedAt: new Date() })
    .where(eq(twoFactors.userId, userId));
  if (sessionId) await markPassed(userId, sessionId);
  return codes;
}

/** At sign-in, after the emailed code: an app code or a recovery code lets this session in. */
export async function verifySecondStep(userId: string, sessionId: string, code: string): Promise<void> {
  const [s] = await db.select({ userId: sessions.userId }).from(sessions).where(eq(sessions.id, sessionId)).limit(1);
  if (!s || s.userId !== userId) throw new AccessError("Sign in again.");
  const row = await load(userId);
  if (!row?.confirmedAt) {
    await markPassed(userId, sessionId);
    return;
  }
  await check(row, code, { recovery: true });
  await markPassed(userId, sessionId);
}

/** A new set of ten, replacing the old ones. Needs a code from the app. */
export async function freshRecoveryCodes(userId: string, code: string): Promise<string[]> {
  const row = await load(userId);
  if (!row?.confirmedAt) throw new AccessError("Two-factor isn't on.");
  await check(row, code, { recovery: false });
  const codes = newRecoveryCodes();
  await db.update(twoFactors).set({ recovery: codes.map(recoveryHash), updatedAt: new Date() }).where(eq(twoFactors.userId, userId));
  return codes;
}

/** Off again. Needs a code from the app; Owners can't (it's required for them). */
export async function turnOffTwoFactor(userId: string, code: string): Promise<void> {
  if (await requiredFor(userId)) throw new AccessError("Owners keep two-factor on: their sign-in can move money.");
  const row = await load(userId);
  if (!row?.confirmedAt) return;
  await check(row, code, { recovery: false });
  await db.delete(twoFactors).where(eq(twoFactors.userId, userId));
}

/**
 * Someone lost their phone and their recovery codes: an Owner clears it.
 * They're signed out everywhere, and set it up again next time (straight
 * away, if they're an Owner). Only for people whose every site the actor
 * owns, so one site's owner can't weaken someone's sign-in elsewhere;
 * anyone else asks output/input. Never your own: use a recovery code.
 */
export async function resetTwoFactor(p: { actorId: string; siteId: string; userId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  if (p.userId === p.actorId) throw new AccessError("You can't reset your own. Sign in with a recovery code, or ask output/input.");
  const theirs = await db.select({ siteId: memberships.siteId }).from(memberships).where(eq(memberships.userId, p.userId));
  if (!theirs.some((m) => m.siteId === p.siteId)) throw new AccessError("That person isn't on this site.");
  const elsewhere = theirs.map((m) => m.siteId).filter((id) => id !== p.siteId);
  if (elsewhere.length) {
    const owned = await db
      .select({ siteId: memberships.siteId })
      .from(memberships)
      .where(and(eq(memberships.userId, p.actorId), eq(memberships.role, "owner"), inArray(memberships.siteId, elsewhere)));
    if (owned.length < elsewhere.length) throw new AccessError("They're on another site too, so ask output/input to reset it.");
  }
  await db.transaction(async (tx) => {
    await tx.delete(twoFactors).where(eq(twoFactors.userId, p.userId));
    await tx.delete(sessions).where(eq(sessions.userId, p.userId));
  });
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, p.userId)).limit(1);
  await logActivity(p.siteId, p.actorId, { action: "reset two-factor for {s}", subject: u?.name || u?.email || "someone", href: "/team" });
}

/** Which of these people use the app (for the Team list). */
export async function usingTwoFactor(userIds: string[]): Promise<Set<string>> {
  if (!userIds.length) return new Set();
  const rows = await db
    .select({ userId: twoFactors.userId })
    .from(twoFactors)
    .where(and(inArray(twoFactors.userId, userIds), isNotNull(twoFactors.confirmedAt)));
  return new Set(rows.map((r) => r.userId));
}
