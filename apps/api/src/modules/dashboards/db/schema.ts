import { sql } from 'drizzle-orm';
import { bigint, boolean, check, date, index, integer, jsonb, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';
import { enumCheck } from '../../../platform/database/enum-check.js';

/**
 * v1.1 R2 (ADR-019 D9): painéis de gráficos sobre AGREGADOS DIÁRIOS (nunca sobre `orders`). Catálogo fechado de métricas no servidor; sem SQL livre.
 * Só schema na R2.1; o job de agregação e as consultas são da R2.3.
 *
 * Todas as tabelas de fato guardam SÓ contagens e somas por (dia, dimensões): sem cliente, endereço, bairro nem motoboy (C-DSH-04). Por isso não têm FK
 * (agregado não é referência de integridade e FK em tabela de escrita pesada custa) e não entram no mapa de privacidade (nenhuma FK para `users`).
 * Dimensões ausentes usam o UUID zero (`00000000-0000-0000-0000-000000000000`) e o texto `all`, para a chave primária não ter coluna nula.
 */
export const ALL_ID = '00000000-0000-0000-0000-000000000000';

/**
 * Fatos aditivos por pedido, na data do PAGAMENTO (America/Sao_Paulo, calculada no banco). Somar linhas dá a resposta para qualquer período e filtro.
 * Mediana e p90 saem dos histogramas de faixas FIXAS (aproximação declarada, `MetricResult.approximate`): `accept_hist` e `pay_to_delivery_hist`.
 * `distance_band`: índice da faixa da tabela de entrega do pedido (snapshot), 0 = retirada, -1 = sem faixa.
 */
export const dashboardDailyFacts = pgTable(
  'dashboard_daily_facts',
  {
    day: date().notNull(),
    cityId: uuid().notNull(),
    storeId: uuid().notNull(),
    /** Categoria principal da LOJA. O GMV por categoria de PRODUTO vem de `dashboard_item_facts`. */
    categoryId: uuid().notNull(),
    mode: text({ enum: ['delivery', 'pickup'] }).notNull(),
    paymentMethod: text({ enum: ['pix', 'card'] }).notNull(),
    campaignId: uuid().notNull(),
    distanceBand: smallint().notNull(),
    ordersReceived: integer().notNull().default(0),
    ordersPaid: integer().notNull().default(0),
    ordersDelivered: integer().notNull().default(0),
    ordersCancelled: integer().notNull().default(0),
    gmvCents: bigint({ mode: 'number' }).notNull().default(0),
    gmvDeliveredCents: bigint({ mode: 'number' }).notNull().default(0),
    commissionCents: bigint({ mode: 'number' }).notNull().default(0),
    deliveryFeeCents: bigint({ mode: 'number' }).notNull().default(0),
    serviceFeeCents: bigint({ mode: 'number' }).notNull().default(0),
    discountCents: bigint({ mode: 'number' }).notNull().default(0),
    discountWebagCents: bigint({ mode: 'number' }).notNull().default(0),
    discountStoreCents: bigint({ mode: 'number' }).notNull().default(0),
    couponOrders: integer().notNull().default(0),
    newCustomers: integer().notNull().default(0),
    courierCostCents: bigint({ mode: 'number' }).notNull().default(0),
    courierCostOrders: integer().notNull().default(0),
    deliveredInWindow: integer().notNull().default(0),
    deliveredWithWindow: integer().notNull().default(0),
    acceptN: integer().notNull().default(0),
    acceptHist: integer().array().notNull().default(sql`'{}'::integer[]`),
    payToDeliveryN: integer().notNull().default(0),
    payToDeliveryHist: integer().array().notNull().default(sql`'{}'::integer[]`),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.storeId, t.categoryId, t.mode, t.paymentMethod, t.campaignId, t.distanceBand] }),
    index('dashboard_daily_facts_city_idx').on(t.cityId, t.day),
    enumCheck('dashboard_daily_facts_mode_enum', t.mode, ['delivery', 'pickup']),
    enumCheck('dashboard_daily_facts_payment_enum', t.paymentMethod, ['pix', 'card']),
    index('dashboard_daily_facts_campaign_idx').on(t.campaignId, t.day).where(sql`${t.campaignId} <> '00000000-0000-0000-0000-000000000000'`),
    check('dashboard_daily_facts_nonneg', sql`${t.ordersReceived} >= 0 and ${t.ordersPaid} >= 0 and ${t.ordersDelivered} >= 0 and ${t.ordersCancelled} >= 0 and ${t.gmvCents} >= 0 and ${t.discountWebagCents} >= 0 and ${t.discountStoreCents} >= 0`),
  ],
);

/** GMV de ITENS por categoria do PRODUTO (a dimensão `category` do GMV usa esta tabela e a métrica passa a "GMV de itens", dito na tela). Sem `payment_method` nem `campaign`. */
export const dashboardItemFacts = pgTable(
  'dashboard_item_facts',
  {
    day: date().notNull(),
    cityId: uuid().notNull(),
    storeId: uuid().notNull(),
    itemCategoryId: uuid().notNull(),
    mode: text({ enum: ['delivery', 'pickup'] }).notNull(),
    gmvItemsCents: bigint({ mode: 'number' }).notNull().default(0),
    units: integer().notNull().default(0),
    orders: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.day, t.storeId, t.itemCategoryId, t.mode] }),
    index('dashboard_item_facts_city_idx').on(t.cityId, t.day),
    enumCheck('dashboard_item_facts_mode_enum', t.mode, ['delivery', 'pickup']),
  ],
);

/**
 * Contagens DISTINTAS (clientes ativos, recompra em 30 dias) não somam entre dias: ficam pré-calculadas por janela. O job grava o NÚMERO, nunca a lista de clientes.
 * `window`: `d1`, `d7`, `d30` (terminando em `day`) ou `m` (mês-calendário, `day` = primeiro dia). `metric`: `active` ou `repeat30` (numerador em `value`, denominador em `denominator`).
 * `city_id`/`store_id` = UUID zero no total.
 */
export const dashboardDistinctDaily = pgTable(
  'dashboard_distinct_daily',
  {
    day: date().notNull(),
    metric: text({ enum: ['active', 'repeat30'] }).notNull(),
    window: text({ enum: ['d1', 'd7', 'd30', 'm'] }).notNull(),
    cityId: uuid().notNull(),
    storeId: uuid().notNull(),
    value: integer().notNull(),
    denominator: integer().notNull().default(0),
  },
  (t) => [
    primaryKey({ columns: [t.metric, t.window, t.day, t.cityId, t.storeId] }),
    enumCheck('dashboard_distinct_daily_metric_enum', t.metric, ['active', 'repeat30']),
    enumCheck('dashboard_distinct_daily_window_enum', t.window, ['d1', 'd7', 'd30', 'm']),
  ],
);

/**
 * Frescor dos agregados (`atualizado_em` das respostas) e marca d'água do job incremental: o job recalcula os dias cujos pedidos mudaram desde `watermark`
 * (`orders.updated_at`), então um cancelamento tardio corrige o dia do pagamento. Uma linha por tabela de fato.
 */
export const dashboardRefreshState = pgTable(
  'dashboard_refresh_state',
  {
    name: text({ enum: ['daily_facts', 'item_facts', 'distinct_daily'] }).primaryKey(),
    /** Última atualização concluída (o que a tela mostra em "Atualizado às HH:MM"). */
    refreshedAt: timestamp({ withTimezone: true }),
    /** `orders.updated_at` máximo já refletido. */
    watermark: timestamp({ withTimezone: true }),
    rowsWritten: integer().notNull().default(0),
    status: text({ enum: ['ok', 'failed', 'running'] }).notNull().default('ok'),
    lastError: varchar({ length: 200 }),
  },
  (t) => [
    enumCheck('dashboard_refresh_state_name_enum', t.name, ['daily_facts', 'item_facts', 'distinct_daily']),
    enumCheck('dashboard_refresh_state_status_enum', t.status, ['ok', 'failed', 'running']),
  ],
);

export const DASHBOARD_KINDS = ['preset', 'user'] as const;
export const DASHBOARD_PRESETS = ['overview', 'sales', 'stores', 'delivery', 'coupons', 'access'] as const;
export const CHART_TYPES = ['number', 'line', 'bar', 'stacked_bar', 'donut', 'table'] as const;

/**
 * Painel. Pronto (`preset`): do sistema, SEM dono, não editável (só duplica). Do usuário: PRIVADO, sempre lido com `owner_admin_id = :me` (C-DSH-05: outro admin = 404).
 * Limite de 20 por usuário é do serviço (contagem sob lock do dono); o de 12 widgets é do banco (`position` 0 a 11 único).
 */
export const dashboards = pgTable(
  'dashboards',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: DASHBOARD_KINDS }).notNull(),
    presetKey: text({ enum: DASHBOARD_PRESETS }),
    ownerAdminId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** Texto puro até 80 caracteres (nunca HTML; escapado no CSV, C-DSH-06). */
    name: varchar({ length: 80 }).notNull(),
    /** Filtros globais padrão do painel (período, cidade, loja, categoria, modo, campanha): ids validados pelo catálogo ao gravar. */
    filters: jsonb().$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('dashboards_owner_idx').on(t.ownerAdminId, t.createdAt.desc()).where(sql`${t.ownerAdminId} is not null`),
    enumCheck('dashboards_kind_enum', t.kind, DASHBOARD_KINDS),
    enumCheck('dashboards_preset_enum', t.presetKey, DASHBOARD_PRESETS),
    uniqueIndex('dashboards_preset_uq').on(t.presetKey).where(sql`${t.kind} = 'preset'`),
    check('dashboards_kind_shape', sql`(${t.kind} = 'preset' and ${t.ownerAdminId} is null and ${t.presetKey} is not null) or (${t.kind} = 'user' and ${t.ownerAdminId} is not null and ${t.presetKey} is null)`),
    check('dashboards_name_len', sql`char_length(${t.name}) between 1 and 80`),
  ],
);

export const dashboardWidgets = pgTable(
  'dashboard_widgets',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    dashboardId: uuid().notNull().references(() => dashboards.id, { onDelete: 'cascade' }),
    /** 0 a 11: o CHECK e o único dão o limite de 12 widgets por painel no banco. */
    position: smallint().notNull(),
    title: varchar({ length: 80 }).notNull(),
    /** Ids do catálogo do servidor (enum do contrato): validados ao gravar E ao consultar. */
    metricId: text().notNull(),
    dimensionIds: text().array().notNull().default(sql`'{}'::text[]`),
    chartType: text({ enum: CHART_TYPES }).notNull(),
    filters: jsonb().$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    period: jsonb().$type<Record<string, unknown>>().notNull(),
    compare: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('dashboard_widgets_position_uq').on(t.dashboardId, t.position),
    enumCheck('dashboard_widgets_chart_enum', t.chartType, CHART_TYPES),
    check('dashboard_widgets_position_range', sql`${t.position} between 0 and 11`),
    check('dashboard_widgets_dimensions_max', sql`coalesce(array_length(${t.dimensionIds}, 1), 0) <= 2`),
    check('dashboard_widgets_title_len', sql`char_length(${t.title}) between 1 and 80`),
  ],
);
