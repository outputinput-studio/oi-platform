/**
 * Fake data only. Runs with the migrator connection because the app role
 * is locked to one site at a time and cannot create sites.
 * Safe to run repeatedly: it only inserts what is missing.
 *
 * Never run against production. Production's first site and owner come
 * from the bootstrap in scripts/migrate.ts instead.
 */
import "dotenv/config";
import { Pool } from "pg";

const url = process.env.MIGRATE_DATABASE_URL;
if (!url) {
  console.error("MIGRATE_DATABASE_URL is not set");
  process.exit(1);
}

const demoSites = [
  { slug: "outputinput", name: "output/input", live: true },
  { slug: "demo", name: "Demo site", live: true },
  // Not launched yet: visitors get the holding page, the team a preview link (Settings · Domain).
  { slug: "soon", name: "Opening soon", live: false },
];

/** One person who owns both demo sites, so the site picker has something to show. */
const demoOwner = { email: "owner@example.com", name: "Demo Owner" };

const pool = new Pool({ connectionString: url, max: 1 });
(async () => {
  for (const s of demoSites) {
    await pool.query(`insert into sites (slug, name, launched_at) values ($1, $2, case when $3 then now() end) on conflict (slug) do nothing`, [s.slug, s.name, s.live]);
  }
  await pool.query(
    `insert into users (id, name, email, email_verified, updated_at)
     values (gen_random_uuid()::text, $1, $2, true, now()) on conflict (email) do nothing`,
    [demoOwner.name, demoOwner.email],
  );
  await pool.query(
    `insert into memberships (user_id, site_id, role)
     select u.id, s.id, 'owner' from users u, sites s
     where u.email = $1 and s.slug = any($2)
     on conflict (user_id, site_id) do nothing`,
    [demoOwner.email, demoSites.map((s) => s.slug)],
  );
  const { rows } = await pool.query(`select slug, name from sites order by slug`);
  console.log("sites:", rows);
  const m = await pool.query(`select count(*)::int as n from memberships`);
  console.log("memberships:", m.rows[0].n);
  await pool.end();
})();
