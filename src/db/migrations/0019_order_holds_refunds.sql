ALTER TABLE "orders" ADD COLUMN "cart_ref" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "refunded" integer DEFAULT 0 NOT NULL;