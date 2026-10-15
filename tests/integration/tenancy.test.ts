/**
 * The tenancy lock, proven against a real Postgres with the migration applied.
 * Needs DATABASE_URL (app role) and MIGRATE_DATABASE_URL (owner). CI provides
 * both from a throwaway container; locally they are your own dev branch.
 */
import { beforeAll, afterAll, describe, expect, test } from "vitest";
import { Pool } from "pg";
import { sql } from "drizzle-orm";
import { db, withSite } from "@/db/client";
import { sites } from "@/db/schema";

const owner = new Pool({ connectionString: process.env.MIGRATE_DATABASE_URL, max: 1 });
let siteA = "";
let siteB = "";

beforeAll(async () => {
  await owner.query(`delete from sites where slug in ('test-a','test-b')`);
  const a = await owner.query(`insert into sites (slug, name) values ('test-a','A') returning id`);
  const b = await owner.query(`insert into sites (slug, name) values ('test-b','B') returning id`);
  siteA = a.rows[0].id;
  siteB = b.rows[0].id;
});

afterAll(async () => {
  await owner.query(`delete from sites where slug in ('test-a','test-b')`);
  await owner.end();
});

describe("row-level security", () => {
  test("a query outside withSite returns no rows", async () => {
    const rows = await db.select().from(sites);
    expect(rows).toHaveLength(0);
  });

  test("inside withSite, only the current site is visible", async () => {
    const rows = await withSite(siteA, (tx) => tx.select().from(sites));
    expect(rows.map((r) => r.id)).toEqual([siteA]);
  });

  test("site A cannot read site B even with a valid id", async () => {
    const rows = await withSite(siteA, (tx) => tx.select().from(sites).where(sql`${sites.id} = ${siteB}`));
    expect(rows).toHaveLength(0);
  });

  test("the site setting does not leak between transactions", async () => {
    await withSite(siteB, (tx) => tx.select().from(sites));
    const rows = await db.select().from(sites);
    expect(rows).toHaveLength(0);
  });

  test("the app role owns no tables and cannot bypass RLS", async () => {
    const role = await db.execute(sql`select rolbypassrls, rolsuper from pg_roles where rolname = current_user`);
    expect(role.rows[0]).toMatchObject({ rolbypassrls: false, rolsuper: false });
    const owned = await db.execute(
      sql`select count(*)::int as n from pg_tables where schemaname = 'public' and tableowner = current_user`,
    );
    expect(owned.rows[0].n).toBe(0);
  });

  test("every public table has forced row-level security", async () => {
    const r = await owner.query(
      `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relkind = 'r' and relname <> '__drizzle_migrations'
         and not (c.relrowsecurity and c.relforcerowsecurity)`,
    );
    expect(r.rows).toEqual([]);
  });
});
