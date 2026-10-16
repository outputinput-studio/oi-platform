CREATE TABLE "discount_codes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"code" text NOT NULL,
	"kind" text DEFAULT 'percent' NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"applies_to" text DEFAULT 'all' NOT NULL,
	"category_id" uuid,
	"product_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"min_spend" integer,
	"max_uses" integer,
	"per_person" integer,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"active" boolean DEFAULT true NOT NULL,
	"uses" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount_code" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "discount" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "discount_codes" ADD CONSTRAINT "discount_codes_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "discount_codes_site_code_idx" ON "discount_codes" USING btree ("site_id","code") WHERE "discount_codes"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "discount_codes_site_id_idx" ON "discount_codes" USING btree ("site_id");--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "discount_codes" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "discount_codes" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "discount_codes_current_site" ON "discount_codes"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "discount_codes" TO app;
