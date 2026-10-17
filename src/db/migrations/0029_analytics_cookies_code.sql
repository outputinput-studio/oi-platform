ALTER TABLE "sites" ADD COLUMN "analytics" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "cookies" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "custom_code" jsonb DEFAULT '{}'::jsonb NOT NULL;