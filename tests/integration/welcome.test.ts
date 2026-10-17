/**
 * First run and Get help (Stage 41, Carl): everyone sees the welcome once
 * per site; after it, anyone without the authenticator app is asked once.
 * Get help sends the message, the site and the screen to O/I support, never
 * showing clients the support sign-in addresses.
 */
import { vi, beforeAll, afterAll, describe, expect, test } from "vitest";

vi.hoisted(() => {
  process.env.OI_SUPPORT_EMAILS = "help@welcome.invalid";
});

import { Pool } from "pg";
import { ZodError } from "zod";
import { AccessError } from "@/modules/auth/access";
import { finishWelcome, skipSecureNudge, welcomeState } from "@/modules/welcome/server";
import { askForHelp, helpContact } from "@/modules/help/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const ids = { mia: "test-wel-mia", sam: "test-wel-sam", bo: "test-wel-bo", help: "test-wel-help" };

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('wel-a','wel-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('wel-a','Welcome A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('wel-b','Welcome B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values
       ($1,'Mia','mia@welcome.invalid',true,now()), ($2,'Sam','sam@welcome.invalid',true,now()), ($3,'Bo','bo@welcome.invalid',true,now()), ($4,'output/input','help@welcome.invalid',true,now())`,
    Object.values(ids),
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$4,'manager'), ($1,$5,'manager'), ($2,$4,'staff'), ($3,$5,'owner')`, [ids.mia, ids.sam, ids.bo, siteA, siteB]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [Object.values(ids)]);
  await db.query(`delete from sites where slug in ('wel-a','wel-b')`);
  await db.end();
});

describe("the welcome", () => {
  test("shown until finished, once per site; then the app is asked about once", async () => {
    expect(await welcomeState({ actorId: ids.mia, siteId: siteA })).toEqual({ welcome: true, secure: false });
    await finishWelcome({ actorId: ids.mia, siteId: siteA });
    expect(await welcomeState({ actorId: ids.mia, siteId: siteA })).toEqual({ welcome: false, secure: true });
    expect(await welcomeState({ actorId: ids.mia, siteId: siteB })).toEqual({ welcome: true, secure: false }); // another site: welcome again
    await skipSecureNudge({ actorId: ids.mia, siteId: siteA });
    expect(await welcomeState({ actorId: ids.mia, siteId: siteA })).toEqual({ welcome: false, secure: false });
  });

  test("someone with the app on isn't asked", async () => {
    await finishWelcome({ actorId: ids.sam, siteId: siteA });
    await db.query(`insert into two_factors (user_id, secret, recovery, confirmed_at) values ($1, 'sealed', '[]'::jsonb, now()) on conflict do nothing`, [ids.sam]);
    expect(await welcomeState({ actorId: ids.sam, siteId: siteA })).toEqual({ welcome: false, secure: false });
  });

  test("only their own: not someone else's site, and O/I support never sees it", async () => {
    await expect(finishWelcome({ actorId: ids.sam, siteId: siteB })).rejects.toThrow(AccessError);
    expect(await welcomeState({ actorId: ids.help, siteId: siteB })).toEqual({ welcome: false, secure: false });
  });
});

describe("Get help", () => {
  test("goes to O/I support with who, the site and the screen; replies go to them", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await askForHelp({ actorId: ids.sam, siteId: siteA, input: { topic: "broken", message: "The order email didn't go.", from: "/orders/1041" } });
    const sent = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("help@welcome.invalid"))!;
    log.mockRestore();
    expect(sent).toContain("Something's broken — Welcome A");
    expect(sent).toContain("The order email didn't go.");
    expect(sent).toContain("From Sam (sam@welcome.invalid)");
    expect(sent).toContain("Screen /orders/1041");
  });

  test("a mistake points at its field; a made-up screen is dropped, not sent", async () => {
    await expect(askForHelp({ actorId: ids.sam, siteId: siteA, input: { topic: "question", message: " " } })).rejects.toMatchObject({ issues: [{ path: ["message"] }] });
    await expect(askForHelp({ actorId: ids.sam, siteId: siteA, input: { message: "Hi" } })).rejects.toThrow(ZodError);
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    await askForHelp({ actorId: ids.sam, siteId: siteA, input: { topic: "question", message: "Hi", from: "javascript:alert(1)" } });
    const sent = log.mock.calls.map((c) => String(c[0])).find((l) => l.includes("help@welcome.invalid"))!;
    log.mockRestore();
    expect(sent).toContain("Screen not known");
  });

  test("ten a day each", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => {});
    for (let i = 0; i < 10; i++) await askForHelp({ actorId: ids.bo, siteId: siteB, input: { topic: "question", message: `Hi ${i}` } });
    await expect(askForHelp({ actorId: ids.bo, siteId: siteB, input: { topic: "question", message: "Again" } })).rejects.toThrow("a lot today");
    log.mockRestore();
  });

  test("the support sign-in addresses are never what clients are shown", () => {
    expect(Object.values(helpContact())).not.toContain("help@welcome.invalid");
  });
});
