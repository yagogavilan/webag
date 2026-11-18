CREATE TABLE "category_commission_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"category_id" uuid NOT NULL,
	"pct_bp" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_commission_rates_pct_chk" CHECK ("category_commission_rates"."pct_bp" is null or ("category_commission_rates"."pct_bp" >= 0 and "category_commission_rates"."pct_bp" <= 3000)),
	CONSTRAINT "category_commission_rates_period_chk" CHECK ("category_commission_rates"."ends_at" is null or "category_commission_rates"."ends_at" > "category_commission_rates"."starts_at")
);
--> statement-breakpoint
CREATE TABLE "ledger_entries" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"transaction_id" uuid NOT NULL,
	"account" text NOT NULL,
	"direction" text NOT NULL,
	"amount_cents" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "ledger_entries_amount_chk" CHECK ("ledger_entries"."amount_cents" > 0)
);
--> statement-breakpoint
CREATE TABLE "ledger_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"order_id" uuid NOT NULL,
	"store_id" uuid,
	"attempt_id" uuid,
	"kind" text NOT NULL,
	"dedupe_key" text NOT NULL,
	"meta" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "store_commission_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"pct_bp" integer,
	"starts_at" timestamp with time zone DEFAULT now() NOT NULL,
	"ends_at" timestamp with time zone,
	"reason" text NOT NULL,
	"created_by" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "store_commission_rates_pct_chk" CHECK ("store_commission_rates"."pct_bp" is null or ("store_commission_rates"."pct_bp" >= 0 and "store_commission_rates"."pct_bp" <= 3000)),
	CONSTRAINT "store_commission_rates_period_chk" CHECK ("store_commission_rates"."ends_at" is null or "store_commission_rates"."ends_at" > "store_commission_rates"."starts_at")
);
--> statement-breakpoint
ALTER TABLE "category_commission_rates" ADD CONSTRAINT "category_commission_rates_category_id_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."categories"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "category_commission_rates" ADD CONSTRAINT "category_commission_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_entries" ADD CONSTRAINT "ledger_entries_transaction_id_ledger_transactions_id_fk" FOREIGN KEY ("transaction_id") REFERENCES "public"."ledger_transactions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ledger_transactions" ADD CONSTRAINT "ledger_transactions_attempt_id_payment_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."payment_attempts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_commission_rates" ADD CONSTRAINT "store_commission_rates_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "store_commission_rates" ADD CONSTRAINT "store_commission_rates_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "category_commission_rates_cat_idx" ON "category_commission_rates" USING btree ("category_id","starts_at");--> statement-breakpoint
CREATE INDEX "ledger_entries_tx_idx" ON "ledger_entries" USING btree ("transaction_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ledger_transactions_dedupe_uq" ON "ledger_transactions" USING btree ("dedupe_key");--> statement-breakpoint
CREATE INDEX "ledger_transactions_order_idx" ON "ledger_transactions" USING btree ("order_id");--> statement-breakpoint
CREATE INDEX "ledger_transactions_store_idx" ON "ledger_transactions" USING btree ("store_id","created_at");--> statement-breakpoint
CREATE INDEX "store_commission_rates_store_idx" ON "store_commission_rates" USING btree ("store_id","starts_at");--> statement-breakpoint
-- SEC-041: ledger append-only. A aplicação nunca atualiza nem apaga lançamento; correção é lançamento inverso.
CREATE FUNCTION "ledger_block_mutation"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
	RAISE EXCEPTION 'ledger é append-only (SEC-041): % em % não é permitido', TG_OP, TG_TABLE_NAME USING ERRCODE = '55000';
END;
$$;--> statement-breakpoint
CREATE TRIGGER "ledger_entries_append_only" BEFORE UPDATE OR DELETE ON "ledger_entries" FOR EACH ROW EXECUTE FUNCTION "ledger_block_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_append_only" BEFORE UPDATE OR DELETE ON "ledger_transactions" FOR EACH ROW EXECUTE FUNCTION "ledger_block_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_entries_no_truncate" BEFORE TRUNCATE ON "ledger_entries" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_block_mutation"();--> statement-breakpoint
CREATE TRIGGER "ledger_transactions_no_truncate" BEFORE TRUNCATE ON "ledger_transactions" FOR EACH STATEMENT EXECUTE FUNCTION "ledger_block_mutation"();--> statement-breakpoint
-- Dupla entrada: ao fim da transação de banco, débitos = créditos em cada lançamento (e há pelo menos 2 linhas).
CREATE FUNCTION "ledger_assert_balanced"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
	diff bigint;
	n integer;
BEGIN
	SELECT COALESCE(SUM(CASE direction WHEN 'debit' THEN amount_cents ELSE -amount_cents END), 0), COUNT(*)
		INTO diff, n FROM ledger_entries WHERE transaction_id = NEW.transaction_id;
	IF diff <> 0 OR n < 2 THEN
		RAISE EXCEPTION 'lançamento % não fecha (diferença % centavos, % linhas)', NEW.transaction_id, diff, n USING ERRCODE = '23514';
	END IF;
	RETURN NULL;
END;
$$;--> statement-breakpoint
CREATE CONSTRAINT TRIGGER "ledger_entries_balanced" AFTER INSERT ON "ledger_entries" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION "ledger_assert_balanced"();
