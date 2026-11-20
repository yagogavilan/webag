import { sql } from 'drizzle-orm';
import { bigserial, boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { productVariants } from '../../catalog/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { orderItems, orders } from '../../orders/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { EXCHANGE_TYPES } from '../domain/eligibility.js';

/**
 * Estados da solicitação (RN-11):
 * `requested` (aguarda a loja, SLA 24 h) -> `awaiting_fee` (aprovada, taxa/diferença a pagar) -> `approved` (aprovada e liberada: coleta
 * na fila da logística ou cliente leva à loja) -> `item_received` (loja conferiu, OK) -> `completed`.
 * Saídas: `rejected` (loja), `cancelled` (cliente ou taxa não paga), `expired` (item não entregue no prazo), `in_mediation` (inspeção reprovada).
 */
export const EXCHANGE_STATUSES = ['requested', 'awaiting_fee', 'approved', 'item_received', 'completed', 'rejected', 'cancelled', 'expired', 'in_mediation'] as const;
export type ExchangeStatus = (typeof EXCHANGE_STATUSES)[number];
/** Estados em que a solicitação ainda ocupa o item (1 aberta por item) e, no tamanho/cor, conta no limite do pedido. */
export const OPEN_EXCHANGE_STATUSES: readonly ExchangeStatus[] = ['requested', 'awaiting_fee', 'approved', 'item_received', 'in_mediation'];
export const EXCHANGE_METHODS = ['pickup_at_home', 'drop_at_store'] as const;
export const EXCHANGE_RESOLUTIONS = ['replace', 'refund'] as const;
export const EXCHANGE_ACTORS = ['customer', 'store', 'system', 'admin'] as const;
export type ExchangeActor = (typeof EXCHANGE_ACTORS)[number];
export const RESERVATION_STATES = ['none', 'reserved', 'committed', 'released'] as const;

/**
 * Solicitação de troca ou devolução de UM item de pedido entregue (DEC-037). Valores (taxa, diferença, reembolso) são
 * congelados na aprovação. `reservation_state` guarda a reserva do tamanho novo: reservada ao aprovar, baixada quando a peça nova
 * é entregue, liberada se a troca acabar antes.
 */
export const exchangeRequests = pgTable(
  'exchange_requests',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Protocolo curto legível (ex.: "TR-4F7K2"). */
    number: varchar({ length: 12 }).notNull(),
    orderId: uuid().notNull().references(() => orders.id),
    orderItemId: uuid().notNull().references(() => orderItems.id),
    userId: uuid().notNull().references(() => users.id),
    storeId: uuid().notNull().references(() => stores.id),
    type: text({ enum: EXCHANGE_TYPES }).notNull(),
    /** Só em tamanho/cor: o que o cliente quer mudar. */
    reasonCode: text({ enum: ['size', 'color'] }),
    description: varchar({ length: 500 }),
    method: text({ enum: EXCHANGE_METHODS }).notNull(),
    resolution: text({ enum: EXCHANGE_RESOLUTIONS }).notNull(),
    status: text({ enum: EXCHANGE_STATUSES }).notNull().default('requested'),
    quantity: integer().notNull(),
    /** Variação desejada (resolução `replace`); pode ser a mesma do item em defeito. */
    newVariantId: uuid().references(() => productVariants.id),
    reservationState: text({ enum: RESERVATION_STATES }).notNull().default('none'),
    /** Fotos (ids de `media_assets`, finalidade `exchange_photo`), privadas. */
    photoIds: jsonb().$type<string[]>().notNull().default([]),
    /** Congelados na aprovação (centavos). `differenceCents` negativo = a Webag estorna. */
    feeCents: integer().notNull().default(0),
    differenceCents: integer().notNull().default(0),
    /** I12: comissão da Webag sobre a diferença de preço POSITIVA (percentual do item original, congelado na aprovação); entra na `application_fee` do split. */
    differenceCommissionCents: integer().notNull().default(0),
    /** Tentativa de pagamento aprovada da taxa + diferença (referência `exchange:<id>`, conta da Webag, sem split). */
    feeAttemptId: uuid(),
    feeDueAt: timestamp({ withTimezone: true }),
    feePaidAt: timestamp({ withTimezone: true }),
    refundCents: integer().notNull().default(0),
    refundedAt: timestamp({ withTimezone: true }),
    /** Código de 6 caracteres para a troca no balcão (WB-243). */
    storeCode: varchar({ length: 6 }),
    codeFailures: integer().notNull().default(0),
    answerDeadlineAt: timestamp({ withTimezone: true }).notNull(),
    /** Prazo legal/da loja do tipo, calculado na criação (a tela mostra "Você tem até"). */
    windowEndsAt: timestamp({ withTimezone: true }).notNull(),
    /** DT-050: lembretes à loja (12 h e 4 h antes do fim do SLA de resposta); cada um sai uma vez. */
    reminder12SentAt: timestamp({ withTimezone: true }),
    reminder4SentAt: timestamp({ withTimezone: true }),
    /** WB-176: o cliente contestou a recusa da loja (uma vez, até `contestacao_dias`); `mediation_started_at` conta o prazo da mediação. */
    contestedAt: timestamp({ withTimezone: true }),
    contestationText: varchar({ length: 500 }),
    mediationStartedAt: timestamp({ withTimezone: true }),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: text({ enum: EXCHANGE_ACTORS }),
    autoApproved: boolean().notNull().default(false),
    decisionReason: varchar({ length: 200 }),
    /** O item voltou ao estoque da loja (inspeção OK). */
    returnToStock: boolean(),
    itemDueAt: timestamp({ withTimezone: true }),
    collectedAt: timestamp({ withTimezone: true }),
    receivedAt: timestamp({ withTimezone: true }),
    /** BUG-017: alerta de reembolso fora do prazo (`reembolso_dias_uteis` depois do item recebido), uma vez por troca. */
    refundLateAlertedAt: timestamp({ withTimezone: true }),
    completedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('exchange_requests_number_uq').on(t.number),
    index('exchange_requests_user_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('exchange_requests_store_idx').on(t.storeId, t.status, t.createdAt.desc()),
    index('exchange_requests_order_idx').on(t.orderId),
    // 1 solicitação aberta por item (corrida de duplo toque cai aqui, não em checagem de aplicação)
    uniqueIndex('exchange_requests_open_item_uq').on(t.orderItemId).where(sql`${t.status} in ('requested','awaiting_fee','approved','item_received','in_mediation')`),
    index('exchange_requests_sla_idx').on(t.answerDeadlineAt).where(sql`${t.status} = 'requested'`),
    check('exchange_requests_money_chk', sql`${t.feeCents} >= 0 and ${t.refundCents} >= 0 and ${t.quantity} >= 1`),
    check('exchange_requests_replace_chk', sql`${t.resolution} <> 'replace' or ${t.newVariantId} is not null`),
  ],
);

/** Histórico append-only (quem, quando, de/para, motivo): inclui o ator "sistema" na aprovação automática. */
export const exchangeEvents = pgTable(
  'exchange_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    exchangeId: uuid().notNull().references(() => exchangeRequests.id, { onDelete: 'cascade' }),
    fromStatus: text({ enum: EXCHANGE_STATUSES }),
    toStatus: text({ enum: EXCHANGE_STATUSES }).notNull(),
    actor: text({ enum: EXCHANGE_ACTORS }).notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    reason: varchar({ length: 200 }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('exchange_events_exchange_idx').on(t.exchangeId, t.id)],
);
