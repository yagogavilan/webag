-- v1.1 R2 (ADR-019 D9, D10): agregados diários e painéis (R2.3), histórico de preço do "de/por" (WB-348), código de barras e catálogo de referência (WB-373), porta falsa do módulo Análises (WB-367).
-- SÓ tabelas novas; o único toque em dado existente é o INSERT ... SELECT da semente do histórico de preço (só leitura de `products` e `product_variants`, escrita só na tabela nova).
-- Semente: o preço de HOJE com início em `now()`. O passado do preço é desconhecido, então ninguém comprova o selo "de/por" nos primeiros 30 dias (honesto, RN-C8).
-- Reversão: drizzle/down/0065.sql (apaga as 10 tabelas: histórico de preço, painéis salvos, respostas da porta falsa; só em staging ou com autorização do fundador).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "analytics_interest" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"clicked_at" timestamp with time zone DEFAULT now() NOT NULL,
	"price_band" text,
	"note" varchar(140),
	"answered_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "analytics_interest_band_enum" CHECK ("analytics_interest"."price_band" in ('up_to_19', '20_to_39', '40_to_79', '80_plus', 'would_not_pay')),
	CONSTRAINT "analytics_interest_answer" CHECK (("analytics_interest"."price_band" is null) = ("analytics_interest"."answered_at" is null))
);
--> statement-breakpoint
CREATE TABLE "product_barcodes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"barcode" varchar(14) NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_barcodes_format" CHECK ("product_barcodes"."barcode" ~ '^[0-9]{8}$' or "product_barcodes"."barcode" ~ '^[0-9]{12,14}$')
);
--> statement-breakpoint
CREATE TABLE "product_price_history" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"product_id" uuid NOT NULL,
	"variant_id" uuid,
	"kind" text NOT NULL,
	"price_cents" integer NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ended_at" timestamp with time zone,
	"actor_kind" text NOT NULL,
	"actor_user_id" uuid,
	CONSTRAINT "product_price_history_kind_enum" CHECK ("product_price_history"."kind" in ('base', 'promo')),
	CONSTRAINT "product_price_history_actor_enum" CHECK ("product_price_history"."actor_kind" in ('merchant', 'admin', 'system', 'import')),
	CONSTRAINT "product_price_history_price" CHECK ("product_price_history"."price_cents" between 1 and 9999999),
	CONSTRAINT "product_price_history_period" CHECK ("product_price_history"."ended_at" is null or "product_price_history"."ended_at" >= "product_price_history"."started_at")
);
--> statement-breakpoint
CREATE TABLE "reference_barcodes" (
	"barcode" varchar(14) PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"brand" varchar(60),
	"category_id" uuid,
	"source" text NOT NULL,
	"moderated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "reference_barcodes_source_enum" CHECK ("reference_barcodes"."source" in ('moderated_catalog', 'admin')),
	CONSTRAINT "reference_barcodes_format" CHECK ("reference_barcodes"."barcode" ~ '^[0-9]{8}$' or "reference_barcodes"."barcode" ~ '^[0-9]{12,14}$')
);
--> statement-breakpoint
CREATE TABLE "dashboard_daily_facts" (
	"day" date NOT NULL,
	"city_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"category_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"payment_method" text NOT NULL,
	"campaign_id" uuid NOT NULL,
	"distance_band" smallint NOT NULL,
	"orders_received" integer DEFAULT 0 NOT NULL,
	"orders_paid" integer DEFAULT 0 NOT NULL,
	"orders_delivered" integer DEFAULT 0 NOT NULL,
	"orders_cancelled" integer DEFAULT 0 NOT NULL,
	"gmv_cents" bigint DEFAULT 0 NOT NULL,
	"gmv_delivered_cents" bigint DEFAULT 0 NOT NULL,
	"commission_cents" bigint DEFAULT 0 NOT NULL,
	"delivery_fee_cents" bigint DEFAULT 0 NOT NULL,
	"service_fee_cents" bigint DEFAULT 0 NOT NULL,
	"discount_cents" bigint DEFAULT 0 NOT NULL,
	"discount_webag_cents" bigint DEFAULT 0 NOT NULL,
	"discount_store_cents" bigint DEFAULT 0 NOT NULL,
	"coupon_orders" integer DEFAULT 0 NOT NULL,
	"new_customers" integer DEFAULT 0 NOT NULL,
	"courier_cost_cents" bigint DEFAULT 0 NOT NULL,
	"courier_cost_orders" integer DEFAULT 0 NOT NULL,
	"delivered_in_window" integer DEFAULT 0 NOT NULL,
	"delivered_with_window" integer DEFAULT 0 NOT NULL,
	"accept_n" integer DEFAULT 0 NOT NULL,
	"accept_hist" integer[] DEFAULT '{}'::integer[] NOT NULL,
	"pay_to_delivery_n" integer DEFAULT 0 NOT NULL,
	"pay_to_delivery_hist" integer[] DEFAULT '{}'::integer[] NOT NULL,
	CONSTRAINT "dashboard_daily_facts_day_store_id_category_id_mode_payment_method_campaign_id_distance_band_pk" PRIMARY KEY("day","store_id","category_id","mode","payment_method","campaign_id","distance_band"),
	CONSTRAINT "dashboard_daily_facts_mode_enum" CHECK ("dashboard_daily_facts"."mode" in ('delivery', 'pickup')),
	CONSTRAINT "dashboard_daily_facts_payment_enum" CHECK ("dashboard_daily_facts"."payment_method" in ('pix', 'card')),
	CONSTRAINT "dashboard_daily_facts_nonneg" CHECK ("dashboard_daily_facts"."orders_received" >= 0 and "dashboard_daily_facts"."orders_paid" >= 0 and "dashboard_daily_facts"."orders_delivered" >= 0 and "dashboard_daily_facts"."orders_cancelled" >= 0 and "dashboard_daily_facts"."gmv_cents" >= 0 and "dashboard_daily_facts"."discount_webag_cents" >= 0 and "dashboard_daily_facts"."discount_store_cents" >= 0)
);
--> statement-breakpoint
CREATE TABLE "dashboard_distinct_daily" (
	"day" date NOT NULL,
	"metric" text NOT NULL,
	"window" text NOT NULL,
	"city_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"value" integer NOT NULL,
	"denominator" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dashboard_distinct_daily_metric_window_day_city_id_store_id_pk" PRIMARY KEY("metric","window","day","city_id","store_id"),
	CONSTRAINT "dashboard_distinct_daily_metric_enum" CHECK ("dashboard_distinct_daily"."metric" in ('active', 'repeat30')),
	CONSTRAINT "dashboard_distinct_daily_window_enum" CHECK ("dashboard_distinct_daily"."window" in ('d1', 'd7', 'd30', 'm'))
);
--> statement-breakpoint
CREATE TABLE "dashboard_item_facts" (
	"day" date NOT NULL,
	"city_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"item_category_id" uuid NOT NULL,
	"mode" text NOT NULL,
	"gmv_items_cents" bigint DEFAULT 0 NOT NULL,
	"units" integer DEFAULT 0 NOT NULL,
	"orders" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "dashboard_item_facts_day_store_id_item_category_id_mode_pk" PRIMARY KEY("day","store_id","item_category_id","mode"),
	CONSTRAINT "dashboard_item_facts_mode_enum" CHECK ("dashboard_item_facts"."mode" in ('delivery', 'pickup'))
);
--> statement-breakpoint
CREATE TABLE "dashboard_refresh_state" (
	"name" text PRIMARY KEY NOT NULL,
	"refreshed_at" timestamp with time zone,
	"watermark" timestamp with time zone,
	"rows_written" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'ok' NOT NULL,
	"last_error" varchar(200),
	CONSTRAINT "dashboard_refresh_state_name_enum" CHECK ("dashboard_refresh_state"."name" in ('daily_facts', 'item_facts', 'distinct_daily')),
	CONSTRAINT "dashboard_refresh_state_status_enum" CHECK ("dashboard_refresh_state"."status" in ('ok', 'failed', 'running'))
);
--> statement-breakpoint
CREATE TABLE "dashboard_widgets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dashboard_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"title" varchar(80) NOT NULL,
	"metric_id" text NOT NULL,
	"dimension_ids" text[] DEFAULT '{}'::text[] NOT NULL,
	"chart_type" text NOT NULL,
	"filters" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"period" jsonb NOT NULL,
	"compare" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboard_widgets_chart_enum" CHECK ("dashboard_widgets"."chart_type" in ('number', 'line', 'bar', 'stacked_bar', 'donut', 'table')),
	CONSTRAINT "dashboard_widgets_position_range" CHECK ("dashboard_widgets"."position" between 0 and 11),
	CONSTRAINT "dashboard_widgets_dimensions_max" CHECK (coalesce(array_length("dashboard_widgets"."dimension_ids", 1), 0) <= 2),
	CONSTRAINT "dashboard_widgets_title_len" CHECK (char_length("dashboard_widgets"."title") between 1 and 80)
);
--> statement-breakpoint
CREATE TABLE "dashboards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"preset_key" text,
	"owner_admin_id" uuid,
	"name" varchar(80) NOT NULL,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "dashboards_kind_enum" CHECK ("dashboards"."kind" in ('preset', 'user')),
	CONSTRAINT "dashboards_preset_enum" CHECK ("dashboards"."preset_key" in ('overview', 'sales', 'stores', 'delivery', 'coupons', 'access')),
	CONSTRAINT "dashboards_kind_shape" CHECK (("dashboards"."kind" = 'preset' and "dashboards"."owner_admin_id" is null and "dashboards"."preset_key" is not null) or ("dashboards"."kind" = 'user' and "dashboards"."owner_admin_id" is not null and "dashboards"."preset_key" is null)),
	CONSTRAINT "dashboards_name_len" CHECK (char_length("dashboards"."name") between 1 and 80)
);
--> statement-breakpoint
ALTER TABLE "analytics_interest" ADD CONSTRAINT "analytics_interest_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "analytics_interest" ADD CONSTRAINT "analytics_interest_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_barcodes" ADD CONSTRAINT "product_barcodes_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_variant_id_product_variants_id_fk" FOREIGN KEY ("variant_id") REFERENCES "public"."product_variants"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_price_history" ADD CONSTRAINT "product_price_history_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reference_barcodes" ADD CONSTRAINT "reference_barcodes_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboard_widgets" ADD CONSTRAINT "dashboard_widgets_dashboard_id_dashboards_id_fk" FOREIGN KEY ("dashboard_id") REFERENCES "public"."dashboards"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "dashboards" ADD CONSTRAINT "dashboards_owner_admin_id_users_id_fk" FOREIGN KEY ("owner_admin_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "analytics_interest_store_uq" ON "analytics_interest" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "product_barcodes_store_uq" ON "product_barcodes" USING btree ("store_id","barcode");--> statement-breakpoint
CREATE INDEX "product_barcodes_product_idx" ON "product_barcodes" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_price_history_product_idx" ON "product_price_history" USING btree ("product_id","started_at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "product_price_history_open_uq" ON "product_price_history" USING btree ("product_id",coalesce("variant_id", '00000000-0000-0000-0000-000000000000'::uuid),"kind") WHERE "product_price_history"."ended_at" is null;--> statement-breakpoint
CREATE INDEX "dashboard_daily_facts_city_idx" ON "dashboard_daily_facts" USING btree ("city_id","day");--> statement-breakpoint
CREATE INDEX "dashboard_daily_facts_campaign_idx" ON "dashboard_daily_facts" USING btree ("campaign_id","day") WHERE "dashboard_daily_facts"."campaign_id" <> '00000000-0000-0000-0000-000000000000';--> statement-breakpoint
CREATE INDEX "dashboard_item_facts_city_idx" ON "dashboard_item_facts" USING btree ("city_id","day");--> statement-breakpoint
CREATE UNIQUE INDEX "dashboard_widgets_position_uq" ON "dashboard_widgets" USING btree ("dashboard_id","position");--> statement-breakpoint
CREATE INDEX "dashboards_owner_idx" ON "dashboards" USING btree ("owner_admin_id","created_at" DESC NULLS LAST) WHERE "dashboards"."owner_admin_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "dashboards_preset_uq" ON "dashboards" USING btree ("preset_key") WHERE "dashboards"."kind" = 'preset';
--> statement-breakpoint
-- Semente do histórico de preço: 1 intervalo aberto por produto e por variação com preço próprio (idempotente: o índice único parcial recusa repetir).
INSERT INTO "product_price_history" ("product_id", "variant_id", "kind", "price_cents", "started_at", "actor_kind")
SELECT p."id", NULL, 'base', p."base_price_cents", now(), 'system' FROM "products" p WHERE p."base_price_cents" IS NOT NULL AND p."status" <> 'archived'
ON CONFLICT DO NOTHING;--> statement-breakpoint
INSERT INTO "product_price_history" ("product_id", "variant_id", "kind", "price_cents", "started_at", "actor_kind")
SELECT v."product_id", v."id", 'base', v."price_cents", now(), 'system' FROM "product_variants" v JOIN "products" p ON p."id" = v."product_id"
 WHERE v."price_cents" IS NOT NULL AND v."price_cents" BETWEEN 1 AND 9999999 AND p."status" <> 'archived'
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Marcas d'água do job de agregados (uma linha por tabela de fato); o job da R2.3 preenche.
INSERT INTO "dashboard_refresh_state" ("name", "status") VALUES ('daily_facts', 'ok'), ('item_facts', 'ok'), ('distinct_daily', 'ok') ON CONFLICT DO NOTHING;
