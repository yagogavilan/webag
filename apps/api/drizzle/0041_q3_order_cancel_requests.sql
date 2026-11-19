CREATE TABLE "order_cancel_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reason" varchar(200),
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"decision_note" varchar(200),
	"alerted_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "order_cancel_requests" ADD CONSTRAINT "order_cancel_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "order_cancel_requests_open_uq" ON "order_cancel_requests" USING btree ("order_id") WHERE "order_cancel_requests"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "order_cancel_requests_order_idx" ON "order_cancel_requests" USING btree ("order_id","requested_at");