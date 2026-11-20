ALTER TABLE "push_campaigns" ADD COLUMN "attempts" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "push_campaigns" ADD COLUMN "sending_started_at" timestamp with time zone;