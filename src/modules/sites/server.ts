import { and, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { db, withSite, type Tx } from "@/db/client";
import { forms, sites, type Site } from "@/db/schema";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { parseTheme, readTheme, themeSchema, type Theme } from "./theme";
import { readSearchSettings, searchSettingsSchema, socialSchema, type SearchSettings } from "./search";
import { detailRowsSchema, readShopSettings, shopSettingsSchema, type ShopSettings } from "./shop";
import { readShipping, shippingSchema, type Shipping } from "./shipping";
import { businessSchema, sendingSchema, type Business, type Sending } from "./business";
import { DEFAULT_TEMPLATES, TEMPLATE_KEYS, notifySchema, readMessages, recipientsSchema, templatesSchema, type Messages } from "./messages";
import { named } from "@/lib/form-error";
import { recordActivity } from "@/modules/activity/server";
import { analyticsSchema, cookieNoticeSchema, type Analytics, type CookieNotice } from "./tracking";

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
  const name = named("name", nameSchema, p.name);
  const [site] = await withSite(p.siteId, async (tx) => {
    const rows = await tx.update(sites).set({ name }).where(eq(sites.id, p.siteId)).returning();
    if (rows[0]) await recordActivity(tx, p.siteId, p.actorId, { action: "renamed the site to {s}", subject: name, href: "/settings/site", key: "settings:/settings/site" });
    return rows;
  });
  if (!site) throw new AccessError("That site doesn't exist.");
  return site;
}

/** One settings screen saved: a line in Activity, folded while the same person keeps tweaking it. */
async function settingsChanged(tx: Tx, p: { siteId: string; actorId: string }, screen: string, href: string): Promise<void> {
  await recordActivity(tx, p.siteId, p.actorId, { action: "changed {s}", subject: `Settings · ${screen}`, href, key: `settings:${href}` });
}

/** The site's look, with defaults filled in. */
export function siteTheme(site: Pick<Site, "theme">): Theme {
  return readTheme(site.theme);
}

/** Owners change how the storefront looks. Validated against themeSchema; unknown keys are dropped. */
export async function updateTheme(p: { actorId: string; siteId: string; theme: unknown; screen?: [string, string] }): Promise<Theme> {
  await assertAccess(p.actorId, p.siteId, "owner");
  // Only what's sent changes: Branding and Footer each save their own part. (Each part is checked
  // on its own; a schema-wide partial would fill the parts not sent with their defaults.)
  const input = (p.theme && typeof p.theme === "object" ? p.theme : {}) as Record<string, unknown>;
  const shape = themeSchema.shape as Record<string, z.ZodTypeAny>;
  const patch = Object.fromEntries(Object.keys(input).filter((k) => k in shape).map((k) => [k, named(k, shape[k], input[k])]));
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ theme: sites.theme }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const theme = parseTheme({ ...readTheme(cur.theme), ...patch });
    if (theme.footer.newsletterFormId) {
      const [f] = await tx.select({ id: forms.id }).from(forms).where(and(eq(forms.id, theme.footer.newsletterFormId), isNull(forms.deletedAt))).limit(1);
      if (!f) throw new AccessError("That form isn't on this site.");
    }
    await tx.update(sites).set({ theme }).where(eq(sites.id, p.siteId));
    const [screen, href] = p.screen ?? ["Branding", "/settings/branding"];
    await settingsChanged(tx, p, screen, href);
    return theme;
  });
}

/**
 * Settings · Footer: the form at the foot of every page and the social
 * links (kept with the business for Google, which lists them too).
 */
export async function updateFooter(p: { actorId: string; siteId: string; footer: unknown; social: unknown }): Promise<{ theme: Theme; search: SearchSettings }> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const social = named("social", socialSchema, p.social ?? {});
  const theme = await updateTheme({ actorId: p.actorId, siteId: p.siteId, theme: { footer: p.footer }, screen: ["Footer", "/settings/footer"] });
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ search: sites.search }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    const search = readSearchSettings(cur?.search);
    const next = { ...search, business: { ...search.business, ...social } };
    await tx.update(sites).set({ search: next }).where(eq(sites.id, p.siteId));
    return { theme, search: next };
  });
}

/**
 * Which site a storefront hostname belongs to: a client's own domain
 * (kinikouture.com.au, or its www) first, then the slug address — the first
 * label of the host (kini.outputinput.co → kini), which keeps working once a
 * domain is connected. Uses resolve_host() and resolve_site(), owner-defined
 * functions, because no site is current yet and `sites` is locked by id.
 */
export async function siteFromHost(host: string): Promise<Site | null> {
  const name = host.toLowerCase().split(":")[0].trim();
  const slug = name.split(".")[0];
  if (!slug) return null;
  const r = name.includes(".") ? await db.execute(sql`select coalesce(resolve_host(${name}), resolve_site(${slug})) as id`) : await db.execute(sql`select resolve_site(${slug}) as id`);
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
  const [site] = await withSite(p.siteId, async (tx) => {
    const rows = await tx.update(sites).set({ search: settings }).where(eq(sites.id, p.siteId)).returning();
    if (rows[0]) await settingsChanged(tx, p, "Search engines", "/settings/search");
    return rows;
  });
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
  const patch = shopSettingsSchema.omit({ enquiryFormId: true, statusNames: true, detailRows: true }).parse(p.settings);
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ shop: sites.shop }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const settings = { ...readShopSettings(cur.shop), ...patch };
    await tx.update(sites).set({ shop: settings }).where(eq(sites.id, p.siteId));
    await settingsChanged(tx, p, "Tax and currency", "/settings/shop");
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
    await settingsChanged(tx, p, "Enquiries", "/settings/enquiries");
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
  const [site] = await withSite(p.siteId, async (tx) => {
    const rows = await tx.update(sites).set({ shipping: settings }).where(eq(sites.id, p.siteId)).returning();
    if (rows[0]) await settingsChanged(tx, p, "Shipping", "/settings/shipping");
    return rows;
  });
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
    await settingsChanged(tx, p, "Order statuses", "/settings/statuses");
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
    await settingsChanged(tx, p, "Business profile", "/settings/business");
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
    await settingsChanged(tx, p, "Sending", "/settings/sending");
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
  const templates = p.templates === undefined ? undefined : named("templates", templatesSchema, p.templates);
  if (templates) {
    for (const k of TEMPLATE_KEYS) {
      if (templates[k].subject === DEFAULT_TEMPLATES[k].subject) templates[k].subject = "";
      if (templates[k].body === DEFAULT_TEMPLATES[k].body) templates[k].body = "";
    }
  }
  const notify = p.notify === undefined ? undefined : named("notify", notifySchema, p.notify);
  const formRows = (p.forms ?? []).map((f, i) => ({ id: z.string().uuid().parse(f.id), ...named(`forms.${i}`, recipientsSchema, f) }));
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
    if (templates || p.keepCopy !== undefined) await settingsChanged(tx, p, "Customer emails", "/settings/emails");
    else await settingsChanged(tx, p, "Who gets notified", "/settings/notify");
    return readMessages(next);
  });
}

/** Owners write the product details rows (Settings · Product details); products keep their own changes by row id. */
export async function updateDetailRows(p: { actorId: string; siteId: string; rows: unknown }): Promise<ShopSettings> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const rows = named("rows", detailRowsSchema, p.rows);
  if (new Set(rows.map((r) => r.id)).size !== rows.length) throw new Error("Two rows share an id. Reload and try again.");
  if (rows.filter((r) => r.kind === "delivery").length > 1) throw new Error("One delivery row is enough.");
  return withSite(p.siteId, async (tx) => {
    const [cur] = await tx.select({ shop: sites.shop }).from(sites).where(eq(sites.id, p.siteId)).limit(1);
    if (!cur) throw new AccessError("That site doesn't exist.");
    const settings = { ...readShopSettings(cur.shop), detailRows: rows };
    await tx.update(sites).set({ shop: settings }).where(eq(sites.id, p.siteId));
    await settingsChanged(tx, p, "Product details", "/settings/product-details");
    return settings;
  });
}

/** Owners set the analytics IDs (Settings · Analytics). IDs only: the storefront writes the snippets. */
export async function updateAnalytics(p: { actorId: string; siteId: string; analytics: unknown }): Promise<Analytics> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const analytics = analyticsSchema.parse(p.analytics ?? {});
  await withSite(p.siteId, async (tx) => {
    await tx.update(sites).set({ analytics }).where(eq(sites.id, p.siteId));
    await settingsChanged(tx, p, "Analytics", "/settings/analytics");
  });
  return analytics;
}

/** Owners switch the cookie notice on or off, and say what it says (Settings · Cookie notice). */
export async function updateCookieNotice(p: { actorId: string; siteId: string; notice: unknown }): Promise<CookieNotice> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const notice = cookieNoticeSchema.parse(p.notice ?? {});
  await withSite(p.siteId, async (tx) => {
    await tx.update(sites).set({ cookies: notice }).where(eq(sites.id, p.siteId));
    await settingsChanged(tx, p, "Cookie notice", "/settings/cookies");
  });
  return notice;
}
