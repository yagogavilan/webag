ALTER TABLE "orders" ADD COLUMN "store_notified_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "notify_new_order_email" boolean DEFAULT true NOT NULL;