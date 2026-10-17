/**
 * Our default plans (Carl, Oct 2026): ops keeps a price list; each site is
 * put on one of them, or given a custom plan of its own. Change a default
 * plan and every site on it follows — a new price from each paying site's
 * next bill; a currency change refused while any of them pays.
 */
import { vi, beforeAll, afterAll, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@planlist.invalid";
});

import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { FieldError } from "@/lib/form-error";
import { listActivity } from "@/modules/activity/server";
import { planView, setPlan } from "@/modules/plans/server";
import { assignPlan, defaultPlan, deleteDefaultPlan, listDefaultPlans, saveDefaultPlan } from "@/modules/plans/catalogue";
import { billingView, startPaying } from "@/modules/billing/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
let planId = "";
const ids = { ann: "test-pl-ann", ben: "test-pl-ben", help: "test-pl-help" };
const site = { name: "Site", description: "Pages, forms and contacts.", price: 8000, currency: "AUD", limits: { storageGb: 2, products: null, people: 1, visits: 5000 } };

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('pl-a','pl-b')`);
  await db.query(`delete from plans where name like 'PL %'`);
  siteA = (await db.query(`insert into sites (slug, name) values ('pl-a','PL A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('pl-b','PL B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Ann','ann@planlist.invalid',true,now()), ($2,'Ben','ben@planlist.invalid',true,now()), ($3,'output/input','help@planlist.invalid',true,now())`,
    [ids.ann, ids.ben, ids.help],
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$4,'owner')`, [ids.ann, ids.ben, siteA, siteB]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('pl-a','pl-b')`);
  if (planId) await db.query(`delete from plans where id = $1`, [planId]);
  await db.end();
});

describe("default plans", () => {
  test("only output/input keeps the list", async () => {
    await expect(listDefaultPlans({ actorId: ids.ann })).rejects.toThrow(AccessError);
    await expect(saveDefaultPlan({ actorId: ids.ann, plan: { ...site, name: "PL Site" } })).rejects.toThrow(AccessError);
    await expect(assignPlan({ actorId: ids.ann, siteId: siteA, planId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow(AccessError);
  });

  test("a plan is added, and a bad one points at its field", async () => {
    await expect(saveDefaultPlan({ actorId: ids.help, plan: { ...site, name: "" } })).rejects.toMatchObject({ issues: [{ path: ["name"] }] });
    planId = (await saveDefaultPlan({ actorId: ids.help, plan: { ...site, name: "PL Site" } })).id;
    const listed = (await listDefaultPlans({ actorId: ids.help })).find((p) => p.id === planId);
    expect(listed).toMatchObject({ name: "PL Site", price: 8000, sites: 0 });
  });

  test("sites go on it, and its Owners see it", async () => {
    await assignPlan({ actorId: ids.help, siteId: siteA, planId });
    await assignPlan({ actorId: ids.help, siteId: siteB, planId });
    expect((await planView({ actorId: ids.ann, siteId: siteA })).plan).toMatchObject({ name: "PL Site", price: 8000 });
    expect((await defaultPlan({ actorId: ids.help, id: planId }))?.sites).toBe(2);
  });

  test("change it, and every site on it follows; a paying site's next bill too", async () => {
    await startPaying({ actorId: ids.ben, siteId: siteB, returnTo: "https://admin.example.test/settings/plan" });
    expect(await saveDefaultPlan({ actorId: ids.help, id: planId, plan: { ...site, name: "PL Site", price: 9000 } })).toEqual({ id: planId, sites: 2 });
    expect((await planView({ actorId: ids.ann, siteId: siteA })).plan?.price).toBe(9000);
    expect((await planView({ actorId: ids.ben, siteId: siteB })).plan?.price).toBe(9000);
    expect((await billingView({ actorId: ids.ben, siteId: siteB })).billing?.price).toBe(9000);
    const lines = (await listActivity({ actorId: ids.ann, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines[0]).toBe("output/input updated the plan PL Site");
  });

  test("its currency can't change while a site on it pays — and then nothing changes anywhere", async () => {
    const err = await saveDefaultPlan({ actorId: ids.help, id: planId, plan: { ...site, name: "PL Site", price: 9000, currency: "NZD" } }).catch((e) => e);
    expect(err).toBeInstanceOf(FieldError);
    expect(err).toMatchObject({ field: "currency" });
    expect((await defaultPlan({ actorId: ids.help, id: planId }))?.currency).toBe("AUD");
    expect((await planView({ actorId: ids.ann, siteId: siteA })).plan?.currency).toBe("AUD");
  });

  test("a custom plan leaves the list; a plan with sites on it can't be removed", async () => {
    await expect(deleteDefaultPlan({ actorId: ids.help, id: planId })).rejects.toThrow("2 sites are on this plan");
    await setPlan({ actorId: ids.help, siteId: siteA, plan: { ...site, name: "PL A's own", price: 5000 } });
    await saveDefaultPlan({ actorId: ids.help, id: planId, plan: { ...site, name: "PL Site", price: 9500 } });
    // A custom plan doesn't follow.
    expect((await planView({ actorId: ids.ann, siteId: siteA })).plan).toMatchObject({ name: "PL A's own", price: 5000 });
    expect((await defaultPlan({ actorId: ids.help, id: planId }))?.sites).toBe(1);
    await setPlan({ actorId: ids.help, siteId: siteB, plan: { ...site, name: "PL B's own", price: 9500 } });
    await deleteDefaultPlan({ actorId: ids.help, id: planId });
    expect(await defaultPlan({ actorId: ids.help, id: planId })).toBeNull();
    planId = "";
  });
});
