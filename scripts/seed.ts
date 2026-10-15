/**
 * Fake data only. Runs with the migrator connection because the app role
 * is locked to one site at a time and cannot create sites.
 * Safe to run repeatedly: it only inserts what is missing.
 */
import "dotenv/config";
import { Pool } from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is not set");
  process.exit(1);
}

const demoSites = [
  { slug: "outputinput", name: "output/input" },
  { slug: "demo", name: "Demo site" },
];

const pool = new Pool({ connectionString: url, max: 1 });
(async () => {
  for (const s of demoSites) {
    await pool.query(
      `insert into sites (slug, name) values ($1, $2) on conflict (slug) do nothing`,
      [s.slug, s.name],
    );
  }
  const { rows } = await pool.query(`select slug, name from sites order by slug`);
  console.log("sites:", rows);
  await pool.end();
})();
