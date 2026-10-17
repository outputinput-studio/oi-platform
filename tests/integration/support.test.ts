/**
 * O/I support access (Carl, Oct 2026): the addresses in OI_SUPPORT_EMAILS
 * can look after every site as an Owner, always on — a client can't take
 * it away ("Ask us and we'll remove it"). Their sign-in always asks for
 * the authenticator app, it only works once secure storage is set up,
 * and what they do shows in Activity as output/input.
 */
import { vi, beforeAll, afterAll, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@support.invalid";
});

import { Pool } from "pg";
import { membershipFor, sitesFor } from "@/modules/auth/access";
import { ensureSupportUser, supportContact } from "@/modules/auth/support";
import { resetTwoFactor, twoFactorStatus } from "@/modules/auth/two-factor";
import { listActivity } from "@/modules/activity/server";
import { renameSite } from "@/modules/sites/server";
import { listMembers, removeMember } from "@/modules/team/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const oli = "test-support-oli"; // owns A
let help = ""; // made by ensureSupportUser, like a first sign-in

beforeAll(async () => {
  await db.query(`delete from users where id = $1 or email in ('help@support.invalid','nobody@support.invalid')`, [oli]);
  await db.query(`delete from sites where slug in ('support-a','support-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('support-a','Support A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('support-b','Support B') returning id`)).rows[0].id;
  await db.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Oli','oli@support.invalid',true,now())`, [oli]);
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$2,'owner')`, [oli, siteA]);
});

afterAll(async () => {
  await db.query(`delete from users where id = $1 or email in ('help@support.invalid','nobody@support.invalid')`, [oli]);
  await db.query(`delete from sites where slug in ('support-a','support-b')`);
  await db.end();
});

describe("support access", () => {
  test("a support address gets an account at its first sign-in; nobody else does", async () => {
    await ensureSupportUser("Help@Support.invalid");
    await ensureSupportUser("help@support.invalid");
    await ensureSupportUser("nobody@support.invalid");
    const rows = (await db.query(`select id, email from users where email in ('help@support.invalid','nobody@support.invalid')`)).rows;
    expect(rows.map((r) => r.email)).toEqual(["help@support.invalid"]);
    help = rows[0].id;
  });

  test("an Owner of every site, with no membership anywhere", async () => {
    expect(await membershipFor(help, siteA)).toBe("owner");
    expect(await membershipFor(help, siteB)).toBe("owner");
    expect((await db.query(`select count(*)::int as n from memberships where user_id = $1`, [help])).rows[0].n).toBe(0);
    const ids = (await sitesFor(help)).map((s) => s.site.id);
    expect(ids).toEqual(expect.arrayContaining([siteA, siteB]));
    // Everyone else is exactly as before.
    expect(await membershipFor(oli, siteB)).toBeNull();
  });

  test("their sign-in always asks for the app", async () => {
    expect((await twoFactorStatus(help)).required).toBe(true);
  });

  test("the client sees us on Team, can't take us off, and can't reset our app", async () => {
    expect(supportContact()).toEqual({ emails: ["help@support.invalid"] });
    expect((await listMembers({ actorId: oli, siteId: siteA })).map((m) => m.email)).toEqual(["oli@support.invalid"]);
    await removeMember({ actorId: oli, siteId: siteA, userId: help });
    expect(await membershipFor(help, siteA)).toBe("owner");
    await expect(resetTwoFactor({ actorId: oli, siteId: siteA, userId: help })).rejects.toThrow(/isn't on this site/);
  });

  test("what we change shows in Activity as output/input", async () => {
    await renameSite({ actorId: help, siteId: siteA, name: "Support A, tidied" });
    const [line] = await listActivity({ actorId: oli, siteId: siteA });
    expect(`${line.who} ${line.before}${line.subject}${line.after}`).toBe("output/input renamed the site to Support A, tidied");
  });
});
