-- Reversão da 0059_r1_audit_store_id (R1.1). Rodar como webag_migrator, numa transação (psql -1 -f).
-- `audit_log` é append-only (gatilho em UPDATE/DELETE, D-06): DDL não dispara o gatilho, então o DROP COLUMN passa e nenhuma LINHA é apagada. Perde-se só
-- `store_id` (o vínculo linha-loja do histórico por loja); a contagem de linhas de `audit_log` não muda (conferir `select count(*)` antes e depois).
-- DROP INDEX e DROP COLUMN pedem bloqueio exclusivo curto em `audit_log`: fora do horário de pico.
DROP INDEX IF EXISTS "audit_log_store_at_idx";
ALTER TABLE "audit_log" DROP COLUMN IF EXISTS "store_id";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795351784283;
