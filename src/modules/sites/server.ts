import { eq } from "drizzle-orm";
import { z } from "zod";
import { withSite } from "@/db/client";
import { sites, type Site } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";

/**
 * A site's own settings. Everything here runs inside withSite(), so the
 * row-level lock applies on top of the membership check.
 */

const nameSchema = z.string().trim().min(1, "Give the site a name.").max(80);

export async function siteSettings(p: { actorId: string; siteId: string }): Promise<Site> {
  await assertAccess(p.actorId, p.siteId);
  const [site] = await withSite(p.siteId, (tx) => tx.select().from(sites).limit(1));
  if (!site) throw new AccessError("That site doesn't exist.");
  return site;
}

export async function renameSite(p: { actorId: string; siteId: string; name: string }): Promise<Site> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const name = nameSchema.parse(p.name);
  const [site] = await withSite(p.siteId, (tx) =>
    tx.update(sites).set({ name }).where(eq(sites.id, p.siteId)).returning(),
  );
  if (!site) throw new AccessError("That site doesn't exist.");
  return site;
}
