/**
 * Who may manage a site's team, and the guard rails around it.
 * Pure database functions; the pages that call them are covered end to end.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { addMember, listMembers, removeMember, setRole } from "@/modules/team/server";
import { renameSite, siteSettings } from "@/modules/sites/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-team-ann"; // owns A
const ben = "test-team-ben"; // staff at A
const cat = "test-team-cat"; // owns B, nothing at A

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3) or email like '%@team.invalid'`, [ann, ben, cat]);
  await owner.query(`delete from sites where slug in ('team-a','team-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('team-a','Team A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('team-b','Team B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@team.invalid',true,now()),
       ($2,'Ben','ben@team.invalid',true,now()),
       ($3,'Cat','cat@team.invalid',true,now())`,
    [ann, ben, cat],
  );
  await owner.query(
    `insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'staff'), ($3,$5,'owner')`,
    [ann, ben, cat, siteA, siteB],
  );
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3) or email like '%@team.invalid'`, [ann, ben, cat]);
  await owner.query(`delete from sites where slug in ('team-a','team-b')`);
  await owner.end();
});

describe("team", () => {
  test("members are listed with name, email and role, owners first", async () => {
    const members = await listMembers({ actorId: ann, siteId: siteA });
    expect(members.map((m) => [m.email, m.role])).toEqual([
      ["ann@team.invalid", "owner"],
      ["ben@team.invalid", "staff"],
    ]);
  });

  test("staff can see the team but not change it", async () => {
    expect((await listMembers({ actorId: ben, siteId: siteA })).length).toBe(2);
    await expect(setRole({ actorId: ben, siteId: siteA, userId: ann, role: "staff" })).rejects.toThrow(AccessError);
    await expect(addMember({ actorId: ben, siteId: siteA, email: "x@team.invalid" })).rejects.toThrow(AccessError);
  });

  test("an owner of another site has no say here", async () => {
    await expect(listMembers({ actorId: cat, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(removeMember({ actorId: cat, siteId: siteA, userId: ben })).rejects.toThrow(AccessError);
  });

  test("adding by email creates the account if needed, and is idempotent", async () => {
    const first = await addMember({ actorId: ann, siteId: siteA, email: "Dee@Team.invalid " });
    expect(first).toMatchObject({ email: "dee@team.invalid", role: "staff", accountCreated: true, added: true });
    const again = await addMember({ actorId: ann, siteId: siteA, email: "dee@team.invalid" });
    expect(again).toMatchObject({ email: "dee@team.invalid", accountCreated: false, added: false });
    // Cat already has an account (owns B): adding her to A reuses it.
    const existing = await addMember({ actorId: ann, siteId: siteA, email: "cat@team.invalid", role: "owner" });
    expect(existing).toMatchObject({ userId: cat, role: "owner", accountCreated: false, added: true });
  });

  test("roles can change, but the last owner cannot be demoted or removed", async () => {
    await setRole({ actorId: ann, siteId: siteA, userId: cat, role: "staff" });
    await expect(setRole({ actorId: ann, siteId: siteA, userId: ann, role: "staff" })).rejects.toThrow(/last owner/);
    await expect(removeMember({ actorId: ann, siteId: siteA, userId: ann })).rejects.toThrow(/last owner/);
    await setRole({ actorId: ann, siteId: siteA, userId: cat, role: "owner" });
    await setRole({ actorId: ann, siteId: siteA, userId: ann, role: "staff" }); // now allowed: Cat owns it
    await setRole({ actorId: cat, siteId: siteA, userId: ann, role: "owner" });
  });

  test("removing a member takes away access to this site only", async () => {
    await removeMember({ actorId: ann, siteId: siteA, userId: cat });
    const members = await listMembers({ actorId: ann, siteId: siteA });
    expect(members.map((m) => m.email)).not.toContain("cat@team.invalid");
    // Cat still owns B and still has an account.
    expect((await listMembers({ actorId: cat, siteId: siteB })).map((m) => m.email)).toEqual(["cat@team.invalid"]);
  });
});

describe("site settings", () => {
  test("an owner can rename the site; staff and outsiders cannot", async () => {
    await renameSite({ actorId: ann, siteId: siteA, name: "  Team A, renamed " });
    expect((await siteSettings({ actorId: ann, siteId: siteA })).name).toBe("Team A, renamed");
    await expect(renameSite({ actorId: ben, siteId: siteA, name: "Nope" })).rejects.toThrow(AccessError);
    await expect(renameSite({ actorId: cat, siteId: siteA, name: "Nope" })).rejects.toThrow(AccessError);
  });

  test("a blank name is refused", async () => {
    await expect(renameSite({ actorId: ann, siteId: siteA, name: "   " })).rejects.toThrow();
  });
});
