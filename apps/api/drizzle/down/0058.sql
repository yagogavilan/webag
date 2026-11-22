-- Reversão da 0058_r1_store_version (R1.1). Regra 5 do modelo de dados; NÃO é lida pelo migrator (só o teste e o runbook a executam).
-- Rodar como webag_migrator, numa transação (psql -1 -f). Perde `stores.version` (controle de concorrência da edição do admin): rollback só da versão da API
-- que a usa, antes de qualquer loja real editar por ela. Depois de reverter, o registro do Drizzle é apagado para a migração poder ser reaplicada.
ALTER TABLE "stores" DROP COLUMN IF EXISTS "version";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795351780124;
