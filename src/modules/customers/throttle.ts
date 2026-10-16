import { eq } from "drizzle-orm";
import type { Tx } from "@/db/client";
import { throttles } from "@/db/schema";
import { lockMinutes } from "./secrets";

/**
 * Slowing down guessing, per thing being guessed at (a key like
 * "signIn:amelia@example.com"). Five misses lock it: 2 minutes the first
 * time, doubling each time after, up to an hour — and once an hour-long
 * lock has run out, it clears and starts again. Quiet for a day clears it
 * too. Runs inside withSite(), so one site's locks never touch another's.
 */

export const MAX_MISSES = 5;
const DAY = 24 * 60 * 60 * 1000;

type Row = typeof throttles.$inferSelect;

async function load(tx: Tx, key: string): Promise<Row | undefined> {
  const [r] = await tx.select().from(throttles).where(eq(throttles.key, key)).limit(1);
  return r;
}

/** Whether it's been long enough that the slate is clean. */
function stale(r: Row, now: Date): boolean {
  if (r.lockedUntil && r.lockedUntil > now) return false;
  const cleared = r.lockedUntil !== null && r.lockedUntil <= now && lockMinutes(r.strikes) >= 60;
  return cleared || now.getTime() - r.updatedAt.getTime() > DAY;
}

/** Seconds until this key may be tried again; 0 when it can be now. */
export async function lockedFor(tx: Tx, key: string, now = new Date()): Promise<number> {
  const r = await load(tx, key);
  if (!r?.lockedUntil || r.lockedUntil <= now) return 0;
  return Math.ceil((r.lockedUntil.getTime() - now.getTime()) / 1000);
}

/** A wrong guess. Returns the seconds it's now locked for (0 while there are tries left). */
export async function miss(tx: Tx, siteId: string, key: string, now = new Date()): Promise<number> {
  const cur = await load(tx, key);
  const fresh = !cur || stale(cur, now);
  const misses = (fresh ? 0 : cur.misses) + 1;
  const strikes = fresh ? 0 : cur.strikes;
  const lock = misses >= MAX_MISSES;
  const next = {
    misses: lock ? 0 : misses,
    strikes: lock ? strikes + 1 : strikes,
    lockedUntil: lock ? new Date(now.getTime() + lockMinutes(strikes + 1) * 60_000) : fresh ? null : cur.lockedUntil,
    updatedAt: now,
  };
  await tx
    .insert(throttles)
    .values({ siteId, key, ...next })
    .onConflictDoUpdate({ target: [throttles.siteId, throttles.key], set: next });
  return lock ? lockMinutes(strikes + 1) * 60 : 0;
}

/** It worked: forget the misses. */
export async function clearThrottle(tx: Tx, key: string): Promise<void> {
  await tx.delete(throttles).where(eq(throttles.key, key));
}
