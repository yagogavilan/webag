ALTER TABLE "exchange_requests" ADD COLUMN "reminder12_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD COLUMN "reminder4_sent_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD COLUMN "contested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD COLUMN "contestation_text" varchar(500);--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD COLUMN "mediation_started_at" timestamp with time zone;