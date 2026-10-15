CREATE TABLE "articles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"excerpt" text DEFAULT '' NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"cover" jsonb,
	"author" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"published_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "articles" ADD CONSTRAINT "articles_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "articles_site_slug_idx" ON "articles" USING btree ("site_id","slug") WHERE "articles"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "articles_site_id_idx" ON "articles" USING btree ("site_id");--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "articles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "articles" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "articles_current_site" ON "articles"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "articles" TO app;
