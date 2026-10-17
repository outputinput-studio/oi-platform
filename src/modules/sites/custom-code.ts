import { eq } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { sites, users } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { recordActivity } from "@/modules/activity/server";
import { customCodeSchema, readCustomCode, withRevert, withSave, type CustomCode } from "./custom-code-rules";

/**
 * Settings · Custom code: owners only (Carl, Oct 2026). Code here runs on
 * every page of the storefront, for every visitor, so only an owner can add
 * or change it; each save keeps the one before so it can be put back.
 */

async function who(actorId: string): Promise<string> {
  const [u] = await db.select({ name: users.name, email: users.email }).from(users).where(eq(users.id, actorId)).limit(1);
  return u ? u.name.trim().split(/\s+/)[0] || u.email : "Someone";
}

async function change(p: { actorId: string; siteId: string }, next: (c: CustomCode, meta: { at: string; by: string }) => CustomCode, line: { action: string; subject?: string }): Promise<CustomCode> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const meta = { at: new Date().toISOString(), by: await who(p.actorId) };
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ customCode: sites.customCode }).from(sites).where(eq(sites.id, p.siteId)).limit(1).for("update");
    if (!cur) throw new AccessError("That site doesn't exist.");
    const was = readCustomCode(cur.customCode);
    const now = next(was, meta);
    if (now !== was) {
      await tx.update(sites).set({ customCode: now }).where(eq(sites.id, p.siteId));
      await recordActivity(tx, p.siteId, p.actorId, { ...line, href: "/settings/custom-code" });
    }
    return now;
  });
}

export async function saveCustomCode(p: { actorId: string; siteId: string; code: unknown }): Promise<CustomCode> {
  const code = customCodeSchema.parse(p.code ?? {});
  return change(p, (c, meta) => withSave(c, code, meta), { action: "changed {s}", subject: "Settings · Custom code" });
}

/** Put back the version saved at `versionAt`. */
export async function revertCustomCode(p: { actorId: string; siteId: string; versionAt: string }): Promise<CustomCode> {
  return change(p, (c, meta) => withRevert(c, p.versionAt, meta), { action: "put back an earlier version of {s}", subject: "Settings · Custom code" });
}
