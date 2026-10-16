CREATE TABLE "waiting" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant" text DEFAULT '' NOT NULL,
	"email" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"notified_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "weight" integer;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "ships_free" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "oversized" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "waiting" ADD CONSTRAINT "waiting_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "waiting" ADD CONSTRAINT "waiting_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "waiting_site_id_idx" ON "waiting" USING btree ("site_id");--> statement-breakpoint
CREATE INDEX "waiting_product_id_idx" ON "waiting" USING btree ("product_id");--> statement-breakpoint
CREATE UNIQUE INDEX "waiting_pending_idx" ON "waiting" USING btree ("product_id","variant","email") WHERE "waiting"."notified_at" is null;--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "waiting" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "waiting" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "waiting_current_site" ON "waiting"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "waiting" TO app;
