import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { forms, sites, type Site } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { parseTheme, readTheme, type Theme } from "./theme";
import { readSearchSettings, searchSettingsSchema, type SearchSettings } from "./search";
import { readShopSettings, shopSettingsSchema, type ShopSettings } from "./shop";
import { readShipping, shippingSchema, type Shipping } from "./shipping";

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

/** The site's look, with defaults filled in. */
export function siteTheme(site: Pick<Site, "theme">): Theme {
  return readTheme(site.theme);
}

/** Owners change how the storefront looks. Validated against themeSchema; unknown keys are dropped. */
export async function updateTheme(p: { actorId: string; siteId: string; theme: unknown }): Promise<Theme> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const theme = parseTheme(p.theme);
  const [site] = await withSite(p.siteId, (tx) => tx.update(sites).set({ theme }).where(eq(sites.id, p.siteId)).returning());
  if (!site) throw new AccessError("That site doesn't exist.");
  return theme;
}

/**
 * Which site a storefront hostname belongs to. The first label of the
 * host is the site's slug (kini.outputinput.co → kini) until custom
 * domains arrive. Uses resolve_site(), an owner-defined function, because
 * no site is current yet and `sites` is locked by id.
 */
export async function siteFromHost(host: string): Promise<Site | null> {
  const slug = host.toLowerCase().split(":")[0].split(".")[0];
  if (!slug) return null;
  const r = await db.execute(sql`select resolve_site(${slug}) as id`);
  const id = (r.rows[0] as { id: string | null } | undefined)?.id;
  if (!id) return null;
  const [site] = await withSite(id, (tx) => tx.select().from(sites).limit(1));
  return site ?? null;
}

/** The site's search-engine settings, with defaults filled in. */
export function siteSearch(site: Pick<Site, "search">): SearchSettings {
  return readSearchSettings(site.search);
}

/** Owners change how the site is found. */
export async function updateSearchSettings(p: { actorId: string; siteId: string; settings: unknown }): Promise<SearchSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const settings = searchSettingsSchema.parse(p.settings);
  const [site] = await withSite(p.siteId, (tx) => tx.update(sites).set({ search: settings }).where(eq(sites.id, p.siteId)).returning());
  if (!site) throw new AccessError("That site doesn't exist.");
  return settings;
}

/** The site's currency and tax, with defaults filled in. */
export function siteShop(site: Pick<Site, "shop">): ShopSettings {
  return readShopSettings(site.shop);
}

/** Owners set the currency and tax: it changes what every price means. The enquiry form is kept as it was. */
export async function updateShopSettings(p: { actorId: string; siteId: string; settings: unknown }): Promise<ShopSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const patch = shopSettingsSchema.omit({ enquiryFormId: true }).parse(p.settings);
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ shop: sites.shop }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const settings = { ...readShopSettings(cur.shop), ...patch };
    await tx.update(sites).set({ shop: settings }).where(eq(sites.id, p.siteId));
    return settings;
  });
}

/** Owners pick which form takes enquiries (or none). It must be one of this site's forms. */
export async function setEnquiryForm(p: { actorId: string; siteId: string; formId: string | null }): Promise<ShopSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const formId = z.string().uuid().nullable().parse(p.formId);
  return withSite(p.siteId, async (tx) => {
    if (formId) {
      const [f] = await tx.select({ id: forms.id }).from(forms).where(eq(forms.id, formId)).limit(1);
      if (!f) throw new AccessError("That form isn't on this site.");
    }
    const [cur] = await tx.select({ shop: sites.shop }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const settings = { ...readShopSettings(cur.shop), enquiryFormId: formId };
    await tx.update(sites).set({ shop: settings }).where(eq(sites.id, p.siteId));
    return settings;
  });
}

/** Dispatch time, zones and rates, with defaults filled in. */
export function siteShipping(site: Pick<Site, "shipping">): Shipping {
  return readShipping(site.shipping);
}

/** Owners set what delivery costs. */
export async function updateShipping(p: { actorId: string; siteId: string; settings: unknown }): Promise<Shipping> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const settings = shippingSchema.parse(p.settings);
  const [site] = await withSite(p.siteId, (tx) => tx.update(sites).set({ shipping: settings }).where(eq(sites.id, p.siteId)).returning());
  if (!site) throw new AccessError("That site doesn't exist.");
  return settings;
}
