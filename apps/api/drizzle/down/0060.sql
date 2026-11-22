-- Reversão da 0060_r1_admin_edit_support (R1.1). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: `admin_view_sessions` (sessões do "Ver como"), `store_admin_changes` (feed de alterações do admin para o lojista) e `store_change_digest`
-- (resumo diário). A trilha oficial continua no `audit_log` (append-only). Apagar dado exige autorização do fundador (CLAUDE.md §7.6): só use com ela,
-- ou em staging. Os DROPs tomam bloqueio exclusivo curto em `users`, `sessions` e `stores` (FKs): fora do horário de pico. Ordem: filha antes da mãe.
DROP TABLE IF EXISTS "store_change_digest";
DROP TABLE IF EXISTS "store_admin_changes";
DROP TABLE IF EXISTS "admin_view_sessions";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795353050981;
