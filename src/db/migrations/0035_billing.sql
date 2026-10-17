CREATE TABLE "billing" (
	"site_id" uuid PRIMARY KEY NOT NULL,
	"provider" text NOT NULL,
	"customer_id" text,
	"subscription_id" text,
	"status" text NOT NULL,
	"price" integer NOT NULL,
	"currency" text NOT NULL,
	"renews_at" timestamp with time zone,
	"card_brand" text,
	"card_last4" text,
	"card_expires" text,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "billing" ADD CONSTRAINT "billing_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "billing" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "billing" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "billing_current_site" ON "billing"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "billing" TO app;
