CREATE TABLE "plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"price" integer NOT NULL,
	"currency" text NOT NULL,
	"limits" jsonb NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "plan_id" uuid;--> statement-breakpoint
-- O/I's own price list: a platform table (no client data), so no RLS — like users and memberships.
-- Only module functions that check for O/I support write to it.
GRANT SELECT, INSERT, UPDATE, DELETE ON "plans" TO app;
