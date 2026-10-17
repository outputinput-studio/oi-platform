CREATE TABLE "export_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"site_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"requested_by" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"downloaded_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "export_links" ADD CONSTRAINT "export_links_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "export_links_token_idx" ON "export_links" USING btree ("token_hash");--> statement-breakpoint
ALTER TABLE "export_links" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "export_links" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "export_links_current_site" ON "export_links"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "export_links" TO app;
