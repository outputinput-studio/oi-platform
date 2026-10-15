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

async function syncAppRole() {
  if (!appUrl) return;
  const u = new URL(appUrl);
  const user = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (user !== "app" || !password) return;
  // Create the role if it is missing (CI, a fresh branch), otherwise just set the password.
  await pool.query(
    `do $$ begin
       if not exists (select 1 from pg_roles where rolname = 'app') then
         create role app login nobypassrls;
       end if;
     end $$`,
  );
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

(async () => {
  try {
    await migrate(db, { migrationsFolder: "./src/db/migrations" });
    console.log("migrations: up to date");
    await syncAppRole();
  } catch (err) {
    console.error("migration failed", err);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
