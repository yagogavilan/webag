-- Reversão da 0065_r2_dashboards_catalog_interest (v1.1 R2, ADR-019). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: agregados dos painéis (recalculáveis a partir de `orders`), painéis e widgets salvos pelos admins, histórico de preço (NÃO recuperável: o passado do preço
-- só existe aqui; sem ele o selo "de/por" volta a ser decidido sem prova), códigos de barras das variações, o catálogo de referência e as respostas da porta falsa.
-- Apagar dado exige autorização do fundador (CLAUDE.md §7.6): só use com ela, ou em staging. Ordem: filhas antes das mães.
SET LOCAL lock_timeout = '5s';
DROP TABLE IF EXISTS "dashboard_widgets";
DROP TABLE IF EXISTS "dashboards";
DROP TABLE IF EXISTS "dashboard_refresh_state";
DROP TABLE IF EXISTS "dashboard_distinct_daily";
DROP TABLE IF EXISTS "dashboard_item_facts";
DROP TABLE IF EXISTS "dashboard_daily_facts";
DROP TABLE IF EXISTS "analytics_interest";
DROP TABLE IF EXISTS "reference_barcodes";
DROP TABLE IF EXISTS "product_barcodes";
DROP TABLE IF EXISTS "product_price_history";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795391779698;
