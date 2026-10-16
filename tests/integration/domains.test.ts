/**
 * Settings · Domain and Going live, against the database, with Vercel's
 * and Resend's APIs stood in for: a domain connected (on Vercel, the other
 * address redirecting), found by the storefront, one site per domain; DNS
 * records checked; with or without www; disconnected. A site that hasn't
 * launched hides behind a pass only its own team can make. And a sending
 * domain: set up in Resend, emails from it once verified.
 */
import { beforeAll, afterAll, beforeEach, describe, expect, test, vi } from "vitest";
import { Pool } from "pg";

vi.stubEnv("OI_VERCEL_TOKEN", "test-vercel-token");
vi.stubEnv("OI_VERCEL_PROJECT_ID", "prj_test");
vi.stubEnv("OI_VERCEL_TEAM_ID", "team_test");
vi.stubEnv("RESEND_API_KEY", "re_test");
vi.stubEnv("EMAIL_FROM", "output/input <mail@outputinput.test>");

type Call = { method: string; url: string; body?: Record<string, unknown> };
const calls: Call[] = [];
let resendStatus = "not_started";
let vercelTaken = false;
vi.stubGlobal("fetch", async (input: URL | string, init: RequestInit = {}) => {
  const url = String(input);
  const method = init.method ?? "GET";
  const body = init.body ? JSON.parse(String(init.body)) : undefined;
  calls.push({ method, url, body });
  const json = (status: number, b: unknown) => new Response(JSON.stringify(b), { status, headers: { "content-type": "application/json" } });
  if (url.startsWith("https://api.vercel.com")) {
    if (method === "POST" && vercelTaken) return json(409, { error: { code: "domain_taken", message: "in use by another account" } });
    if (url.includes("/config")) return json(200, { misconfigured: false, recommendedIPv4: [{ rank: 1, value: ["76.76.21.21"] }], recommendedCNAME: [{ rank: 1, value: "cname.vercel-dns.com." }] });
    return json(200, { name: body?.name ?? "x", verified: true, redirect: null });
  }
  if (url.startsWith("https://api.resend.com/domains")) {
    if (method === "POST" && url.endsWith("/domains")) return json(200, { id: "rd_1", name: body.name, status: "not_started", records: [{ record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=MIGf", status: "not_started" }] });
    return json(200, { id: "rd_1", name: "kini-a.test", status: resendStatus, records: [{ record: "DKIM", name: "resend._domainkey", type: "TXT", value: "p=MIGf", status: resendStatus }] });
  }
  if (url.startsWith("https://api.resend.com/emails")) return json(200, { id: "em_1" });
  throw new Error(`unexpected fetch ${method} ${url}`);
});

const { AccessError } = await import("@/modules/auth/access");
const { siteFromHost } = await import("@/modules/sites/server");
const { connectDomain, disconnectDomain, domainStatus, setDomainWww } = await import("@/modules/sites/domain");
const { launchSite, passValid, previewPass, siteVisible, teamPreviewPass } = await import("@/modules/sites/launch");
const { checkSendingDomain, removeSendingDomain, sendingDomainStatus, setUpSendingDomain } = await import("@/modules/sites/sending-domain");
const { senderFor } = await import("@/modules/sites/business");

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const own = "test-domains-owner";
const staff = "test-domains-staff";
const allFound = async () => ({ a: ["76.76.21.21"], cname: { "www.kini-a.test": "cname.vercel-dns.com." } });
const nothing = async () => ({ a: [], cname: {} });

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('dom-a','dom-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('dom-a','Kini A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('dom-b','Other B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@dom.invalid',true,now()), ($2,'Staff','staff@dom.invalid',true,now())`, [own, staff]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($1,$4,'owner'), ($2,$3,'staff')`, [own, staff, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug in ('dom-a','dom-b')`);
  await owner.end();
});

beforeEach(() => {
  calls.length = 0;
});

describe("your own domain", () => {
  test("only an owner connects one; what's typed is cleaned up; nonsense points at the box", async () => {
    await expect(connectDomain({ actorId: staff, siteId: siteA, domain: "kini-a.test", lookup: nothing })).rejects.toBeInstanceOf(AccessError);
    await expect(connectDomain({ actorId: own, siteId: siteA, domain: "kini", lookup: nothing })).rejects.toMatchObject({ field: "domain" });
    const v = await connectDomain({ actorId: own, siteId: siteA, domain: "https://Kini-A.test/shop", lookup: nothing });
    expect(v).toMatchObject({ domain: "kini-a.test", primary: "kini-a.test", other: "www.kini-a.test", connected: false, automatic: true });
    expect(v.records.map((r) => [r.type, r.name, r.status])).toEqual([
      ["A", "kini-a.test", "waiting"],
      ["CNAME", "www.kini-a.test", "waiting"],
    ]);
  });

  test("it goes on the Vercel project: the domain, and www redirecting to it", async () => {
    await disconnectDomain({ actorId: own, siteId: siteA });
    calls.length = 0;
    await connectDomain({ actorId: own, siteId: siteA, domain: "kini-a.test", lookup: nothing });
    const adds = calls.filter((c) => c.method === "POST" && c.url.includes("/v10/projects/prj_test/domains"));
    expect(adds.map((c) => c.body)).toEqual([{ name: "kini-a.test" }, { name: "www.kini-a.test", redirect: "kini-a.test", redirectStatusCode: 308 }]);
    expect(adds[0].url).toContain("teamId=team_test");
  });

  test("the storefront finds the site by its domain, with or without www; the slug address still works", async () => {
    expect((await siteFromHost("kini-a.test"))?.id).toBe(siteA);
    expect((await siteFromHost("WWW.kini-a.test:443"))?.id).toBe(siteA);
    expect((await siteFromHost("dom-a.localhost"))?.id).toBe(siteA);
  });

  test("one domain, one site", async () => {
    await expect(connectDomain({ actorId: own, siteId: siteB, domain: "www.kini-a.test", lookup: nothing })).rejects.toThrow(/connected to another site/);
    await expect(connectDomain({ actorId: own, siteId: siteA, domain: "else.test", lookup: nothing })).rejects.toThrow(/connected already/);
  });

  test("on someone else's Vercel: refused, and nothing is left behind", async () => {
    vercelTaken = true;
    await expect(connectDomain({ actorId: own, siteId: siteB, domain: "theirs.test", lookup: nothing })).rejects.toThrow(/another Vercel account/);
    vercelTaken = false;
    expect(await siteFromHost("theirs.test")).toBeNull();
    expect((await domainStatus({ actorId: own, siteId: siteB })).domain).toBeNull();
  });

  test("records found and Vercel happy: connected, and from then on the address the public is given", async () => {
    const v = await domainStatus({ actorId: staff, siteId: siteA, lookup: allFound });
    expect(v).toMatchObject({ connected: true });
    expect(v.records.every((r) => r.status === "found")).toBe(true);
    const row = (await owner.query(`select domain_ok_at from sites where id = $1`, [siteA])).rows[0];
    expect(row.domain_ok_at).not.toBeNull();
  });

  test("with www: www becomes the main address, the bare one redirects to it", async () => {
    await expect(setDomainWww({ actorId: staff, siteId: siteA, www: true })).rejects.toBeInstanceOf(AccessError);
    const v = await setDomainWww({ actorId: own, siteId: siteA, www: true, lookup: allFound });
    expect(v).toMatchObject({ primary: "www.kini-a.test", other: "kini-a.test", www: true });
    const patches = calls.filter((c) => c.method === "PATCH").map((c) => [c.url.split("/domains/")[1].split("?")[0], c.body?.redirect]);
    expect(patches).toEqual([
      ["www.kini-a.test", null],
      ["kini-a.test", "www.kini-a.test"],
    ]);
  });

  test("disconnected: off Vercel, off the site; the slug address carries on", async () => {
    await disconnectDomain({ actorId: own, siteId: siteA });
    expect(calls.filter((c) => c.method === "DELETE").map((c) => c.url.split("/domains/")[1].split("?")[0]).sort()).toEqual(["kini-a.test", "www.kini-a.test"]);
    expect(await siteFromHost("kini-a.test")).toBeNull();
    expect((await siteFromHost("dom-a.localhost"))?.id).toBe(siteA);
  });
});

describe("going live", () => {
  test("a new site isn't live; a pass is for its own site, and runs out", async () => {
    const a = (await siteFromHost("dom-a.localhost"))!;
    expect(a.launchedAt).toBeNull();
    const pass = await teamPreviewPass({ actorId: staff, siteId: siteA });
    expect(siteVisible(a, undefined)).toBe(false);
    expect(siteVisible(a, pass)).toBe(true);
    expect(passValid(siteB, pass)).toBe(false);
    expect(passValid(siteA, pass.replace(/.$/, (c) => (c === "A" ? "B" : "A")))).toBe(false);
    expect(passValid(siteA, previewPass(siteA, Date.now() - 31 * 86_400_000))).toBe(false);
    await expect(teamPreviewPass({ actorId: "nobody", siteId: siteA })).rejects.toBeInstanceOf(AccessError);
  });

  test("an owner launches it, once", async () => {
    await expect(launchSite({ actorId: staff, siteId: siteA })).rejects.toBeInstanceOf(AccessError);
    const first = await launchSite({ actorId: own, siteId: siteA });
    expect(await launchSite({ actorId: own, siteId: siteA })).toEqual(first);
    expect(siteVisible((await siteFromHost("dom-a.localhost"))!, undefined)).toBe(true);
  });
});

describe("your own sending domain", () => {
  test("set up in Resend; emails keep the platform's address until it's verified, then use it", async () => {
    await expect(setUpSendingDomain({ actorId: staff, siteId: siteA, domain: "kini-a.test", local: "orders" })).rejects.toBeInstanceOf(AccessError);
    await expect(setUpSendingDomain({ actorId: own, siteId: siteA, domain: "kini-a.test", local: "Not Valid!" })).rejects.toThrow(/Letters, numbers/);
    const v = await setUpSendingDomain({ actorId: own, siteId: siteA, domain: "Kini-A.test", local: "Orders" });
    expect(v.setUp).toMatchObject({ name: "kini-a.test", local: "orders", resendId: "rd_1", status: "not_started" });
    expect(calls.find((c) => c.method === "POST" && c.url.endsWith("/domains"))?.body).toEqual({ name: "kini-a.test" });
    expect(senderFor((await siteFromHost("dom-a.localhost"))!).fromAddress).toBeUndefined();

    resendStatus = "verified";
    const checked = await checkSendingDomain({ actorId: own, siteId: siteA });
    expect(calls.some((c) => c.method === "POST" && c.url.endsWith("/domains/rd_1/verify"))).toBe(true);
    expect(checked.setUp?.status).toBe("verified");
    expect(senderFor((await siteFromHost("dom-a.localhost"))!)).toMatchObject({ fromName: "Kini A", fromAddress: "orders@kini-a.test" });
    expect(await setUpSendingDomain({ actorId: own, siteId: siteA, domain: "other.test", local: "x" }).catch((e) => e.message)).toMatch(/already/);
  });

  test("removed: gone from Resend, and emails go back to the platform's address", async () => {
    await removeSendingDomain({ actorId: own, siteId: siteA });
    expect(calls.some((c) => c.method === "DELETE" && c.url.endsWith("/domains/rd_1"))).toBe(true);
    expect((await sendingDomainStatus({ actorId: own, siteId: siteA })).setUp).toBeNull();
    expect(senderFor((await siteFromHost("dom-a.localhost"))!).fromAddress).toBeUndefined();
  });
});
