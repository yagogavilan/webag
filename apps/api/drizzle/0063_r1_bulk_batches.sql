-- WB-377 / WB-353 (ADR-018 D17, D18): lotes de ação em massa do catálogo (histórico e desfazer de 10 min do reajuste). Só tabelas NOVAS (sem reescrita de tabela existente);
-- as FKs seguram um bloqueio curto em `stores`, `products` e `users`, por isso o `lock_timeout`. Reversão: drizzle/down/0063.sql (apaga as 2 tabelas: o histórico de lotes some, o `audit_log` fica).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE TABLE "product_bulk_batch_items" (
	"batch_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"previous_version" integer NOT NULL,
	"applied_version" integer NOT NULL,
	"previous_price_cents" integer NOT NULL,
	"applied_price_cents" integer NOT NULL,
	"variants" jsonb DEFAULT '[]'::jsonb NOT NULL,
	CONSTRAINT "product_bulk_batch_items_batch_id_product_id_pk" PRIMARY KEY("batch_id","product_id")
);
--> statement-breakpoint
CREATE TABLE "product_bulk_batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"store_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"source" text NOT NULL,
	"actor_user_id" uuid,
	"items_count" integer NOT NULL,
	"params" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"undo_until" timestamp with time zone,
	"undone_at" timestamp with time zone,
	"undone_by" uuid,
	"undo_result" jsonb,
	CONSTRAINT "product_bulk_batches_items_positive" CHECK ("product_bulk_batches"."items_count" >= 1),
	CONSTRAINT "product_bulk_batches_undo_only_price" CHECK ("product_bulk_batches"."undo_until" is null or "product_bulk_batches"."kind" = 'price_adjust')
);
--> statement-breakpoint
ALTER TABLE "product_bulk_batch_items" ADD CONSTRAINT "product_bulk_batch_items_batch_id_product_bulk_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."product_bulk_batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bulk_batch_items" ADD CONSTRAINT "product_bulk_batch_items_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bulk_batches" ADD CONSTRAINT "product_bulk_batches_store_id_stores_id_fk" FOREIGN KEY ("store_id") REFERENCES "public"."stores"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bulk_batches" ADD CONSTRAINT "product_bulk_batches_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bulk_batches" ADD CONSTRAINT "product_bulk_batches_undone_by_users_id_fk" FOREIGN KEY ("undone_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_bulk_batch_items_product_idx" ON "product_bulk_batch_items" USING btree ("product_id");--> statement-breakpoint
CREATE INDEX "product_bulk_batches_store_idx" ON "product_bulk_batches" USING btree ("store_id","created_at" DESC NULLS LAST,"id" DESC NULLS LAST);