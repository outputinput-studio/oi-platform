/**
 * Who may do what, module by module (Carl, Oct 2026): an Owner does
 * everything; a Manager runs the shop and the site (refunds too) but not
 * the team, payment keys, the domain, custom code or going live; Staff
 * handle orders, the inbox and contacts. Each row names the least role
 * that may call the function; every role is tried against every row.
 * A refusal is the access check itself — a function that got past it and
 * then tripped over the made-up input below still counts as allowed.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import type { MembershipRole } from "@/db/schema";
import { AccessError } from "@/modules/auth/access";
import { atLeast } from "@/modules/auth/roles";
import { listActivity } from "@/modules/activity/server";
import { createContact, findDuplicates, listContacts } from "@/modules/contacts/server";
import { updateAccountSettings } from "@/modules/customers/admin";
import { createForm, listForms, listSubmissions } from "@/modules/forms/server";
import { listMedia } from "@/modules/media/server";
import { listOrders, moveOrder, refundOrder, sendTemplateTest } from "@/modules/orders/admin";
import { createPage, listPages } from "@/modules/pages/server";
import { planView } from "@/modules/plans/server";
import { removeStripeKeys, saveStripeKeys } from "@/modules/payments/server";
import { listProducts } from "@/modules/products/server";
import { saveCustomCode } from "@/modules/sites/custom-code";
import { connectDomain, domainStatus } from "@/modules/sites/domain";
import { hideSite, launchSite, teamPreviewPass } from "@/modules/sites/launch";
import { setUpSendingDomain } from "@/modules/sites/sending-domain";
import { renameSite, siteSettings, updateAnalytics, updateCookieNotice, updateShopSettings, updateTheme } from "@/modules/sites/server";
import { addMember, listMembers, setRole } from "@/modules/team/server";

const db = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let site = "";
const people: Record<MembershipRole, string> = { owner: "test-roles-owen", manager: "test-roles-mia", staff: "test-roles-sam" };
const ids = Object.values(people);
const noOrder = "00000000-0000-4000-8000-000000000000";

beforeAll(async () => {
  await db.query(`delete from users where id = any($1) or email like '%@roles.invalid'`, [ids]);
  await db.query(`delete from sites where slug = 'roles-a'`);
  site = (await db.query(`insert into sites (slug, name) values ('roles-a','Roles A') returning id`)).rows[0].id;
  await db.query(
    `insert into users (id, name, email, email_verified, updated_at) values ($1,'Owen','owen@roles.invalid',true,now()), ($2,'Mia','mia@roles.invalid',true,now()), ($3,'Sam','sam@roles.invalid',true,now())`,
    ids,
  );
  await db.query(`insert into memberships (user_id, site_id, role) values ($1,$4,'owner'), ($2,$4,'manager'), ($3,$4,'staff')`, [...ids, site]);
});

afterAll(async () => {
  await db.query(`delete from users where id = any($1) or email like '%@roles.invalid'`, [ids]);
  await db.query(`delete from sites where slug = 'roles-a'`);
  await db.end();
});

type Call = (actorId: string, siteId: string) => Promise<unknown>;

const rows: Array<[string, MembershipRole, Call]> = [
  // Staff: orders, the inbox, contacts.
  ["see orders", "staff", (actorId, siteId) => listOrders({ actorId, siteId })],
  ["move an order", "staff", (actorId, siteId) => moveOrder({ actorId, siteId, orderId: noOrder, change: { status: "nope" } })],
  ["read the inbox", "staff", (actorId, siteId) => listSubmissions({ actorId, siteId })],
  ["see which forms the inbox holds", "staff", (actorId, siteId) => listForms({ actorId, siteId })],
  ["see contacts", "staff", (actorId, siteId) => listContacts({ actorId, siteId })],
  ["add a contact", "staff", (actorId, siteId) => createContact({ actorId, siteId, details: { name: `Contact by ${actorId}` } })],
  ["see duplicates", "staff", (actorId, siteId) => findDuplicates({ actorId, siteId })],
  ["preview the site before it's live", "staff", (actorId, siteId) => teamPreviewPass({ actorId, siteId })],
  // Managers: the shop and the site.
  ["refund an order", "manager", (actorId, siteId) => refundOrder({ actorId, siteId, orderId: noOrder, refund: {} })],
  ["see pages", "manager", (actorId, siteId) => listPages({ actorId, siteId })],
  ["add a page", "manager", (actorId, siteId) => createPage({ actorId, siteId, title: `Page by ${actorId}` })],
  ["see products", "manager", (actorId, siteId) => listProducts({ actorId, siteId })],
  ["see images", "manager", (actorId, siteId) => listMedia({ actorId, siteId })],
  ["build a form", "manager", (actorId, siteId) => createForm({ actorId, siteId, name: `Form by ${actorId}` })],
  ["see Activity", "manager", (actorId, siteId) => listActivity({ actorId, siteId })],
  ["see the team", "manager", (actorId, siteId) => listMembers({ actorId, siteId })],
  ["see settings", "manager", (actorId, siteId) => siteSettings({ actorId, siteId })],
  ["rename the site", "manager", (actorId, siteId) => renameSite({ actorId, siteId, name: "Roles A" })],
  ["change the theme", "manager", (actorId, siteId) => updateTheme({ actorId, siteId, theme: {} })],
  ["change shop settings", "manager", (actorId, siteId) => updateShopSettings({ actorId, siteId, settings: {} })],
  ["set analytics", "manager", (actorId, siteId) => updateAnalytics({ actorId, siteId, analytics: {} })],
  ["set the cookie notice", "manager", (actorId, siteId) => updateCookieNotice({ actorId, siteId, notice: { enabled: false } })],
  ["set customer accounts", "manager", (actorId, siteId) => updateAccountSettings({ actorId, siteId, settings: {} })],
  ["send a test email", "manager", (actorId, siteId) => sendTemplateTest({ actorId, siteId, to: "x@roles.invalid", key: "nope", template: {} })],
  ["see the domain", "manager", (actorId, siteId) => domainStatus({ actorId, siteId })],
  // Owners only.
  ["add to the team", "owner", (actorId, siteId) => addMember({ actorId, siteId, email: "new@roles.invalid" })],
  ["change a role", "owner", (actorId, siteId) => setRole({ actorId, siteId, userId: people.staff, role: "staff" })],
  ["save payment keys", "owner", (actorId, siteId) => saveStripeKeys({ actorId, siteId, secretKey: "nope" })],
  ["remove payment keys", "owner", (actorId, siteId) => removeStripeKeys({ actorId, siteId })],
  ["connect a domain", "owner", (actorId, siteId) => connectDomain({ actorId, siteId, domain: "not a domain" })],
  ["set up a sending domain", "owner", (actorId, siteId) => setUpSendingDomain({ actorId, siteId, domain: "", local: "" })],
  ["change custom code", "owner", (actorId, siteId) => saveCustomCode({ actorId, siteId, code: { head: "", body: "" } })],
  ["launch the site", "owner", (actorId, siteId) => launchSite({ actorId, siteId })],
  ["hide the site", "owner", (actorId, siteId) => hideSite({ actorId, siteId })],
  ["see the plan and usage", "owner", (actorId, siteId) => planView({ actorId, siteId })],
];

/** True unless the access check said no. */
async function allowed(call: Call, actorId: string): Promise<boolean> {
  try {
    await call(actorId, site);
    return true;
  } catch (err) {
    if (err instanceof AccessError && /^Only |not a member/.test(err.message)) return false;
    return true;
  }
}

describe.each(["staff", "manager", "owner"] as const)("%s", (role) => {
  test.each(rows)("%s (needs %s)", async (_what, min, call) => {
    expect(await allowed(call, people[role])).toBe(atLeast(role, min));
  });
});

describe("refusals say who can", () => {
  test("a manager-level change, tried by staff", async () => {
    await expect(listPages({ actorId: people.staff, siteId: site })).rejects.toThrow("Only an owner or a manager can do that.");
  });
  test("an owner-level change, tried by a manager", async () => {
    await expect(saveCustomCode({ actorId: people.manager, siteId: site, code: {} })).rejects.toThrow("Only an owner can do that.");
  });
});
