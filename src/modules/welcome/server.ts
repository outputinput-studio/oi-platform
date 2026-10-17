import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { memberships } from "@/db/schema";
import { assertAccess } from "@/modules/auth/access";
import { twoFactorStatus } from "@/modules/auth/two-factor";

/**
 * First run (Stage 41, design/admin.html): a welcome card on Home until it's
 * dismissed or "Show me around" is finished, then — for anyone not using an
 * authenticator app yet — "Make your sign-in harder to copy", until they set
 * it up or say "Not yet". Remembered per person per site (Carl: everyone
 * sees it once per site). O/I support has no membership, so never sees it.
 */
export type WelcomeState = { welcome: boolean; secure: boolean };

export async function welcomeState(p: { actorId: string; siteId: string }): Promise<WelcomeState> {
  await assertAccess(p.actorId, p.siteId, "staff");
  const [m] = await db
    .select({ welcomedAt: memberships.welcomedAt, nudgedAt: memberships.secureNudgedAt })
    .from(memberships)
    .where(and(eq(memberships.userId, p.actorId), eq(memberships.siteId, p.siteId)))
    .limit(1);
  if (!m) return { welcome: false, secure: false };
  if (!m.welcomedAt) return { welcome: true, secure: false };
  if (m.nudgedAt) return { welcome: false, secure: false };
  return { welcome: false, secure: !(await twoFactorStatus(p.actorId)).on };
}

/** "Dismiss", or "Got it" at the end of Show me around. */
export async function finishWelcome(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "staff");
  await db
    .update(memberships)
    .set({ welcomedAt: new Date() })
    .where(and(eq(memberships.userId, p.actorId), eq(memberships.siteId, p.siteId)));
}

/** "Not yet" on adding the authenticator app. It's still on Your account whenever they want it. */
export async function skipSecureNudge(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "staff");
  await db
    .update(memberships)
    .set({ secureNudgedAt: new Date() })
    .where(and(eq(memberships.userId, p.actorId), eq(memberships.siteId, p.siteId)));
}
