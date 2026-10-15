CREATE TABLE "pages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"published_at" timestamp with time zone,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"page_id" uuid NOT NULL,
	"type" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"data" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "pages" ADD CONSTRAINT "pages_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sections" ADD CONSTRAINT "sections_page_id_pages_id_fk" FOREIGN KEY ("page_id") REFERENCES "public"."pages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "pages_site_slug_idx" ON "pages" USING btree ("site_id","slug") WHERE "pages"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "pages_site_id_idx" ON "pages" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "sections_page_id_idx" ON "sections" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "sections_site_id_idx" ON "sections" USING btree ("site_id");--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0000_sites.sql).
ALTER TABLE "pages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "pages" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "pages_current_site" ON "pages"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "pages" TO app;--> statement-breakpoint
ALTER TABLE "sections" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sections" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "sections_current_site" ON "sections"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "sections" TO app;
--> statement-breakpoint
-- The storefront learns which site a hostname belongs to before any site
-- is current, and `sites` is locked by id. This function runs as the table
-- owner and answers exactly one question: the id for a slug. Nothing else
-- about any site is reachable through it.
CREATE OR REPLACE FUNCTION resolve_site(p_slug text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM sites WHERE slug = p_slug $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_site(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_site(text) TO app;
