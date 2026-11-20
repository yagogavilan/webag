ALTER TABLE "deliveries" ADD COLUMN "eta_to_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "deliveries" ADD COLUMN "late_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_from_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "eta_to_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "store_settings" ADD COLUMN "prep_minutes" integer;