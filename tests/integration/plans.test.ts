/**
 * Plans (Carl, Oct 2026): output/input sets each site's plan in ops; the
 * site's Owners see it, and what they're using against it, in Settings ·
 * Plan. Nobody else changes a plan; Managers and Staff don't see it.
 */
import { vi, beforeAll, afterAll, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@plans.invalid";
});

import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { listActivity } from "@/modules/activity/server";
import { countVisit, planView, setPlan, visitorKey } from "@/modules/plans/server";
import { opsSite, opsSites } from "@/modules/ops/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ids = { oli: "test-plans-oli", max: "test-plans-max", help: "test-plans-help", bea: "test-plans-bea" };
const plan = { name: "Shop and journal", description: "Products, orders, pages and contacts.", price: 18000, currency: "AUD", limits: { storageGb: 5, products: null, people: 2, visits: 10 } };

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('plans-a','plans-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('plans-a','Plans A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('plans-b','Plans B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Oli','oli@plans.invalid',true,now()), ($2,'Max','max@plans.invalid',true,now()), ($3,'output/input','help@plans.invalid',true,now()), ($4,'Bea','bea@plans.invalid',true,now())`,
    [ids.oli, ids.max, ids.help, ids.bea],
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'manager'), ($4,$5,'owner')`, [ids.oli, ids.max, siteA, ids.bea, siteB]);
  await db.query(`insert into media (site_id, key, filename, content_type, size_bytes, width, height) values ($1, $2, 'a.jpg', 'image/jpeg', 300000000, 10, 10), ($1, $3, 'b.jpg', 'image/jpeg', 200000000, 10, 10)`, [siteA, `${siteA}/a.jpg`, `${siteA}/b.jpg`]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('plans-a','plans-b')`);
  await db.end();
});

describe("setting a plan", () => {
  test("only output/input, never a site's own Owner", async () => {
    await expect(setPlan({ actorId: ids.oli, siteId: siteA, plan })).rejects.toThrow(AccessError);
    await setPlan({ actorId: ids.help, siteId: siteA, plan });
    const lines = (await listActivity({ actorId: ids.oli, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines[0]).toBe("output/input set the plan to Shop and journal");
  });

  test("a bad plan points at its field", async () => {
    await expect(setPlan({ actorId: ids.help, siteId: siteA, plan: { ...plan, price: -5 } })).rejects.toMatchObject({ issues: [{ path: ["price"] }] });
  });
});

describe("Settings · Plan", () => {
  test("Owners see the plan and what they're using; Managers and other sites don't", async () => {
    await countVisit(siteA);
    await countVisit(siteA);
    const v = await planView({ actorId: ids.oli, siteId: siteA });
    expect(v.plan).toMatchObject({ name: "Shop and journal", price: 18000 });
    expect(v.usage).toMatchObject({ storageBytes: 500000000, products: 0, people: 2, visits: 2 });
    await expect(planView({ actorId: ids.max, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(planView({ actorId: ids.bea, siteId: siteA })).rejects.toThrow(AccessError);
    expect((await planView({ actorId: ids.bea, siteId: siteB })).plan).toBeNull();
  });

  test("visits count per site, per day", async () => {
    await countVisit(siteB);
    expect((await planView({ actorId: ids.bea, siteId: siteB })).usage.visits).toBe(1);
    expect((await planView({ actorId: ids.oli, siteId: siteA })).usage.visits).toBe(2);
  });
});

describe("a visit counts once per visitor per day (Carl: a script can't push the number up)", () => {
  test("the same connection a thousand times is one visit; another connection is another", async () => {
    const before = (await planView({ actorId: ids.bea, siteId: siteB })).usage.visits;
    const one = visitorKey("203.0.113.7");
    expect(await countVisit(siteB, one)).toBe(true);
    for (let i = 0; i < 20; i++) expect(await countVisit(siteB, one)).toBe(false);
    expect(await countVisit(siteB, visitorKey("203.0.113.8"))).toBe(true);
    // The same visitor on another site is that site's visit.
    expect(await countVisit(siteA, one)).toBe(true);
    expect((await planView({ actorId: ids.bea, siteId: siteB })).usage.visits).toBe(before + 2);
  });

  test("the key is a hash that changes daily, never the address; old days are cleared", async () => {
    const k = visitorKey("203.0.113.7", "2026-10-17", "s".repeat(32));
    expect(k).not.toContain("203");
    expect(k).toBe(visitorKey(" 203.0.113.7 ", "2026-10-17", "s".repeat(32)));
    expect(k).not.toBe(visitorKey("203.0.113.7", "2026-10-18", "s".repeat(32)));
    await db.query(`insert into visits_seen (site_id, day, visitor) values ($1, '2000-01-01', 'old')`, [siteB]);
    await countVisit(siteB, visitorKey("203.0.113.9"));
    const old = await db.query(`select 1 from visits_seen where site_id = $1 and day < to_char(now() at time zone 'utc', 'YYYY-MM-DD')`, [siteB]);
    expect(old.rowCount).toBe(0);
  });
});

describe("ops", () => {
  test("every site, with its plan and storage — for output/input only", async () => {
    const all = await opsSites({ actorId: ids.help });
    const a = all.find((s) => s.id === siteA)!;
    expect(a).toMatchObject({ name: "Plans A", planName: "Shop and journal", storageBytes: 500000000 });
    expect(all.find((s) => s.id === siteB)?.planName).toBeNull();
    await expect(opsSites({ actorId: ids.oli })).rejects.toThrow(AccessError);
  });

  test("one site: plan, usage, and its people", async () => {
    const s = await opsSite({ actorId: ids.help, siteId: siteA });
    expect(s.site.name).toBe("Plans A");
    expect(s.plan?.name).toBe("Shop and journal");
    expect(s.people.map((p) => [p.email, p.role])).toEqual([
      ["oli@plans.invalid", "owner"],
      ["max@plans.invalid", "manager"],
    ]);
    await expect(opsSite({ actorId: ids.bea, siteId: siteA })).rejects.toThrow(AccessError);
  });
});
