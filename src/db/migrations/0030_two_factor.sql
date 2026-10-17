CREATE TABLE "two_factors" (
	"user_id" text PRIMARY KEY NOT NULL,
	"secret" text NOT NULL,
	"confirmed_at" timestamp with time zone,
	"recovery" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"last_step" bigint,
	"misses" integer DEFAULT 0 NOT NULL,
	"strikes" integer DEFAULT 0 NOT NULL,
	"locked_until" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "sessions" ADD COLUMN "two_factor_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "two_factors" ADD CONSTRAINT "two_factors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
-- A platform table, like sessions: it belongs to a person, not a site, so no
-- row-level security. The app role reads and writes it directly; every
-- function in src/modules/auth/two-factor.ts works on one person's row.
GRANT SELECT, INSERT, UPDATE, DELETE ON "two_factors" TO app;
