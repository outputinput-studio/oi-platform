/**
 * Invitations (Carl: "As designed", design/admin.html Team): an Owner
 * invites an email as a role; the link joins them; 14 days; copy, resend,
 * change role, cancel; an expired link asks for a new one itself. Locked
 * to the site like everything else.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError, membershipFor } from "@/modules/auth/access";
import { listActivity } from "@/modules/activity/server";
import {
  acceptInvitation,
  askForNewLink,
  cancelInvite,
  invite,
  listInvitations,
  openInvitation,
  resendInvite,
  setInviteRole,
} from "@/modules/team/invitations";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";
const oli = "test-inv-oli"; // owns A
const max = "test-inv-max"; // manages A
const bea = "test-inv-bea"; // owns B
const ids = [oli, max, bea];
const sent: Array<{ to: string; subject: string; text: string }> = [];
const send = async (m: { to: string; subject: string; text: string }) => {
  sent.push(m);
  return { delivered: true };
};
const host = "admin.example.test";

beforeAll(async () => {
  await db.query(`delete from users where id = any($1) or email like '%@inv.invalid'`, [ids]);
  await db.query(`delete from sites where slug in ('inv-a','inv-b')`);
  siteA = (await db.query(`insert into sites (slug, name) values ('inv-a','Kini A') returning id`)).rows[0].id;
  siteB = (await db.query(`insert into sites (slug, name) values ('inv-b','Kini B') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Oli Ng','oli@inv.invalid',true,now()), ($2,'Max','max@inv.invalid',true,now()), ($3,'Bea','bea@inv.invalid',true,now())`,
    ids,
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'manager'), ($3,$5,'owner')`, [...ids, siteA, siteB]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1) or email like '%@inv.invalid'`, [ids]);
  await db.query(`delete from sites where slug in ('inv-a','inv-b')`);
  await db.end();
});

const token = (link: string) => link.split("/join/")[1];

describe("inviting", () => {
  test("an Owner invites; the email says who, what, the link and fourteen days", async () => {
    const r = await invite({ actorId: oli, siteId: siteA, email: " Sam@Inv.invalid ", role: "staff", host, send });
    expect(r).toMatchObject({ email: "sam@inv.invalid", role: "staff", status: "sent", emailed: true });
    expect(r.link).toMatch(/^https:\/\/admin\.example\.test\/join\/[\w-]{40,}$/);
    expect(sent.at(-1)).toMatchObject({ to: "sam@inv.invalid", subject: "Oli invited you to Kini A" });
    expect(sent.at(-1)!.text).toContain(r.link);
    expect(sent.at(-1)!.text).toContain("14 days");
    // Not on the team until they accept.
    const sam = (await db.query(`select id from users where email = 'sam@inv.invalid'`)).rows[0].id;
    expect(await membershipFor(sam, siteA)).toBeNull();
  });

  test("only Owners invite; someone already on the team points at the email", async () => {
    await expect(invite({ actorId: max, siteId: siteA, email: "x@inv.invalid", role: "staff", host, send })).rejects.toThrow(AccessError);
    await expect(invite({ actorId: bea, siteId: siteA, email: "x@inv.invalid", role: "staff", host, send })).rejects.toThrow(AccessError);
    await expect(invite({ actorId: oli, siteId: siteA, email: "max@inv.invalid", role: "staff", host, send })).rejects.toMatchObject({ field: "email" });
    await expect(invite({ actorId: oli, siteId: siteA, email: "nope", role: "staff", host, send })).rejects.toMatchObject({ issues: [{ path: ["email"] }] });
  });

  test("inviting the same address again resends the one already waiting", async () => {
    const again = await invite({ actorId: oli, siteId: siteA, email: "sam@inv.invalid", role: "manager", host, send });
    const list = await listInvitations({ actorId: oli, siteId: siteA, host });
    expect(list.filter((i) => i.email === "sam@inv.invalid")).toHaveLength(1);
    expect(again.role).toBe("manager");
  });

  test("Managers can see who's waiting; another site can't", async () => {
    expect((await listInvitations({ actorId: max, siteId: siteA, host })).map((i) => i.email)).toEqual(["sam@inv.invalid"]);
    await expect(listInvitations({ actorId: bea, siteId: siteA, host })).rejects.toThrow(AccessError);
  });
});

describe("waiting to accept", () => {
  test("change the role, resend, cancel — Owners only", async () => {
    const [inv] = await listInvitations({ actorId: oli, siteId: siteA, host });
    await setInviteRole({ actorId: oli, siteId: siteA, inviteId: inv.id, role: "staff" });
    await expect(setInviteRole({ actorId: max, siteId: siteA, inviteId: inv.id, role: "owner" })).rejects.toThrow(AccessError);
    const before = sent.length;
    await resendInvite({ actorId: oli, siteId: siteA, inviteId: inv.id, host, send });
    expect(sent.length).toBe(before + 1);
    const t = await invite({ actorId: oli, siteId: siteA, email: "tara@inv.invalid", role: "manager", host, send });
    await cancelInvite({ actorId: oli, siteId: siteA, inviteId: t.id });
    expect((await listInvitations({ actorId: oli, siteId: siteA, host })).map((i) => i.email)).toEqual(["sam@inv.invalid"]);
    expect((await openInvitation(token(t.link)))?.status).toBe("cancelled");
  });
});

describe("the link", () => {
  test("opening it says who invited you to what, and Team shows it was opened", async () => {
    const [inv] = await listInvitations({ actorId: oli, siteId: siteA, host });
    const seen = await openInvitation(token(inv.link));
    expect(seen).toMatchObject({ siteName: "Kini A", byName: "Oli", email: "sam@inv.invalid", role: "staff", status: "sent" });
    expect((await listInvitations({ actorId: oli, siteId: siteA, host }))[0].status).toBe("opened");
    expect(await openInvitation("not-a-real-token")).toBeNull();
  });

  test("accepting puts them on the team as the role it says, once", async () => {
    const [inv] = await listInvitations({ actorId: oli, siteId: siteA, host });
    const r = await acceptInvitation(token(inv.link));
    expect(r).toMatchObject({ email: "sam@inv.invalid", siteId: siteA });
    const sam = (await db.query(`select id from users where email = 'sam@inv.invalid'`)).rows[0].id;
    expect(await membershipFor(sam, siteA)).toBe("staff");
    await expect(acceptInvitation(token(inv.link))).resolves.toMatchObject({ email: "sam@inv.invalid" }); // a second click is harmless
    expect((await listInvitations({ actorId: oli, siteId: siteA, host }))[0].status).toBe("accepted");
    const lines = (await listActivity({ actorId: oli, siteId: siteA })).map((l) => `${l.who} ${l.before}${l.subject}${l.after}`);
    expect(lines).toContain("Sam joined the team as staff");
    expect(lines).toContain("Oli invited sam@inv.invalid as staff");
  });

  test("an expired link can't be used, but asks for a new one itself — once an hour", async () => {
    const r = await invite({ actorId: oli, siteId: siteA, email: "late@inv.invalid", role: "staff", host, send });
    await db.query(`update invitations set expires_at = now() - interval '1 day' where id = $1`, [r.id]);
    expect((await openInvitation(token(r.link)))?.status).toBe("expired");
    await expect(acceptInvitation(token(r.link))).rejects.toThrow(/expired/);
    const before = sent.length;
    expect(await askForNewLink(token(r.link), host, send)).toBe(true);
    expect(sent.at(-1)!.to).toBe("late@inv.invalid"); // to the invited address, never whoever clicked
    expect(sent.length).toBe(before + 1);
    expect((await openInvitation(token(r.link)))?.status).toBe("sent");
    await db.query(`update invitations set expires_at = now() - interval '1 day' where id = $1`, [r.id]);
    expect(await askForNewLink(token(r.link), host, send)).toBe(false); // asked within the hour
    await expect(acceptInvitation("not-a-real-token")).rejects.toThrow(/isn't/);
  });
});
