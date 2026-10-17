/**
 * Two-factor for the team (Carl, Oct 2026): the emailed code, then a code
 * from an authenticator app. Required for Owners, a choice for everyone
 * else. Ten one-time recovery codes; an Owner can reset someone who lost
 * their phone. Plus "Where you're signed in" on Your account.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { totpAt } from "@/modules/auth/totp";
import {
  confirmSetup,
  freshRecoveryCodes,
  resetTwoFactor,
  signInState,
  startSetup,
  turnOffTwoFactor,
  twoFactorStatus,
  verifySecondStep,
} from "@/modules/auth/two-factor";
import { listSessions, signOutOthers, signOutSession } from "@/modules/auth/sessions";
import { listActivity } from "@/modules/activity/server";
import { listMembers } from "@/modules/team/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const oli = "test-2fa-oli"; // owns A
const sam = "test-2fa-sam"; // staff at A
const mia = "test-2fa-mia"; // manager at A, staff at B
const bea = "test-2fa-bea"; // owns B
const ids = [oli, sam, mia, bea];
const secrets: Record<string, string> = {};

/** Now, as a session row stores it (UTC, no zone), give or take some seconds. */
const utc = (secondsAgo = 0) => new Date(Date.now() - secondsAgo * 1000).toISOString().replace("T", " ").replace("Z", "");
async function session(id: string, userId: string, ua = "", secondsAgo = 0) {
  await db.query(
    `insert into sessions (id, token, user_id, expires_at, created_at, updated_at, user_agent) values ($1, $1 || '-t', $2, now() + interval '30 days', $3, $3, $4)`,
    [id, userId, utc(secondsAgo), ua],
  );
}
/** A code the app would show, one step on from anything already used. */
function nextCode(userId: string, ahead = 0) {
  return totpAt(secrets[userId], Math.floor(Date.now() / 1000) + 30 * ahead);
}
/** A fresh code, as if half a minute had passed since the last one used (tests don't wait). */
async function appCode(userId: string) {
  await db.query(`update two_factors set last_step = null where user_id = $1`, [userId]);
  return nextCode(userId);
}
/** The code that was just used. */
async function usedCode(userId: string) {
  const { last_step } = (await db.query(`select last_step from two_factors where user_id = $1`, [userId])).rows[0];
  return totpAt(secrets[userId], Number(last_step) * 30);
}
function wrong(code: string) {
  return code.slice(0, 5) + ((Number(code[5]) + 1) % 10);
}

beforeAll(async () => {
  await db.query(`delete from users where id = any($1)`, [ids]);
  await db.query(`delete from sites where slug in ('tfa-a','tfa-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('tfa-a','TFA A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('tfa-b','TFA B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Oli','oli@tfa.invalid',true,now()), ($2,'Sam','sam@tfa.invalid',true,now()), ($3,'Mia','mia@tfa.invalid',true,now()), ($4,'Bea','bea@tfa.invalid',true,now())`,
    ids,
  );
  await db.query(
    `insert into memberships (user_id, site_id, role) values ($1,$5,'owner'), ($2,$5,'staff'), ($3,$5,'manager'), ($3,$6,'staff'), ($4,$6,'owner')`,
    [...ids, siteA, siteB],
  );
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1)`, [ids]);
  await db.query(`delete from sites where slug in ('tfa-a','tfa-b')`);
  await db.end();
});

describe("setting it up", () => {
  test("required for owners, a choice for everyone else", async () => {
    expect(await twoFactorStatus(oli)).toEqual({ on: false, required: true, recoveryLeft: 0 });
    expect(await twoFactorStatus(sam)).toEqual({ on: false, required: false, recoveryLeft: 0 });
  });

  test("a key to scan, then a code from the app turns it on and gives ten recovery codes", async () => {
    const s = await startSetup(sam);
    expect(s.uri).toContain(`secret=${s.secret}`);
    expect(s.uri).toContain("sam%40tfa.invalid");
    // Reloading the page shows the same key: it may already be in their app.
    expect((await startSetup(sam)).secret).toBe(s.secret);
    secrets[sam] = s.secret;
    expect((await twoFactorStatus(sam)).on).toBe(false);

    await expect(confirmSetup(sam, wrong(nextCode(sam)))).rejects.toMatchObject({ field: "code" });
    const codes = await confirmSetup(sam, nextCode(sam));
    expect(codes).toHaveLength(10);
    expect(await twoFactorStatus(sam)).toEqual({ on: true, required: false, recoveryLeft: 10 });
    secrets[`${sam}:recovery`] = codes.join(",");

    // Kept sealed: the database never holds the key or a recovery code as typed.
    const row = (await db.query(`select secret, recovery::text from two_factors where user_id = $1`, [sam])).rows[0];
    expect(row.secret).toMatch(/^v1:/);
    expect(row.secret).not.toContain(s.secret);
    expect(row.recovery).not.toContain(codes[0]);

    await expect(startSetup(sam)).rejects.toThrow(/already on/);
  });
});

describe("signing in", () => {
  test("after the emailed code, the session waits for the app", async () => {
    await session("tfa-s1", sam);
    expect(await signInState("tfa-s1")).toEqual({ twoFactorOn: true, passed: false });
    await expect(verifySecondStep(sam, "tfa-s1", wrong(nextCode(sam, 1)))).rejects.toMatchObject({ field: "code" });
    await verifySecondStep(sam, "tfa-s1", nextCode(sam, 1));
    expect(await signInState("tfa-s1")).toEqual({ twoFactorOn: true, passed: true });
  });

  test("an app code works once; a recovery code works once", async () => {
    await session("tfa-s2", sam);
    await expect(verifySecondStep(sam, "tfa-s2", await usedCode(sam))).rejects.toThrow(/already been used/);
    const [first] = secrets[`${sam}:recovery`].split(",");
    await verifySecondStep(sam, "tfa-s2", first.toUpperCase().replace("-", " "));
    expect((await twoFactorStatus(sam)).recoveryLeft).toBe(9);
    await session("tfa-s3", sam);
    await expect(verifySecondStep(sam, "tfa-s3", first)).rejects.toMatchObject({ field: "code" });
  });

  test("five wrong codes lock it for two minutes, even for the right one", async () => {
    await session("tfa-s4", sam);
    await db.query(`update two_factors set misses = 0 where user_id = $1`, [sam]); // the reused codes above were misses too
    for (let i = 0; i < 4; i++) await expect(verifySecondStep(sam, "tfa-s4", "000000")).rejects.toThrow(/didn't work/);
    await expect(verifySecondStep(sam, "tfa-s4", "000000")).rejects.toThrow(/Try again in 2 minutes/);
    await expect(verifySecondStep(sam, "tfa-s4", await appCode(sam))).rejects.toThrow(/Try again in/);
    await db.query(`update two_factors set locked_until = null, misses = 0 where user_id = $1`, [sam]);
  });

  test("someone without it passes straight through; a session that isn't theirs never does", async () => {
    await session("tfa-s5", bea);
    expect(await signInState("tfa-s5")).toEqual({ twoFactorOn: false, passed: false });
    await expect(verifySecondStep(sam, "tfa-s5", await appCode(sam))).rejects.toThrow(AccessError);
    expect(await signInState("nope")).toBeNull();
  });
});

describe("looking after it", () => {
  test("new recovery codes replace the old ones, with a code from the app", async () => {
    await expect(freshRecoveryCodes(sam, "000000")).rejects.toMatchObject({ field: "code" });
    const codes = await freshRecoveryCodes(sam, await appCode(sam));
    expect(codes).toHaveLength(10);
    expect(codes).not.toContain(secrets[`${sam}:recovery`].split(",")[1]);
    expect((await twoFactorStatus(sam)).recoveryLeft).toBe(10);
  });

  test("turning it off needs a code; owners keep it on", async () => {
    await expect(turnOffTwoFactor(sam, "000000")).rejects.toMatchObject({ field: "code" });
    await turnOffTwoFactor(sam, await appCode(sam));
    expect((await twoFactorStatus(sam)).on).toBe(false);

    secrets[oli] = (await startSetup(oli)).secret;
    await confirmSetup(oli, nextCode(oli));
    await expect(turnOffTwoFactor(oli, await appCode(oli))).rejects.toThrow(/Owners keep/);
  });
});

describe("an owner resets it for someone who lost their phone", () => {
  test("they're signed out everywhere and set it up again; Activity says so", async () => {
    secrets[sam] = (await startSetup(sam)).secret;
    await confirmSetup(sam, nextCode(sam));
    expect((await listMembers({ actorId: oli, siteId: siteA })).find((m) => m.userId === sam)?.twoFactor).toBe(true);
    await resetTwoFactor({ actorId: oli, siteId: siteA, userId: sam });
    expect((await twoFactorStatus(sam)).on).toBe(false);
    expect((await db.query(`select count(*)::int as n from sessions where user_id = $1`, [sam])).rows[0].n).toBe(0);
    const lines = (await listActivity({ actorId: oli, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines[0]).toBe("Oli reset two-factor for Sam");
  });

  test("only an owner of every site they're on; never yourself", async () => {
    secrets[mia] = (await startSetup(mia)).secret;
    await confirmSetup(mia, nextCode(mia));
    await expect(resetTwoFactor({ actorId: oli, siteId: siteA, userId: mia })).rejects.toThrow(/another site/);
    await expect(resetTwoFactor({ actorId: mia, siteId: siteA, userId: oli })).rejects.toThrow(AccessError);
    await expect(resetTwoFactor({ actorId: oli, siteId: siteA, userId: oli })).rejects.toThrow(/your own/);
    await expect(resetTwoFactor({ actorId: bea, siteId: siteA, userId: sam })).rejects.toThrow(AccessError);
    expect((await twoFactorStatus(mia)).on).toBe(true);
  });
});

describe("where you're signed in", () => {
  test("this device first, then the rest by when they were last used, in words", async () => {
    await session("tfa-m1", mia, "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36", 3600);
    await session("tfa-m2", mia, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1", 60);
    await session("tfa-m3", mia, "", 86400 * 3);
    const list = await listSessions(mia, "tfa-m1");
    expect(list.map((s) => [s.id, s.device, s.current])).toEqual([
      ["tfa-m1", "Mac · Chrome", true],
      ["tfa-m2", "iPhone · Safari", false],
      ["tfa-m3", "A browser", false],
    ]);
    expect(Math.round((Date.now() - list[1].lastUsed.getTime()) / 1000)).toBeGreaterThanOrEqual(59);
  });

  test("sign one out, or everywhere else; never someone else's", async () => {
    await session("tfa-b1", bea);
    await signOutSession(mia, "tfa-b1");
    expect((await db.query(`select count(*)::int as n from sessions where id = 'tfa-b1'`)).rows[0].n).toBe(1);
    await signOutSession(mia, "tfa-m3");
    expect((await listSessions(mia, "tfa-m1")).map((s) => s.id)).toEqual(["tfa-m1", "tfa-m2"]);
    expect(await signOutOthers(mia, "tfa-m1")).toBe(1);
    expect((await listSessions(mia, "tfa-m1")).map((s) => s.id)).toEqual(["tfa-m1"]);
    expect((await db.query(`select count(*)::int as n from sessions where user_id = $1`, [bea])).rows[0].n).toBeGreaterThan(0);
  });
});
