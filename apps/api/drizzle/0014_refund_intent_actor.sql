ALTER TABLE "payment_refund_intents" ADD COLUMN "actor_id" uuid;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "actor_role" text;--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD COLUMN "request_id" text;