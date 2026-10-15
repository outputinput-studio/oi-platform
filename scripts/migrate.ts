/**
 * Applies pending migrations with the MIGRATOR connection (table owner).
 * Runs at the start of every Vercel build, so a failed migration is a
 * failed deploy and nothing half-done ever goes live.
 *
 * Never point MIGRATE_DATABASE_URL at production from anywhere but Vercel
 * production. Locally it points at your own dev branch.
 */
import "dotenv/config";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is not set");
  process.exit(1);
}

const pool = new Pool({ connectionString: url, max: 1 });
const db = drizzle({ client: pool });

migrate(db, { migrationsFolder: "./src/db/migrations" })
  .then(() => console.log("migrations: up to date"))
  .catch((err) => {
    console.error("migration failed", err);
    process.exit(1);
  })
  .finally(() => pool.end());
