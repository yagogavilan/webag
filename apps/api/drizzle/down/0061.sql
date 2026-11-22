-- Reversão da 0061_r1_catalog_version (R1.2). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: `product_creation_metrics` (métrica de criação de produto) e as colunas novas de `products` (`version`, `via`, `created_by_admin_id`,
-- `duplicated_from`) e de `categories` (`template`, `description_required`, `description_min_chars`). Linhas de produto NÃO são apagadas; rascunhos
-- (`status = 'draft'`) continuam existindo. Exige autorização do fundador (CLAUDE.md §7.6) fora do staging. Reverte o CHECK de nome (rascunho novo nasce com nome vazio).
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_via_valid";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_version_positive";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_name_len";
DROP INDEX IF EXISTS "products_store_drafts_idx";
ALTER TABLE "products" DROP CONSTRAINT IF EXISTS "products_created_by_admin_id_users_id_fk";
ALTER TABLE "products" DROP COLUMN IF EXISTS "duplicated_from";
ALTER TABLE "products" DROP COLUMN IF EXISTS "created_by_admin_id";
ALTER TABLE "products" DROP COLUMN IF EXISTS "via";
ALTER TABLE "products" DROP COLUMN IF EXISTS "version";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "description_min_chars";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "description_required";
ALTER TABLE "categories" DROP COLUMN IF EXISTS "template";
DROP TABLE IF EXISTS "product_creation_metrics";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795355095828;
