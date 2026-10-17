import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { withSite, type Tx } from "@/db/client";
import { activity, users } from "@/db/schema";
import { isSupportEmail } from "@/modules/auth/support";
import { assertAccess } from "@/modules/auth/access";
import { activityParts, firstName } from "./words";

/**
 * Activity (design/admin.html, More → Activity): everything the team
 * changed, and who changed it. Module functions call recordActivity inside
 * the same transaction as the change, so a change and its line in Activity
 * land together or not at all. Anyone on the team can read it.
 */

export type ActivityEntry = {
  /** After the person's name: "moved order 1041 to {s}", "added {n} photos". */
  action: string;
  subject?: string;
  /** An admin path (public form, e.g. "/orders/…"), when there's somewhere to go. */
  href?: string;
  /** Same person, same key, within half an hour: folds into the last row instead of adding one. */
  key?: string;
  count?: number;
};

export const FOLD_MINUTES = 30;

export async function recordActivity(
  tx: Tx,
  siteId: string,
  actorId: string | null,
  e: ActivityEntry,
): Promise<void> {
  const subject = (e.subject ?? "").slice(0, 200);
  const href = e.href ?? "";
  const n = e.count ?? 1;
  if (e.key) {
    const [recent] = await tx
      .select({ id: activity.id })
      .from(activity)
      .where(
        and(
          eq(activity.key, e.key),
          actorId ? eq(activity.actorId, actorId) : isNull(activity.actorId),
          gt(activity.updatedAt, new Date(Date.now() - FOLD_MINUTES * 60_000)),
        ),
      )
      .orderBy(desc(activity.updatedAt))
      .limit(1);
    if (recent) {
      await tx
        .update(activity)
        .set({
          action: e.action,
          subject,
          href,
          count: sql`${activity.count} + ${n}`,
          updatedAt: new Date(),
        })
        .where(eq(activity.id, recent.id));
      return;
    }
  }
  await tx
    .insert(activity)
    .values({ siteId, actorId, action: e.action, subject, href, key: e.key ?? "", count: n });
}

/** For a change that didn't run in a transaction of its own (an outside call made first, say). */
export async function logActivity(
  siteId: string,
  actorId: string | null,
  e: ActivityEntry,
): Promise<void> {
  await withSite(siteId, (tx) => recordActivity(tx, siteId, actorId, e));
}

export type ActivityLine = {
  id: string;
  who: string;
  before: string;
  subject: string;
  after: string;
  href: string;
  at: Date;
};

/** Newest first, a page at a time (`before` is the last line's time). */
export async function listActivity(p: {
  actorId: string;
  siteId: string;
  before?: Date;
  limit?: number;
}): Promise<ActivityLine[]> {
  await assertAccess(p.actorId, p.siteId);
  const limit = Math.min(Math.max(p.limit ?? 100, 1), 200);
  const rows = await withSite(p.siteId, (tx) =>
    tx
      .select({ a: activity, name: users.name, email: users.email })
      .from(activity)
      .leftJoin(users, eq(users.id, activity.actorId))
      .where(p.before ? lt(activity.updatedAt, p.before) : undefined)
      .orderBy(desc(activity.updatedAt))
      .limit(limit),
  );
  return rows.map(({ a, name, email }) => ({
    id: a.id,
    // O/I support shows as output/input, like the platform itself.
    who: firstName(a.actorId === null || isSupportEmail(email) ? null : name === null ? undefined : { name, email: email ?? "" }),
    ...activityParts(a.action, a.subject, a.count),
    href: a.href,
    at: a.updatedAt,
  }));
}
