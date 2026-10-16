/**
 * Each site's own Stripe keys: owners only, checked, stored encrypted,
 * never readable from the database, and the site lock.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { AccessError } from "@/modules/auth/access";
import { paymentsStatus, removeStripeKeys, saveStripeKeys, siteWebhookSecret } from "@/modules/payments/server";
import { siteFromHost } from "@/modules/sites/server";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteId = "";
const own = "test-payments-owner";
const staff = "test-payments-staff";
const KEY = "rk_test_51AbCdEfGhIjKlMnOpQr";
const HOOK = "whsec_AbCdEfGhIjKlMnOp1234";
const fine = async () => ({ accountId: "acct_123", businessName: "Kini Kouture", chargesEnabled: true });

beforeAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug = 'payments-a'`);
  siteId = (await owner.query(`insert into sites (slug, name) values ('payments-a','Payments A') returning id`)).rows[0].id;
  await owner.query(`insert into users (id, name, email, email_verified, updated_at) values ($1,'Own','own@payments.invalid',true,now()), ($2,'Staff','staff@payments.invalid',true,now())`, [own, staff]);
  await owner.query(`insert into memberships (user_id, site_id, role) values ($1,$3,'owner'), ($2,$3,'staff')`, [own, staff, siteId]);
});

afterAll(async () => {
  await owner.query(`delete from users where id in ($1,$2)`, [own, staff]);
  await owner.query(`delete from sites where slug = 'payments-a'`);
  await owner.end();
});

describe("a site's own Stripe", () => {
  test("only an owner puts keys in, and only real-looking ones", async () => {
    await expect(saveStripeKeys({ actorId: staff, siteId, secretKey: KEY, check: fine })).rejects.toBeInstanceOf(AccessError);
    await expect(saveStripeKeys({ actorId: own, siteId, secretKey: "pk_live_publishable123456", check: fine })).rejects.toThrow(/secret key/);
    await expect(saveStripeKeys({ actorId: own, siteId, secretKey: KEY, webhookSecret: "nope", check: fine })).rejects.toThrow(/whsec_/);
    await expect(
      saveStripeKeys({
        actorId: own,
        siteId,
        secretKey: KEY,
        check: async () => {
          throw new Error("Stripe didn't accept that key.");
        },
      }),
    ).rejects.toThrow(/didn't accept/);
    expect(paymentsStatus((await siteFromHost("payments-a.localhost"))!)).toMatchObject({ provider: "test", hasKeys: false });
  });

  test("saved keys are encrypted at rest, and the shop takes payments through them", async () => {
    const s = await saveStripeKeys({ actorId: own, siteId, secretKey: KEY, webhookSecret: HOOK, check: fine });
    expect(s).toMatchObject({ provider: "stripe", ready: true, hasKeys: true, hasWebhook: true, keyLast4: "OpQr", livemode: false, businessName: "Kini Kouture" });
    expect(s).not.toHaveProperty("secretKey");
    const raw = JSON.stringify((await owner.query(`select payments from sites where id = $1`, [siteId])).rows[0].payments);
    expect(raw).not.toContain(KEY);
    expect(raw).not.toContain(HOOK);
    const site = (await siteFromHost("payments-a.localhost"))!;
    expect(siteWebhookSecret(site)).toBe(HOOK);

    // A new key with the webhook left empty keeps the saved webhook secret.
    await saveStripeKeys({ actorId: own, siteId, secretKey: "sk_live_ZyXwVuTsRqPoNmLk", check: async () => ({ accountId: "acct_123", businessName: "", chargesEnabled: false }) });
    const after = (await siteFromHost("payments-a.localhost"))!;
    expect(paymentsStatus(after)).toMatchObject({ livemode: true, ready: false, hasWebhook: true, keyLast4: "NmLk" });
    expect(siteWebhookSecret(after)).toBe(HOOK);

    await expect(removeStripeKeys({ actorId: staff, siteId })).rejects.toBeInstanceOf(AccessError);
    await removeStripeKeys({ actorId: own, siteId });
    expect(paymentsStatus((await siteFromHost("payments-a.localhost"))!)).toMatchObject({ hasKeys: false, provider: "test" });
  });
});
