/**
 * Activity (design/admin.html, More → Activity): everything the team
 * changed and who changed it, newest first. A run of edits to one thing by
 * one person is one line; uploads count up; output/input itself and people
 * since removed are named sensibly; another site never sees it.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { listActivity, logActivity } from "@/modules/activity/server";
import { createPage, updatePage, setPageStatus } from "@/modules/pages/server";
import { uploadMedia } from "@/modules/media/server";
import { hideSite, launchSite } from "@/modules/sites/launch";
import { renameSite, updateShipping } from "@/modules/sites/server";
import { setRole } from "@/modules/team/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const mia = "test-activity-mia"; // owner of A
const ned = "test-activity-ned"; // manager at A
const zed = "test-activity-zed"; // owner of B
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  "base64",
);

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3)`, [mia, ned, zed]);
  await owner.query(`delete from sites where slug in ('activity-a','activity-b')`);
  siteA = (
    await owner.query(
      `insert into sites (slug, name) values ('activity-a','Activity A') returning id`,
    )
  ).rows[0].id;
  siteB = (
    await owner.query(
      `insert into sites (slug, name) values ('activity-b','Activity B') returning id`,
    )
  ).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Mia Ross','mia@activity.invalid',true,now()), ($2,'Ned Lane','ned@activity.invalid',true,now()), ($3,'Zed','zed@activity.invalid',true,now())`,
    [mia, ned, zed],
  );
  await owner.query(
    `insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'manager'), ($3,$5,'owner')`,
    [mia, ned, zed, siteA, siteB],
  );
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3)`, [mia, ned, zed]);
  await owner.query(`delete from sites where slug in ('activity-a','activity-b')`);
  await owner.end();
});

const words = (l: { who: string; before: string; subject: string; after: string }) =>
  `${l.who} ${l.before}${l.subject}${l.after}`;
const lines = async (actorId = mia, siteId = siteA) =>
  (await listActivity({ actorId, siteId })).map(words);

describe("what goes in", () => {
  test("a page: added, then edited many times by one person is one line, by another person another", async () => {
    const page = await createPage({ actorId: mia, siteId: siteA, title: "Custom commissions" });
    await updatePage({ actorId: mia, siteId: siteA, pageId: page.id, title: "Custom commissions" });
    await updatePage({
      actorId: mia,
      siteId: siteA,
      pageId: page.id,
      seo: { title: "Commissions" },
    });
    await updatePage({ actorId: ned, siteId: siteA, pageId: page.id, title: "Custom commissions" });
    await setPageStatus({ actorId: mia, siteId: siteA, pageId: page.id, status: "published" });
    expect(await lines()).toEqual([
      "Mia published the page Custom commissions",
      "Ned edited the page Custom commissions",
      "Mia edited the page Custom commissions",
      "Mia added the page Custom commissions",
    ]);
  });

  test("three photos in a row are one line that counts", async () => {
    for (let i = 0; i < 3; i++)
      await uploadMedia({
        actorId: mia,
        siteId: siteA,
        filename: `p${i}.png`,
        contentType: "image/png",
        bytes: new Uint8Array(PNG),
        width: 1,
        height: 1,
      });
    expect((await lines())[0]).toBe("Mia added 3 photos");
  });

  test("settings saved twice is one line; renaming, launching and hiding say so", async () => {
    await updateShipping({ actorId: mia, siteId: siteA, settings: { dispatchDays: 3, zones: [] } });
    await updateShipping({ actorId: mia, siteId: siteA, settings: { dispatchDays: 4, zones: [] } });
    await renameSite({ actorId: mia, siteId: siteA, name: "Activity A+" });
    await launchSite({ actorId: mia, siteId: siteA });
    await hideSite({ actorId: mia, siteId: siteA });
    await hideSite({ actorId: mia, siteId: siteA }); // already hidden: nothing new
    expect((await lines()).slice(0, 4)).toEqual([
      "Mia hid the site behind the holding page",
      "Mia launched the site",
      "Mia renamed the site to Activity A+",
      "Mia changed Settings · Shipping",
    ]);
  });

  test("the team: who was made what", async () => {
    await setRole({ actorId: mia, siteId: siteA, userId: ned, role: "owner" });
    expect((await lines())[0]).toBe("Mia made Ned Lane an owner");
  });
});

describe("who and where", () => {
  test("output/input itself, and someone since removed from the platform", async () => {
    await logActivity(siteA, null, { action: "updated the platform" });
    await owner.query(
      `insert into activity (site_id, actor_id, action) values ($1, 'test-activity-gone', 'edited the footer')`,
      [siteA],
    );
    const top = await lines();
    expect(top[0]).toBe("Someone edited the footer");
    expect(top[1]).toBe("output/input updated the platform");
  });

  test("anyone on the team reads it; another site neither sees it nor reads it", async () => {
    expect((await lines(ned)).length).toBeGreaterThan(5);
    expect(await lines(zed, siteB)).toEqual([]);
    await expect(listActivity({ actorId: zed, siteId: siteA })).rejects.toBeInstanceOf(AccessError);
  });

  test("older lines a page at a time", async () => {
    const all = await listActivity({ actorId: mia, siteId: siteA });
    const page = await listActivity({ actorId: mia, siteId: siteA, before: all[2].at, limit: 2 });
    expect(page.map((l) => l.id)).toEqual(all.slice(3, 5).map((l) => l.id));
  });
});
