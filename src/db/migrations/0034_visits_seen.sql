CREATE TABLE "visits_seen" (
	"site_id" uuid NOT NULL,
	"day" text NOT NULL,
	"visitor" text NOT NULL
);
--> statement-breakpoint
ALTER TABLE "visits_seen" ADD CONSTRAINT "visits_seen_site_id_sites_id_fk" FOREIGN KEY ("site_id") REFERENCES "public"."sites"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "visits_seen_site_day_visitor_idx" ON "visits_seen" USING btree ("site_id","day","visitor");--> statement-breakpoint
ALTER TABLE "visits_seen" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "visits_seen" FORCE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "visits_seen_current_site" ON "visits_seen"
  USING ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid)
  WITH CHECK ("site_id" = NULLIF(current_setting('app.site_id', true), '')::uuid);--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON "visits_seen" TO app;
