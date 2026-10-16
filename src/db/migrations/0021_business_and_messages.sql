ALTER TABLE "sites" ADD COLUMN "business" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "sites" ADD COLUMN "messages" jsonb DEFAULT '{}'::jsonb NOT NULL;