ALTER TABLE "payment_attempts" ADD COLUMN "receiver_account_id" text;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "failures" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "next_attempt_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "last_error_code" text;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "covered_by" uuid;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "covered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "coverage_reason" text;