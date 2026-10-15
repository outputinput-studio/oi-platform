/**
 * Applies pending migrations with the MIGRATOR connection (table owner).
 * Runs at the start of every Vercel build, so a failed migration is a
 * failed deploy and nothing half-done ever goes live.
 *
 * It also keeps the app role's password in step with DATABASE_URL, so the
 * password you set in Vercel is the one the database expects. No separate
 * step in Neon, nothing to keep in sync by hand.
 *
 * Never point MIGRATE_DATABASE_URL at production from anywhere but Vercel
 * production. Locally it points at your own dev branch.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.MIGRATE_DATABASE_URL;
const appUrl = process.env.DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool });

/** host + database of a connection string, never the password. */
function describe(connectionString: string) {
  const u = new URL(connectionString);
  return `${u.hostname}${u.pathname}`;
}

/** Neon's pooled endpoint is the same database as its direct one. */
function sameDatabase(a: string, b: string) {
  return describe(a).replace("-pooler", "") === describe(b).replace("-pooler", "");
}

console.log(`migrator → ${describe(url)}`);
if (appUrl) {
  console.log(`app      → ${describe(appUrl)}`);
  if (!sameDatabase(url, appUrl)) {
    console.warn(
      "WARNING: MIGRATE_DATABASE_URL and DATABASE_URL point at different databases. " +
        "Migrations and the app password sync will land somewhere the app never connects to.",
    );
  }
}

/**
 * The app role must exist BEFORE migrations run: the very first migration
 * grants it access. On a fresh database (CI, a new Neon branch) this is what
 * creates it. Created by SQL on purpose: roles made in Neon's console get
 * BYPASSRLS, which would quietly switch the tenancy lock off.
 */
async function ensureAppRole() {
  await pool.query(
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = 'app') then
         create role app login nobypassrls;
       end if;
     end $$`,
  );
}

async function syncAppRole() {
  if (!appUrl) return;
  const u = new URL(appUrl);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (user !== "app" || !password) return;
  await pool
    .query(`alter role app with login nobypassrls password $1`, [password])
    .catch(async (err) => {
      // Parameters are not allowed in ALTER ROLE; fall back to a safely quoted literal.
      if (err?.code !== "42601") throw err;
      const { rows } = await pool.query(
        `select format('alter role app with login nobypassrls password %L', $1::text) as q`,
        [password],
      );
      await pool.query(rows[0].q);
    });
  console.log("app role: password in step with DATABASE_URL");
}

/**
 * First site and first owner, from environment, so production can be born
 * without anyone running SQL by hand and without a name in the code:
 *
 *   OI_BOOTSTRAP_SITE_SLUG=outputinput
 *   OI_BOOTSTRAP_SITE_NAME="output/input"
 *   OI_BOOTSTRAP_OWNER_EMAIL=you@example.com
 *
 * Idempotent: creates what is missing, touches nothing that exists.
 */
async function bootstrap() {
  const slug = process.env.OI_BOOTSTRAP_SITE_SLUG;
  const name = process.env.OI_BOOTSTRAP_SITE_NAME;
  const email = process.env.OI_BOOTSTRAP_OWNER_EMAIL?.trim().toLowerCase();
  if (!slug || !name || !email) return;
  await pool.query(`insert into sites (slug, name) values ($1, $2) on conflict (slug) do nothing`, [slug, name]);
  await pool.query(
    `insert into users (id, name, email, email_verified, updated_at)
     values (gen_random_uuid()::text, $1, $2, true, now()) on conflict (email) do nothing`,
    [email.split("@")[0], email],
  );
  await pool.query(
    `insert into memberships (user_id, site_id, role)
     select u.id, s.id, 'owner' from users u, sites s where u.email = $1 and s.slug = $2
     on conflict (user_id, site_id) do nothing`,
    [email, slug],
  );
  console.log(`bootstrap: site "${slug}" has an owner`);
}

(async () => {
  try {
    await ensureAppRole();
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("migrations: up to date");
    await syncAppRole();
    await bootstrap();
  } catch (err) {
    console.error("migration failed", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
