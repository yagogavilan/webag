ALTER TABLE "orders" ALTER COLUMN "pickup_code" SET DATA TYPE varchar(6);--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD COLUMN "refund_late_alerted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "accept_reminded_at" timestamp with time zone;