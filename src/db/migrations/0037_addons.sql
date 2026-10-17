CREATE TABLE "addons" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"currency" text NOT NULL,
	"kind" text NOT NULL,
	"amount" integer,
	"self_serve" boolean DEFAULT true NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"stripe_product_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "site_addons" (
	"site_id" uuid NOT NULL,
	"addon_id" uuid NOT NULL,
	"added_by" text,
	"stripe_item_id" text,
	"added_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "site_addons" ADD CONSTRAINT "site_addons_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "site_addons_site_addon_idx" ON "site_addons" USING btree ("site_id","addon_id");--> statement-breakpoint
-- O/I's own add-on list: a platform table (no client data), like plans. Only support changes it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "addons" TO app;--> statement-breakpoint
ALTER TABLE "site_addons" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "site_addons" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "site_addons_current_site" ON "site_addons"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "site_addons" TO app;
