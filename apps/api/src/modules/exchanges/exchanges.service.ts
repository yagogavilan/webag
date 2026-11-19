import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, asc, count, eq, inArray, lte, ne, sql } from 'drizzle-orm';
import type { AnyPgColumn } from 'drizzle-orm/pg-core';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { ParametersService } from '../admin/index.js';
import { effectivePrice, InventoryService } from '../catalog/index.js';
import { products, productVariants } from '../catalog/db/schema.js';
import { IdempotencyService } from '../idempotency/index.js';
import { users } from '../identity/db/schema.js';
import { DeliveriesService, type Delivery, type DeliveryActor, type DeliveryListener, type DeliveryStatus } from '../logistics/index.js';
import { MediaService } from '../media/index.js';
import { orderItems, orders } from '../orders/db/schema.js';
import { generateOrderNumber } from '../orders/order-number.js';
import { PaymentsService, type PaymentAttempt, type PaymentListener } from '../payments/index.js';
import { paymentAttempts, type PaymentStatus } from '../payments/db/schema.js';
import type { ProviderPayment } from '../payments/payment-provider.js';
import { stores } from '../stores/db/schema.js';
import { exchangeEvents, exchangeRequests, OPEN_EXCHANGE_STATUSES, type ExchangeActor, type ExchangeStatus } from './db/schema.js';
import { approvalMode, collectionFeeCents, evaluateEligibility, EXCHANGE_TYPES, priceDifferenceCents, refundCents, storeAnswerDeadline, windowDays, DAY_MS, type EligibilityReason, type ExchangeType } from './domain/eligibility.js';
import { canExchangeTransition } from './domain/state.js';
import { ExchangeEventBus, type ExchangeEvent } from './exchange-events.bus.js';

export type ExchangeRow = typeof exchangeRequests.$inferSelect;
type OrderRow = typeof orders.$inferSelect;
type ItemRow = typeof orderItems.$inferSelect;
interface PendingRefund {
  attemptId: string;
  amountCents: number;
  reason: string;
  key: string;
}
interface Decider {
  actor: ExchangeActor;
  userId: string | null;
  reason: string | null;
  auto: boolean;
}

export interface CreateExchangeInput {
  orderItemId: string;
  type: ExchangeType;
  reasonCode?: 'size' | 'color' | undefined;
  description?: string | undefined;
  method: 'pickup_at_home' | 'drop_at_store';
  resolution?: 'replace' | 'refund' | undefined;
  newVariantId?: string | undefined;
  photoIds?: string[] | undefined;
}

const SYSTEM_CTX: RequestContext = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
const money = (amount: number) => ({ amount, currency: 'BRL' as const });
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_MAX_FAILS = 5;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REASON_CODE: Record<EligibilityReason, string> = {
  NOT_DELIVERED: 'EXCHANGE_ORDER_NOT_DELIVERED',
  OPEN_REQUEST: 'EXCHANGE_ALREADY_OPEN',
  WINDOW_EXPIRED: 'EXCHANGE_WINDOW_EXPIRED',
  STORE_NO_VOLUNTARY: 'EXCHANGE_STORE_NO_VOLUNTARY',
  PRODUCT_NO_VOLUNTARY: 'EXCHANGE_PRODUCT_NO_VOLUNTARY',
  VOLUNTARY_LIMIT: 'EXCHANGE_VOLUNTARY_LIMIT',
  ALREADY_EXCHANGED: 'EXCHANGE_ITEM_ALREADY_EXCHANGED',
};
const REASON_TEXT: Record<EligibilityReason, string> = {
  NOT_DELIVERED: 'O pedido ainda não foi entregue.',
  OPEN_REQUEST: 'Este item já tem uma solicitação em andamento.',
  WINDOW_EXPIRED: 'O prazo para este tipo de troca encerrou.',
  STORE_NO_VOLUNTARY: 'Essa loja não faz troca por tamanho ou cor.',
  PRODUCT_NO_VOLUNTARY: 'Este produto não tem troca por tamanho ou cor.',
  VOLUNTARY_LIMIT: 'Este pedido já teve uma troca.',
  ALREADY_EXCHANGED: 'Este item já foi trocado; só pode voltar por defeito.',
};

const storeAddressLine = (store: { addressStreet?: string | null; addressNumber?: string | null; addressNeighborhood?: string | null; addressCityName?: string | null }): string =>
  [store.addressStreet, store.addressNumber, store.addressNeighborhood, store.addressCityName].filter(Boolean).join(', ');

function isUniqueViolation(error: unknown, constraint: string): boolean {
  const e = error as { code?: string; constraint?: string; cause?: { code?: string; constraint?: string } };
  return (e.code === '23505' && e.constraint === constraint) || (e.cause?.code === '23505' && e.cause.constraint === constraint);
}

/**
 * Trocas e devoluções (T.2/T.3, DEC-037, RN-11). Um pedido de troca = um item. A taxa de coleta e a diferença de preço são
 * congeladas na aprovação e cobradas à parte (pagamento na conta da Webag, referência `exchange:<id>`, sem split); a loja nunca
 * recebe a taxa. A reserva do tamanho novo nasce na aprovação e a peça nova só sai depois da antiga conferida (DEC-038f).
 */
@Injectable()
export class ExchangesService implements OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown, PaymentListener, DeliveryListener {
  private readonly logger = new Logger(ExchangesService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly pendingEvents = new Map<string, ExchangeEvent[]>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly inventory: InventoryService,
    private readonly payments: PaymentsService,
    private readonly deliveries: DeliveriesService,
    private readonly media: MediaService,
    private readonly idempotency: IdempotencyService,
    readonly bus: ExchangeEventBus,
  ) {}

  onModuleInit(): void {
    this.payments.registerListener(this);
    this.deliveries.registerListener(this);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.sweep().catch((e: Error) => this.logger.error(e.message)), 60_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // =================================================================== elegibilidade (cliente)

  private async eligibilityInputs(exec: Db | Tx, order: OrderRow, item: ItemRow) {
    const [voluntary, [done], [open], limit] = await Promise.all([
      exec
        .select({ n: count() })
        .from(exchangeRequests)
        .where(and(eq(exchangeRequests.orderId, order.id), eq(exchangeRequests.type, 'size_color'), inArray(exchangeRequests.status, [...OPEN_EXCHANGE_STATUSES, 'completed']))),
      exec.select({ id: exchangeRequests.id }).from(exchangeRequests).where(and(eq(exchangeRequests.orderItemId, item.id), eq(exchangeRequests.status, 'completed'))),
      exec.select({ id: exchangeRequests.id, status: exchangeRequests.status }).from(exchangeRequests).where(and(eq(exchangeRequests.orderItemId, item.id), inArray(exchangeRequests.status, [...OPEN_EXCHANGE_STATUSES]))),
      this.params.getNumber('troca_voluntaria_max_por_pedido'),
    ]);
    return { voluntaryExchangesInOrder: voluntary[0]?.n ?? 0, voluntaryLimitPerOrder: limit, itemAlreadyExchanged: done !== undefined, openRequestForItem: open !== undefined, open };
  }

  private async tableFee(order: OrderRow): Promise<number> {
    const snapshot = (order.deliverySnapshot ?? {}) as { exchangeFeeCents?: number };
    const cap = await this.params.getNumber('taxa_coleta_max_cents');
    return Math.min(snapshot.exchangeFeeCents ?? 0, cap);
  }

  /** O que o cliente pode pedir em cada item, com o prazo ("Você tem até DD/MM") e o motivo de cada bloqueio. */
  async options(userId: string, orderId: string) {
    const [order] = await this.db.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId)));
    if (!order) throw errors.notFound('Pedido não encontrado.');
    const items = await this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id));
    const now = new Date();
    const tableFee = await this.tableFee(order);
    const result = [];
    for (const item of items) {
      const [product] = await this.db.select().from(products).where(eq(products.id, item.productId));
      const inputs = await this.eligibilityInputs(this.db, order, item);
      const kinds = EXCHANGE_TYPES.map((type) => {
        const verdict = evaluateEligibility({ type, deliveredAt: order.deliveredAt, now, storeVoluntaryDays: order.exchangeVoluntaryDays, productNoVoluntaryExchange: product?.noVoluntaryExchange ?? false, productDurable: true, ...inputs });
        const deadline = verdict.deadline ?? (order.deliveredAt ? new Date(order.deliveredAt.getTime() + windowDays({ type, productDurable: true, storeVoluntaryDays: order.exchangeVoluntaryDays }) * DAY_MS) : null);
        return {
          type,
          eligible: verdict.eligible,
          reason: verdict.eligible ? null : { code: REASON_CODE[verdict.reason], message: REASON_TEXT[verdict.reason] },
          deadline: deadline && (type !== 'size_color' || order.exchangeVoluntaryDays > 0) ? deadline.toISOString() : null,
          pickupFee: money(collectionFeeCents({ type, method: 'pickup_at_home', tableExchangeFeeCents: tableFee, approved: true })),
        };
      });
      const variants = await this.db.select().from(productVariants).where(and(eq(productVariants.productId, item.productId), eq(productVariants.active, true)));
      result.push({
        orderItemId: item.id,
        name: item.name,
        attributes: item.attributes,
        quantity: item.quantity,
        openExchange: inputs.open ? { id: inputs.open.id, status: inputs.open.status } : null,
        options: kinds,
        variants: variants.map((v) => ({ variantId: v.id, attributes: v.attributes, available: v.stock - v.reserved >= item.quantity, current: v.id === item.variantId })),
      });
    }
    return { orderId: order.id, deliveredAt: order.deliveredAt?.toISOString() ?? null, pickupAvailable: order.mode === 'delivery', items: result };
  }

  // =================================================================== criar

  /** `created` distingue 201 de 200 (mesma `Idempotency-Key` e mesmo corpo). */
  async create(principal: Principal, orderId: string, input: CreateExchangeInput, key: string): Promise<{ created: boolean; exchange: Awaited<ReturnType<ExchangesService['getForCustomer']>> }> {
    let created = false;
    const result = await this.idempotency.run(
      `exchange:${principal.userId}`,
      key,
      { orderId, ...input },
      async () => {
        created = true;
        return { id: await this.createOnce(principal.userId, orderId, input) };
      },
      { reusedStatus: 409 },
    );
    return { created, exchange: await this.getForCustomer(principal.userId, result.id) };
  }

  private async createOnce(userId: string, orderId: string, input: CreateExchangeInput): Promise<string> {
    const photos = await this.media.requireExchangePhotos(userId, input.photoIds ?? []);
    if (input.type === 'defect' && photos.length < 1) throw errors.validation([{ field: 'photoIds', message: 'Envie de 1 a 5 fotos do defeito.' }]);
    if (input.type === 'size_color' && !input.reasonCode) throw errors.validation([{ field: 'reasonCode', message: 'Diga se é tamanho ou cor.' }]);
    const events: ExchangeEvent[] = [];
    let id = '';
    for (let attempt = 0; attempt < 5; attempt += 1) {
      try {
        id = await this.db.transaction(async (tx) => {
          const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).for('update');
          if (!order) throw errors.notFound('Pedido não encontrado.');
          const [item] = await tx.select().from(orderItems).where(and(eq(orderItems.id, input.orderItemId), eq(orderItems.orderId, order.id)));
          if (!item) throw errors.notFound('Item não encontrado.');
          const [product] = await tx.select().from(products).where(eq(products.id, item.productId));
          const inputs = await this.eligibilityInputs(tx, order, item);
          const now = new Date();
          const verdict = evaluateEligibility({ type: input.type, deliveredAt: order.deliveredAt, now, storeVoluntaryDays: order.exchangeVoluntaryDays, productNoVoluntaryExchange: product?.noVoluntaryExchange ?? false, productDurable: true, ...inputs });
          if (!verdict.eligible) throw errors.unprocessable(REASON_CODE[verdict.reason], 'Troca não disponível', { detail: REASON_TEXT[verdict.reason] });
          if (input.method === 'pickup_at_home' && order.mode !== 'delivery') throw errors.unprocessable('PICKUP_NOT_AVAILABLE', 'Coleta em casa indisponível', { detail: 'Pedido de retirada: leve o item até a loja.' });

          // Resolução: arrependimento é sempre reembolso; defeito e tamanho/cor podem repor a peça (se houver estoque) ou reembolsar.
          let resolution = input.resolution ?? (input.type === 'withdrawal' ? 'refund' : 'replace');
          if (input.type === 'withdrawal') resolution = 'refund';
          let newVariantId: string | null = null;
          if (resolution === 'replace') {
            newVariantId = input.newVariantId ?? (input.type === 'defect' ? item.variantId : null);
            if (!newVariantId) throw errors.validation([{ field: 'newVariantId', message: 'Escolha a variação desejada.' }]);
            if (input.type === 'size_color' && newVariantId === item.variantId) throw errors.validation([{ field: 'newVariantId', message: 'Escolha uma variação diferente da atual.' }]);
            const [variant] = await tx.select().from(productVariants).where(and(eq(productVariants.id, newVariantId), eq(productVariants.productId, item.productId), eq(productVariants.active, true)));
            if (!variant) throw errors.notFound('Variação não encontrada.');
            if (variant.stock - variant.reserved < item.quantity) throw errors.conflict('EXCHANGE_NO_STOCK', 'Sem estoque nessa variação', 'Sem estoque nesse tamanho. Quer o reembolso?', { variantId: variant.id });
          } else if (input.newVariantId) throw errors.validation([{ field: 'newVariantId', message: 'Reembolso não leva variação nova.' }]);

          const slaHours = await this.params.getNumber('troca_resposta_h');
          const [row] = await tx
            .insert(exchangeRequests)
            .values({
              number: generateOrderNumber().replace('WB-', 'TR-'),
              orderId: order.id,
              orderItemId: item.id,
              userId,
              storeId: order.storeId,
              type: input.type,
              reasonCode: input.type === 'size_color' ? input.reasonCode! : null,
              description: input.description?.trim() || null,
              method: input.method,
              resolution,
              quantity: item.quantity,
              newVariantId,
              photoIds: photos.map((p) => p.id),
              answerDeadlineAt: storeAnswerDeadline(now, slaHours),
              windowEndsAt: verdict.deadline,
            })
            .returning();
          const created = row!;
          await tx.insert(exchangeEvents).values({ exchangeId: created.id, fromStatus: null, toStatus: 'requested', actor: 'customer', actorUserId: userId, reason: input.description?.trim().slice(0, 200) ?? null });
          events.push(this.eventOf(created, null, 'requested', 'customer', null, now));
          if (approvalMode(input.type) === 'automatic') {
            // Arrependimento: aprovada na hora, sem esperar a loja (a loja é só avisada).
            const approved = await this.approveInTx(tx, created, order, item, { actor: 'system', userId: null, reason: 'Arrependimento: aprovação imediata', auto: false });
            events.push(approved.event);
          }
          return created.id;
        });
        break;
      } catch (error) {
        if (isUniqueViolation(error, 'exchange_requests_number_uq')) continue;
        if (isUniqueViolation(error, 'exchange_requests_open_item_uq')) throw errors.unprocessable(REASON_CODE.OPEN_REQUEST, 'Troca não disponível', { detail: REASON_TEXT.OPEN_REQUEST });
        throw error;
      }
    }
    if (!id) throw new Error('não foi possível gerar o protocolo da troca');
    for (const event of events) await this.bus.emit(event);
    return id;
  }

  // =================================================================== aprovação (loja, sistema ou arrependimento)

  private eventOf(ex: ExchangeRow, from: ExchangeStatus | null, to: ExchangeStatus, actor: ExchangeActor, reason: string | null, at: Date): ExchangeEvent {
    return { exchangeId: ex.id, number: ex.number, orderId: ex.orderId, userId: ex.userId, storeId: ex.storeId, type: ex.type, from, to, actor, reason, at };
  }

  private async variantPrice(tx: Tx, productId: string, variantPriceCents: number | null, now: Date): Promise<number> {
    const [product] = await tx.select().from(products).where(eq(products.id, productId));
    return effectivePrice(product?.basePriceCents ?? 0, variantPriceCents, { promoPriceCents: product?.promoPriceCents ?? null, promoStartsAt: product?.promoStartsAt ?? null, promoEndsAt: product?.promoEndsAt ?? null }, now).priceCents;
  }

  /**
   * Aprova na transação de quem chama: congela taxa e diferença, reserva a peça nova e, se não há nada a pagar, libera a
   * coleta/troca na loja. Com a taxa pendente fica em `awaiting_fee` (a reserva já vale). Sem estoque na aprovação AUTOMÁTICA,
   * a resolução cai para reembolso (nunca prende a troca); na manual, a loja recebe o conflito.
   */
  private async approveInTx(tx: Tx, ex: ExchangeRow, order: OrderRow, item: ItemRow, by: Decider): Promise<{ ex: ExchangeRow; event: ExchangeEvent }> {
    if (!canExchangeTransition(ex.status, 'approved', by.actor)) throw errors.conflict('INVALID_EXCHANGE_TRANSITION', 'Transição não permitida', `A troca está em "${ex.status}".`);
    const now = new Date();
    const fee = collectionFeeCents({ type: ex.type, method: ex.method, tableExchangeFeeCents: await this.tableFee(order), approved: true });
    let { resolution, newVariantId } = ex;
    let difference = 0;
    let reservation: ExchangeRow['reservationState'] = 'none';
    let note = by.reason;
    if (resolution === 'replace' && newVariantId) {
      try {
        await this.inventory.reserve(tx, [{ variantId: newVariantId, quantity: ex.quantity }]);
        reservation = 'reserved';
        const [original] = await tx.select().from(productVariants).where(eq(productVariants.id, item.variantId));
        const [replacement] = await tx.select().from(productVariants).where(eq(productVariants.id, newVariantId));
        const [oldNow, newNow] = await Promise.all([this.variantPrice(tx, item.productId, original?.priceCents ?? null, now), this.variantPrice(tx, item.productId, replacement?.priceCents ?? null, now)]);
        difference = priceDifferenceCents(newNow, oldNow) * ex.quantity;
      } catch (error) {
        if (!(error instanceof AppError) || error.code !== 'STOCK_CONFLICT') throw error;
        if (by.actor !== 'system') throw errors.conflict('EXCHANGE_NO_STOCK', 'Sem estoque na variação pedida', 'Acabou o estoque do tamanho pedido. Recuse ou aguarde a reposição.');
        resolution = 'refund';
        newVariantId = null;
        note = `${by.reason ?? 'Aprovação automática'}; sem estoque do tamanho pedido: reembolso`;
      }
    }
    const due = fee + Math.max(difference, 0);
    const to: ExchangeStatus = due > 0 ? 'awaiting_fee' : 'approved';
    const hours = await this.params.getNumber('troca_taxa_pagamento_h');
    const [updated] = await tx
      .update(exchangeRequests)
      .set({ status: to, resolution, newVariantId, reservationState: reservation, feeCents: fee, differenceCents: difference, feeDueAt: due > 0 ? new Date(now.getTime() + hours * 3_600_000) : null, decidedAt: now, decidedBy: by.actor, autoApproved: by.auto, decisionReason: note?.slice(0, 200) ?? null, updatedAt: now })
      .where(and(eq(exchangeRequests.id, ex.id), eq(exchangeRequests.status, ex.status)))
      .returning();
    if (!updated) throw errors.conflict('INVALID_EXCHANGE_TRANSITION', 'Transição não permitida', 'A troca mudou enquanto você agia.');
    await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: ex.status, toStatus: to, actor: by.actor, actorUserId: by.userId, reason: note?.slice(0, 200) ?? null });
    let result = updated;
    if (to === 'approved') result = await this.activate(tx, updated, order);
    return { ex: result, event: this.eventOf(result, ex.status, to, by.actor, note, now) };
  }

  /** Libera a troca (nada a pagar ou taxa paga): prazo do cliente, código do balcão ou corrida de coleta na fila da logística. */
  private async activate(tx: Tx, ex: ExchangeRow, order: OrderRow): Promise<ExchangeRow> {
    const days = await this.params.getNumber('coleta_entrega_item_dias');
    const now = new Date();
    const code = ex.method === 'drop_at_store' ? Array.from({ length: 6 }, () => CODE_ALPHABET[randomInt(CODE_ALPHABET.length)]).join('') : null;
    const [updated] = await tx.update(exchangeRequests).set({ itemDueAt: new Date(now.getTime() + days * DAY_MS), storeCode: code, updatedAt: now }).where(eq(exchangeRequests.id, ex.id)).returning();
    if (ex.method === 'pickup_at_home') await this.createRun(tx, updated!, order, 'exchange_pickup');
    return updated!;
  }

  private async createRun(tx: Tx, ex: ExchangeRow, order: OrderRow, kind: 'exchange_pickup' | 'exchange_return'): Promise<void> {
    const [store] = await tx.select().from(stores).where(eq(stores.id, ex.storeId));
    const [customer] = await tx.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, ex.userId));
    const address = (order.address ?? {}) as { street?: string; number?: string; complement?: string | null; neighborhood?: string; city?: string; cityId?: string | null; neighborhoodId?: string | null };
    const snapshot = (order.deliverySnapshot ?? {}) as { expectedCostCents?: number };
    await this.deliveries.createInTx(
      tx,
      {
        kind,
        orderId: order.id,
        exchangeId: ex.id,
        storeId: ex.storeId,
        volumes: 1,
        note: null,
        cityId: address.cityId ?? null,
        neighborhoodId: address.neighborhoodId ?? null,
        feeCents: kind === 'exchange_pickup' ? ex.feeCents : 0,
        expectedCostCents: snapshot.expectedCostCents ?? 0,
        actor: { id: null, role: 'system' },
        contact: {
          number: ex.number,
          kind,
          storeName: store?.name ?? '',
          storePhone: store?.whatsapp ?? store?.phone ?? null,
          pickupAddress: storeAddressLine(store ?? {}),
          dropoffAddress: [address.street, address.number, address.complement, address.neighborhood, address.city].filter(Boolean).join(', '),
          customerFirstName: (customer?.name ?? '').trim().split(/\s+/)[0] ?? '',
          customerPhone: customer?.phone ?? null,
          volumes: 1,
          note: null,
        },
      },
      SYSTEM_CTX,
    );
  }

  private async lockFor(tx: Tx, exchangeId: string): Promise<{ ex: ExchangeRow; order: OrderRow; item: ItemRow }> {
    const [ex] = await tx.select().from(exchangeRequests).where(eq(exchangeRequests.id, exchangeId)).for('update');
    if (!ex) throw errors.notFound('Troca não encontrada.');
    const [order] = await tx.select().from(orders).where(eq(orders.id, ex.orderId));
    const [item] = await tx.select().from(orderItems).where(eq(orderItems.id, ex.orderItemId));
    if (!order || !item) throw errors.notFound('Troca não encontrada.');
    return { ex, order, item };
  }

  /** Loja aprova. 404 se a troca é de outra loja (IDOR). */
  async approve(storeId: string, exchangeId: string, userId: string): Promise<void> {
    let event: ExchangeEvent | null = null;
    await this.db.transaction(async (tx) => {
      const { ex, order, item } = await this.lockFor(tx, exchangeId);
      if (ex.storeId !== storeId) throw errors.notFound('Troca não encontrada.');
      if (ex.status === 'awaiting_fee' || ex.status === 'approved') return; // repetir é idempotente
      event = (await this.approveInTx(tx, ex, order, item, { actor: 'store', userId, reason: null, auto: false })).event;
    });
    if (event) await this.bus.emit(event);
  }

  /** Loja recusa (tamanho/cor, com motivo). Defeito vai à mediação; arrependimento não pode ser recusado (RN-11). */
  async reject(storeId: string, exchangeId: string, userId: string, reason: string): Promise<void> {
    let event: ExchangeEvent | null = null;
    await this.db.transaction(async (tx) => {
      const { ex } = await this.lockFor(tx, exchangeId);
      if (ex.storeId !== storeId) throw errors.notFound('Troca não encontrada.');
      if (ex.type === 'withdrawal') throw errors.conflict('EXCHANGE_CANNOT_REJECT', 'Arrependimento não pode ser recusado', 'O direito de arrependimento é garantido por lei (CDC art. 49).');
      if (ex.status === 'rejected' || ex.status === 'in_mediation') return;
      const to: ExchangeStatus = ex.type === 'defect' ? 'in_mediation' : 'rejected';
      if (!canExchangeTransition(ex.status, to, 'store')) throw errors.conflict('INVALID_EXCHANGE_TRANSITION', 'Transição não permitida', `A troca está em "${ex.status}".`);
      const now = new Date();
      await tx.update(exchangeRequests).set({ status: to, decidedAt: now, decidedBy: 'store', decisionReason: reason.slice(0, 200), updatedAt: now }).where(eq(exchangeRequests.id, ex.id));
      await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: ex.status, toStatus: to, actor: 'store', actorUserId: userId, reason: reason.slice(0, 200) });
      event = this.eventOf(ex, ex.status, to, 'store', reason, now);
    });
    if (event) await this.bus.emit(event);
  }

  // =================================================================== encerramento (cancelar, expirar, taxa não paga)

  private async releaseReservation(tx: Tx, ex: ExchangeRow): Promise<void> {
    if (ex.reservationState === 'reserved' && ex.newVariantId) {
      await this.inventory.release(tx, [{ variantId: ex.newVariantId, quantity: ex.quantity }]);
      await tx.update(exchangeRequests).set({ reservationState: 'released' }).where(eq(exchangeRequests.id, ex.id));
    }
  }

  /** Fecha a troca (cancelada ou expirada): libera a reserva, cancela a corrida e, se pedido, agenda o estorno da taxa já paga. */
  private async closeInTx(tx: Tx, ex: ExchangeRow, to: 'cancelled' | 'expired', by: { actor: ExchangeActor; userId: string | null }, reason: string, refundFee: boolean): Promise<{ event: ExchangeEvent; refund: PendingRefund | null }> {
    if (!canExchangeTransition(ex.status, to, by.actor)) throw errors.conflict('INVALID_EXCHANGE_TRANSITION', 'Transição não permitida', `A troca está em "${ex.status}".`);
    await this.releaseReservation(tx, ex);
    await this.deliveries.cancelForExchangeInTx(tx, ex.id, reason, { id: by.userId, role: by.actor }, SYSTEM_CTX);
    let refund: PendingRefund | null = null;
    if (refundFee && ex.feeAttemptId && ex.feePaidAt) {
      const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, ex.feeAttemptId));
      const key = `exchange-fee:${ex.id}`;
      if (attempt) {
        await this.payments.reserveRefundIntent(tx, attempt.id, attempt.amountCents, 'exchange_cancelled', key, { actorId: by.userId, actorRole: by.actor, requestId: null });
        refund = { attemptId: attempt.id, amountCents: attempt.amountCents, reason: 'exchange_cancelled', key };
      }
    }
    const now = new Date();
    await tx.update(exchangeRequests).set({ status: to, decidedAt: ex.decidedAt ?? now, decisionReason: ex.decisionReason ?? reason.slice(0, 200), updatedAt: now, ...(refund ? { refundCents: refund.amountCents, refundedAt: now } : {}) }).where(eq(exchangeRequests.id, ex.id));
    await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: ex.status, toStatus: to, actor: by.actor, actorUserId: by.userId, reason: reason.slice(0, 200) });
    return { event: this.eventOf(ex, ex.status, to, by.actor, reason, now), refund };
  }

  private async finishRefund(refund: PendingRefund | null): Promise<void> {
    if (!refund) return;
    try {
      await this.payments.executeScheduledRefund(refund.attemptId, refund.amountCents, refund.reason, refund.key);
    } catch (error) {
      this.logger.warn(`estorno da troca (tentativa ${refund.attemptId}) pendente: ${safeErrorMessage(error)}`);
    }
  }

  /** Cliente cancela antes da coleta: a taxa já paga volta integral e a reserva é liberada (WB-171 C5). */
  async cancelByCustomer(userId: string, exchangeId: string, reason: string | null): Promise<void> {
    let done: { event: ExchangeEvent; refund: PendingRefund | null } | null = null;
    await this.db.transaction(async (tx) => {
      const [probe] = await tx.select({ id: exchangeRequests.id }).from(exchangeRequests).where(and(eq(exchangeRequests.id, exchangeId), eq(exchangeRequests.userId, userId)));
      if (!probe) throw errors.notFound('Troca não encontrada.');
      const { ex } = await this.lockFor(tx, exchangeId);
      if (ex.status === 'cancelled') return;
      if (!canExchangeTransition(ex.status, 'cancelled', 'customer')) throw errors.conflict('EXCHANGE_NOT_CANCELLABLE', 'A troca não pode mais ser cancelada', 'Depois da coleta o pedido segue até a conferência da loja.');
      const runs = await this.deliveries.forExchange(ex.id, tx);
      if (runs.some((r) => r.kind === 'exchange_pickup' && !['ready_for_collection', 'awaiting_courier', 'cancelled'].includes(r.status))) {
        throw errors.conflict('EXCHANGE_NOT_CANCELLABLE', 'A troca não pode mais ser cancelada', 'O motoboy já está a caminho ou com o item.');
      }
      done = await this.closeInTx(tx, ex, 'cancelled', { actor: 'customer', userId }, reason?.trim() || 'Cancelada pelo cliente', true);
    });
    if (!done) return;
    const result = done as { event: ExchangeEvent; refund: PendingRefund | null };
    await this.finishRefund(result.refund);
    await this.bus.emit(result.event);
  }

  // =================================================================== pagamento da taxa e da diferença

  private dueCents(ex: ExchangeRow): number {
    return ex.feeCents + Math.max(ex.differenceCents, 0);
  }

  async pay(principal: Principal, exchangeId: string, input: { paymentMethod: 'pix' | 'card'; card?: { token: string; installments: number; paymentMethodId?: string | undefined; issuerId?: string | undefined } | undefined; payerDocument?: string | undefined }) {
    const [ex] = await this.db.select().from(exchangeRequests).where(and(eq(exchangeRequests.id, exchangeId), eq(exchangeRequests.userId, principal.userId)));
    if (!ex) throw errors.notFound('Troca não encontrada.');
    if (ex.status !== 'awaiting_fee') throw errors.conflict('EXCHANGE_NOT_AWAITING_FEE', 'Não há nada a pagar nesta troca');
    if (ex.feeDueAt && ex.feeDueAt.getTime() <= Date.now()) throw errors.conflict('EXCHANGE_FEE_EXPIRED', 'O prazo para pagar a taxa acabou', 'Peça a troca de novo ou escolha levar à loja.');
    const reference = `exchange:${ex.id}`;
    const open = await this.payments.latestForReference(reference);
    if (open && ['creating', 'pending', 'pending_3ds'].includes(open.status) && open.method === input.paymentMethod && open.amountCents === this.dueCents(ex)) return this.paymentView(ex, open);
    const attempt = await this.payments.createPayment({
      externalReference: reference,
      method: input.paymentMethod,
      amountCents: this.dueCents(ex),
      storeId: null, // conta da Webag, sem split: a taxa é receita da Webag
      applicationFeeCents: 0,
      installments: input.card?.installments ?? 1,
      ...(input.card ? { cardToken: input.card.token, card: { paymentMethodId: input.card.paymentMethodId, issuerId: input.card.issuerId } } : {}),
      payer: { email: principal.email, ...(input.payerDocument ? { document: input.payerDocument } : {}) },
    });
    return this.paymentView(ex, attempt);
  }

  async paymentForCustomer(userId: string, exchangeId: string) {
    const [ex] = await this.db.select().from(exchangeRequests).where(and(eq(exchangeRequests.id, exchangeId), eq(exchangeRequests.userId, userId)));
    if (!ex) throw errors.notFound('Troca não encontrada.');
    const attempt = await this.payments.latestForReference(`exchange:${ex.id}`);
    if (!attempt) throw errors.notFound('Pagamento não encontrado.');
    return this.paymentView(ex, attempt);
  }

  private paymentView(ex: ExchangeRow, attempt: PaymentAttempt) {
    const status = attempt.status === 'creating' || attempt.status === 'divergent' ? 'pending' : attempt.status;
    return {
      exchangeId: ex.id,
      method: attempt.method,
      status,
      amount: money(attempt.amountCents),
      fee: money(ex.feeCents),
      difference: money(Math.max(ex.differenceCents, 0)),
      pix: attempt.method === 'pix' && attempt.pixCopyPaste && attempt.expiresAt && status === 'pending' ? { copyPaste: attempt.pixCopyPaste, qrCodeBase64: attempt.pixQrBase64, expiresAt: attempt.expiresAt.toISOString() } : null,
      installments: attempt.installments,
      threeDsUrl: attempt.status === 'pending_3ds' ? attempt.threeDsUrl : null,
      updatedAt: attempt.updatedAt.toISOString(),
    };
  }

  /** Roda na transação do pagamento: taxa aprovada libera a troca (reserva já existe desde a aprovação). */
  async onAttemptTransition(tx: Tx, attempt: PaymentAttempt, _from: PaymentStatus, _remote: ProviderPayment | null): Promise<void> {
    if (!attempt.externalReference.startsWith('exchange:')) return;
    const id = attempt.externalReference.slice('exchange:'.length);
    if (!UUID_RE.test(id) || attempt.status !== 'approved') return;
    const [probe] = await tx.select().from(exchangeRequests).where(eq(exchangeRequests.id, id));
    if (!probe) return;
    const { ex, order } = await this.lockFor(tx, id);
    // SEC-134: só vale a tentativa com o valor devido e sem loja (conta da Webag); outra cai no estorno de `afterTransition`.
    if (ex.status !== 'awaiting_fee' || attempt.amountCents !== this.dueCents(ex) || attempt.storeId !== null) return;
    const now = new Date();
    const [paid] = await tx.update(exchangeRequests).set({ status: 'approved', feePaidAt: now, feeAttemptId: attempt.id, updatedAt: now }).where(eq(exchangeRequests.id, ex.id)).returning();
    await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: 'awaiting_fee', toStatus: 'approved', actor: 'system', reason: 'Taxa de troca paga' });
    const active = await this.activate(tx, paid!, order);
    this.pendingEvents.set(attempt.id, [this.eventOf(active, 'awaiting_fee', 'approved', 'system', 'Taxa de troca paga', now)]);
  }

  async afterTransition(attempt: PaymentAttempt): Promise<void> {
    if (!attempt.externalReference.startsWith('exchange:')) return;
    for (const event of this.pendingEvents.get(attempt.id) ?? []) await this.bus.emit(event);
    this.pendingEvents.delete(attempt.id);
    if (attempt.status !== 'approved') return;
    const id = attempt.externalReference.slice('exchange:'.length);
    if (!UUID_RE.test(id)) return;
    const [ex] = await this.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, id));
    if (ex && ex.feeAttemptId === attempt.id) return;
    // Pagamento aprovado que não é o da troca (troca cancelada, valor errado, segunda tentativa): volta para o cliente.
    await this.payments.raiseAlert(attempt.id, 'exchange_attempt_mismatch', { exchangeId: id });
    await this.payments.refundBySystem(attempt.id, attempt.amountCents, 'exchange_attempt_mismatch', `exchange-late:${attempt.id}`);
  }

  // =================================================================== corridas (coleta e reentrega)

  async onDeliveryChange(tx: Tx, delivery: Delivery, _from: DeliveryStatus | null, to: DeliveryStatus, _actor: DeliveryActor, _reason: string | null): Promise<void> {
    if (!delivery.exchangeId || to !== 'delivered') return;
    const { ex } = await this.lockFor(tx, delivery.exchangeId);
    const now = new Date();
    if (delivery.kind === 'exchange_pickup') {
      await tx.update(exchangeRequests).set({ collectedAt: now, updatedAt: now }).where(eq(exchangeRequests.id, ex.id));
      return;
    }
    if (delivery.kind === 'exchange_return' && ex.status === 'item_received') {
      await this.commitReservation(tx, ex);
      await tx.update(exchangeRequests).set({ status: 'completed', completedAt: now, updatedAt: now }).where(eq(exchangeRequests.id, ex.id));
      await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: 'item_received', toStatus: 'completed', actor: 'system', reason: 'Peça nova entregue' });
      this.pendingEvents.set(delivery.id, [this.eventOf(ex, 'item_received', 'completed', 'system', 'Peça nova entregue', now)]);
    }
  }

  async afterDeliveryChange(delivery: Delivery): Promise<void> {
    for (const event of this.pendingEvents.get(delivery.id) ?? []) await this.bus.emit(event);
    this.pendingEvents.delete(delivery.id);
  }

  /** A peça nova sai do estoque (a reserva vira baixa definitiva). */
  private async commitReservation(tx: Tx, ex: ExchangeRow): Promise<void> {
    if (ex.reservationState !== 'reserved' || !ex.newVariantId) return;
    await this.inventory.commitSale(tx, [{ variantId: ex.newVariantId, quantity: ex.quantity }]);
    await tx.update(exchangeRequests).set({ reservationState: 'committed' }).where(eq(exchangeRequests.id, ex.id));
  }

  // =================================================================== recebimento e resolução (loja)

  /** Reembolso do item (e, no arrependimento do último item, da taxa de entrega paga). Cupom entra proporcional ao item. */
  private async refundAmount(tx: Tx, ex: ExchangeRow, order: OrderRow, item: ItemRow): Promise<number> {
    const discountShare = order.subtotalCents > 0 ? Math.round((order.discountCents * item.lineTotalCents) / order.subtotalCents) : 0;
    const [{ others } = { others: 0 }] = await tx.select({ others: count() }).from(orderItems).where(and(eq(orderItems.orderId, order.id), ne(orderItems.id, item.id)));
    const [{ refundedOthers } = { refundedOthers: 0 }] = await tx
      .select({ refundedOthers: count() })
      .from(exchangeRequests)
      .where(and(eq(exchangeRequests.orderId, order.id), ne(exchangeRequests.orderItemId, item.id), eq(exchangeRequests.status, 'completed'), eq(exchangeRequests.resolution, 'refund')));
    const lastItem = others - refundedOthers <= 0;
    return refundCents({ type: ex.type, itemsCents: item.lineTotalCents - discountShare, deliveryFeePaidCents: lastItem ? order.deliveryFeeCents : 0 });
  }

  private async scheduleOrderRefund(tx: Tx, order: OrderRow, amountCents: number, reason: string, key: string, by: ExchangeActor, userId: string | null): Promise<PendingRefund | null> {
    if (!order.paymentAttemptId || amountCents <= 0) return null;
    const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, order.paymentAttemptId));
    if (!attempt) return null;
    const remaining = attempt.amountCents - (await this.payments.refundedOrPendingCents(tx, attempt.id));
    const amount = Math.min(amountCents, remaining);
    if (amount <= 0) return null;
    await this.payments.reserveRefundIntent(tx, attempt.id, amount, reason, key, { actorId: userId, actorRole: by, requestId: null });
    return { attemptId: attempt.id, amountCents: amount, reason, key };
  }

  /**
   * A loja confere o item (WB-173): OK segue a resolução; reprovado vai à mediação (a loja não recusa sozinha depois de receber).
   * Troca na loja exige o código do balcão (5 tentativas). Coleta em casa exige a coleta confirmada pela logística.
   */
  async receive(storeId: string, exchangeId: string, userId: string, input: { ok: boolean; reason?: string | undefined; returnToStock?: boolean | undefined; code?: string | undefined }): Promise<void> {
    let codeError: 'wrong' | 'locked' | null = null;
    const events: ExchangeEvent[] = [];
    const refunds: (PendingRefund | null)[] = [];
    await this.db.transaction(async (tx) => {
      const { ex, order, item } = await this.lockFor(tx, exchangeId);
      if (ex.storeId !== storeId) throw errors.notFound('Troca não encontrada.');
      if (ex.status !== 'approved') throw errors.conflict('INVALID_EXCHANGE_TRANSITION', 'Transição não permitida', `A troca está em "${ex.status}".`);
      const now = new Date();
      if (ex.method === 'drop_at_store') {
        if (ex.codeFailures >= CODE_MAX_FAILS) {
          codeError = 'locked';
          return;
        }
        if (!input.code || input.code.trim().toUpperCase() !== ex.storeCode) {
          await tx.update(exchangeRequests).set({ codeFailures: ex.codeFailures + 1 }).where(eq(exchangeRequests.id, ex.id));
          codeError = 'wrong';
          return;
        }
      } else if (!ex.collectedAt) {
        throw errors.conflict('ITEM_NOT_COLLECTED', 'O motoboy ainda não entregou o item na loja', 'Aguarde a logística confirmar a coleta.');
      }

      if (!input.ok) {
        if (!input.reason || input.reason.trim().length < 3) throw errors.validation([{ field: 'reason', message: 'Explique o motivo da reprovação.' }]);
        await tx.update(exchangeRequests).set({ status: 'in_mediation', receivedAt: now, decisionReason: input.reason.trim().slice(0, 200), updatedAt: now }).where(eq(exchangeRequests.id, ex.id));
        await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: 'approved', toStatus: 'in_mediation', actor: 'store', actorUserId: userId, reason: input.reason.trim().slice(0, 200) });
        events.push(this.eventOf(ex, 'approved', 'in_mediation', 'store', input.reason.trim(), now));
        return;
      }

      const returnToStock = input.returnToStock ?? ex.type !== 'defect';
      if (returnToStock && item.stockState === 'sold') await this.inventory.restock(tx, [{ variantId: item.variantId, quantity: ex.quantity }]);
      let refund: PendingRefund | null = null;
      let refunded = 0;
      if (ex.resolution === 'refund') {
        refunded = await this.refundAmount(tx, ex, order, item);
        refund = await this.scheduleOrderRefund(tx, order, refunded, `exchange_${ex.type}`, `exchange-refund:${ex.id}`, 'store', userId);
      } else if (ex.differenceCents < 0) {
        refunded = -ex.differenceCents;
        refund = await this.scheduleOrderRefund(tx, order, refunded, 'exchange_price_difference', `exchange-diff:${ex.id}`, 'store', userId);
      }
      refunds.push(refund);
      const base = { receivedAt: now, returnToStock, updatedAt: now, ...(refund ? { refundCents: refund.amountCents, refundedAt: now } : {}) };
      const finishNow = ex.resolution === 'refund' || ex.method === 'drop_at_store';
      if (finishNow) {
        if (ex.resolution === 'replace') await this.commitReservation(tx, ex);
        await tx.update(exchangeRequests).set({ ...base, status: 'completed', completedAt: now }).where(eq(exchangeRequests.id, ex.id));
        await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: 'approved', toStatus: 'completed', actor: 'store', actorUserId: userId, reason: ex.resolution === 'refund' ? 'Item conferido: reembolso' : 'Troca feita no balcão' });
        events.push(this.eventOf(ex, 'approved', 'completed', 'store', null, now));
      } else {
        // Coleta em casa com peça nova: a conferência libera a reentrega (DEC-038f); conclui quando a segunda corrida entrega.
        await tx.update(exchangeRequests).set({ ...base, status: 'item_received' }).where(eq(exchangeRequests.id, ex.id));
        await tx.insert(exchangeEvents).values({ exchangeId: ex.id, fromStatus: 'approved', toStatus: 'item_received', actor: 'store', actorUserId: userId, reason: 'Item conferido: peça nova liberada para entrega' });
        await this.createRun(tx, { ...ex, status: 'item_received' }, order, 'exchange_return');
        events.push(this.eventOf(ex, 'approved', 'item_received', 'store', null, now));
      }
    });
    if (codeError === 'locked') throw new AppError(429, 'EXCHANGE_CODE_LOCKED', 'Código bloqueado', { detail: 'Muitos códigos errados. Fale com o suporte da Webag.' });
    if (codeError === 'wrong') {
      const [row] = await this.db.select({ fails: exchangeRequests.codeFailures }).from(exchangeRequests).where(eq(exchangeRequests.id, exchangeId));
      if ((row?.fails ?? 0) >= CODE_MAX_FAILS) await this.payments.raiseAlert(null, 'exchange_code_locked', { exchangeId }).catch(() => undefined);
      throw errors.unprocessable('EXCHANGE_CODE_INVALID', 'Código incorreto', { detail: `Código incorreto (${row?.fails ?? 0} de ${CODE_MAX_FAILS}).` });
    }
    for (const refund of refunds) await this.finishRefund(refund);
    for (const event of events) await this.bus.emit(event);
  }

  // =================================================================== varredura (SLA, taxa não paga, prazo do item)

  /** Aprovação automática após o SLA da loja, cancelamento por taxa não paga e expiração por item não entregue. Idempotente. */
  async sweep(now = new Date()): Promise<{ autoApproved: number; feeExpired: number; itemExpired: number }> {
    const pending = await this.db.select({ id: exchangeRequests.id, at: exchangeRequests.createdAt }).from(exchangeRequests).where(and(eq(exchangeRequests.status, 'requested'), lte(exchangeRequests.answerDeadlineAt, now))).limit(100);
    let autoApproved = 0;
    for (const row of pending) {
      let event: ExchangeEvent | null = null;
      try {
        await this.db.transaction(async (tx) => {
          const { ex, order, item } = await this.lockFor(tx, row.id);
          if (ex.status !== 'requested' || ex.answerDeadlineAt > now) return;
          event = (await this.approveInTx(tx, ex, order, item, { actor: 'system', userId: null, reason: 'Aprovada automaticamente: a loja não respondeu no prazo', auto: true })).event;
        });
      } catch (error) {
        this.logger.warn(`aprovação automática da troca ${row.id} falhou: ${safeErrorMessage(error)}`);
        continue;
      }
      if (event) {
        autoApproved += 1;
        await this.bus.emit(event);
      }
    }
    const feeExpired = await this.closeDue('awaiting_fee', exchangeRequests.feeDueAt, now, 'cancelled', 'Taxa de troca não paga no prazo', false);
    const itemExpired = await this.closeDue('approved', exchangeRequests.itemDueAt, now, 'expired', 'Item não entregue no prazo', false);
    return { autoApproved, feeExpired, itemExpired };
  }

  private async closeDue(status: ExchangeStatus, column: AnyPgColumn, now: Date, to: 'cancelled' | 'expired', reason: string, refundFee: boolean): Promise<number> {
    const due = await this.db.select({ id: exchangeRequests.id }).from(exchangeRequests).where(and(eq(exchangeRequests.status, status), lte(column, now))).limit(100);
    let closed = 0;
    for (const row of due) {
      let done: { event: ExchangeEvent; refund: PendingRefund | null } | null = null;
      try {
        await this.db.transaction(async (tx) => {
          const { ex } = await this.lockFor(tx, row.id);
          if (ex.status !== status) return;
          done = await this.closeInTx(tx, ex, to, { actor: 'system', userId: null }, reason, refundFee);
        });
      } catch (error) {
        this.logger.warn(`encerramento da troca ${row.id} falhou: ${safeErrorMessage(error)}`);
        continue;
      }
      if (done) {
        closed += 1;
        const result = done as { event: ExchangeEvent; refund: PendingRefund | null };
        await this.finishRefund(result.refund);
        await this.bus.emit(result.event);
      }
    }
    return closed;
  }

  // =================================================================== leitura

  private async present(ex: ExchangeRow, view: 'customer' | 'store', detail: boolean) {
    const [item] = await this.db.select().from(orderItems).where(eq(orderItems.id, ex.orderItemId));
    const [order] = await this.db.select({ number: orders.number }).from(orders).where(eq(orders.id, ex.orderId));
    const [variant] = ex.newVariantId ? await this.db.select({ id: productVariants.id, attributes: productVariants.attributes }).from(productVariants).where(eq(productVariants.id, ex.newVariantId)) : [];
    const base = {
      id: ex.id,
      number: ex.number,
      orderId: ex.orderId,
      orderNumber: order?.number ?? '',
      status: ex.status,
      type: ex.type,
      reasonCode: ex.reasonCode,
      description: ex.description,
      method: ex.method,
      resolution: ex.resolution,
      quantity: ex.quantity,
      item: item ? { orderItemId: item.id, name: item.name, attributes: item.attributes, image: { urls: item.image }, unitPrice: money(item.unitPriceCents) } : null,
      newVariant: variant ? { variantId: variant.id, attributes: variant.attributes } : null,
      fee: money(ex.feeCents),
      difference: money(ex.differenceCents),
      totalDue: money(this.dueCents(ex)),
      feeDueAt: ex.feeDueAt?.toISOString() ?? null,
      feePaid: ex.feePaidAt !== null,
      refund: money(ex.refundCents),
      answerDeadlineAt: ex.answerDeadlineAt.toISOString(),
      windowEndsAt: ex.windowEndsAt.toISOString(),
      itemDueAt: ex.itemDueAt?.toISOString() ?? null,
      autoApproved: ex.autoApproved,
      decidedBy: ex.decidedBy,
      decisionReason: ex.decisionReason,
      photoCount: ex.photoIds.length,
      createdAt: ex.createdAt.toISOString(),
      updatedAt: ex.updatedAt.toISOString(),
    };
    if (!detail) return base;
    const [events, runs] = await Promise.all([
      this.db.select().from(exchangeEvents).where(eq(exchangeEvents.exchangeId, ex.id)).orderBy(asc(exchangeEvents.id)),
      this.deliveries.forExchange(ex.id),
    ]);
    const photos = await Promise.all(ex.photoIds.map(async (id) => ({ id, url: await this.media.privatePhotoUrl(id) })));
    return {
      ...base,
      // O código do balcão é do cliente; a loja digita o que o cliente mostra (nunca vê).
      storeCode: view === 'customer' && ex.method === 'drop_at_store' && ex.status === 'approved' ? ex.storeCode : null,
      photos,
      timeline: events.map((e) => ({ from: e.fromStatus, to: e.toStatus, actor: e.actor, reason: e.reason, at: e.at.toISOString() })),
      runs: runs.map((r) => ({ id: r.id, kind: r.kind, status: r.status })),
    };
  }

  async getForCustomer(userId: string, exchangeId: string) {
    const [ex] = await this.db.select().from(exchangeRequests).where(and(eq(exchangeRequests.id, exchangeId), eq(exchangeRequests.userId, userId)));
    if (!ex) throw errors.notFound('Troca não encontrada.');
    return this.present(ex, 'customer', true);
  }

  async getForStore(storeId: string, exchangeId: string) {
    const [ex] = await this.db.select().from(exchangeRequests).where(and(eq(exchangeRequests.id, exchangeId), eq(exchangeRequests.storeId, storeId)));
    if (!ex) throw errors.notFound('Troca não encontrada.');
    return this.present(ex, 'store', true);
  }

  async listForCustomer(userId: string, query: { cursor?: string | undefined; limit?: unknown }): Promise<Page<Awaited<ReturnType<ExchangesService['present']>>>> {
    return this.page(eq(exchangeRequests.userId, userId), 'customer', query);
  }

  async listForStore(storeId: string, query: { scope?: 'pending' | 'in_progress' | 'history' | undefined; cursor?: string | undefined; limit?: unknown }) {
    const scope = { pending: ['requested'], in_progress: ['awaiting_fee', 'approved', 'item_received', 'in_mediation'], history: ['completed', 'rejected', 'cancelled', 'expired'] } as const;
    const filter = query.scope ? inArray(exchangeRequests.status, [...scope[query.scope]]) : undefined;
    return this.page(and(eq(exchangeRequests.storeId, storeId), filter), 'store', query);
  }

  private async page(where: ReturnType<typeof and>, view: 'customer' | 'store', query: { cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(exchangeRequests)
      .where(and(where, timestampCursorBefore(exchangeRequests.createdAt, exchangeRequests.id, cursor)))
      .orderBy(...timestampOrderDesc(exchangeRequests.createdAt, exchangeRequests.id))
      .limit(limit + 1);
    const slice = rows.slice(0, limit);
    const last = slice.at(-1);
    return { data: await Promise.all(slice.map((r) => this.present(r, view, false))), nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }
}

