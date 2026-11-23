import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { campaigns } from '../../campaigns/db/schema.js';
import { coupons } from '../../cart/db/schema.js';
import { products, productVariants } from '../../catalog/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { paymentAttempts } from '../../payments/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { ORDER_STATUSES } from '../domain/state.js';

export const STOCK_STATES = ['reserved', 'sold', 'released'] as const;
export type StockState = (typeof STOCK_STATES)[number];

/**
 * Pedido (RN-05/06/07). Valores são SNAPSHOT do momento da criação (preço, taxas, comissão, política de trocas): mudar o
 * produto ou a configuração depois não altera pedido existente. Dinheiro em centavos inteiros; a conta fechada pelo
 * `finance` fica em `finance` (JSON) e é a base do ledger.
 */
export const orders = pgTable(
  'orders',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Código curto legível ("WB-4F7K2") para falar com a loja e o suporte. */
    number: varchar({ length: 12 }).notNull(),
    userId: uuid().notNull().references(() => users.id),
    storeId: uuid().notNull().references(() => stores.id),
    status: text({ enum: ORDER_STATUSES }).notNull().default('awaiting_payment'),
    mode: text({ enum: ['delivery', 'pickup'] }).notNull(),
    cartRevision: integer().notNull(),
    /** Endereço de entrega congelado no pedido, no formato do contrato (o cadastro do cliente pode mudar depois). Dado pessoal: só dono, loja e admin leem. */
    address: jsonb().$type<Record<string, unknown> | null>(),
    etaMinMinutes: integer().notNull(),
    etaMaxMinutes: integer().notNull(),
    /** DEC-053: faixa de chegada em horário de relógio, gravada na criação (nulo em pedido anterior à regra ou de retirada). */
    etaFromAt: timestamp({ withTimezone: true }),
    etaToAt: timestamp({ withTimezone: true }),
    /** A-06 / DEC-076: faixa INFORMATIVA depois do despacho (motoboy a caminho, só falta o deslocamento). É só o que a tela mostra; a promessa (atraso, cancelamento sem custo, compensação) segue em `etaFromAt`/`etaToAt`, a que o cliente aceitou. */
    etaDispatchFromAt: timestamp({ withTimezone: true }),
    etaDispatchToAt: timestamp({ withTimezone: true }),
    pickup: jsonb().$type<{ address: string; instructions: string | null; prepMinMinutes: number; prepMaxMinutes: number } | null>(),
    /** Código de retirada (4 dígitos), só mostrado depois de pago. */
    pickupCode: varchar({ length: 6 }),
    couponId: uuid().references(() => coupons.id, { onDelete: 'set null' }),
    couponCode: varchar({ length: 20 }),
    /** v1.1 R2 (WB-341 C6): campanha do cupom e o SNAPSHOT do que o cliente viu e do que o motor decidiu (fonte, parte da loja, `autofin_teto_pct`, margem prevista, custo previsto do motoboy e sua origem, desconto bruto, da loja e da Webag). Mudar a campanha ou a tabela depois não altera o pedido (RN-05). */
    campaignId: uuid().references(() => campaigns.id),
    couponSnapshot: jsonb().$type<Record<string, unknown> | null>(),
    subtotalCents: integer().notNull(),
    deliveryFeeCents: integer().notNull(),
    serviceFeeCents: integer().notNull(),
    /** Desconto realmente aplicado (loja + plataforma), já depois dos tetos. */
    discountCents: integer().notNull(),
    storeCouponCents: integer().notNull().default(0),
    platformDiscountCents: integer().notNull().default(0),
    totalCents: integer().notNull(),
    commissionCents: integer().notNull(),
    /** `application_fee` do split: comissão + taxa de serviço - desconto da plataforma. */
    applicationFeeCents: integer().notNull(),
    finance: jsonb().$type<Record<string, unknown>>().notNull(),
    /** Faixa da tabela de entrega usada, com distância e taxa de troca (RN-05, DEC-036): mudar a tabela depois não altera o pedido. */
    deliverySnapshot: jsonb().$type<Record<string, unknown>>(),
    paymentMethod: text({ enum: ['pix', 'card'] }).notNull(),
    paymentAttemptId: uuid().references(() => paymentAttempts.id),
    exchangeVoluntaryDays: integer().notNull().default(0),
    exchangeCollectionFeeCents: integer().notNull().default(0),
    exchangePolicyVersion: integer().notNull().default(1),
    /** Estoque do pedido como um todo (itens seguem o mesmo estado, exceto item indisponível). */
    stockState: text({ enum: STOCK_STATES }).notNull().default('reserved'),
    /** PIX vence aqui (`pix_expiracao_min`); passou, o pedido expira e o estoque volta. */
    paymentExpiresAt: timestamp({ withTimezone: true }),
    /** Pago em `received`; a loja tem até aqui para aceitar (`loja_aceite_timeout_min`). */
    acceptDeadlineAt: timestamp({ withTimezone: true }),
    paidAt: timestamp({ withTimezone: true }),
    /** I2: o provedor contestou o pagamento (chargeback/mediação). Não muda o estado do pedido; o ledger e o alerta acompanham. */
    disputedAt: timestamp({ withTimezone: true }),
    acceptedAt: timestamp({ withTimezone: true }),
    deliveredAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    /** WB-253 C1: quando o aviso de atraso (1 push por pedido) saiu; nulo = ainda não avisou. */
    lateNotifiedAt: timestamp({ withTimezone: true }),
    /** BUG-017: lembrete à loja de pedido sem aceite (`loja_aceite_lembrete_min`); nulo = ainda não lembrou. */
    acceptRemindedAt: timestamp({ withTimezone: true }),
    /** B2: o e-mail de pedido novo à loja saiu; reivindicação atômica (nulo = ainda não), para um pedido nunca avisar duas vezes. */
    storeNotifiedAt: timestamp({ withTimezone: true }),
    /** BUG-014: aviso ao cliente 24 h antes de a retirada vencer; nulo = ainda não avisou. */
    pickupRemindedAt: timestamp({ withTimezone: true }),
    /** BUG-020 (RN-07): primeiro "não recebi" do cliente. Enquanto preenchido, a auto-conclusão de 24 h não fecha a corrida: a operação decide. */
    notReceivedAt: timestamp({ withTimezone: true }),
    /** SEC-170: HMAC do CPF do pagador (nunca o CPF), chave do cupom de primeira compra contra multiconta. */
    payerDocumentHash: varchar({ length: 64 }),
    cancelledBy: text({ enum: ['customer', 'store', 'system', 'admin'] }),
    cancelReason: varchar({ length: 200 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('orders_number_uq').on(t.number),
    index('orders_user_idx').on(t.userId, t.createdAt.desc(), t.id.desc()),
    index('orders_store_idx').on(t.storeId, t.status, t.createdAt.desc()),
    index('orders_campaign_idx').on(t.campaignId, t.paidAt).where(sql`${t.campaignId} is not null`),
    index('orders_payment_expiry_idx').on(t.paymentExpiresAt).where(sql`${t.status} = 'awaiting_payment'`),
    index('orders_accept_deadline_idx').on(t.acceptDeadlineAt).where(sql`${t.status} = 'received'`),
    check('orders_money_chk', sql`${t.subtotalCents} >= 0 and ${t.deliveryFeeCents} >= 0 and ${t.serviceFeeCents} >= 0 and ${t.discountCents} >= 0 and ${t.totalCents} >= 0 and ${t.commissionCents} >= 0 and ${t.applicationFeeCents} >= 0`),
    check('orders_mode_chk', sql`(${t.mode} = 'delivery' and ${t.address} is not null) or (${t.mode} = 'pickup' and ${t.pickup} is not null)`),
  ],
);

/** Item com snapshot de nome, variação, preço e comissão (o percentual vale mesmo que a regra mude depois, RN-10). */
export const orderItems = pgTable(
  'order_items',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid().notNull().references(() => orders.id, { onDelete: 'cascade' }),
    productId: uuid().notNull().references(() => products.id),
    variantId: uuid().notNull().references(() => productVariants.id),
    categoryId: uuid(),
    name: varchar({ length: 120 }).notNull(),
    attributes: jsonb().$type<Record<string, string>>().notNull(),
    image: jsonb().$type<Record<string, string>>().notNull().default({}),
    quantity: integer().notNull(),
    unitPriceCents: integer().notNull(),
    lineTotalCents: integer().notNull(),
    commissionPctBp: integer().notNull(),
    stockState: text({ enum: STOCK_STATES }).notNull().default('reserved'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_items_order_idx').on(t.orderId), index('order_items_variant_idx').on(t.variantId), check('order_items_qty_chk', sql`${t.quantity} >= 1 and ${t.unitPriceCents} >= 0 and ${t.lineTotalCents} = ${t.quantity} * ${t.unitPriceCents}`)],
);

/** Histórico de transições (quem, quando, de/para, motivo). Append-only por convenção de código; a trilha de auditoria tem a sua. */
export const orderEvents = pgTable(
  'order_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    orderId: uuid().notNull().references(() => orders.id, { onDelete: 'cascade' }),
    fromStatus: text({ enum: ORDER_STATUSES }),
    toStatus: text({ enum: ORDER_STATUSES }).notNull(),
    actor: text({ enum: ['customer', 'store', 'system', 'admin'] }).notNull(),
    actorUserId: uuid().references(() => users.id, { onDelete: 'set null' }),
    reason: varchar({ length: 200 }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('order_events_order_idx').on(t.orderId, t.id)],
);

/** `superseded` (SEC-175): o pedido ou a corrida mudou de estado antes da resposta (entregue, não entregue, cancelado); nada foi aceito. */
export const CANCEL_REQUEST_STATUSES = ['pending', 'approved', 'refused', 'superseded'] as const;
/** `preparation`: pedido em separação, a loja decide (BUG-015). `late`: entrega atrasada em SAIU, a operação decide (WB-253 C3). */
export const CANCEL_REQUEST_KINDS = ['preparation', 'late'] as const;

/**
 * Pedido de cancelamento do cliente com o pedido EM SEPARAÇÃO (BUG-015, WB-028 C2): a loja decide em `cancelamento_resposta_min`
 * (10 min); sem resposta, o admin é alertado e decide (cancelando o pedido). Uma solicitação aberta por pedido E por tipo (A-02: `late` e `preparation` não se bloqueiam).
 */
export const orderCancelRequests = pgTable(
  'order_cancel_requests',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    orderId: uuid().notNull().references(() => orders.id, { onDelete: 'cascade' }),
    kind: text({ enum: CANCEL_REQUEST_KINDS }).notNull().default('preparation'),
    status: text({ enum: CANCEL_REQUEST_STATUSES }).notNull().default('pending'),
    reason: varchar({ length: 200 }),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: text({ enum: ['store', 'admin', 'system'] }),
    decisionNote: varchar({ length: 200 }),
    alertedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('order_cancel_requests_open_uq').on(t.orderId, t.kind).where(sql`${t.status} = 'pending'`), index('order_cancel_requests_order_idx').on(t.orderId, t.requestedAt)],
);
