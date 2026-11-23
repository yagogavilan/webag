-- Reversão da 0066_r2_review_fixes (v1.1 R2.1: correções do tech-lead e do security). Rodar como webag_migrator, numa transação (psql -1 -f), ANTES de 0065 e 0064.
-- Não apaga dado: só tira as restrições, os índices e o gatilho que a 0066 pôs e devolve a função de invariante da 0064 (unidirecional). Os `REVOKE` da 0066 NÃO são desfeitos
-- (o `app-grants.ts` é quem dá os privilégios do `webag_app` a cada `migrate`; sem a 0066 ele volta a conceder `DELETE` nas duas tabelas).
SET LOCAL lock_timeout = '5s';
DROP TRIGGER IF EXISTS "product_price_history_close_only" ON "product_price_history";
DROP FUNCTION IF EXISTS webag_price_history_close_only();
ALTER TABLE IF EXISTS "coupons" DROP CONSTRAINT IF EXISTS "coupons_code_origin_enum";
ALTER TABLE IF EXISTS "coupons" DROP CONSTRAINT IF EXISTS "coupons_visibility_enum";
ALTER TABLE IF EXISTS "coupon_reservations" DROP CONSTRAINT IF EXISTS "coupon_reservations_month";
ALTER TABLE IF EXISTS "campaigns" DROP CONSTRAINT IF EXISTS "campaigns_store_funded_no_webag_budget";
ALTER TABLE IF EXISTS "campaign_store_months" DROP CONSTRAINT IF EXISTS "campaign_store_months_month_first_day";
ALTER TABLE IF EXISTS "campaign_budget_entries" DROP CONSTRAINT IF EXISTS "campaign_budget_entries_month";
ALTER TABLE IF EXISTS "campaign_budget_entries" DROP CONSTRAINT IF EXISTS "campaign_budget_entries_store_funder";
DROP INDEX IF EXISTS "orders_paid_idx";
DROP INDEX IF EXISTS "orders_updated_idx";
ALTER TABLE IF EXISTS "campaign_acceptances" DROP CONSTRAINT IF EXISTS "campaign_acceptances_enrollment_scope_fk";
DROP INDEX IF EXISTS "campaign_store_enrollments_scope_uq";
-- A função de invariante volta à forma da 0064 (unidirecional); a reversão da 0064 a apaga em seguida (ordem: 0066, 0065, 0064). Só se as tabelas ainda existem (o script é repetível).
DO $do$ BEGIN
  IF to_regclass('public.coupon_reservations') IS NOT NULL THEN
    EXECUTE $fn$
CREATE OR REPLACE FUNCTION campaign_budget_violations() RETURNS TABLE (campaign_id uuid, scope text, counter text, expected bigint, actual bigint)
LANGUAGE sql STABLE AS $body$
  WITH j AS (
    SELECT e.campaign_id, e.funder, e.day, e.month, e.store_id,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'reserve'), 0) AS res,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'confirm'), 0) AS conf,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'release'), 0) AS rel,
           COALESCE(SUM(e.amount_cents) FILTER (WHERE e.kind = 'refund'), 0) AS ref
      FROM campaign_budget_entries e GROUP BY e.campaign_id, e.funder, e.day, e.month, e.store_id
  ), total AS (
    SELECT campaign_id, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'webag' GROUP BY campaign_id
  ), per_day AS (
    SELECT campaign_id, day, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'webag' GROUP BY campaign_id, day
  ), per_month AS (
    SELECT campaign_id, store_id, month, SUM(res - conf - rel) AS reserved, SUM(conf - ref) AS spent FROM j WHERE funder = 'store' GROUP BY campaign_id, store_id, month
  )
  SELECT c.id, 'campaign', 'budget_reserved_cents', COALESCE(t.reserved, 0)::bigint, c.budget_reserved_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_reserved_cents <> COALESCE(t.reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'budget_spent_cents', COALESCE(t.spent, 0)::bigint, c.budget_spent_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_spent_cents <> COALESCE(t.spent, 0)
  UNION ALL
  SELECT d.campaign_id, 'day:' || d.day::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, d.reserved_cents::bigint
    FROM campaign_budget_days d LEFT JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE d.reserved_cents <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT d.campaign_id, 'day:' || d.day::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, d.spent_cents::bigint
    FROM campaign_budget_days d LEFT JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE d.spent_cents <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT m.campaign_id, 'store_month:' || m.store_id::text || ':' || m.month::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, m.reserved_cents::bigint
    FROM campaign_store_months m LEFT JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE m.reserved_cents <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT m.campaign_id, 'store_month:' || m.store_id::text || ':' || m.month::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, m.spent_cents::bigint
    FROM campaign_store_months m LEFT JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE m.spent_cents <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_reserved', COALESCE(u.reserved, 0)::bigint, c.uses_reserved::bigint
    FROM campaigns c LEFT JOIN (SELECT campaign_id, count(*) FILTER (WHERE state = 'reserved') AS reserved FROM coupon_reservations GROUP BY campaign_id) u ON u.campaign_id = c.id WHERE c.uses_reserved <> COALESCE(u.reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_confirmed', COALESCE(u.confirmed, 0)::bigint, c.uses_confirmed::bigint
    FROM campaigns c LEFT JOIN (SELECT campaign_id, count(*) FILTER (WHERE state = 'confirmed') AS confirmed FROM coupon_reservations GROUP BY campaign_id) u ON u.campaign_id = c.id WHERE c.uses_confirmed <> COALESCE(u.confirmed, 0)
$body$;
    $fn$;
  END IF;
END $do$;
DELETE FROM "drizzle"."__drizzle_migrations" WHERE "created_at" = 1795395386091;
