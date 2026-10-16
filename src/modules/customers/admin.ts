import { eq, sql } from "drizzle-orm";
import { withSite } from "@/db/client";
import { customers, sites } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { named } from "@/lib/form-error";
import { accountSettingsSchema, readAccountSettings, type AccountSettings } from "./settings";

/** Settings · Customer accounts, the team side. Owners turn accounts and passwords on and off. */

export async function updateAccountSettings(p: { actorId: string; siteId: string; settings: unknown }): Promise<AccountSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const settings = named("settings", accountSettingsSchema, p.settings);
  // Passwords only mean anything with accounts on.
  const next = { ...settings, passwords: settings.enabled && settings.passwords };
  const [site] = await withSite(p.siteId, (tx) => tx.update(sites).set({ accounts: next }).where(eq(sites.id, p.siteId)).returning({ accounts: sites.accounts }));
  if (!site) throw new AccessError("That site doesn't exist.");
  return readAccountSettings(site.accounts);
}

/** How many customers have an account here. */
export async function customerCount(p: { actorId: string; siteId: string }): Promise<number> {
  await assertAccess(p.actorId, p.siteId);
  const [r] = await withSite(p.siteId, (tx) => tx.select({ n: sql<number>`count(*)::int` }).from(customers));
  return r?.n ?? 0;
}
