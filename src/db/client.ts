import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";
import * as schema from "./schema";
import { env } from "@/lib/env";

/**
 * The ONLY file that creates a database connection. Everything else goes
 * through withSite(). Lint enforces this.
 *
 * node-postgres works against Neon's pooled connection string in production
 * and against a plain Postgres container in CI, which keeps tests honest.
 */
const globalForDb = globalThis as unknown as { oiPool?: Pool };

function pool(): Pool {
  if (!globalForDb.oiPool) {
    globalForDb.oiPool = new Pool({ connectionString: env().DATABASE_URL, max: 5 });
  }
  return globalForDb.oiPool;
}

export const db = drizzle({ client: pool(), schema });
export type Db = typeof db;
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/**
 * Run `fn` inside a transaction scoped to one site.
 *
 * SET LOCAL lives only for this transaction, so pooled connections can never
 * leak a site into the next request. Row-level security then filters every
 * query to rows where site_id matches. A query run outside withSite() sees
 * nothing at all, and that is tested.
 */
export async function withSite<T>(siteId: string, fn: (tx: Tx) => Promise<T>): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.site_id', ${siteId}, true)`);
    return fn(tx);
  });
}

/** For tests and health checks only: proves the database answers. */
export async function ping(): Promise<boolean> {
  const r = await db.execute(sql`select 1 as ok`);
  return r.rows.length === 1;
}
