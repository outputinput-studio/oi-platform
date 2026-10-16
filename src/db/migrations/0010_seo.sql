ALTER TABLE "articles" ADD COLUMN "seo" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "pages" ADD COLUMN "seo" jsonb DEFAULT '{}'::jsonb NOT NULL;