CREATE TABLE "sites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "sites_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
-- Tenancy lock. Every client-owned table gets these four statements.
-- FORCE matters: without it the table owner (the migrator) would skip the policy.
ALTER TABLE "sites" ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
ALTER TABLE "sites" FORCE ROW LEVEL SECURITY;
--> statement-breakpoint
-- NULLIF matters: on a pooled connection an unset setting reads as '' not NULL,
-- and ''::uuid throws. With NULLIF an unset site simply matches nothing.
CREATE POLICY "sites_current_site" ON "sites"
  USING ("id" = NULLIF(current_setting('app.site_id', true), '')::uuid);
--> statement-breakpoint
-- The app role owns nothing and gets exactly what it needs, table by table.
GRANT USAGE ON SCHEMA public TO app;
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sites" TO app;
