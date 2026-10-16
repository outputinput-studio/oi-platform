import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withSite } from "@/db/client";
import { forms, sites, type Site } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { parseTheme, readTheme, themeSchema, type Theme } from "./theme";
import { readSearchSettings, searchSettingsSchema, socialSchema, type SearchSettings } from "./search";
import { readShopSettings, shopSettingsSchema, type ShopSettings } from "./shop";
import { readShipping, shippingSchema, type Shipping } from "./shipping";
import { businessSchema, sendingSchema, type Business, type Sending } from "./business";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, notifySchema, readMessages, recipientsSchema, templatesSchema, type Messages } from "./messages";

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
  // Only what's sent changes: Branding and Footer each save their own part. (Each part is checked
  // on its own; a schema-wide partial would fill the parts not sent with their defaults.)
  const input = (p.theme && typeof p.theme === "object" ? p.theme : {}) as Record<string, unknown>;
  const shape = themeSchema.shape as Record<string, z.ZodTypeAny>;
  const patch = Object.fromEntries(Object.keys(input).filter((k) => k in shape).map((k) => [k, shape[k].parse(input[k])]));
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ theme: sites.theme }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const theme = parseTheme({ ...readTheme(cur.theme), ...patch });
    if (theme.footer.newsletterFormId) {
      const [f] = await tx.select({ id: forms.id }).from(forms).where(and(eq(forms.id, theme.footer.newsletterFormId), isNull(forms.deletedAt))).limit(1);
      if (!f) throw new AccessError("That form isn't on this site.");
    }
    await tx.update(sites).set({ theme }).where(eq(sites.id, p.siteId));
    return theme;
  });
}

/**
 * Settings · Footer: the form at the foot of every page and the social
 * links (kept with the business for Google, which lists them too).
 */
export async function updateFooter(p: { actorId: string; siteId: string; footer: unknown; social: unknown }): Promise<{ theme: Theme; search: SearchSettings }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const social = socialSchema.parse(p.social ?? {});
  const theme = await updateTheme({ actorId: p.actorId, siteId: p.siteId, theme: { footer: p.footer } });
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ search: sites.search }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    const search = readSearchSettings(cur?.search);
    const next = { ...search, business: { ...search.business, ...social } };
    await tx.update(sites).set({ search: next }).where(eq(sites.id, p.siteId));
    return { theme, search: next };
  });
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
  const patch = shopSettingsSchema.omit({ enquiryFormId: true, statusNames: true }).parse(p.settings);
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

/** Owners rename the four order stages. Empty puts a stage back to its default name. */
export async function updateStatusNames(p: { actorId: string; siteId: string; names: unknown }): Promise<ShopSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const names = shopSettingsSchema.shape.statusNames.parse(p.names);
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ shop: sites.shop }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const settings = { ...readShopSettings(cur.shop), statusNames: names };
    await tx.update(sites).set({ shop: settings }).where(eq(sites.id, p.siteId));
    return settings;
  });
}

/** Owners keep the business profile: it signs emails, makes receipts tax invoices, and tells Google who runs the site. */
export async function updateBusiness(p: { actorId: string; siteId: string; business: unknown }): Promise<Business> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const business = businessSchema.parse(p.business);
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ search: sites.search }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    // The profile now owns name, phone and email; Search engines' old copies stop standing in.
    const search = readSearchSettings(cur.search);
    await tx
      .update(sites)
      .set({ business, search: { ...search, business: { ...search.business, name: "", phone: "", email: "" } } })
      .where(eq(sites.id, p.siteId));
    return business;
  });
}

/** Owners set how the site's emails read: the name they're from and where replies go. */
export async function updateSending(p: { actorId: string; siteId: string; sending: unknown }): Promise<Sending> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const sending = sendingSchema.parse(p.sending);
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ messages: sites.messages }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    await tx
      .update(sites)
      .set({ messages: { ...(cur.messages ?? {}), sending } })
      .where(eq(sites.id, p.siteId));
    return sending;
  });
}

/**
 * Owners change the customer emails (wording, keeping a copy) and who's
 * told about what: orders, stock, failed payments, and each form. One
 * save, one transaction. A template equal to the default is stored empty,
 * so it keeps following the default.
 */
export async function updateMessages(p: {
  actorId: string;
  siteId: string;
  keepCopy?: boolean;
  templates?: unknown;
  notify?: unknown;
  forms?: { id: string; on: boolean; to: string; cc: string; bcc: string }[];
}): Promise<Messages> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const templates = p.templates === undefined ? undefined : templatesSchema.parse(p.templates);
  if (templates) {
    for (const k of TEMPLATE_KEYS) {
      if (templates[k].subject === DEFAULT_TEMPLATES[k].subject) templates[k].subject = "";
      if (templates[k].body === DEFAULT_TEMPLATES[k].body) templates[k].body = "";
    }
  }
  const notify = p.notify === undefined ? undefined : notifySchema.parse(p.notify);
  const formRows = (p.forms ?? []).map((f) => ({ id: z.string().uuid().parse(f.id), ...recipientsSchema.parse(f) }));
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ messages: sites.messages }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const next = {
      ...(cur.messages ?? {}),
      ...(p.keepCopy === undefined ? {} : { keepCopy: p.keepCopy }),
      ...(templates ? { templates } : {}),
      ...(notify ? { notify } : {}),
    };
    await tx.update(sites).set({ messages: next }).where(eq(sites.id, p.siteId));
    for (const f of formRows) {
      const [row] = await tx
        .update(forms)
        .set({ notifyOn: f.on, notifyEmails: f.to, notifyCc: f.cc, notifyBcc: f.bcc, updatedAt: new Date() })
        .where(and(eq(forms.id, f.id), isNull(forms.deletedAt)))
        .returning({ id: forms.id });
      if (!row) throw new AccessError("That form isn't on this site.");
    }
    return readMessages(next);
  });
}
