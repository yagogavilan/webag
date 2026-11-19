CREATE TABLE "exchange_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"exchange_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"reason" varchar(200),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "exchange_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(12) NOT NULL,
	"order_id" uuid NOT NULL,
	"order_item_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"type" text NOT NULL,
	"reason_code" text,
	"description" varchar(500),
	"method" text NOT NULL,
	"resolution" text NOT NULL,
	"status" text DEFAULT 'requested' NOT NULL,
	"quantity" integer NOT NULL,
	"new_variant_id" uuid,
	"reservation_state" text DEFAULT 'none' NOT NULL,
	"photo_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"difference_cents" integer DEFAULT 0 NOT NULL,
	"fee_attempt_id" uuid,
	"fee_due_at" timestamp with time zone,
	"fee_paid_at" timestamp with time zone,
	"refund_cents" integer DEFAULT 0 NOT NULL,
	"refunded_at" timestamp with time zone,
	"store_code" varchar(6),
	"code_failures" integer DEFAULT 0 NOT NULL,
	"answer_deadline_at" timestamp with time zone NOT NULL,
	"window_ends_at" timestamp with time zone NOT NULL,
	"decided_at" timestamp with time zone,
	"decided_by" text,
	"auto_approved" boolean DEFAULT false NOT NULL,
	"decision_reason" varchar(200),
	"return_to_stock" boolean,
	"item_due_at" timestamp with time zone,
	"collected_at" timestamp with time zone,
	"received_at" timestamp with time zone,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exchange_requests_money_chk" CHECK ("exchange_requests"."fee_cents" >= 0 and "exchange_requests"."refund_cents" >= 0 and "exchange_requests"."quantity" >= 1),
	CONSTRAINT "exchange_requests_replace_chk" CHECK ("exchange_requests"."resolution" <> 'replace' or "exchange_requests"."new_variant_id" is not null)
);
--> statement-breakpoint
ALTER TABLE "exchange_events" ADD CONSTRAINT "exchange_events_exchange_id_exchange_requests_id_fk" FOREIGN KEY ("exchange_id") REFERENCES "public"."exchange_requests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_events" ADD CONSTRAINT "exchange_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_order_item_id_order_items_id_fk" FOREIGN KEY ("order_item_id") REFERENCES "public"."order_items"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exchange_requests" ADD CONSTRAINT "exchange_requests_new_variant_id_product_variants_id_fk" FOREIGN KEY ("new_variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exchange_events_exchange_idx" ON "exchange_events" USING btree ("exchange_id","id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_requests_number_uq" ON "exchange_requests" USING btree ("number");--> statement-breakpoint
CREATE INDEX "exchange_requests_user_idx" ON "exchange_requests" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exchange_requests_store_idx" ON "exchange_requests" USING btree ("store_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "exchange_requests_order_idx" ON "exchange_requests" USING btree ("order_id");--> statement-breakpoint
CREATE UNIQUE INDEX "exchange_requests_open_item_uq" ON "exchange_requests" USING btree ("order_item_id") WHERE "exchange_requests"."status" in ('requested','awaiting_fee','approved','item_received','in_mediation');--> statement-breakpoint
CREATE INDEX "exchange_requests_sla_idx" ON "exchange_requests" USING btree ("answer_deadline_at") WHERE "exchange_requests"."status" = 'requested';--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_exchange_kind_uq" ON "deliveries" USING btree ("exchange_id","kind") WHERE "deliveries"."exchange_id" is not null;