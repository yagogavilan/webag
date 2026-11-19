CREATE TABLE "couriers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"note" text,
	"active" boolean DEFAULT true NOT NULL,
	"documents_checked_at" timestamp with time zone NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "deliveries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text DEFAULT 'delivery' NOT NULL,
	"order_id" uuid NOT NULL,
	"exchange_id" uuid,
	"store_id" uuid NOT NULL,
	"status" text DEFAULT 'ready_for_collection' NOT NULL,
	"ready_at" timestamp with time zone DEFAULT now() NOT NULL,
	"courier_id" uuid,
	"volumes" integer DEFAULT 1 NOT NULL,
	"note" text,
	"city_id" uuid,
	"neighborhood_id" uuid,
	"fee_cents" integer DEFAULT 0 NOT NULL,
	"expected_cost_cents" integer DEFAULT 0 NOT NULL,
	"cost_cents" integer,
	"cost_registered_by" uuid,
	"cost_registered_at" timestamp with time zone,
	"cost_paid_at" timestamp with time zone,
	"contact" jsonb,
	"pii_cleared_at" timestamp with time zone,
	"delivery_code" text,
	"code_failures" integer DEFAULT 0 NOT NULL,
	"attempts" integer DEFAULT 1 NOT NULL,
	"whatsapp_sent_at" timestamp with time zone,
	"fail_reason" text,
	"fail_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "delivery_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"action" text NOT NULL,
	"actor_id" uuid,
	"actor_role" text,
	"reason" text,
	"meta" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "couriers" ADD CONSTRAINT "couriers_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_courier_id_couriers_id_fk" FOREIGN KEY ("courier_id") REFERENCES "public"."couriers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "deliveries" ADD CONSTRAINT "deliveries_cost_registered_by_users_id_fk" FOREIGN KEY ("cost_registered_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "delivery_events" ADD CONSTRAINT "delivery_events_delivery_id_deliveries_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."deliveries"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "couriers_phone_active_uq" ON "couriers" USING btree ("phone") WHERE "couriers"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "deliveries_order_delivery_uq" ON "deliveries" USING btree ("order_id") WHERE "deliveries"."kind" = 'delivery';--> statement-breakpoint
CREATE INDEX "deliveries_queue_idx" ON "deliveries" USING btree ("status","ready_at");--> statement-breakpoint
CREATE INDEX "deliveries_courier_idx" ON "deliveries" USING btree ("courier_id","status");--> statement-breakpoint
CREATE INDEX "deliveries_store_idx" ON "deliveries" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "delivery_events_delivery_idx" ON "delivery_events" USING btree ("delivery_id","created_at");--> statement-breakpoint
-- L.3: histórico da corrida é append-only (auditoria da logística, WB-233 C5); correção é novo evento.
CREATE FUNCTION "delivery_events_block_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'delivery_events é append-only: % não é permitido', TG_OP USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "delivery_events_append_only" BEFORE UPDATE OR DELETE ON "delivery_events" FOR EACH ROW EXECUTE FUNCTION "delivery_events_block_mutation"();
