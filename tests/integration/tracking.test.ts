/**
 * Settings · Analytics, Cookie notice and Custom code: owners only, saved
 * as validated values (IDs, never code, for analytics), every custom-code
 * save kept so it can be put back, all of it in Activity, and locked to
 * the site like everything else.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { siteFromHost, siteSettings, updateAnalytics, updateCookieNotice } from "@/modules/sites/server";
import { revertCustomCode, saveCustomCode } from "@/modules/sites/custom-code";
import { readAnalytics, readCookieNotice } from "@/modules/sites/tracking";
import { readCustomCode } from "@/modules/sites/custom-code-rules";
import { listActivity } from "@/modules/activity/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const oli = "test-tracking-oli"; // owner of A
const sal = "test-tracking-sal"; // staff at A
const bea = "test-tracking-bea"; // owner of B

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3)`, [oli, sal, bea]);
  await owner.query(`delete from sites where slug in ('tracking-a','tracking-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('tracking-a','Tracking A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('tracking-b','Tracking B') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Oli','oli@tracking.invalid',true,now()), ($2,'Sal','sal@tracking.invalid',true,now()), ($3,'Bea','bea@tracking.invalid',true,now())`, [oli, sal, bea]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'staff'), ($3,$5,'owner')`, [oli, sal, bea, siteA, siteB]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3)`, [oli, sal, bea]);
  await owner.query(`delete from sites where slug in ('tracking-a','tracking-b')`);
  await owner.end();
});

const site = async () => (await siteFromHost("tracking-a.localhost"))!;

describe("analytics", () => {
  test("an owner saves the IDs; a pasted snippet becomes its ID", async () => {
    await updateAnalytics({ actorId: oli, siteId: siteA, analytics: { gaId: `<script>gtag('config', 'G-AB12CD34EF');</script>`, metaPixelId: "1234567890123456" } });
    expect(readAnalytics((await site()).analytics)).toEqual({ gaId: "G-AB12CD34EF", metaPixelId: "1234567890123456" });
  });

  test("staff can't; something that isn't an ID points at its box", async () => {
    await expect(updateAnalytics({ actorId: sal, siteId: siteA, analytics: { gaId: "", metaPixelId: "" } })).rejects.toBeInstanceOf(AccessError);
    await expect(updateAnalytics({ actorId: oli, siteId: siteA, analytics: { gaId: "UA-1-1", metaPixelId: "" } })).rejects.toMatchObject({ issues: [{ path: ["gaId"] }] });
    await expect(updateAnalytics({ actorId: bea, siteId: siteA, analytics: {} })).rejects.toBeInstanceOf(AccessError);
  });
});

describe("cookie notice", () => {
  test("on, with words and a privacy page on the site; staff can't change it", async () => {
    await updateCookieNotice({ actorId: oli, siteId: siteA, notice: { enabled: true, message: "We use cookies for stats.", policyPath: "/privacy" } });
    expect(readCookieNotice((await site()).cookies)).toEqual({ enabled: true, message: "We use cookies for stats.", policyPath: "/privacy" });
    await expect(updateCookieNotice({ actorId: sal, siteId: siteA, notice: { enabled: false } })).rejects.toBeInstanceOf(AccessError);
    await expect(updateCookieNotice({ actorId: oli, siteId: siteA, notice: { enabled: true, policyPath: "https://elsewhere.example" } })).rejects.toMatchObject({ issues: [{ path: ["policyPath"] }] });
  });
});

describe("custom code", () => {
  test("owners only; each save keeps the one before; staff can read it but not change it", async () => {
    await expect(saveCustomCode({ actorId: sal, siteId: siteA, code: { head: "<script>x()</script>", body: "" } })).rejects.toBeInstanceOf(AccessError);
    await saveCustomCode({ actorId: oli, siteId: siteA, code: { head: "<script>one()</script>", body: "" } });
    const c = await saveCustomCode({ actorId: oli, siteId: siteA, code: { head: "<script>two()</script>", body: "<p>end</p>" } });
    expect(c).toMatchObject({ head: "<script>two()</script>", body: "<p>end</p>", by: "Oli" });
    expect(c.history.map((h) => h.head)).toEqual(["<script>one()</script>"]);
    expect(readCustomCode((await siteSettings({ actorId: sal, siteId: siteA })).customCode).head).toBe("<script>two()</script>");
  });

  test("an earlier version put back; another site can't touch it", async () => {
    const before = readCustomCode((await site()).customCode);
    const back = await revertCustomCode({ actorId: oli, siteId: siteA, versionAt: before.history[0].at });
    expect(back.head).toBe("<script>one()</script>");
    expect(back.history[0].head).toBe("<script>two()</script>");
    await expect(revertCustomCode({ actorId: bea, siteId: siteA, versionAt: before.history[0].at })).rejects.toBeInstanceOf(AccessError);
    await expect(revertCustomCode({ actorId: oli, siteId: siteA, versionAt: "1999-01-01T00:00:00.000Z" })).rejects.toThrow(/isn't there/);
  });

  test("too much code points at its box", async () => {
    await expect(saveCustomCode({ actorId: oli, siteId: siteA, code: { head: "", body: "x".repeat(20_001) } })).rejects.toMatchObject({ issues: [{ path: ["body"] }] });
  });
});

describe("in Activity", () => {
  test("each screen, and the code put back", async () => {
    const lines = (await listActivity({ actorId: oli, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines).toContain("Oli changed Settings · Analytics");
    expect(lines).toContain("Oli changed Settings · Cookie notice");
    expect(lines).toContain("Oli changed Settings · Custom code");
    expect(lines[0]).toBe("Oli put back an earlier version of Settings · Custom code");
  });
});
