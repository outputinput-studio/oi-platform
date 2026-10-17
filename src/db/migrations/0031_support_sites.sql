-- O/I support (Stage 38) looks after every site, so its site picker needs
-- every site's id before any one is current — and `sites` is locked by id.
-- Like resolve_site(), this runs as the table owner and answers exactly one
-- question: which site ids exist. Names and everything else are still read
-- one site at a time through withSite(), and only for a support address
-- (src/modules/auth/access.ts decides who that is).
CREATE OR REPLACE FUNCTION all_site_ids() RETURNS SETOF uuid
  LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
  AS $$ SELECT id FROM sites $$;--> statement-breakpoint
REVOKE ALL ON FUNCTION all_site_ids() FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION all_site_ids() TO app;
