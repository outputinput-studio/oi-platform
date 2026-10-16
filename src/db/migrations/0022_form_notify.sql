ALTER TABLE "forms" ADD COLUMN "notify_on" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "notify_cc" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "notify_bcc" text DEFAULT '' NOT NULL;