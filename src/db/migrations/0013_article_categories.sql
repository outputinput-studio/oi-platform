CREATE TABLE "article_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text NOT NULL,
	"slug" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "category_id" uuid;--> statement-breakpoint
ALTER TABLE "articles" ADD COLUMN "category_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "article_categories" ADD CONSTRAINT "article_categories_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "article_categories_site_slug_idx" ON "article_categories" USING btree ("site_id","slug") WHERE "article_categories"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "article_categories_site_id_idx" ON "article_categories" USING btree ("site_id");--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "article_categories" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "article_categories" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "article_categories_current_site" ON "article_categories"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "article_categories" TO app;
