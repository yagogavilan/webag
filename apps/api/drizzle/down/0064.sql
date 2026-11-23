-- Reversão da 0064_r2_campaigns (v1.1 R2, ADR-019). Rodar como webag_migrator, numa transação (psql -1 -f).
-- APAGA DADO: campanhas, adesões e a PROVA DE ACEITE das lojas (`campaign_acceptances`, append-only), reservas e o diário do orçamento (`campaign_budget_entries`),
-- o antifraude (`coupon_fraud_*`, `coupon_identifier_sightings`) e as colunas `coupons.campaign_id/visibility/code_origin`, `orders.campaign_id/coupon_snapshot`
-- (o snapshot do desconto composto dos pedidos já feitos com campanha SOME; o `discount`, `store_coupon` e `platform_discount` do pedido ficam). Os cupons que estavam ligados a uma
-- campanha ficam INATIVOS (R3: a regra de público e visibilidade vivia na campanha e some com ela). Apagar dado exige autorização do fundador
-- (CLAUDE.md §7.6): só use com ela, ou em staging. A prova de aceite é a evidência de adesão da loja: exporte-a antes (ADR-019 D14).
-- Os gatilhos append-only das duas tabelas caem com os DROP TABLE (o DROP não dispara `BEFORE DELETE`). Ordem: filhas antes das mães; colunas antes da tabela `campaigns`.
SET LOCAL lock_timeout = '5s';
DROP FUNCTION IF EXISTS campaign_budget_violations();
ALTER TABLE "orders" DROP CONSTRAINT IF EXISTS "orders_campaign_id_campaigns_id_fk";
DROP INDEX IF EXISTS "orders_campaign_idx";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "coupon_snapshot";
ALTER TABLE "orders" DROP COLUMN IF EXISTS "campaign_id";
-- R3 (review R2.1): a regra de público, alvo e visibilidade vivia na CAMPANHA; sem ela o código dela viraria cupom comum (um código privado ou segmentado ficaria público).
-- Por isso os códigos de campanha são DESATIVADOS antes de a ligação sumir (o `coupon_redemptions` e o histórico ficam; reativar um é decisão consciente do admin, pelo cupom legado).
DO $do$ BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'coupons' AND column_name = 'campaign_id') THEN
    UPDATE "coupons" SET "active" = false WHERE "campaign_id" IS NOT NULL;
  END IF;
END $do$;
ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_private_code_strength";
ALTER TABLE "coupons" DROP CONSTRAINT IF EXISTS "coupons_campaign_id_campaigns_id_fk";
DROP INDEX IF EXISTS "coupons_campaign_idx";
ALTER TABLE "coupons" DROP COLUMN IF EXISTS "campaign_id";
ALTER TABLE "coupons" DROP COLUMN IF EXISTS "visibility";
ALTER TABLE "coupons" DROP COLUMN IF EXISTS "code_origin";
DROP TABLE IF EXISTS "coupon_fraud_signals";
DROP TABLE IF EXISTS "coupon_identifier_sightings";
DROP TABLE IF EXISTS "coupon_fraud_claims";
DROP TABLE IF EXISTS "campaign_budget_entries";
DROP TABLE IF EXISTS "coupon_reservations";
DROP TABLE IF EXISTS "campaign_store_months";
DROP TABLE IF EXISTS "campaign_budget_days";
DROP TABLE IF EXISTS "campaign_acceptances";
DROP TABLE IF EXISTS "campaign_store_enrollments";
DROP TABLE IF EXISTS "campaigns";
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795393639610;
