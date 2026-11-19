import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';
import { DELIVERY_KINDS, DELIVERY_STATUSES, NOT_DELIVERED_REASONS } from '../domain/state.js';

export const FEE_SCOPE_TYPES = ['default', 'city', 'neighborhood'] as const;

/**
 * Versão da tabela de taxa de entrega de um escopo (DEC-036, WB-236). Cada gravação é uma versão NOVA (histórico): vale a
 * partir de `effective_from`, nunca é retroativa, e o pedido guarda o snapshot da faixa usada.
 * `scope_key` = 'default' | id da cidade | id do bairro.
 */
export const deliveryFeeTables = pgTable(
  'delivery_fee_tables',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    scopeType: text({ enum: FEE_SCOPE_TYPES }).notNull(),
    scopeKey: text().notNull(),
    version: integer().notNull(),
    effectiveFrom: timestamp({ withTimezone: true }).notNull(),
    reason: text().notNull(),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('delivery_fee_tables_scope_version_uq').on(t.scopeKey, t.version), index('delivery_fee_tables_scope_idx').on(t.scopeKey, t.effectiveFrom)],
);

export const deliveryFeeTiers = pgTable(
  'delivery_fee_tiers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid()
      .notNull()
      .references(() => deliveryFeeTables.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    fromM: integer().notNull(),
    toM: integer().notNull(),
    feeCents: integer().notNull(),
    exchangeFeeCents: integer().notNull(),
    expectedCostCents: integer().notNull().default(0),
    etaMinutes: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('delivery_fee_tiers_position_uq').on(t.tableId, t.position)],
);

/**
 * Motoboy (DEC-036, WB-231): terceiro autônomo que age por WhatsApp. Minimização (LGPD): só nome, telefone (WhatsApp), observação e
 * o aceite interno de "documentos conferidos fora do app" com a data. Sem CPF, sem upload de documento. Não há exclusão: só
 * inativar (histórico e auditoria ficam).
 */
export const couriers = pgTable(
  'couriers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: text().notNull(),
    /** Formato internacional sem `+` (`5511988887777`), pronto para `wa.me`. */
    phone: text().notNull(),
    note: text(),
    active: boolean().notNull().default(true),
    documentsCheckedAt: timestamp({ withTimezone: true }).notNull(),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('couriers_phone_active_uq').on(t.phone).where(sql`${t.active}`)],
);

/**
 * Corrida (L.3): uma por pedido de entrega (`kind = delivery`, único por pedido) e uma por coleta/reentrega de troca.
 * O `contact` é a FOTO mínima para o despacho (loja, endereços, 1º nome e telefone do cliente); some do painel depois de
 * concluída (`pii_cleared_at`, retenção).
 */
export const deliveries = pgTable(
  'deliveries',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: DELIVERY_KINDS }).notNull().default('delivery'),
    /** Pedido da corrida (`delivery`) ou da troca (`exchange_*`, com `exchange_id`). */
    orderId: uuid().notNull(),
    exchangeId: uuid(),
    storeId: uuid().notNull(),
    status: text({ enum: DELIVERY_STATUSES }).notNull().default('ready_for_collection'),
    /** Horário em que ficou pronta: base da fila e do SLA, e continua o mesmo ao reatribuir. */
    readyAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** DEC-053: fim da faixa de entrega prometida ao cliente; passou disso a corrida está atrasada. Nulo = sem ETA gravado. */
    etaToAt: timestamp({ withTimezone: true }),
    /** Alerta de atraso já emitido (um por corrida). */
    lateAlertedAt: timestamp({ withTimezone: true }),
    courierId: uuid().references(() => couriers.id),
    volumes: integer().notNull().default(1),
    note: text(),
    cityId: uuid(),
    neighborhoodId: uuid(),
    /** Taxa cobrada do cliente e custo previsto da faixa (snapshot); o custo real é lançado pela operação. */
    feeCents: integer().notNull().default(0),
    expectedCostCents: integer().notNull().default(0),
    costCents: integer(),
    costRegisteredBy: uuid().references(() => users.id),
    costRegisteredAt: timestamp({ withTimezone: true }),
    costPaidAt: timestamp({ withTimezone: true }),
    contact: jsonb().$type<Record<string, unknown>>(),
    piiClearedAt: timestamp({ withTimezone: true }),
    /** SEC-143: a loja confirmou que recebeu a mercadoria devolvida (ou o admin registrou por ela, com motivo); só então o pedido é cancelado e estornado. */
    storeReturnConfirmedAt: timestamp({ withTimezone: true }),
    storeReturnConfirmedBy: uuid().references(() => users.id),
    storeReturnConfirmedVia: text({ enum: ['store', 'admin'] }),
    /** Código de entrega de 4 dígitos (WB-226): o cliente informa ao motoboy; o admin digita para concluir. */
    deliveryCode: text(),
    codeFailures: integer().notNull().default(0),
    attempts: integer().notNull().default(1),
    whatsappSentAt: timestamp({ withTimezone: true }),
    failReason: text({ enum: NOT_DELIVERED_REASONS }),
    failNote: text(),
    /**
     * WB-262: a hora REAL da entrega (a operação atualiza o status com atraso e pode recuar até 60 min, com motivo e auditoria); sem
     * recuo = a hora do clique. Base da compensação, da medida de pontualidade e do relatório. Nulo enquanto não entregue.
     */
    deliveredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Uma entrega por pedido (toque duplo em "pronto para coleta" não cria duas, WB-229 C4).
    uniqueIndex('deliveries_order_delivery_uq').on(t.orderId).where(sql`${t.kind} = 'delivery'`),
    // Uma coleta e uma reentrega por troca (aprovação repetida não duplica a corrida).
    uniqueIndex('deliveries_exchange_kind_uq').on(t.exchangeId, t.kind).where(sql`${t.exchangeId} is not null`),
    index('deliveries_queue_idx').on(t.status, t.readyAt),
    index('deliveries_courier_idx').on(t.courierId, t.status),
    index('deliveries_store_idx').on(t.storeId),
  ],
);

/** Histórico append-only da corrida: estado, ator, motivo e valores anteriores (WB-233 C5, WB-239 C3). */
export const deliveryEvents = pgTable(
  'delivery_events',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    deliveryId: uuid()
      .notNull()
      .references(() => deliveries.id),
    fromStatus: text({ enum: DELIVERY_STATUSES }),
    toStatus: text({ enum: DELIVERY_STATUSES }).notNull(),
    action: text().notNull(),
    actorId: uuid(),
    actorRole: text(),
    reason: text(),
    meta: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('delivery_events_delivery_idx').on(t.deliveryId, t.createdAt)],
);

/**
 * Pausa da entrega da Webag (BUG-016, DEC-039c): geral (`city_id` nulo) ou de uma cidade, com motivo; vale até `resumed_at`.
 * Uma pausa aberta por escopo. O horário normal é o parâmetro `logistica_horario`.
 */
export const logisticsPauses = pgTable(
  'logistics_pauses',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cityId: uuid(),
    reason: text().notNull(),
    pausedBy: uuid().references(() => users.id),
    pausedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resumedAt: timestamp({ withTimezone: true }),
    resumedBy: uuid().references(() => users.id),
  },
  (t) => [uniqueIndex('logistics_pauses_open_uq').on(sql`coalesce(${t.cityId}, '00000000-0000-0000-0000-000000000000'::uuid)`).where(sql`${t.resumedAt} is null`)],
);
