import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";

/**
 * The tenant. Every client-owned table in the platform carries site_id and
 * is locked by row-level security to the current site. `sites` itself is the
 * one tenant table whose policy compares its own id.
 */
export const sites = pgTable("sites", {
  id: uuid("id").primaryKey().defaultRandom(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export type Site = typeof sites.$inferSelect;
