import { resolve4, resolveCname } from "node:dns/promises";
import { eq } from "drizzle-orm";
import { withSite } from "@/db/client";
import { sites, type Site } from "@/db/schema";
import { platformBases } from "@/lib/env";
import { cleanDomain, hostsFor, isApex, recordsFor, DEFAULT_A, DEFAULT_CNAME, type DnsRecord } from "@/lib/domains";
import { FieldError } from "@/lib/form-error";
import { addProjectDomain, domainConfig, getProjectDomain, ourProjectDomain, removeProjectDomain, setRedirect, vercelConfig, VercelError, type VercelConfig } from "@/lib/vercel";
import { AccessError, assertAccess } from "@/modules/auth/access";
import { logActivity, recordActivity } from "@/modules/activity/server";

/**
 * Settings · Domain (design/admin.html): the client's own domain. Owners
 * connect one; the platform puts it (and its www) on the Vercel project
 * when OI_VERCEL_* is set, and either way checks the two DNS records it
 * needs. The slug address keeps working alongside. One domain, one site.
 */

/** What DNS says for a domain: its A records, and the CNAME of each name asked. Swappable for tests. */
export type Lookup = (domain: string, names: string[]) => Promise<{ a: string[]; cname: Record<string, string | null> }>;

const within = <T>(p: Promise<T>, ms: number, fallback: T) => Promise.race([p.catch(() => fallback), new Promise<T>((r) => setTimeout(() => r(fallback), ms))]);

export const dnsLookup: Lookup = async (domain, names) => {
  const [a, ...cnames] = await Promise.all([isApex(domain) ? within(resolve4(domain), 4000, [] as string[]) : Promise.resolve([] as string[]), ...names.map((n) => within(resolveCname(n), 4000, [] as string[]))]);
  return { a, cname: Object.fromEntries(names.map((n, i) => [n, cnames[i][0] ?? null])) };
};

export type DomainView = {
  domain: string | null;
  www: boolean;
  primary: string | null;
  other: string | null;
  apex: boolean;
  records: DnsRecord[];
  /** A TXT record Vercel wants first, when the domain is already on another Vercel account. */
  ownership: { type: string; name: string; value: string }[];
  /** Both records right and Vercel serving it. */
  connected: boolean;
  /** Vercel does the adding itself (false: someone at output/input adds it by hand). */
  automatic: boolean;
  checkedAt: string | null;
  launchedAt: string | null;
};

function view(site: Site, records: DnsRecord[] = [], ownership: DomainView["ownership"] = [], connected = false, checked = false): DomainView {
  const hosts = site.domain ? hostsFor(site.domain, site.domainWww) : null;
  return {
    domain: site.domain,
    www: site.domainWww,
    primary: hosts?.primary ?? null,
    other: hosts?.other ?? null,
    apex: site.domain ? isApex(site.domain) : true,
    records,
    ownership,
    connected,
    automatic: !!safeConfig(),
    checkedAt: checked ? new Date().toISOString() : null,
    launchedAt: site.launchedAt?.toISOString() ?? null,
  };
}

function safeConfig(): VercelConfig | null {
  try {
    return vercelConfig();
  } catch {
    return null;
  }
}

async function load(siteId: string): Promise<Site> {
  const [site] = await withSite(siteId, (tx) => tx.select().from(sites).limit(1));
  if (!site) throw new AccessError("That site doesn't exist.");
  return site;
}

/**
 * The domain as it stands, checked now: what DNS says for each record,
 * and (with Vercel set up) whether Vercel is serving it. Seen working once,
 * it becomes the address links and Google are given.
 */
export async function domainStatus(p: { actorId: string; siteId: string; lookup?: Lookup }): Promise<DomainView> {
  await assertAccess(p.actorId, p.siteId);
  const site = await load(p.siteId);
  if (!site.domain) return view(site);
  const { primary } = hostsFor(site.domain, site.domainWww);
  const cfg = safeConfig();
  let want = { a: [DEFAULT_A], cname: [DEFAULT_CNAME] };
  let vercelOk = true;
  const ownership: DomainView["ownership"] = [];
  if (cfg) {
    try {
      const [conf, pd] = await Promise.all([domainConfig(cfg, primary), getProjectDomain(cfg, primary)]);
      want = { a: conf.a, cname: conf.cname };
      vercelOk = !conf.misconfigured && pd.verified !== false;
      for (const v of pd.verified === false ? (pd.verification ?? []) : []) ownership.push({ type: v.type, name: v.domain, value: v.value });
    } catch (err) {
      console.error("vercel domain check failed", err);
      vercelOk = false;
    }
  }
  const names = isApex(site.domain) ? [`www.${site.domain}`] : [site.domain];
  const records = recordsFor(site.domain, await (p.lookup ?? dnsLookup)(site.domain, names), want);
  const connected = vercelOk && records.every((r) => r.status === "found");
  if (connected && !site.domainOkAt) await withSite(p.siteId, (tx) => tx.update(sites).set({ domainOkAt: new Date() }).where(eq(sites.id, p.siteId)));
  return view(site, records, ownership, connected, true);
}

/** Owners connect a domain. On Vercel straight away (both addresses, the other redirecting to the main one) when it's set up. */
export async function connectDomain(p: { actorId: string; siteId: string; domain: string; lookup?: Lookup }): Promise<DomainView> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const clean = cleanDomain(p.domain, platformBases());
  if (!clean.ok) throw new FieldError("domain", clean.message);
  const site = await load(p.siteId);
  if (site.domain) throw new FieldError("domain", `${site.domain} is connected already. Disconnect it first to use another.`);
  const www = clean.www && isApex(clean.domain);
  try {
    await withSite(p.siteId, (tx) => tx.update(sites).set({ domain: clean.domain, domainWww: www, domainOkAt: null }).where(eq(sites.id, p.siteId)));
  } catch (err) {
    const code = (err as { code?: string; cause?: { code?: string } }).cause?.code ?? (err as { code?: string }).code;
    if (code === "23505") throw new FieldError("domain", "That domain is connected to another site on output/input. If it's yours, get in touch and we'll sort it out.");
    throw err;
  }
  const cfg = safeConfig();
  if (cfg) {
    const { primary, other } = hostsFor(clean.domain, www);
    const created: string[] = [];
    try {
      if ((await addProjectDomain(cfg, primary)).created) created.push(primary);
      if (other && (await addProjectDomain(cfg, other, primary)).created) created.push(other);
    } catch (err) {
      // Couldn't put it on Vercel: take it back off the site, undo only what this added, and say why in words.
      await withSite(p.siteId, (tx) => tx.update(sites).set({ domain: null, domainWww: false }).where(eq(sites.id, p.siteId)));
      for (const host of created) await removeProjectDomain(cfg, host).catch(() => {});
      if (err instanceof VercelError && err.code === "domain_in_other_environment") throw new FieldError("domain", "That domain is already set up elsewhere on output/input, so it can't be connected here. Get in touch and we'll sort it out.");
      if (err instanceof VercelError && err.status === 409) throw new FieldError("domain", "That domain is in use on another Vercel account. Take it off there first, or get in touch and we'll help.");
      if (err instanceof VercelError && err.status === 400) throw new FieldError("domain", "Vercel won't take that domain. Check it's spelt right.");
      console.error("vercel add domain failed", err);
      throw new Error("Couldn't connect it just now. Try again in a minute.");
    }
  }
  await logActivity(p.siteId, p.actorId, { action: "connected {s}", subject: hostsFor(clean.domain, www).primary, href: "/settings/domain" });
  return domainStatus({ actorId: p.actorId, siteId: p.siteId, lookup: p.lookup });
}

/** With or without www: which is the main address. The other one redirects to it, so both always work. */
export async function setDomainWww(p: { actorId: string; siteId: string; www: boolean; lookup?: Lookup }): Promise<DomainView> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const site = await load(p.siteId);
  if (!site.domain) throw new Error("Connect a domain first.");
  if (!isApex(site.domain)) throw new Error("A subdomain has just the one address.");
  if (site.domainWww === p.www) return domainStatus(p);
  const cfg = safeConfig();
  const { primary, other } = hostsFor(site.domain, p.www);
  if (cfg && other) {
    // Never re-point the other side's (live vs staging) addresses from here.
    const [a, b] = await Promise.all([ourProjectDomain(cfg, primary), ourProjectDomain(cfg, other)]);
    if (!a || !b) throw new Error("That domain is set up elsewhere on output/input, so its addresses can't be changed from here. Get in touch and we'll sort it out.");
    // The new main address stops redirecting first, so there's never a moment where both redirect.
    await setRedirect(cfg, primary, null);
    await setRedirect(cfg, other, primary);
  }
  await withSite(p.siteId, async (tx) => {
    await tx.update(sites).set({ domainWww: p.www }).where(eq(sites.id, p.siteId));
    await recordActivity(tx, p.siteId, p.actorId, { action: "made {s} the main address", subject: primary, href: "/settings/domain" });
  });
  return domainStatus(p);
}

/** Owners disconnect it: off Vercel, off the site. The slug address carries on as before. */
export async function disconnectDomain(p: { actorId: string; siteId: string }): Promise<void> {
  await assertAccess(p.actorId, p.siteId, "owner");
  const site = await load(p.siteId);
  if (!site.domain) return;
  const cfg = safeConfig();
  if (cfg) {
    const { primary, other } = hostsFor(site.domain, site.domainWww);
    if (other) await removeProjectDomain(cfg, other);
    await removeProjectDomain(cfg, primary);
  }
  await withSite(p.siteId, async (tx) => {
    await tx.update(sites).set({ domain: null, domainWww: false, domainOkAt: null }).where(eq(sites.id, p.siteId));
    await recordActivity(tx, p.siteId, p.actorId, { action: "disconnected {s}", subject: hostsFor(site.domain!, site.domainWww).primary, href: "/settings/domain" });
  });
}
