-- v1.1 R2.1, correções da revisão do tech-lead (reviews/r2-1-contrato-2026-11-23.md: R1, R2, R4, S6) e do security (SEC-227, SEC-229, SEC-230). Aditiva sobre a 0064/0065.
-- Sem dado a corrigir (as tabelas da R2 ainda não têm linha fora do dev). Os `CHECK` entram sem NOT VALID por isso; em tabela com dado, validar em lote antes.
-- `orders_updated_idx` e `orders_paid_idx` não usam CONCURRENTLY (não cabe no `migrate`, review R1 B4): a tabela é pequena no piloto; com volume, criar à parte.
-- Reversão: drizzle/down/0066.sql (só tira o que esta migração pôs; nenhum dado se perde).
SET LOCAL lock_timeout = '5s';--> statement-breakpoint
CREATE UNIQUE INDEX "campaign_store_enrollments_scope_uq" ON "campaign_store_enrollments" USING btree ("id","store_id","campaign_id");--> statement-breakpoint
ALTER TABLE "campaign_acceptances" ADD CONSTRAINT "campaign_acceptances_enrollment_scope_fk" FOREIGN KEY ("enrollment_id","store_id","campaign_id") REFERENCES "public"."campaign_store_enrollments"("id","store_id","campaign_id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "orders_updated_idx" ON "orders" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "orders_paid_idx" ON "orders" USING btree ("paid_at") WHERE "orders"."paid_at" is not null;--> statement-breakpoint
ALTER TABLE "campaign_budget_entries" ADD CONSTRAINT "campaign_budget_entries_store_funder" CHECK ("campaign_budget_entries"."funder" <> 'store' or "campaign_budget_entries"."store_id" is not null);--> statement-breakpoint
ALTER TABLE "campaign_budget_entries" ADD CONSTRAINT "campaign_budget_entries_month" CHECK ("campaign_budget_entries"."month" = date_trunc('month', "campaign_budget_entries"."day"::timestamp)::date);--> statement-breakpoint
ALTER TABLE "campaign_store_months" ADD CONSTRAINT "campaign_store_months_month_first_day" CHECK ("campaign_store_months"."month" = date_trunc('month', "campaign_store_months"."month"::timestamp)::date);--> statement-breakpoint
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_store_funded_no_webag_budget" CHECK ("campaigns"."funding_source" <> 'store' or ("campaigns"."budget_reserved_cents" = 0 and "campaigns"."budget_spent_cents" = 0));--> statement-breakpoint
ALTER TABLE "coupon_reservations" ADD CONSTRAINT "coupon_reservations_month" CHECK ("coupon_reservations"."month" = date_trunc('month', "coupon_reservations"."day"::timestamp)::date);--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_visibility_enum" CHECK ("coupons"."visibility" in ('public', 'private'));--> statement-breakpoint
ALTER TABLE "coupons" ADD CONSTRAINT "coupons_code_origin_enum" CHECK ("coupons"."code_origin" in ('manual', 'generated'));--> statement-breakpoint

-- R1 + SEC-229: o invariante agora é BIDIRECIONAL (FULL JOIN: entrada no diário para um dia ou mês SEM linha de contador aparece, esperado x real, ausente = 0) e confere também
-- as reservas contra os contadores (`coupon_reservations` x `campaigns` e `campaign_store_months`): o contador, o diário e a reserva têm de contar a mesma história.
CREATE OR REPLACE FUNCTION campaign_budget_violations() RETURNS TABLE (campaign_id uuid, scope text, counter text, expected bigint, actual bigint)
LANGUAGE sql STABLE AS $fn$
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
  ), resv AS (
    SELECT campaign_id,
           COALESCE(SUM(webag_cents) FILTER (WHERE state = 'reserved'), 0) AS webag_reserved,
           COALESCE(SUM(webag_cents - refunded_webag_cents) FILTER (WHERE confirmed_at IS NOT NULL), 0) AS webag_spent,
           COALESCE(SUM(store_cents) FILTER (WHERE state = 'reserved'), 0) AS store_reserved,
           COALESCE(SUM(store_cents - refunded_store_cents) FILTER (WHERE confirmed_at IS NOT NULL), 0) AS store_spent,
           count(*) FILTER (WHERE state = 'reserved') AS n_reserved,
           count(*) FILTER (WHERE state = 'confirmed') AS n_confirmed
      FROM coupon_reservations GROUP BY campaign_id
  ), store_counters AS (
    SELECT campaign_id, SUM(reserved_cents) AS reserved, SUM(spent_cents) AS spent FROM campaign_store_months GROUP BY campaign_id
  )
  SELECT c.id, 'campaign', 'budget_reserved_cents', COALESCE(t.reserved, 0)::bigint, c.budget_reserved_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_reserved_cents <> COALESCE(t.reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'budget_spent_cents', COALESCE(t.spent, 0)::bigint, c.budget_spent_cents::bigint
    FROM campaigns c LEFT JOIN total t ON t.campaign_id = c.id WHERE c.budget_spent_cents <> COALESCE(t.spent, 0)
  UNION ALL
  SELECT COALESCE(d.campaign_id, p.campaign_id), 'day:' || COALESCE(d.day, p.day)::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, COALESCE(d.reserved_cents, 0)::bigint
    FROM campaign_budget_days d FULL JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE COALESCE(d.reserved_cents, 0) <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT COALESCE(d.campaign_id, p.campaign_id), 'day:' || COALESCE(d.day, p.day)::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, COALESCE(d.spent_cents, 0)::bigint
    FROM campaign_budget_days d FULL JOIN per_day p ON p.campaign_id = d.campaign_id AND p.day = d.day WHERE COALESCE(d.spent_cents, 0) <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT COALESCE(m.campaign_id, p.campaign_id), 'store_month:' || COALESCE(m.store_id, p.store_id)::text || ':' || COALESCE(m.month, p.month)::text, 'reserved_cents', COALESCE(p.reserved, 0)::bigint, COALESCE(m.reserved_cents, 0)::bigint
    FROM campaign_store_months m FULL JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE COALESCE(m.reserved_cents, 0) <> COALESCE(p.reserved, 0)
  UNION ALL
  SELECT COALESCE(m.campaign_id, p.campaign_id), 'store_month:' || COALESCE(m.store_id, p.store_id)::text || ':' || COALESCE(m.month, p.month)::text, 'spent_cents', COALESCE(p.spent, 0)::bigint, COALESCE(m.spent_cents, 0)::bigint
    FROM campaign_store_months m FULL JOIN per_month p ON p.campaign_id = m.campaign_id AND p.store_id = m.store_id AND p.month = m.month WHERE COALESCE(m.spent_cents, 0) <> COALESCE(p.spent, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_reserved', COALESCE(r.n_reserved, 0)::bigint, c.uses_reserved::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id WHERE c.uses_reserved <> COALESCE(r.n_reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'uses_confirmed', COALESCE(r.n_confirmed, 0)::bigint, c.uses_confirmed::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id WHERE c.uses_confirmed <> COALESCE(r.n_confirmed, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'reservations_webag_reserved', COALESCE(r.webag_reserved, 0)::bigint, c.budget_reserved_cents::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id WHERE c.budget_reserved_cents <> COALESCE(r.webag_reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'reservations_webag_spent', COALESCE(r.webag_spent, 0)::bigint, c.budget_spent_cents::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id WHERE c.budget_spent_cents <> COALESCE(r.webag_spent, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'reservations_store_reserved', COALESCE(r.store_reserved, 0)::bigint, COALESCE(sc.reserved, 0)::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id LEFT JOIN store_counters sc ON sc.campaign_id = c.id WHERE COALESCE(sc.reserved, 0) <> COALESCE(r.store_reserved, 0)
  UNION ALL
  SELECT c.id, 'campaign', 'reservations_store_spent', COALESCE(r.store_spent, 0)::bigint, COALESCE(sc.spent, 0)::bigint
    FROM campaigns c LEFT JOIN resv r ON r.campaign_id = c.id LEFT JOIN store_counters sc ON sc.campaign_id = c.id WHERE COALESCE(sc.spent, 0) <> COALESCE(r.store_spent, 0)
$fn$;
--> statement-breakpoint
-- SEC-230: o histórico de preço é a PROVA do selo "de/por" (CDC art. 37): a única mudança aceita é fechar o intervalo (`ended_at` de nulo para valor); nada reescreve `started_at` nem o preço.
-- DELETE não é barrado por gatilho (o produto rascunho apagado leva o histórico em cascata, `ON DELETE cascade`); o papel da API perde o DELETE direto (REVOKE abaixo e em `app-grants.ts`).
CREATE OR REPLACE FUNCTION webag_price_history_close_only() RETURNS trigger AS $$
BEGIN
  IF OLD.ended_at IS NULL AND NEW.ended_at IS NOT NULL AND (to_jsonb(NEW) - 'ended_at') = (to_jsonb(OLD) - 'ended_at') THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'tabela % só aceita fechar o intervalo (ended_at nulo para valor): % não é permitido', TG_TABLE_NAME, TG_OP
    USING ERRCODE = 'restrict_violation';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER "product_price_history_close_only" BEFORE UPDATE ON "product_price_history" FOR EACH ROW EXECUTE FUNCTION webag_price_history_close_only();--> statement-breakpoint
-- S6 + SEC-230: a reserva liga o pedido ao desconto e o invariante a conta; apagar quebra a prova. O papel da API não apaga (o `app-grants.ts` reafirma a cada `migrate`: `NO_DELETE_TABLES`).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'webag_app') THEN
    REVOKE DELETE, TRUNCATE ON TABLE "coupon_reservations" FROM webag_app;
    REVOKE DELETE, TRUNCATE ON TABLE "product_price_history" FROM webag_app;
  END IF;
END $$;
