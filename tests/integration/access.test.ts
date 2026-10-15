/**
 * Who may touch which site. Exercises the pure-database half of the access
 * module; the cookie-and-redirect half is covered end to end in Playwright.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { membershipFor, sitesFor } from "@/modules/auth/access";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const alice = "test-user-alice";
const bob = "test-user-bob";

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1, $2)`, [alice, bob]);
  await owner.query(`delete from sites where slug in ('access-a','access-b')`);
  siteA = (await owner.query(`insert into sites (slug, name) values ('access-a','Access A') returning id`)).rows[0].id;
  siteB = (await owner.query(`insert into sites (slug, name) values ('access-b','Access B') returning id`)).rows[0].id;
  await owner.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1, 'Alice', 'alice@test.invalid', true, now()),
       ($2, 'Bob', 'bob@test.invalid', true, now())`,
    [alice, bob],
  );
  // Alice owns A and works at B. Bob belongs nowhere.
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1, $2, 'owner'), ($1, $3, 'staff')`, [
    alice,
    siteA,
    siteB,
  ]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1, $2)`, [alice, bob]);
  await owner.query(`delete from sites where slug in ('access-a','access-b')`);
  await owner.end();
});

describe("site access", () => {
  test("a member gets their role", async () => {
    expect(await membershipFor(alice, siteA)).toBe("owner");
    expect(await membershipFor(alice, siteB)).toBe("staff");
  });

  test("a non-member gets nothing, even with a real site id", async () => {
    expect(await membershipFor(bob, siteA)).toBeNull();
    expect(await membershipFor(bob, siteB)).toBeNull();
  });

  test("an unknown user or site gets nothing", async () => {
    expect(await membershipFor("nobody", siteA)).toBeNull();
    expect(await membershipFor(alice, "00000000-0000-0000-0000-000000000000")).toBeNull();
  });

  test("sitesFor lists only the user's sites, with names, through the site lock", async () => {
    const mine = await sitesFor(alice);
    expect(mine.map((m) => [m.site.name, m.role])).toEqual([
      ["Access A", "owner"],
      ["Access B", "staff"],
    ]);
    expect(await sitesFor(bob)).toEqual([]);
  });
});
