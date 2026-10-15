ALTER TABLE "forms" ADD COLUMN "auto_reply" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "reply_subject" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "forms" ADD COLUMN "reply_message" text DEFAULT '' NOT NULL;