import { sql } from 'drizzle-orm';
import { bigserial, boolean, check, date, foreignKey, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { categories, cities } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { enumCheck } from '../../../platform/database/enum-check.js';

/**
 * v1.1 R2 (ADR-019): campanhas e cupons por fonte de custo, orçamento com reserva atômica, adesão da loja e antifraude.
 * Schema da R2.1; o motor (cálculo, reserva, confirmação, devolução, varreduras) é a R2.2, em `src/modules/campaigns`.
 *
 * Fronteiras (B2): este arquivo NÃO importa `orders` nem `cart`: `cart` e `orders` importam DAQUI (`carts.coupon_id`, `orders.campaign_id`),
 * sem ciclo de módulos; e a posse de `coupons` e `coupon_redemptions` é deste arquivo. Por isso `coupon_reservations.order_id` é `uuid` sem FK (como `coupon_redemptions.order_id`)
 * e a ligação ao cupom usado sai de `orders.coupon_id`. A integridade dessas ligações é do serviço, na mesma transação, e do teste de invariante.
 */
export const CAMPAIGN_OWNERS = ['webag', 'store'] as const;
/** As 4 únicas fontes de custo (DEC-088). Não existe quinta fonte nem campo que majore preço, frete ou taxa. */
export const CAMPAIGN_FUNDING = ['webag', 'store', 'split', 'self_funded'] as const;
export type CampaignFunding = (typeof CAMPAIGN_FUNDING)[number];
export const CAMPAIGN_KINDS = ['percent', 'fixed', 'free_shipping'] as const;
export const CAMPAIGN_AUDIENCES = ['all', 'first_purchase', 'reactivation'] as const;
export const CAMPAIGN_TARGETS = ['all', 'city', 'store', 'category'] as const;
export const CAMPAIGN_STATES = ['draft', 'scheduled', 'active', 'paused', 'ended'] as const;
export type CampaignState = (typeof CAMPAIGN_STATES)[number];
export const CAMPAIGN_END_REASONS = ['budget', 'uses', 'expired', 'admin'] as const;
export const CAMPAIGN_PAUSED_BY = ['admin', 'merchant', 'system'] as const;

export const campaigns = pgTable(
  'campaigns',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    owner: text({ enum: CAMPAIGN_OWNERS }).notNull().default('webag'),
    /** Cupom próprio da loja (WB-346): a loja dona. Nulo na campanha da Webag. */
    ownerStoreId: uuid().references(() => stores.id),
    name: varchar({ length: 80 }).notNull(),
    fundingSource: text({ enum: CAMPAIGN_FUNDING }).notNull(),
    /** Parte da loja em % (RN-C2): webag 0, store 100, split 1 a 99, self_funded 0. */
    storeSharePct: smallint().notNull(),
    kind: text({ enum: CAMPAIGN_KINDS }).notNull(),
    /** Percentual (1 a 100) ou centavos (fixo); 0 no frete grátis. */
    value: integer().notNull().default(0),
    percentCapCents: integer(),
    minOrderCents: integer().notNull().default(0),
    audience: text({ enum: CAMPAIGN_AUDIENCES }).notNull().default('all'),
    reactivationDays: smallint().notNull().default(30),
    targetKind: text({ enum: CAMPAIGN_TARGETS }).notNull().default('all'),
    targetCityId: uuid().references(() => cities.id),
    targetStoreId: uuid().references(() => stores.id),
    targetCategoryId: uuid().references(() => categories.id),
    startsAt: timestamp({ withTimezone: true }),
    endsAt: timestamp({ withTimezone: true }),
    /** Orçamento da parte da WEBAG (centavos). Obrigatório para sair de `draft` com `desconto_webag > 0` (RN-C4). */
    budgetTotalCents: integer(),
    budgetDailyCents: integer(),
    maxUses: integer(),
    perCustomerLimit: smallint().notNull().default(1),
    state: text({ enum: CAMPAIGN_STATES }).notNull().default('draft'),
    endReason: text({ enum: CAMPAIGN_END_REASONS }),
    pausedBy: text({ enum: CAMPAIGN_PAUSED_BY }),
    stateReason: varchar({ length: 200 }),
    stateChangedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Concorrência otimista da edição e da ativação (409 `CAMPAIGN_VERSION_CONFLICT`). */
    version: integer().notNull().default(1),
    /** Contadores materializados sob a trava da linha; o diário de `campaign_budget_entries` é a prova (função `campaign_budget_violations()`). */
    budgetReservedCents: integer().notNull().default(0),
    budgetSpentCents: integer().notNull().default(0),
    usesReserved: integer().notNull().default(0),
    usesConfirmed: integer().notNull().default(0),
    /** Super admin que reconheceu o risco de prejuízo ao ativar "Webag paga" acima da margem (RN-C3 item 5). */
    lossRiskAckBy: uuid().references(() => users.id),
    createdBy: uuid().references(() => users.id),
    activatedBy: uuid().references(() => users.id),
    activatedAt: timestamp({ withTimezone: true }),
    endedAt: timestamp({ withTimezone: true }),
    duplicatedFrom: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaigns_list_idx').on(t.createdAt.desc(), t.id.desc()),
    enumCheck('campaigns_owner_enum', t.owner, CAMPAIGN_OWNERS),
    enumCheck('campaigns_funding_enum', t.fundingSource, CAMPAIGN_FUNDING),
    enumCheck('campaigns_kind_enum', t.kind, CAMPAIGN_KINDS),
    enumCheck('campaigns_audience_enum', t.audience, CAMPAIGN_AUDIENCES),
    enumCheck('campaigns_target_enum', t.targetKind, CAMPAIGN_TARGETS),
    enumCheck('campaigns_state_enum', t.state, CAMPAIGN_STATES),
    enumCheck('campaigns_end_reason_enum', t.endReason, CAMPAIGN_END_REASONS),
    enumCheck('campaigns_paused_by_enum', t.pausedBy, CAMPAIGN_PAUSED_BY),
    index('campaigns_live_idx').on(t.state, t.endsAt).where(sql`${t.state} in ('scheduled', 'active', 'paused')`),
    index('campaigns_owner_store_idx').on(t.ownerStoreId).where(sql`${t.ownerStoreId} is not null`),
    check('campaigns_funding_share', sql`(${t.fundingSource} = 'webag' and ${t.storeSharePct} = 0) or (${t.fundingSource} = 'store' and ${t.storeSharePct} = 100) or (${t.fundingSource} = 'split' and ${t.storeSharePct} between 1 and 99) or (${t.fundingSource} = 'self_funded' and ${t.storeSharePct} = 0)`),
    // WB-340 C3: o frete é da Webag (a loja não é dona do frete, DEC-036).
    check('campaigns_free_shipping_funding', sql`${t.kind} <> 'free_shipping' or ${t.fundingSource} in ('webag', 'self_funded')`),
    check('campaigns_value_range', sql`(${t.kind} = 'free_shipping' and ${t.value} = 0) or (${t.kind} = 'percent' and ${t.value} between 1 and 100) or (${t.kind} = 'fixed' and ${t.value} >= 1)`),
    check('campaigns_owner_store', sql`(${t.owner} = 'store') = (${t.ownerStoreId} is not null) and (${t.owner} <> 'store' or (${t.fundingSource} = 'store' and ${t.targetKind} = 'store' and ${t.targetStoreId} = ${t.ownerStoreId} and ${t.kind} <> 'free_shipping'))`),
    check('campaigns_target_consistency', sql`(${t.targetKind} = 'all' and ${t.targetCityId} is null and ${t.targetStoreId} is null and ${t.targetCategoryId} is null) or (${t.targetKind} = 'city' and ${t.targetCityId} is not null and ${t.targetStoreId} is null and ${t.targetCategoryId} is null) or (${t.targetKind} = 'store' and ${t.targetStoreId} is not null and ${t.targetCityId} is null and ${t.targetCategoryId} is null) or (${t.targetKind} = 'category' and ${t.targetCategoryId} is not null and ${t.targetCityId} is null and ${t.targetStoreId} is null)`),
    check('campaigns_period', sql`${t.startsAt} is null or ${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
    check('campaigns_window_after_draft', sql`${t.state} = 'draft' or (${t.startsAt} is not null and ${t.endsAt} is not null)`),
    // RN-C4 / WB-340 C4: sem orçamento total e diário não sai de rascunho com custo da Webag (a fonte `store` não gasta dinheiro da Webag).
    check('campaigns_budget_required', sql`${t.fundingSource} = 'store' or ${t.state} = 'draft' or (${t.budgetTotalCents} is not null and ${t.budgetDailyCents} is not null)`),
    // WB-342 C6: exige o limite de usos OU o orçamento.
    check('campaigns_limit_required', sql`${t.state} = 'draft' or ${t.maxUses} is not null or ${t.budgetTotalCents} is not null`),
    check('campaigns_budget_positive', sql`(${t.budgetTotalCents} is null or ${t.budgetTotalCents} > 0) and (${t.budgetDailyCents} is null or ${t.budgetDailyCents} > 0) and (${t.maxUses} is null or ${t.maxUses} > 0) and ${t.perCustomerLimit} >= 1`),
    // Invariante do orçamento (C-CUP-02): mesmo com bug no serviço, o banco recusa passar do total ou dos usos.
    check('campaigns_budget_invariant', sql`${t.budgetReservedCents} >= 0 and ${t.budgetSpentCents} >= 0 and (${t.budgetTotalCents} is null or ${t.budgetReservedCents} + ${t.budgetSpentCents} <= ${t.budgetTotalCents})`),
    check('campaigns_uses_invariant', sql`${t.usesReserved} >= 0 and ${t.usesConfirmed} >= 0 and (${t.maxUses} is null or ${t.usesReserved} + ${t.usesConfirmed} <= ${t.maxUses})`),
    check('campaigns_end_consistency', sql`(${t.state} = 'ended') = (${t.endReason} is not null and ${t.endedAt} is not null)`),
    check('campaigns_paused_by', sql`(${t.state} = 'paused') = (${t.pausedBy} is not null)`),
    // SEC-229: campanha "Loja paga" nunca consome orçamento da Webag (o gasto dela vive em `campaign_store_months`).
    check('campaigns_store_funded_no_webag_budget', sql`${t.fundingSource} <> 'store' or (${t.budgetReservedCents} = 0 and ${t.budgetSpentCents} = 0)`),
    check('campaigns_percent_cap', sql`${t.percentCapCents} is null or ${t.kind} = 'percent'`),
    // WB-340 C12 (design CU-2): o custo de um percentual com custo da Webag varia com o ticket; sem teto em R$ o percentual não salva (Webag paga ou Dividido). No Autofinanciado o teto é a margem.
    check('campaigns_percent_cap_required', sql`${t.kind} <> 'percent' or ${t.fundingSource} not in ('webag', 'split') or ${t.percentCapCents} is not null`),
  ],
);

/**
 * Convite e adesão da loja (RN-C5): nunca existe adesão automática. Uma linha por (campanha, loja). O aceite em si é prova imutável em
 * `campaign_acceptances`; esta linha guarda o ESTADO vigente (e o teto mensal próprio da loja).
 */
export const CAMPAIGN_ENROLLMENT_STATES = ['pending', 'accepted', 'declined', 'left', 'expired'] as const;
export const campaignStoreEnrollments = pgTable(
  'campaign_store_enrollments',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid().notNull().references(() => campaigns.id),
    storeId: uuid().notNull().references(() => stores.id),
    state: text({ enum: CAMPAIGN_ENROLLMENT_STATES }).notNull().default('pending'),
    invitedBy: uuid().references(() => users.id),
    invitedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** `campanha_convite_validade_dias` (7): sem resposta, expira sem custo e sem aceite tácito. */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    respondedAt: timestamp({ withTimezone: true }),
    respondedBy: uuid().references(() => users.id),
    /** Teto mensal PRÓPRIO da loja para a parte dela (centavos). */
    monthlyCapCents: integer(),
    termsVersion: varchar({ length: 40 }),
    termsHash: varchar({ length: 64 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_store_enrollments_uq').on(t.campaignId, t.storeId),
    // SEC-227: alvo da FK composta de `campaign_acceptances`, para o aceite de uma loja nunca apontar para o convite de outra.
    uniqueIndex('campaign_store_enrollments_scope_uq').on(t.id, t.storeId, t.campaignId),
    enumCheck('campaign_store_enrollments_state_enum', t.state, CAMPAIGN_ENROLLMENT_STATES),
    index('campaign_store_enrollments_store_idx').on(t.storeId, t.state),
    index('campaign_store_enrollments_pending_idx').on(t.expiresAt).where(sql`${t.state} = 'pending'`),
    check('campaign_store_enrollments_accepted', sql`${t.state} <> 'accepted' or (${t.monthlyCapCents} is not null and ${t.monthlyCapCents} > 0 and ${t.termsVersion} is not null and ${t.termsHash} ~ '^[a-f0-9]{64}$' and ${t.respondedBy} is not null and ${t.respondedAt} is not null)`),
  ],
);

/**
 * Prova do aceite, da recusa e da saída (WB-343 C3, C-CUP-07): APPEND-ONLY (gatilho `campaign_acceptances_append_only` e papel `webag_app` só com
 * INSERT e SELECT, D-06). Uma loja que aceitou não consegue negar depois. Sem IP nem user agent (minimização); `request_id` basta para rastrear.
 */
export const campaignAcceptances = pgTable(
  'campaign_acceptances',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    campaignId: uuid().notNull().references(() => campaigns.id),
    storeId: uuid().notNull().references(() => stores.id),
    enrollmentId: uuid().references(() => campaignStoreEnrollments.id),
    userId: uuid().notNull().references(() => users.id),
    action: text({ enum: ['accept', 'decline', 'leave', 'create'] }).notNull(),
    termsVersion: varchar({ length: 40 }),
    termsHash: varchar({ length: 64 }),
    monthlyCapCents: integer(),
    /** Parte da loja no momento (a campanha não muda depois de ativa, mas a prova não depende disso). */
    storeSharePct: smallint().notNull(),
    requestId: varchar({ length: 64 }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('campaign_acceptances_campaign_idx').on(t.campaignId, t.storeId, t.at.desc()),
    enumCheck('campaign_acceptances_action_enum', t.action, ['accept', 'decline', 'leave', 'create']),
    // SEC-227: o convite citado tem de ser da MESMA loja e da MESMA campanha do registro (`enrollment_id` nulo = ação sem convite, ex. criação).
    foreignKey({ name: 'campaign_acceptances_enrollment_scope_fk', columns: [t.enrollmentId, t.storeId, t.campaignId], foreignColumns: [campaignStoreEnrollments.id, campaignStoreEnrollments.storeId, campaignStoreEnrollments.campaignId] }),
    check('campaign_acceptances_proof', sql`${t.action} not in ('accept', 'create') or (${t.termsVersion} is not null and ${t.termsHash} ~ '^[a-f0-9]{64}$' and ${t.monthlyCapCents} is not null)`),
  ],
);

/**
 * Orçamento DIÁRIO (data em America/Sao_Paulo calculada no banco, nunca no relógio da aplicação). A linha do dia nasce sob a trava da campanha
 * (`INSERT ... ON CONFLICT DO NOTHING`) com o limite copiado da campanha; o CHECK impede passar dele mesmo com bug no serviço.
 */
export const campaignBudgetDays = pgTable(
  'campaign_budget_days',
  {
    campaignId: uuid().notNull().references(() => campaigns.id),
    day: date().notNull(),
    limitCents: integer().notNull(),
    reservedCents: integer().notNull().default(0),
    spentCents: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.day] }),
    check('campaign_budget_days_invariant', sql`${t.limitCents} > 0 and ${t.reservedCents} >= 0 and ${t.spentCents} >= 0 and ${t.reservedCents} + ${t.spentCents} <= ${t.limitCents}`),
  ],
);

/** Teto MENSAL da loja por campanha (`monthlyCapCents` do aceite), mês em America/Sao_Paulo (primeiro dia). Mesma lógica do orçamento diário. */
export const campaignStoreMonths = pgTable(
  'campaign_store_months',
  {
    campaignId: uuid().notNull().references(() => campaigns.id),
    storeId: uuid().notNull().references(() => stores.id),
    month: date().notNull(),
    limitCents: integer().notNull(),
    reservedCents: integer().notNull().default(0),
    spentCents: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.campaignId, t.storeId, t.month] }),
    index('campaign_store_months_store_idx').on(t.storeId, t.month),
    check('campaign_store_months_month_first_day', sql`${t.month} = date_trunc('month', ${t.month}::timestamp)::date`),
    check('campaign_store_months_invariant', sql`${t.limitCents} > 0 and ${t.reservedCents} >= 0 and ${t.spentCents} >= 0 and ${t.reservedCents} + ${t.spentCents} <= ${t.limitCents}`),
  ],
);

/**
 * Reserva por pedido (C-CUP-03): `reserved` (pedido criado, não pago) -> `confirmed` (pagamento aprovado) -> `returned` (expirou, cancelou ou estornou).
 * Toda transição é condicional (`UPDATE ... WHERE state = 'reserved'`), então expirar e cancelar o mesmo pedido em paralelo devolvem UMA vez.
 * Estorno parcial depois de confirmar soma em `refunded_webag_cents` (nunca passa do confirmado).
 */
export const COUPON_RESERVATION_STATES = ['reserved', 'confirmed', 'returned'] as const;
export const couponReservations = pgTable(
  'coupon_reservations',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Sem FK (ver o cabeçalho do arquivo): único por pedido. */
    orderId: uuid().notNull(),
    campaignId: uuid().notNull().references(() => campaigns.id),
    userId: uuid().notNull().references(() => users.id),
    storeId: uuid().notNull().references(() => stores.id),
    state: text({ enum: COUPON_RESERVATION_STATES }).notNull().default('reserved'),
    /** `desconto_webag` e `desconto_loja` do pedido (RN-C2), centavos. */
    webagCents: integer().notNull(),
    storeCents: integer().notNull(),
    /** Dia e mês da RESERVA em America/Sao_Paulo (a devolução volta ao mesmo dia, mesmo depois da meia-noite). */
    day: date().notNull(),
    month: date().notNull(),
    refundedWebagCents: integer().notNull().default(0),
    refundedStoreCents: integer().notNull().default(0),
    returnedReason: text({ enum: ['expired', 'cancelled', 'refunded', 'admin'] }),
    reservedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    confirmedAt: timestamp({ withTimezone: true }),
    returnedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('coupon_reservations_order_uq').on(t.orderId),
    index('coupon_reservations_campaign_idx').on(t.campaignId, t.state),
    enumCheck('coupon_reservations_state_enum', t.state, COUPON_RESERVATION_STATES),
    enumCheck('coupon_reservations_reason_enum', t.returnedReason, ['expired', 'cancelled', 'refunded', 'admin']),
    // Limite por cliente da campanha (conta só o que está vivo), lido sob a trava da campanha.
    index('coupon_reservations_user_campaign_idx').on(t.userId, t.campaignId).where(sql`${t.state} in ('reserved', 'confirmed')`),
    index('coupon_reservations_store_idx').on(t.storeId, t.campaignId),
    check('coupon_reservations_month', sql`${t.month} = date_trunc('month', ${t.day}::timestamp)::date`),
    check('coupon_reservations_amounts', sql`${t.webagCents} >= 0 and ${t.storeCents} >= 0 and ${t.webagCents} + ${t.storeCents} > 0`),
    check('coupon_reservations_refund_cap', sql`${t.refundedWebagCents} between 0 and ${t.webagCents} and ${t.refundedStoreCents} between 0 and ${t.storeCents}`),
    check('coupon_reservations_state_shape', sql`(${t.state} = 'reserved' and ${t.confirmedAt} is null and ${t.returnedAt} is null and ${t.returnedReason} is null and ${t.refundedWebagCents} = 0 and ${t.refundedStoreCents} = 0) or (${t.state} = 'confirmed' and ${t.confirmedAt} is not null and ${t.returnedAt} is null and ${t.returnedReason} is null) or (${t.state} = 'returned' and ${t.returnedAt} is not null and ${t.returnedReason} is not null)`),
  ],
);

/**
 * DIÁRIO do orçamento (o "ledger" da campanha): APPEND-ONLY, uma linha por movimento, `dedupe_key` única (repetir o job não duplica).
 * Invariante, conferida por `campaign_budget_violations()` e pelo teste: por campanha e quem paga (`funder`),
 *   reservado = soma(reserve) - soma(confirm) - soma(release)   e   gasto = soma(confirm) - soma(refund)
 * e esses totais são os contadores de `campaigns`, de `campaign_budget_days` e de `campaign_store_months`. Corrigir é lançar o movimento inverso.
 * NÃO é o razão financeiro (`ledger_*`): o desconto da Webag já está na `application_fee` da venda; este diário é o controle do ORÇAMENTO e não lança dinheiro (ADR-019 D2).
 */
export const campaignBudgetEntries = pgTable(
  'campaign_budget_entries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    campaignId: uuid().notNull().references(() => campaigns.id),
    reservationId: uuid().references(() => couponReservations.id),
    orderId: uuid(),
    storeId: uuid().references(() => stores.id),
    kind: text({ enum: ['reserve', 'confirm', 'release', 'refund'] }).notNull(),
    funder: text({ enum: ['webag', 'store'] }).notNull(),
    amountCents: integer().notNull(),
    day: date().notNull(),
    month: date().notNull(),
    dedupeKey: varchar({ length: 120 }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('campaign_budget_entries_dedupe_uq').on(t.dedupeKey),
    enumCheck('campaign_budget_entries_kind_enum', t.kind, ['reserve', 'confirm', 'release', 'refund']),
    enumCheck('campaign_budget_entries_funder_enum', t.funder, ['webag', 'store']),
    index('campaign_budget_entries_campaign_idx').on(t.campaignId, t.funder, t.kind),
    index('campaign_budget_entries_reservation_idx').on(t.reservationId),
    check('campaign_budget_entries_amount', sql`${t.amountCents} > 0`),
    // R1 (review R2.1): o diário de loja sempre diz QUAL loja, e o mês é o do dia (forma imutável, sem depender de fuso).
    check('campaign_budget_entries_store_funder', sql`${t.funder} <> 'store' or ${t.storeId} is not null`),
    check('campaign_budget_entries_month', sql`${t.month} = date_trunc('month', ${t.day}::timestamp)::date`),
  ],
);

/**
 * ANTIFRAUDE (WB-344, C-CUP-04, C-CUP-05). SÓ HMAC-SHA256 com a chave dedicada `COUPON_FRAUD_HMAC_KEY` (obrigatória no boot, com a anterior para rotação):
 * nunca CPF, endereço, id de aparelho ou telefone, nem em claro nem em log nem em exportação. O celular NÃO é identificador (DEC-103 D-01).
 * Retenção de 12 meses por job (base: prevenção à fraude, LGPD art. 7º IX `[HIPÓTESE; encarregado]`).
 *
 * `coupon_fraud_claims`: o consumo da PRIMEIRA COMPRA por identificador, valendo ENTRE campanhas. O índice único parcial decide a corrida no banco
 * (o `pg_advisory_xact_lock` por HMAC, em ordem fixa, só serializa a reconferência e evita deadlock). `released` quando o pedido expira ou cancela sem pagar.
 */
export const FRAUD_IDENTIFIER_KINDS = ['account', 'device', 'address', 'document'] as const;
export const couponFraudClaims = pgTable(
  'coupon_fraud_claims',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    /** `first_purchase`: a PRIMEIRA COMPRA, 1 por identificador ENTRE campanhas (único parcial). `campaign_use`: o limite de usos por cliente DA campanha (WB-344 C14: outra conta no mesmo aparelho; contado sob a trava da campanha). */
    scope: text({ enum: ['first_purchase', 'campaign_use'] }).notNull().default('first_purchase'),
    kind: text({ enum: FRAUD_IDENTIFIER_KINDS }).notNull(),
    hmac: varchar({ length: 64 }).notNull(),
    keyVersion: smallint().notNull().default(1),
    orderId: uuid().notNull(),
    campaignId: uuid().notNull().references(() => campaigns.id),
    state: text({ enum: ['active', 'released'] }).notNull().default('active'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    releasedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    enumCheck('coupon_fraud_claims_scope_enum', t.scope, ['first_purchase', 'campaign_use']),
    uniqueIndex('coupon_fraud_claims_active_uq').on(t.kind, t.hmac).where(sql`${t.state} = 'active' and ${t.scope} = 'first_purchase'`),
    index('coupon_fraud_claims_use_idx').on(t.campaignId, t.kind, t.hmac).where(sql`${t.state} = 'active' and ${t.scope} = 'campaign_use'`),
    enumCheck('coupon_fraud_claims_kind_enum', t.kind, FRAUD_IDENTIFIER_KINDS),
    enumCheck('coupon_fraud_claims_state_enum', t.state, ['active', 'released']),
    index('coupon_fraud_claims_order_idx').on(t.orderId),
    index('coupon_fraud_claims_created_idx').on(t.createdAt),
    check('coupon_fraud_claims_hmac', sql`${t.hmac} ~ '^[a-f0-9]{64}$'`),
    check('coupon_fraud_claims_state', sql`(${t.state} = 'released') = (${t.releasedAt} is not null)`),
  ],
);

/**
 * Avistamentos para o sinal de velocidade (3 ou mais contas no mesmo aparelho, endereço ou pagador em 24 h, RN-C6 f): quantas contas DISTINTAS
 * (HMAC da conta, não o `user_id`) já usaram o identificador. Uma linha por (identificador, conta); `last_seen_at` é atualizado.
 */
export const couponIdentifierSightings = pgTable(
  'coupon_identifier_sightings',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    kind: text({ enum: ['device', 'address', 'document'] }).notNull(),
    hmac: varchar({ length: 64 }).notNull(),
    accountHmac: varchar({ length: 64 }).notNull(),
    keyVersion: smallint().notNull().default(1),
    firstSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('coupon_identifier_sightings_uq').on(t.kind, t.hmac, t.accountHmac),
    enumCheck('coupon_identifier_sightings_kind_enum', t.kind, ['device', 'address', 'document']),
    index('coupon_identifier_sightings_window_idx').on(t.kind, t.hmac, t.lastSeenAt),
    index('coupon_identifier_sightings_retention_idx').on(t.lastSeenAt),
    check('coupon_identifier_sightings_hmac', sql`${t.hmac} ~ '^[a-f0-9]{64}$' and ${t.accountHmac} ~ '^[a-f0-9]{64}$'`),
  ],
);

/** Painel "Suspeitos" (WB-344 C6, C9, C12): pedido + sinal, nenhum identificador. `open` tira o cupom do próximo pedido da conta até o admin liberar. */
export const COUPON_FRAUD_SIGNALS = ['device_accounts', 'address_accounts', 'payer_accounts', 'cancellations', 'account_velocity'] as const;
export const couponFraudSignals = pgTable(
  'coupon_fraud_signals',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid().notNull().references(() => users.id),
    /** Sem FK (ver o cabeçalho do arquivo). */
    orderId: uuid().notNull(),
    campaignId: uuid().notNull().references(() => campaigns.id),
    signal: text({ enum: COUPON_FRAUD_SIGNALS }).notNull(),
    state: text({ enum: ['open', 'released'] }).notNull().default('open'),
    detectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid().references(() => users.id),
    releasedAt: timestamp({ withTimezone: true }),
    releaseReason: varchar({ length: 200 }),
  },
  (t) => [
    index('coupon_fraud_signals_open_user_idx').on(t.userId).where(sql`${t.state} = 'open'`),
    enumCheck('coupon_fraud_signals_signal_enum', t.signal, COUPON_FRAUD_SIGNALS),
    enumCheck('coupon_fraud_signals_state_enum', t.state, ['open', 'released']),
    index('coupon_fraud_signals_list_idx').on(t.state, t.detectedAt.desc(), t.id.desc()),
    index('coupon_fraud_signals_campaign_idx').on(t.campaignId, t.detectedAt),
    uniqueIndex('coupon_fraud_signals_order_signal_uq').on(t.orderId, t.signal),
    check('coupon_fraud_signals_release', sql`(${t.state} = 'released') = (${t.releasedBy} is not null and ${t.releasedAt} is not null and ${t.releaseReason} is not null)`),
  ],
);

/**
 * B2 (review R2.1, ADR-019 D1): a POSSE de `coupons` e `coupon_redemptions` é deste módulo (o módulo `cart` e o `orders` só falam com `campaigns/index.ts`).
 * As tabelas são as mesmas da 0004 (nada migra); só o arquivo de schema mudou de dono, para a ligação `coupons.campaign_id` e a escrita dos espelhos ficarem no
 * mesmo módulo e o `cart` não importar `campaigns` e ser importado por ele (ciclo).
 */
export const COUPON_KINDS = ['percent', 'fixed', 'free_shipping'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];
export const COUPON_SCOPES = ['store', 'platform'] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

/**
 * Cupom (RN-09). `value`: percentual (1 a 100) ou centavos (fixo); ignorado em frete grátis. Escopo `store` (custo do
 * lojista, `storeId` obrigatório) ou `platform` (custo Webag, limitado à comissão do pedido, DEC-016). A gestão pelo
 * lojista e pelo admin é WB-073/WB-116; aqui só a leitura e a validação no carrinho.
 */
export const coupons = pgTable(
  'coupons',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** 4 a 20 caracteres A-Z0-9, guardado em maiúsculas. */
    code: varchar({ length: 20 }).notNull(),
    kind: text({ enum: COUPON_KINDS }).notNull(),
    scope: text({ enum: COUPON_SCOPES }).notNull(),
    storeId: uuid().references(() => stores.id, { onDelete: 'cascade' }),
    value: integer().notNull().default(0),
    /** Teto do desconto percentual (centavos); nulo = sem teto. */
    percentCapCents: integer(),
    minOrderCents: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    maxUses: integer(),
    perCustomerLimit: integer().notNull().default(1),
    firstPurchaseOnly: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    /** WB-254: cupom pessoal e intransferível (compensação por atraso); só o dono o enxerga e usa. Apagado com a conta (LGPD). */
    ownerUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** WB-254 C5: pedido atrasado que originou o cupom; único, e por isso um cupom por pedido mesmo se reprocessar. */
    sourceOrderId: uuid(),
    /**
     * v1.1 R2 (ADR-019 D3): código de uma CAMPANHA. Nulo = cupom legado (WB-116) ou de compensação por atraso, que seguem pela regra de hoje e FICAM FORA do orçamento (D13).
     * Quando preenchido, `kind`, `value`, `min_order`, `starts_at`, `ends_at`, `max_uses`, `per_customer_limit`, `first_purchase_only` e `scope` são ESPELHOS da campanha, escritos pelo serviço
     * na mesma transação (a campanha não muda depois de ativa); a verdade das regras, do orçamento e do estado é a linha de `campaigns`.
     */
    campaignId: uuid().references(() => campaigns.id),
    /** `private`: código gerado pelo servidor (8 ou mais caracteres aleatórios, C-CUP-06); nunca entra na vitrine. */
    visibility: text({ enum: ['public', 'private'] }).notNull().default('public'),
    codeOrigin: text({ enum: ['manual', 'generated'] }).notNull().default('manual'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coupons_campaign_idx').on(t.campaignId).where(sql`${t.campaignId} is not null`),
    // R2 (review R2.1): enum de segurança também é CHECK; `visibility` é o que esconde o código privado (C-CUP-06).
    enumCheck('coupons_visibility_enum', t.visibility, ['public', 'private']),
    enumCheck('coupons_code_origin_enum', t.codeOrigin, ['manual', 'generated']),
    check('coupons_private_code_strength', sql`${t.visibility} = 'public' or (${t.codeOrigin} = 'generated' and char_length(${t.code}) >= 8)`),
    uniqueIndex('coupons_source_order_uq').on(t.sourceOrderId).where(sql`${t.sourceOrderId} is not null`),
    index('coupons_owner_idx').on(t.ownerUserId).where(sql`${t.ownerUserId} is not null`),
    uniqueIndex('coupons_code_uq').on(sql`upper(${t.code})`),
    check('coupons_code_format', sql`${t.code} ~ '^[A-Z0-9]{4,20}$'`),
    check('coupons_store_scope', sql`(${t.scope} = 'store') = (${t.storeId} is not null)`),
    check('coupons_value_range', sql`(${t.kind} = 'free_shipping') or (${t.kind} = 'percent' and ${t.value} between 1 and 100) or (${t.kind} = 'fixed' and ${t.value} >= 1)`),
    check('coupons_period', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Uso de cupom por pedido (limite total e por cliente). Quem grava é a criação do pedido (Onda 4), na mesma transação
 * do pedido; cancelamento devolve o uso (RN-08). Sem FK para `orders` até a Onda 4.
 */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    orderId: uuid().notNull(),
    discountCents: integer().notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('coupon_redemptions_order_uq').on(t.orderId), index('coupon_redemptions_coupon_idx').on(t.couponId, t.userId)],
);

export type Campaign = typeof campaigns.$inferSelect;
export type CouponReservation = typeof couponReservations.$inferSelect;
