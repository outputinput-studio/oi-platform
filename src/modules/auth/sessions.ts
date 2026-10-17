import { and, count, desc, eq, gt, ne } from "drizzle-orm";
import { db } from "@/db/client";
import { sessions } from "@/db/schema";
import { describeDevice } from "./devices";

/**
 * Your account · Where you're signed in (design/admin.html): each phone or
 * computer with a live session, and a way to sign it out. Sessions are a
 * platform table; every function here works on one person's own rows (the
 * signed-in user, never an id from a form).
 */

export type SignedIn = { id: string; device: string; current: boolean; lastUsed: Date; since: Date };

/**
 * This device first, then the rest by when they were last used, up to
 * `limit` in all. Expired ones are left out.
 */
export async function listSessions(userId: string, currentId: string, limit = 8): Promise<SignedIn[]> {
  const live = and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date()));
  const cols = { id: sessions.id, ua: sessions.userAgent, updatedAt: sessions.updatedAt, createdAt: sessions.createdAt };
  const [here, rest] = await Promise.all([
    db.select(cols).from(sessions).where(and(live, eq(sessions.id, currentId))).limit(1),
    db.select(cols).from(sessions).where(and(live, ne(sessions.id, currentId))).orderBy(desc(sessions.updatedAt)).limit(Math.max(0, limit - 1)),
  ]);
  return [...here, ...rest].map((r) => ({ id: r.id, device: describeDevice(r.ua), current: r.id === currentId, lastUsed: r.updatedAt, since: r.createdAt }));
}

/** How many places someone is signed in, all told. */
export async function countSessions(userId: string): Promise<number> {
  const [r] = await db
    .select({ n: count() })
    .from(sessions)
    .where(and(eq(sessions.userId, userId), gt(sessions.expiresAt, new Date())));
  return Number(r?.n ?? 0);
}

/** Sign out one of your own sessions. Someone else's id does nothing. */
export async function signOutSession(userId: string, sessionId: string): Promise<void> {
  await db.delete(sessions).where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
}

/** "Sign out everywhere else": every session but this one. Returns how many went. */
export async function signOutOthers(userId: string, currentId: string): Promise<number> {
  const gone = await db
    .delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.id, currentId)))
    .returning({ id: sessions.id });
  return gone.length;
}
