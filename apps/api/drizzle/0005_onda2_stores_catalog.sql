-- PostGIS (ADR-008): a imagem do compose e o CI já trazem a extensão; o papel de migração precisa poder criá-la.
CREATE EXTENSION IF NOT EXISTS postgis;--> statement-breakpoint
CREATE TABLE "moderation_terms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"value" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_images" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"asset_id" uuid NOT NULL,
	"position" smallint NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_moderation_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"action" text NOT NULL,
	"reason" text,
	"actor_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "product_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"attributes" jsonb NOT NULL,
	"attributes_key" text NOT NULL,
	"sku" varchar(40),
	"price_cents" integer,
	"stock" integer DEFAULT 0 NOT NULL,
	"reserved" integer DEFAULT 0 NOT NULL,
	"low_stock_armed" boolean DEFAULT true NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(80) NOT NULL,
	"description" varchar(1000),
	"category_id" uuid,
	"section_id" uuid,
	"position" integer DEFAULT 0 NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"moderation_status" text DEFAULT 'ok' NOT NULL,
	"moderation_reason" text,
	"moderated_by" uuid,
	"moderated_at" timestamp with time zone,
	"base_price_cents" integer,
	"promo_price_cents" integer,
	"promo_starts_at" timestamp with time zone,
	"promo_ends_at" timestamp with time zone,
	"variant_attributes" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"published_at" timestamp with time zone,
	"archived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_sections" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"position" integer DEFAULT 0 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "media_assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"store_id" uuid,
	"purpose" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"object_key" text NOT NULL,
	"declared_content_type" text NOT NULL,
	"declared_size_bytes" integer NOT NULL,
	"content_type" text,
	"size_bytes" integer,
	"width" integer,
	"height" integer,
	"variants" jsonb,
	"rejection_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"expires_at" timestamp with time zone NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"provider" text NOT NULL,
	"provider_account_id" text NOT NULL,
	"status" text NOT NULL,
	"holder_document_masked" text NOT NULL,
	"holder_matches_store" boolean NOT NULL,
	"tokens_enc" text NOT NULL,
	"tokens_expire_at" timestamp with time zone,
	"connected_by" uuid NOT NULL,
	"connected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" uuid,
	"release_reason" text,
	"disconnected_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "payment_oauth_states" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"state_hash" text NOT NULL,
	"store_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"session_id" uuid NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"used_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_activity" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"actor_id" uuid,
	"action" text NOT NULL,
	"details" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_delivery_tiers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"position" smallint NOT NULL,
	"from_m" integer NOT NULL,
	"to_m" integer NOT NULL,
	"fee_cents" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"asset_id" uuid NOT NULL,
	"uploaded_by" uuid NOT NULL,
	"superseded_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_extra_categories" (
	"store_id" uuid NOT NULL,
	"category_id" uuid NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_holidays" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"day" date NOT NULL,
	"label" varchar(60)
);
--> statement-breakpoint
CREATE TABLE "store_hours" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"weekday" smallint NOT NULL,
	"start_min" integer NOT NULL,
	"end_min" integer NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_review_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"item" text NOT NULL,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "store_settings" (
	"store_id" uuid PRIMARY KEY NOT NULL,
	"accepts_delivery" boolean DEFAULT true NOT NULL,
	"radius_m" integer DEFAULT 5000 NOT NULL,
	"fee_mode" text DEFAULT 'fixed' NOT NULL,
	"fee_fixed_cents" integer DEFAULT 0 NOT NULL,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"free_above_cents" integer DEFAULT 0 NOT NULL,
	"eta_min_minutes" integer DEFAULT 30 NOT NULL,
	"eta_max_minutes" integer DEFAULT 60 NOT NULL,
	"pickup_enabled" boolean DEFAULT false NOT NULL,
	"pickup_use_store_address" boolean DEFAULT true NOT NULL,
	"pickup_address" varchar(200),
	"pickup_instructions" varchar(200),
	"pickup_prep_min_minutes" integer DEFAULT 15 NOT NULL,
	"pickup_prep_max_minutes" integer DEFAULT 30 NOT NULL,
	"voluntary_exchange_days" integer DEFAULT 0 NOT NULL,
	"collection_fee_cents" integer DEFAULT 0 NOT NULL,
	"exchange_policy_version" integer DEFAULT 1 NOT NULL,
	"low_stock_threshold" integer,
	"paused_until" timestamp with time zone,
	"paused_indefinitely" boolean DEFAULT false NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_status_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"from_status" text,
	"to_status" text NOT NULL,
	"actor_id" uuid,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "stores" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_user_id" uuid NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"document_type" text NOT NULL,
	"document_number" varchar(14) NOT NULL,
	"legal_name" varchar(160),
	"fiscal_accepted_at" timestamp with time zone,
	"fiscal_accepted_document_version" integer,
	"name" varchar(80),
	"main_category_id" uuid,
	"description" varchar(300),
	"phone" varchar(11),
	"whatsapp" varchar(11),
	"address_cep" varchar(8),
	"address_street" varchar(120),
	"address_number" varchar(20),
	"address_complement" varchar(80),
	"address_neighborhood" varchar(80),
	"address_city_id" uuid,
	"address_city_name" varchar(80),
	"address_state" varchar(2),
	"lat" double precision,
	"lng" double precision,
	"logo_asset_id" uuid,
	"cover_asset_id" uuid,
	"submitted_at" timestamp with time zone,
	"sla_started_at" timestamp with time zone,
	"sla_elapsed_ms" integer,
	"decided_at" timestamp with time zone,
	"decided_by" uuid,
	"decision_reason" text,
	"approved_at" timestamp with time zone,
	"suspended_at" timestamp with time zone,
	"suspension_reason" text,
	"pending_changes" jsonb,
	"suspension_review_flagged_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "moderation_terms" ADD CONSTRAINT "moderation_terms_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_images" ADD CONSTRAINT "product_images_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_moderation_events" ADD CONSTRAINT "product_moderation_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_moderation_events" ADD CONSTRAINT "product_moderation_events_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_moderation_events" ADD CONSTRAINT "product_moderation_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_section_id_store_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."store_sections"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_moderated_by_users_id_fk" FOREIGN KEY ("moderated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_sections" ADD CONSTRAINT "store_sections_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "media_assets" ADD CONSTRAINT "media_assets_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_connected_by_users_id_fk" FOREIGN KEY ("connected_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_accounts" ADD CONSTRAINT "payment_accounts_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_oauth_states" ADD CONSTRAINT "payment_oauth_states_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_oauth_states" ADD CONSTRAINT "payment_oauth_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_activity" ADD CONSTRAINT "store_activity_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_activity" ADD CONSTRAINT "store_activity_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_delivery_tiers" ADD CONSTRAINT "store_delivery_tiers_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_documents" ADD CONSTRAINT "store_documents_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_documents" ADD CONSTRAINT "store_documents_asset_id_media_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_documents" ADD CONSTRAINT "store_documents_uploaded_by_users_id_fk" FOREIGN KEY ("uploaded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_extra_categories" ADD CONSTRAINT "store_extra_categories_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_extra_categories" ADD CONSTRAINT "store_extra_categories_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_holidays" ADD CONSTRAINT "store_holidays_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_hours" ADD CONSTRAINT "store_hours_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_review_items" ADD CONSTRAINT "store_review_items_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_review_items" ADD CONSTRAINT "store_review_items_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_status_history" ADD CONSTRAINT "store_status_history_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_status_history" ADD CONSTRAINT "store_status_history_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_owner_user_id_users_id_fk" FOREIGN KEY ("owner_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_main_category_id_categories_id_fk" FOREIGN KEY ("main_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_address_city_id_cities_id_fk" FOREIGN KEY ("address_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_logo_asset_id_media_assets_id_fk" FOREIGN KEY ("logo_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_cover_asset_id_media_assets_id_fk" FOREIGN KEY ("cover_asset_id") REFERENCES "public"."media_assets"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stores" ADD CONSTRAINT "stores_decided_by_users_id_fk" FOREIGN KEY ("decided_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "moderation_terms_uq" ON "moderation_terms" USING btree ("kind","value");--> statement-breakpoint
CREATE UNIQUE INDEX "product_images_pos_uq" ON "product_images" USING btree ("product_id","position");--> statement-breakpoint
CREATE INDEX "product_moderation_events_store_idx" ON "product_moderation_events" USING btree ("store_id","action","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_combo_uq" ON "product_variants" USING btree ("product_id","attributes_key") WHERE "product_variants"."active";--> statement-breakpoint
CREATE UNIQUE INDEX "product_variants_sku_uq" ON "product_variants" USING btree ("store_id",lower("sku")) WHERE "product_variants"."sku" is not null and "product_variants"."active";--> statement-breakpoint
CREATE INDEX "products_store_idx" ON "products" USING btree ("store_id","status");--> statement-breakpoint
CREATE INDEX "products_moderation_idx" ON "products" USING btree ("moderation_status","created_at");--> statement-breakpoint
CREATE INDEX "store_sections_store_idx" ON "store_sections" USING btree ("store_id","position");--> statement-breakpoint
CREATE INDEX "media_assets_owner_idx" ON "media_assets" USING btree ("owner_user_id","created_at");--> statement-breakpoint
CREATE INDEX "media_assets_store_idx" ON "media_assets" USING btree ("store_id");--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_store_uq" ON "payment_accounts" USING btree ("store_id") WHERE "payment_accounts"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_accounts_provider_uq" ON "payment_accounts" USING btree ("provider","provider_account_id") WHERE "payment_accounts"."status" <> 'disconnected';--> statement-breakpoint
CREATE UNIQUE INDEX "payment_oauth_states_hash_uq" ON "payment_oauth_states" USING btree ("state_hash");--> statement-breakpoint
CREATE INDEX "payment_oauth_states_store_idx" ON "payment_oauth_states" USING btree ("store_id");--> statement-breakpoint
CREATE INDEX "store_activity_store_idx" ON "store_activity" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "store_delivery_tiers_pos_uq" ON "store_delivery_tiers" USING btree ("store_id","position");--> statement-breakpoint
CREATE INDEX "store_documents_store_idx" ON "store_documents" USING btree ("store_id","kind");--> statement-breakpoint
CREATE UNIQUE INDEX "store_extra_categories_uq" ON "store_extra_categories" USING btree ("store_id","category_id");--> statement-breakpoint
CREATE UNIQUE INDEX "store_holidays_day_uq" ON "store_holidays" USING btree ("store_id","day");--> statement-breakpoint
CREATE INDEX "store_hours_store_idx" ON "store_hours" USING btree ("store_id","weekday");--> statement-breakpoint
CREATE INDEX "store_review_items_store_idx" ON "store_review_items" USING btree ("store_id","resolved_at");--> statement-breakpoint
CREATE INDEX "store_status_history_store_idx" ON "store_status_history" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_owner_uq" ON "stores" USING btree ("owner_user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "stores_document_uq" ON "stores" USING btree ("document_number") WHERE "stores"."status" <> 'rejected';--> statement-breakpoint
CREATE INDEX "stores_status_idx" ON "stores" USING btree ("status","sla_started_at");
--> statement-breakpoint
-- Coluna geográfica GERADA a partir de lat/lng (fonte única) + índice GiST para ST_DWithin (ADR-008).
ALTER TABLE "stores" ADD COLUMN "location" geography(Point,4326) GENERATED ALWAYS AS (
  CASE WHEN "lat" IS NULL OR "lng" IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint("lng", "lat"), 4326)::geography END
) STORED;--> statement-breakpoint
CREATE INDEX "stores_location_gist" ON "stores" USING gist ("location");--> statement-breakpoint
-- DT-019: store_members.store_id passa a ter FK (a tabela stores nasce agora). Apagar loja apaga os vínculos.
ALTER TABLE "store_members" ADD CONSTRAINT "store_members_store_id_fk" FOREIGN KEY ("store_id") REFERENCES "stores"("id") ON DELETE CASCADE;--> statement-breakpoint
-- Invariantes de estoque e preço no banco (RN-05, RN-06): nem um bug de aplicação gera estoque negativo.
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_stock_chk" CHECK ("stock" >= 0 AND "stock" <= 99999 AND "reserved" >= 0 AND "stock" >= "reserved");--> statement-breakpoint
ALTER TABLE "product_variants" ADD CONSTRAINT "product_variants_price_chk" CHECK ("price_cents" IS NULL OR ("price_cents" >= 1 AND "price_cents" <= 9999999));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_price_chk" CHECK ("base_price_cents" IS NULL OR ("base_price_cents" >= 1 AND "base_price_cents" <= 9999999));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_promo_chk" CHECK ("promo_price_cents" IS NULL OR ("promo_price_cents" >= 1 AND "base_price_cents" IS NOT NULL AND "promo_price_cents" < "base_price_cents"));--> statement-breakpoint
ALTER TABLE "store_settings" ADD CONSTRAINT "store_settings_chk" CHECK ("radius_m" BETWEEN 1 AND 100000 AND "fee_fixed_cents" BETWEEN 0 AND 5000 AND "min_order_cents" >= 0 AND "free_above_cents" >= 0 AND "eta_min_minutes" < "eta_max_minutes" AND "eta_max_minutes" <= 1440);

