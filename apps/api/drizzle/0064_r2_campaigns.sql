-- v1.1 R2 (ADR-019 D1 a D7): campanhas, adesão da loja, reserva atômica de orçamento, diário do orçamento e antifraude por HMAC.
-- Tabelas NOVAS, mais 3 colunas nulas ou com default constante em `coupons` (metadado puro) e 2 colunas nulas em `orders` (metadado puro, sem reescrita): nenhum dado existente muda.
-- As FKs seguram um bloqueio curto em `stores`, `users`, `cities`, `categories`, `coupons` e `orders`; por isso o `lock_timeout` (e o do papel `webag_migrator` vale por cima).
-- Reversão: drizzle/down/0064.sql (apaga campanhas, reservas, diário e antifraude: só em staging ou com autorização do fundador, CLAUDE.md §7.6).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "campaign_acceptances" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"enrollment_id" uuid,
	"user_id" uuid NOT NULL,
	"action" text NOT NULL,
	"terms_version" varchar(40),
	"terms_hash" varchar(64),
	"monthly_cap_cents" integer,
	"store_share_pct" smallint NOT NULL,
	"request_id" varchar(64),
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_acceptances_action_enum" CHECK ("campaign_acceptances"."action" in ('accept', 'decline', 'leave', 'create')),
	CONSTRAINT "campaign_acceptances_proof" CHECK ("campaign_acceptances"."action" not in ('accept', 'create') or ("campaign_acceptances"."terms_version" is not null and "campaign_acceptances"."terms_hash" ~ '^[a-f0-9]{64}$' and "campaign_acceptances"."monthly_cap_cents" is not null))
);
--> statement-breakpoint
CREATE TABLE "campaign_budget_days" (
	"campaign_id" uuid NOT NULL,
	"day" date NOT NULL,
	"limit_cents" integer NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_budget_days_campaign_id_day_pk" PRIMARY KEY("campaign_id","day"),
	CONSTRAINT "campaign_budget_days_invariant" CHECK ("campaign_budget_days"."limit_cents" > 0 and "campaign_budget_days"."reserved_cents" >= 0 and "campaign_budget_days"."spent_cents" >= 0 and "campaign_budget_days"."reserved_cents" + "campaign_budget_days"."spent_cents" <= "campaign_budget_days"."limit_cents")
);
--> statement-breakpoint
CREATE TABLE "campaign_budget_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"campaign_id" uuid NOT NULL,
	"reservation_id" uuid,
	"order_id" uuid,
	"store_id" uuid,
	"kind" text NOT NULL,
	"funder" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"day" date NOT NULL,
	"month" date NOT NULL,
	"dedupe_key" varchar(120) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_budget_entries_kind_enum" CHECK ("campaign_budget_entries"."kind" in ('reserve', 'confirm', 'release', 'refund')),
	CONSTRAINT "campaign_budget_entries_funder_enum" CHECK ("campaign_budget_entries"."funder" in ('webag', 'store')),
	CONSTRAINT "campaign_budget_entries_amount" CHECK ("campaign_budget_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "campaign_store_enrollments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"campaign_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"state" text DEFAULT 'pending' NOT NULL,
	"invited_by" uuid,
	"invited_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"responded_at" timestamp with time zone,
	"responded_by" uuid,
	"monthly_cap_cents" integer,
	"terms_version" varchar(40),
	"terms_hash" varchar(64),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaign_store_enrollments_state_enum" CHECK ("campaign_store_enrollments"."state" in ('pending', 'accepted', 'declined', 'left', 'expired')),
	CONSTRAINT "campaign_store_enrollments_accepted" CHECK ("campaign_store_enrollments"."state" <> 'accepted' or ("campaign_store_enrollments"."monthly_cap_cents" is not null and "campaign_store_enrollments"."monthly_cap_cents" > 0 and "campaign_store_enrollments"."terms_version" is not null and "campaign_store_enrollments"."terms_hash" ~ '^[a-f0-9]{64}$' and "campaign_store_enrollments"."responded_by" is not null and "campaign_store_enrollments"."responded_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "campaign_store_months" (
	"campaign_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"month" date NOT NULL,
	"limit_cents" integer NOT NULL,
	"reserved_cents" integer DEFAULT 0 NOT NULL,
	"spent_cents" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "campaign_store_months_campaign_id_store_id_month_pk" PRIMARY KEY("campaign_id","store_id","month"),
	CONSTRAINT "campaign_store_months_invariant" CHECK ("campaign_store_months"."limit_cents" > 0 and "campaign_store_months"."reserved_cents" >= 0 and "campaign_store_months"."spent_cents" >= 0 and "campaign_store_months"."reserved_cents" + "campaign_store_months"."spent_cents" <= "campaign_store_months"."limit_cents")
);
--> statement-breakpoint
CREATE TABLE "campaigns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner" text DEFAULT 'webag' NOT NULL,
	"owner_store_id" uuid,
	"name" varchar(80) NOT NULL,
	"funding_source" text NOT NULL,
	"store_share_pct" smallint NOT NULL,
	"kind" text NOT NULL,
	"value" integer DEFAULT 0 NOT NULL,
	"percent_cap_cents" integer,
	"min_order_cents" integer DEFAULT 0 NOT NULL,
	"audience" text DEFAULT 'all' NOT NULL,
	"reactivation_days" smallint DEFAULT 30 NOT NULL,
	"target_kind" text DEFAULT 'all' NOT NULL,
	"target_city_id" uuid,
	"target_store_id" uuid,
	"target_category_id" uuid,
	"starts_at" timestamp with time zone,
	"ends_at" timestamp with time zone,
	"budget_total_cents" integer,
	"budget_daily_cents" integer,
	"max_uses" integer,
	"per_customer_limit" smallint DEFAULT 1 NOT NULL,
	"state" text DEFAULT 'draft' NOT NULL,
	"end_reason" text,
	"paused_by" text,
	"state_reason" varchar(200),
	"state_changed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"budget_reserved_cents" integer DEFAULT 0 NOT NULL,
	"budget_spent_cents" integer DEFAULT 0 NOT NULL,
	"uses_reserved" integer DEFAULT 0 NOT NULL,
	"uses_confirmed" integer DEFAULT 0 NOT NULL,
	"loss_risk_ack_by" uuid,
	"created_by" uuid,
	"activated_by" uuid,
	"activated_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"duplicated_from" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "campaigns_owner_enum" CHECK ("campaigns"."owner" in ('webag', 'store')),
	CONSTRAINT "campaigns_funding_enum" CHECK ("campaigns"."funding_source" in ('webag', 'store', 'split', 'self_funded')),
	CONSTRAINT "campaigns_kind_enum" CHECK ("campaigns"."kind" in ('percent', 'fixed', 'free_shipping')),
	CONSTRAINT "campaigns_audience_enum" CHECK ("campaigns"."audience" in ('all', 'first_purchase', 'reactivation')),
	CONSTRAINT "campaigns_target_enum" CHECK ("campaigns"."target_kind" in ('all', 'city', 'store', 'category')),
	CONSTRAINT "campaigns_state_enum" CHECK ("campaigns"."state" in ('draft', 'scheduled', 'active', 'paused', 'ended')),
	CONSTRAINT "campaigns_end_reason_enum" CHECK ("campaigns"."end_reason" in ('budget', 'uses', 'expired', 'admin')),
	CONSTRAINT "campaigns_paused_by_enum" CHECK ("campaigns"."paused_by" in ('admin', 'merchant', 'system')),
	CONSTRAINT "campaigns_funding_share" CHECK (("campaigns"."funding_source" = 'webag' and "campaigns"."store_share_pct" = 0) or ("campaigns"."funding_source" = 'store' and "campaigns"."store_share_pct" = 100) or ("campaigns"."funding_source" = 'split' and "campaigns"."store_share_pct" between 1 and 99) or ("campaigns"."funding_source" = 'self_funded' and "campaigns"."store_share_pct" = 0)),
	CONSTRAINT "campaigns_free_shipping_funding" CHECK ("campaigns"."kind" <> 'free_shipping' or "campaigns"."funding_source" in ('webag', 'self_funded')),
	CONSTRAINT "campaigns_value_range" CHECK (("campaigns"."kind" = 'free_shipping' and "campaigns"."value" = 0) or ("campaigns"."kind" = 'percent' and "campaigns"."value" between 1 and 100) or ("campaigns"."kind" = 'fixed' and "campaigns"."value" >= 1)),
	CONSTRAINT "campaigns_owner_store" CHECK (("campaigns"."owner" = 'store') = ("campaigns"."owner_store_id" is not null) and ("campaigns"."owner" <> 'store' or ("campaigns"."funding_source" = 'store' and "campaigns"."target_kind" = 'store' and "campaigns"."target_store_id" = "campaigns"."owner_store_id" and "campaigns"."kind" <> 'free_shipping'))),
	CONSTRAINT "campaigns_target_consistency" CHECK (("campaigns"."target_kind" = 'all' and "campaigns"."target_city_id" is null and "campaigns"."target_store_id" is null and "campaigns"."target_category_id" is null) or ("campaigns"."target_kind" = 'city' and "campaigns"."target_city_id" is not null and "campaigns"."target_store_id" is null and "campaigns"."target_category_id" is null) or ("campaigns"."target_kind" = 'store' and "campaigns"."target_store_id" is not null and "campaigns"."target_city_id" is null and "campaigns"."target_category_id" is null) or ("campaigns"."target_kind" = 'category' and "campaigns"."target_category_id" is not null and "campaigns"."target_city_id" is null and "campaigns"."target_store_id" is null)),
	CONSTRAINT "campaigns_period" CHECK ("campaigns"."starts_at" is null or "campaigns"."ends_at" is null or "campaigns"."ends_at" > "campaigns"."starts_at"),
	CONSTRAINT "campaigns_window_after_draft" CHECK ("campaigns"."state" = 'draft' or ("campaigns"."starts_at" is not null and "campaigns"."ends_at" is not null)),
	CONSTRAINT "campaigns_budget_required" CHECK ("campaigns"."funding_source" = 'store' or "campaigns"."state" = 'draft' or ("campaigns"."budget_total_cents" is not null and "campaigns"."budget_daily_cents" is not null)),
	CONSTRAINT "campaigns_limit_required" CHECK ("campaigns"."state" = 'draft' or "campaigns"."max_uses" is not null or "campaigns"."budget_total_cents" is not null),
	CONSTRAINT "campaigns_budget_positive" CHECK (("campaigns"."budget_total_cents" is null or "campaigns"."budget_total_cents" > 0) and ("campaigns"."budget_daily_cents" is null or "campaigns"."budget_daily_cents" > 0) and ("campaigns"."max_uses" is null or "campaigns"."max_uses" > 0) and "campaigns"."per_customer_limit" >= 1),
	CONSTRAINT "campaigns_budget_invariant" CHECK ("campaigns"."budget_reserved_cents" >= 0 and "campaigns"."budget_spent_cents" >= 0 and ("campaigns"."budget_total_cents" is null or "campaigns"."budget_reserved_cents" + "campaigns"."budget_spent_cents" <= "campaigns"."budget_total_cents")),
	CONSTRAINT "campaigns_uses_invariant" CHECK ("campaigns"."uses_reserved" >= 0 and "campaigns"."uses_confirmed" >= 0 and ("campaigns"."max_uses" is null or "campaigns"."uses_reserved" + "campaigns"."uses_confirmed" <= "campaigns"."max_uses")),
	CONSTRAINT "campaigns_end_consistency" CHECK (("campaigns"."state" = 'ended') = ("campaigns"."end_reason" is not null and "campaigns"."ended_at" is not null)),
	CONSTRAINT "campaigns_paused_by" CHECK (("campaigns"."state" = 'paused') = ("campaigns"."paused_by" is not null)),
	CONSTRAINT "campaigns_percent_cap" CHECK ("campaigns"."percent_cap_cents" is null or "campaigns"."kind" = 'percent')
);
--> statement-breakpoint
CREATE TABLE "coupon_fraud_claims" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"hmac" varchar(64) NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"order_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"state" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_at" timestamp with time zone,
	CONSTRAINT "coupon_fraud_claims_kind_enum" CHECK ("coupon_fraud_claims"."kind" in ('account', 'device', 'address', 'document')),
	CONSTRAINT "coupon_fraud_claims_state_enum" CHECK ("coupon_fraud_claims"."state" in ('active', 'released')),
	CONSTRAINT "coupon_fraud_claims_hmac" CHECK ("coupon_fraud_claims"."hmac" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "coupon_fraud_claims_state" CHECK (("coupon_fraud_claims"."state" = 'released') = ("coupon_fraud_claims"."released_at" is not null))
);
--> statement-breakpoint
CREATE TABLE "coupon_fraud_signals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"order_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"signal" text NOT NULL,
	"state" text DEFAULT 'open' NOT NULL,
	"detected_at" timestamp with time zone DEFAULT now() NOT NULL,
	"released_by" uuid,
	"released_at" timestamp with time zone,
	"release_reason" varchar(200),
	CONSTRAINT "coupon_fraud_signals_signal_enum" CHECK ("coupon_fraud_signals"."signal" in ('device_accounts', 'address_accounts', 'payer_accounts', 'cancellations', 'account_velocity')),
	CONSTRAINT "coupon_fraud_signals_state_enum" CHECK ("coupon_fraud_signals"."state" in ('open', 'released')),
	CONSTRAINT "coupon_fraud_signals_release" CHECK (("coupon_fraud_signals"."state" = 'released') = ("coupon_fraud_signals"."released_by" is not null and "coupon_fraud_signals"."released_at" is not null and "coupon_fraud_signals"."release_reason" is not null))
);
--> statement-breakpoint
CREATE TABLE "coupon_identifier_sightings" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"kind" text NOT NULL,
	"hmac" varchar(64) NOT NULL,
	"account_hmac" varchar(64) NOT NULL,
	"key_version" smallint DEFAULT 1 NOT NULL,
	"first_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_seen_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "coupon_identifier_sightings_kind_enum" CHECK ("coupon_identifier_sightings"."kind" in ('device', 'address', 'document')),
	CONSTRAINT "coupon_identifier_sightings_hmac" CHECK ("coupon_identifier_sightings"."hmac" ~ '^[a-f0-9]{64}$' and "coupon_identifier_sightings"."account_hmac" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
CREATE TABLE "coupon_reservations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"campaign_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"store_id" uuid NOT NULL,
	"state" text DEFAULT 'reserved' NOT NULL,
	"webag_cents" integer NOT NULL,
	"store_cents" integer NOT NULL,
	"day" date NOT NULL,
	"month" date NOT NULL,
	"refunded_webag_cents" integer DEFAULT 0 NOT NULL,
	"refunded_store_cents" integer DEFAULT 0 NOT NULL,
	"returned_reason" text,
	"reserved_at" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmed_at" timestamp with time zone,
	"returned_at" timestamp with time zone,
	CONSTRAINT "coupon_reservations_state_enum" CHECK ("coupon_reservations"."state" in ('reserved', 'confirmed', 'returned')),
	CONSTRAINT "coupon_reservations_reason_enum" CHECK ("coupon_reservations"."returned_reason" in ('expired', 'cancelled', 'refunded', 'admin')),
	CONSTRAINT "coupon_reservations_amounts" CHECK ("coupon_reservations"."webag_cents" >= 0 and "coupon_reservations"."store_cents" >= 0 and "coupon_reservations"."webag_cents" + "coupon_reservations"."store_cents" > 0),
	CONSTRAINT "coupon_reservations_refund_cap" CHECK ("coupon_reservations"."refunded_webag_cents" between 0 and "coupon_reservations"."webag_cents" and "coupon_reservations"."refunded_store_cents" between 0 and "coupon_reservations"."store_cents"),
	CONSTRAINT "coupon_reservations_state_shape" CHECK (("coupon_reservations"."state" = 'reserved' and "coupon_reservations"."confirmed_at" is null and "coupon_reservations"."returned_at" is null and "coupon_reservations"."returned_reason" is null and "coupon_reservations"."refunded_webag_cents" = 0 and "coupon_reservations"."refunded_store_cents" = 0) or ("coupon_reservations"."state" = 'confirmed' and "coupon_reservations"."confirmed_at" is not null and "coupon_reservations"."returned_at" is null and "coupon_reservations"."returned_reason" is null) or ("coupon_reservations"."state" = 'returned' and "coupon_reservations"."returned_at" is not null and "coupon_reservations"."returned_reason" is not null))
);
--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "visibility" text DEFAULT 'public' NOT NULL;--> statement-breakpoint
ALTER TABLE "coupons" ADD COLUMN "code_origin" text DEFAULT 'manual' NOT NULL;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "campaign_id" uuid;--> statement-breakpoint
ALTER TABLE "orders" ADD COLUMN "coupon_snapshot" jsonb;--> statement-breakpoint
ALTER TABLE "campaign_acceptances" ADD CONSTRAINT "campaign_acceptances_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_acceptances" ADD CONSTRAINT "campaign_acceptances_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_acceptances" ADD CONSTRAINT "campaign_acceptances_enrollment_id_campaign_store_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."campaign_store_enrollments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_acceptances" ADD CONSTRAINT "campaign_acceptances_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budget_days" ADD CONSTRAINT "campaign_budget_days_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budget_entries" ADD CONSTRAINT "campaign_budget_entries_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budget_entries" ADD CONSTRAINT "campaign_budget_entries_reservation_id_coupon_reservations_id_fk" FOREIGN KEY ("reservation_id") REFERENCES "public"."coupon_reservations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_budget_entries" ADD CONSTRAINT "campaign_budget_entries_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_invited_by_users_id_fk" FOREIGN KEY ("invited_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_enrollments" ADD CONSTRAINT "campaign_store_enrollments_responded_by_users_id_fk" FOREIGN KEY ("responded_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_months" ADD CONSTRAINT "campaign_store_months_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaign_store_months" ADD CONSTRAINT "campaign_store_months_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_owner_store_id_stores_id_fk" FOREIGN KEY ("owner_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_target_city_id_cities_id_fk" FOREIGN KEY ("target_city_id") REFERENCES "public"."cities"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_target_store_id_stores_id_fk" FOREIGN KEY ("target_store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_target_category_id_categories_id_fk" FOREIGN KEY ("target_category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_loss_risk_ack_by_users_id_fk" FOREIGN KEY ("loss_risk_ack_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_activated_by_users_id_fk" FOREIGN KEY ("activated_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_fraud_claims" ADD CONSTRAINT "coupon_fraud_claims_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_fraud_signals" ADD CONSTRAINT "coupon_fraud_signals_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_fraud_signals" ADD CONSTRAINT "coupon_fraud_signals_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_fraud_signals" ADD CONSTRAINT "coupon_fraud_signals_released_by_users_id_fk" FOREIGN KEY ("released_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "campaign_acceptances_campaign_idx" ON "campaign_acceptances" USING btree ("campaign_id","store_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_budget_entries_dedupe_uq" ON "campaign_budget_entries" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "campaign_budget_entries_campaign_idx" ON "campaign_budget_entries" USING btree ("campaign_id","funder","kind");--> statement-breakpoint
CREATE INDEX "campaign_budget_entries_reservation_idx" ON "campaign_budget_entries" USING btree ("reservation_id");--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_store_enrollments_uq" ON "campaign_store_enrollments" USING btree ("campaign_id","store_id");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_store_idx" ON "campaign_store_enrollments" USING btree ("store_id","state");--> statement-breakpoint
CREATE INDEX "campaign_store_enrollments_pending_idx" ON "campaign_store_enrollments" USING btree ("expires_at") WHERE "campaign_store_enrollments"."state" = 'pending';--> statement-breakpoint
CREATE INDEX "campaign_store_months_store_idx" ON "campaign_store_months" USING btree ("store_id","month");--> statement-breakpoint
CREATE INDEX "campaigns_list_idx" ON "campaigns" USING btree ("created_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "campaigns_live_idx" ON "campaigns" USING btree ("state","ends_at") WHERE "campaigns"."state" in ('scheduled', 'active', 'paused');--> statement-breakpoint
CREATE INDEX "campaigns_owner_store_idx" ON "campaigns" USING btree ("owner_store_id") WHERE "campaigns"."owner_store_id" is not null;--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_fraud_claims_active_uq" ON "coupon_fraud_claims" USING btree ("kind","hmac") WHERE "coupon_fraud_claims"."state" = 'active';--> statement-breakpoint
CREATE INDEX "coupon_fraud_claims_order_idx" ON "coupon_fraud_claims" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_fraud_claims_created_idx" ON "coupon_fraud_claims" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "coupon_fraud_signals_open_user_idx" ON "coupon_fraud_signals" USING btree ("user_id") WHERE "coupon_fraud_signals"."state" = 'open';--> statement-breakpoint
CREATE INDEX "coupon_fraud_signals_list_idx" ON "coupon_fraud_signals" USING btree ("state","detected_at" DESC NULLS LAST,"id" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "coupon_fraud_signals_campaign_idx" ON "coupon_fraud_signals" USING btree ("campaign_id","detected_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_fraud_signals_order_signal_uq" ON "coupon_fraud_signals" USING btree ("order_id","signal");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_identifier_sightings_uq" ON "coupon_identifier_sightings" USING btree ("kind","hmac","account_hmac");--> statement-breakpoint
CREATE INDEX "coupon_identifier_sightings_window_idx" ON "coupon_identifier_sightings" USING btree ("kind","hmac","last_seen_at");--> statement-breakpoint
CREATE INDEX "coupon_identifier_sightings_retention_idx" ON "coupon_identifier_sightings" USING btree ("last_seen_at");--> statement-breakpoint
CREATE UNIQUE INDEX "coupon_reservations_order_uq" ON "coupon_reservations" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "coupon_reservations_campaign_idx" ON "coupon_reservations" USING btree ("campaign_id","state");--> statement-breakpoint
CREATE INDEX "coupon_reservations_user_campaign_idx" ON "coupon_reservations" USING btree ("user_id","campaign_id") WHERE "coupon_reservations"."state" in ('reserved', 'confirmed');--> statement-breakpoint
CREATE INDEX "coupon_reservations_store_idx" ON "coupon_reservations" USING btree ("store_id","campaign_id");--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "orders" ADD CONSTRAINT "orders_campaign_id_campaigns_id_fk" FOREIGN KEY ("campaign_id") REFERENCES "public"."campaigns"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coupons_campaign_idx" ON "coupons" USING btree ("campaign_id") WHERE "coupons"."campaign_id" is not null;--> statement-breakpoint
CREATE INDEX "orders_campaign_idx" ON "orders" USING btree ("campaign_id","paid_at") WHERE "orders"."campaign_id" is not null;--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_private_code_strength" CHECK ("coupons"."visibility" = 'public' or ("coupons"."code_origin" = 'generated' and char_length("coupons"."code") >= 8));
--> statement-breakpoint
-- Append-only (D-06, SEC-041): a prova do aceite da loja e o diário do orçamento nunca são alterados nem apagados, por QUALQUER papel (a função vem da 0001).
CREATE TRIGGER "campaign_acceptances_append_only" BEFORE UPDATE OR DELETE ON "campaign_acceptances" FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER "campaign_acceptances_no_truncate" BEFORE TRUNCATE ON "campaign_acceptances" FOR EACH STATEMENT EXECUTE FUNCTION webag_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER "campaign_budget_entries_append_only" BEFORE UPDATE OR DELETE ON "campaign_budget_entries" FOR EACH ROW EXECUTE FUNCTION webag_forbid_mutation();--> statement-breakpoint
CREATE TRIGGER "campaign_budget_entries_no_truncate" BEFORE TRUNCATE ON "campaign_budget_entries" FOR EACH STATEMENT EXECUTE FUNCTION webag_forbid_mutation();--> statement-breakpoint
-- Reforço do `webag_app` (D19 item 2). Protegido por IF EXISTS: em dev sem o init de papéis o `REVOKE` solto falharia; o `app-grants.ts` reafirma a cada `migrate` (as duas tabelas estão em APPEND_ONLY_TABLES).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') THEN
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "campaign_acceptances" FROM webag_app;
    REVOKE UPDATE, DELETE, TRUNCATE ON TABLE "campaign_budget_entries" FROM webag_app;
  END IF;
END $$;--> statement-breakpoint
-- Invariante do orçamento: devolve UMA LINHA por contador que diverge do diário `campaign_budget_entries` (vazio = tudo conciliado). Só leitura; o job de conciliação e o teste a chamam.
--   campanha:  reservado = soma(reserve) - soma(confirm) - soma(release);  gasto = soma(confirm) - soma(refund)   (por quem paga: webag no total e no dia, store no mês da loja)
--   usos:      usos reservados e confirmados = reservas em cada estado (estorno total devolve o uso: estado `returned`)
CREATE OR REPLACE FUNCTION campaign_budget_violations() RETURNS TABLE (campaign_id uuid, scope text, counter text, expected bigint, actual bigint)
LANGUAGE sql STABLE AS $fn$
  WITH j AS (
    SELECT e.campaign_id, e.funder, e.day, e.month, e.store_id,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'reserve'), 0) AS res,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'confirm'), 0) AS conf,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'release'), 0) AS rel,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'refund'), 0) AS ref
      FROM campaign_budget_entries e GROUP BY e.campaign_id, e.funder, e.day, e.month, e.store_id
  ), total AS (
    SELECT campaign_id, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'webag' GROUP BY campaign_id
  ), per_day AS (
    SELECT campaign_id, day, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'webag' GROUP BY campaign_id, day
  ), per_month AS (
    SELECT campaign_id, store_id, month, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'store' GROUP BY campaign_id, store_id, month
  )
  SELECT c.id, 'campaign', 'budget_reserved_cents', COALESCE(t.reserved, 0)::bigint, c.budget_reserved_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_reserved_cents <> COALESCE(t.reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'budget_spent_cents', COALESCE(t.spent, 0)::bigint, c.budget_spent_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_spent_cents <> COALESCE(t.spent, 0)
  UNION ALL
  SELECT d.campaign_id, 'day:' || d.day::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, d.reserved_cents::bigint
    FROM campaign_budget_days d LEFT JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE d.reserved_cents <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT d.campaign_id, 'day:' || d.day::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, d.spent_cents::bigint
    FROM campaign_budget_days d LEFT JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE d.spent_cents <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT m.campaign_id, 'store_month:' || m.store_id::text || ':' || m.month::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, m.reserved_cents::bigint
    FROM campaign_store_months m LEFT JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE m.reserved_cents <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT m.campaign_id, 'store_month:' || m.store_id::text || ':' || m.month::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, m.spent_cents::bigint
    FROM campaign_store_months m LEFT JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE m.spent_cents <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_reserved', COALESCE(u.reserved, 0)::bigint, c.uses_reserved::bigint
    FROM campaigns c LEFT JOIN (SELECT campaign_id, count(*) FILTER (WHERE state = 'reserved') AS reserved FROM coupon_reservations GROUP BY campaign_id) u ON u.campaign_id = c.id WHERE c.uses_reserved <> COALESCE(u.reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_confirmed', COALESCE(u.confirmed, 0)::bigint, c.uses_confirmed::bigint
    FROM campaigns c LEFT JOIN (SELECT campaign_id, count(*) FILTER (WHERE state = 'confirmed') AS confirmed FROM coupon_reservations GROUP BY campaign_id) u ON u.campaign_id = c.id WHERE c.uses_confirmed <> COALESCE(u.confirmed, 0)
$fn$;
