-- Reversão da 0063_r1_bulk_batches (WB-377 / WB-353). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: o histórico de lotes de ação em massa (`product_bulk_batches` e `product_bulk_batch_items`) e, com ele, o "Desfazer" dos reajustes recentes.
-- O `audit_log` (antes/depois por item) NÃO é tocado. Fora do staging exige autorização do fundador (CLAUDE.md §7.6).
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "product_bulk_batch_items";
DROP TABLE IF EXISTS "product_bulk_batches";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795377034068;
