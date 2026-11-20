CREATE TABLE "payment_refund_intents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"attempt_id" uuid NOT NULL,
	"idempotency_key" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"reason" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"provider_refund_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "payment_attempts" ALTER COLUMN "provider_payment_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "payment_attempts" ALTER COLUMN "status" SET DEFAULT 'creating';--> statement-breakpoint
ALTER TABLE "payment_refund_intents" ADD CONSTRAINT "payment_refund_intents_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "payment_refund_intents_key_uq" ON "payment_refund_intents" USING btree ("attempt_id","idempotency_key");--> statement-breakpoint
CREATE INDEX "payment_refund_intents_pending_idx" ON "payment_refund_intents" USING btree ("status","updated_at");