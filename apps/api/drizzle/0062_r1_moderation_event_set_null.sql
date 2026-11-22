-- BUG-042: apagar rascunho (rota de excluir ou vencimento de 30 dias) falhava na FK `NO ACTION` de `product_moderation_events.product_id` (a cópia de produto moderado nasce com evento).
-- O evento sobrevive ao produto apagado (`product_id` vira NULL): a regra "3 remoções em 30 dias" conta por `store_id`, então apagar o rascunho não zera a contagem da loja.
-- Tabela pequena (1 linha por ação de moderação); lock_timeout curto para não enfileirar atrás de transação longa. Reversão: drizzle/down/0062.sql.
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
ALTER TABLE "product_moderation_events" DROP CONSTRAINT "product_moderation_events_product_id_products_id_fk";--> statement-breakpoint
ALTER TABLE "product_moderation_events" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "product_moderation_events" ADD CONSTRAINT "product_moderation_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_moderation_events_product_idx" ON "product_moderation_events" USING btree ("product_id");
