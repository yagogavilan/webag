CREATE TABLE "order_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"order_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor" text NOT NULL,
	"actor_user_id" uuid,
	"reason" varchar(200),
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "order_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid NOT NULL,
	"category_id" uuid,
	"name" varchar(120) NOT NULL,
	"attributes" jsonb NOT NULL,
	"image" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"quantity" integer NOT NULL,
	"unit_price_cents" integer NOT NULL,
	"line_total_cents" integer NOT NULL,
	"commission_pct_bp" integer NOT NULL,
	"stock_state" text DEFAULT 'reserved' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "order_items_qty_chk" CHECK ("order_items"."quantity" >= 1 and "order_items"."unit_price_cents" >= 0 and "order_items"."line_total_cents" = "order_items"."quantity" * "order_items"."unit_price_cents")
);
--> statement-breakpoint
CREATE TABLE "orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"number" varchar(12) NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"status" text DEFAULT 'awaiting_payment' NOT NULL,
	"mode" text NOT NULL,
	"cart_revision" integer NOT NULL,
	"address" jsonb,
	"eta_min_minutes" integer NOT NULL,
	"eta_max_minutes" integer NOT NULL,
	"pickup" jsonb,
	"pickup_code" varchar(4),
	"coupon_id" uuid,
	"coupon_code" varchar(20),
	"subtotal_cents" integer NOT NULL,
	"delivery_fee_cents" integer NOT NULL,
	"service_fee_cents" integer NOT NULL,
	"discount_cents" integer NOT NULL,
	"store_coupon_cents" integer DEFAULT 0 NOT NULL,
	"platform_discount_cents" integer DEFAULT 0 NOT NULL,
	"total_cents" integer NOT NULL,
	"commission_cents" integer NOT NULL,
	"application_fee_cents" integer NOT NULL,
	"finance" jsonb NOT NULL,
	"payment_method" text NOT NULL,
	"payment_attempt_id" uuid,
	"exchange_voluntary_days" integer DEFAULT 0 NOT NULL,
	"exchange_collection_fee_cents" integer DEFAULT 0 NOT NULL,
	"exchange_policy_version" integer DEFAULT 1 NOT NULL,
	"stock_state" text DEFAULT 'reserved' NOT NULL,
	"payment_expires_at" timestamp with time zone,
	"accept_deadline_at" timestamp with time zone,
	"paid_at" timestamp with time zone,
	"accepted_at" timestamp with time zone,
	"delivered_at" timestamp with time zone,
	"cancelled_at" timestamp with time zone,
	"cancelled_by" text,
	"cancel_reason" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "orders_money_chk" CHECK ("orders"."subtotal_cents" >= 0 and "orders"."delivery_fee_cents" >= 0 and "orders"."service_fee_cents" >= 0 and "orders"."discount_cents" >= 0 and "orders"."total_cents" >= 0 and "orders"."commission_cents" >= 0 and "orders"."application_fee_cents" >= 0),
	CONSTRAINT "orders_mode_chk" CHECK (("orders"."mode" = 'delivery' and "orders"."address" is not null) or ("orders"."mode" = 'pickup' and "orders"."pickup" is not null))
);
--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_events" ADD CONSTRAINT "order_events_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_orders_id_fk" FOREIGN KEY ("order_id") REFERENCES "public"."orders"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_coupon_id_coupons_id_fk" FOREIGN KEY ("coupon_id") REFERENCES "public"."coupons"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_payment_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("payment_attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "order_events_order_idx" ON "order_events" USING btree ("order_id","id");--> statement-breakpoint
CREATE INDEX "order_items_order_idx" ON "order_items" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "order_items_variant_idx" ON "order_items" USING btree ("variant_id");--> statement-breakpoint
CREATE UNIQUE INDEX "orders_number_uq" ON "orders" USING btree ("number");--> statement-breakpoint
CREATE INDEX "orders_user_idx" ON "orders" USING btree ("user_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_store_idx" ON "orders" USING btree ("store_id","status","created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "orders_payment_expiry_idx" ON "orders" USING btree ("payment_expires_at") WHERE "orders"."status" = 'awaiting_payment';--> statement-breakpoint
CREATE INDEX "orders_accept_deadline_idx" ON "orders" USING btree ("accept_deadline_at") WHERE "orders"."status" = 'received';