ALTER TABLE "sites" ADD COLUMN "domain" text;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "domain_www" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "domain_ok_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "launched_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "sites_domain_idx" ON "sites" USING btree ("domain");--> statement-breakpoint
-- Every site that already exists is live: Going live only holds back sites made from now on.
UPDATE "sites" SET "launched_at" = "created_at" WHERE "launched_at" IS NULL;--> statement-breakpoint
-- Like resolve_site(slug): the one way to find a site by a client's own domain before a site is current.
-- Owner-defined, answers exactly one question (the id for a host), nothing else about any site.
CREATE OR REPLACE FUNCTION resolve_host(p_host text) RETURNS uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM sites WHERE domain IS NOT NULL AND (domain = lower(p_host) OR 'www.' || domain = lower(p_host)) LIMIT 1 $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION resolve_host(text) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION resolve_host(text) TO app;
