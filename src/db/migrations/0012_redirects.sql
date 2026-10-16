CREATE TABLE "not_found_hits" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"path" text NOT NULL,
	"hits" integer DEFAULT 1 NOT NULL,
	"referrer" text DEFAULT '' NOT NULL,
	"last_seen" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redirects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"from_path" text NOT NULL,
	"to_path" text NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"hits" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "not_found_hits" ADD CONSTRAINT "not_found_hits_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redirects" ADD CONSTRAINT "redirects_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "not_found_site_path_idx" ON "not_found_hits" USING btree ("site_id","path");--> statement-breakpoint
CREATE INDEX "not_found_site_id_idx" ON "not_found_hits" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redirects_site_from_idx" ON "redirects" USING btree ("site_id","from_path");--> statement-breakpoint
CREATE INDEX "redirects_site_id_idx" ON "redirects" USING btree ("site_id");--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "redirects" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "redirects" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "redirects_current_site" ON "redirects"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "redirects" TO app;--> statement-breakpoint
ALTER TABLE "not_found_hits" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "not_found_hits" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "not_found_hits_current_site" ON "not_found_hits"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "not_found_hits" TO app;
