/**
 * Who may manage a site's team, and the guard rails around it.
 * Pure database functions; the pages that call them are covered end to end.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { addMember, invitationEmail, listMembers, removeMember, setRole } from "@/modules/team/server";
import { renameSite, siteSettings } from "@/modules/sites/server";
import { listActivity } from "@/modules/activity/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ann = "test-team-ann"; // owns A
const ben = "test-team-ben"; // staff at A
const cat = "test-team-cat"; // owns B, nothing at A
const max = "test-team-max"; // manages A

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3,$4) or email like '%@team.invalid'`, [ann, ben, cat, max]);
  await owner.query(`delete from sites where slug in ('team-a','team-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('team-a','Team A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('team-b','Team B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Ann','ann@team.invalid',true,now()),
       ($2,'Ben','ben@team.invalid',true,now()),
       ($3,'Cat','cat@team.invalid',true,now()),
       ($4,'Max','max@team.invalid',true,now())`,
    [ann, ben, cat, max],
  );
  await owner.query(
    `insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'staff'), ($3,$5,'owner'), ($6,$4,'manager')`,
    [ann, ben, cat, siteA, siteB, max],
  );
  // Ann signed in a while ago, and again just now; nobody else has yet.
  await owner.query(
    `insert into sessions (id, token, user_id, expires_at, created_at, updated_at) values
       ('test-team-s1','test-team-t1',$1, now() + interval '30 days', $2::timestamp - interval '3 days', $2::timestamp - interval '3 days'),
       ('test-team-s2','test-team-t2',$1, now() + interval '30 days', $2::timestamp - interval '9 minutes', $2::timestamp - interval '9 minutes')`,
    [ann, new Date().toISOString().replace("T", " ").replace("Z", "")], // sessions keep UTC without a zone, as Better Auth writes them
  );
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2,$3,$4) or email like '%@team.invalid'`, [ann, ben, cat, max]);
  await owner.query(`delete from sites where slug in ('team-a','team-b')`);
  await owner.end();
});

describe("team", () => {
  test("members are listed with name, email and role: owners, then managers, then staff", async () => {
    const members = await listMembers({ actorId: ann, siteId: siteA });
    expect(members.map((m) => [m.email, m.role])).toEqual([
      ["ann@team.invalid", "owner"],
      ["max@team.invalid", "manager"],
      ["ben@team.invalid", "staff"],
    ]);
  });

  test("each with when they last signed in", async () => {
    const [a, m] = await listMembers({ actorId: ann, siteId: siteA });
    expect(Date.now() - a.lastSignedIn!.getTime()).toBeLessThan(10 * 60_000 + 5_000);
    expect(Date.now() - a.lastSignedIn!.getTime()).toBeGreaterThan(8 * 60_000);
    expect(m.lastSignedIn).toBeNull();
  });

  test("a manager can see the team but not change it; staff can do neither", async () => {
    expect((await listMembers({ actorId: max, siteId: siteA })).length).toBe(3);
    await expect(setRole({ actorId: max, siteId: siteA, userId: ben, role: "manager" })).rejects.toThrow(AccessError);
    await expect(addMember({ actorId: max, siteId: siteA, email: "x@team.invalid" })).rejects.toThrow(AccessError);
    await expect(listMembers({ actorId: ben, siteId: siteA })).rejects.toThrow(AccessError);
    await expect(setRole({ actorId: ben, siteId: siteA, userId: ann, role: "staff" })).rejects.toThrow(AccessError);
    await expect(addMember({ actorId: ben, siteId: siteA, email: "x@team.invalid" })).rejects.toThrow(AccessError);
  });

  test("an owner makes someone a manager, and back; Activity says so", async () => {
    await setRole({ actorId: ann, siteId: siteA, userId: ben, role: "manager" });
    expect((await listMembers({ actorId: ann, siteId: siteA })).find((m) => m.userId === ben)?.role).toBe("manager");
    await setRole({ actorId: ann, siteId: siteA, userId: ben, role: "staff" });
    const lines = (await listActivity({ actorId: ann, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines.slice(0, 2)).toEqual(["Ann made Ben staff", "Ann made Ben a manager"]);
  });

  test("a new person can start as a manager", async () => {
    const r = await addMember({ actorId: ann, siteId: siteA, email: "fay@team.invalid", role: "manager" });
    expect(r).toMatchObject({ role: "manager", added: true });
    const lines = (await listActivity({ actorId: ann, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines[0]).toBe("Ann added fay@team.invalid to the team as a manager");
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
    await expect(setRole({ actorId: ann, siteId: siteA, userId: ann, role: "manager" })).rejects.toThrow(/last owner/);
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
  test("an owner or a manager can rename the site; staff and outsiders cannot", async () => {
    await renameSite({ actorId: max, siteId: siteA, name: "Team A" });
    await renameSite({ actorId: ann, siteId: siteA, name: "  Team A, renamed " });
    expect((await siteSettings({ actorId: ann, siteId: siteA })).name).toBe("Team A, renamed");
    await expect(renameSite({ actorId: ben, siteId: siteA, name: "Nope" })).rejects.toThrow(AccessError);
    await expect(renameSite({ actorId: cat, siteId: siteA, name: "Nope" })).rejects.toThrow(AccessError);
  });

  test("a blank name is refused", async () => {
    await expect(renameSite({ actorId: ann, siteId: siteA, name: "   " })).rejects.toThrow();
  });
});

describe("site from host", () => {
  test("the first label of the host is the slug; unknown hosts resolve to nothing", async () => {
    const { siteFromHost } = await import("@/modules/sites/server");
    expect((await siteFromHost("team-a.outputinput.co"))?.id).toBe(siteA);
    expect((await siteFromHost("TEAM-B.localhost:3000"))?.id).toBe(siteB);
    expect(await siteFromHost("nobody.outputinput.co")).toBeNull();
  });
});

describe("invitation", () => {
  test("says who, what and where, and nothing it shouldn't", () => {
    const m = invitationEmail("dee@team.invalid", { siteName: "Kini", byName: "Ann", signInUrl: "https://admin.example.test/sign-in" });
    expect(m.to).toBe("dee@team.invalid");
    expect(m.subject).toBe("Ann added you to Kini");
    expect(m.text).toContain("https://admin.example.test/sign-in");
    expect(m.text).toContain("six-digit code");
    expect(m.text).not.toMatch(/password[^.]/i);
  });
  test("is only attempted for a new membership, and never blocks the add", async () => {
    const inv = { siteName: "A", byName: "Ann", signInUrl: "https://admin.example.test/sign-in" };
    const first = await addMember({ actorId: ann, siteId: siteA, email: "eve@team.invalid", invitation: inv });
    expect(first.added).toBe(true);
    expect(first.emailed).toBe(false); // console delivery in tests: logged, not delivered
    const again = await addMember({ actorId: ann, siteId: siteA, email: "eve@team.invalid", invitation: inv });
    expect(again.added).toBe(false);
    expect(again.emailed).toBe(false);
  });
});
