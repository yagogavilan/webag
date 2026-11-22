-- Reversão da 0062_r1_moderation_event_set_null (BUG-042). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: as linhas de `product_moderation_events` cujo produto já foi apagado (`product_id IS NULL`: eventos de rascunhos excluídos), porque a coluna volta a ser NOT NULL.
-- Isso reduz a contagem da regra "3 remoções em 30 dias". Exige autorização do fundador (CLAUDE.md §7.6) fora do staging. Depois da reversão, apagar rascunho com evento volta a falhar.
SET LOCAL lock_timeout = '5s';
DROP INDEX IF EXISTS "product_moderation_events_product_idx";
ALTER TABLE "product_moderation_events" DROP CONSTRAINT IF EXISTS "product_moderation_events_product_id_products_id_fk";
DELETE FROM "product_moderation_events" WHERE "product_id" IS NULL;
ALTER TABLE "product_moderation_events" ALTER COLUMN "product_id" SET NOT NULL;
ALTER TABLE "product_moderation_events" ADD CONSTRAINT "product_moderation_events_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE no action ON UPDATE no action;
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795371091799;
