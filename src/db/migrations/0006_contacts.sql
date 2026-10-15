CREATE TABLE "contacts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"name" text DEFAULT '' NOT NULL,
	"email" text DEFAULT '' NOT NULL,
	"phone" text DEFAULT '' NOT NULL,
	"notes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "create_contact" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "contact_id" uuid;--> statement-breakpoint
ALTER TABLE "contacts" ADD CONSTRAINT "contacts_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "contacts_site_id_idx" ON "contacts" USING btree ("site_id");--> statement-breakpoint
CREATE UNIQUE INDEX "contacts_site_email_idx" ON "contacts" USING btree ("site_id","email") WHERE "contacts"."deleted_at" is null and "contacts"."email" <> '';--> statement-breakpoint
-- The tenancy lock, as on every client table (see 0002_pages.sql).
ALTER TABLE "contacts" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "contacts" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "contacts_current_site" ON "contacts"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "contacts" TO app;
