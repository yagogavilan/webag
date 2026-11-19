import { Inject, Injectable } from '@nestjs/common';
import { Redis } from 'ioredis';
import { and, asc, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { users } from '../identity/db/schema.js';
import { couriers, DeliveriesService } from '../logistics/index.js';
import { orderEvents, orderItems, orders } from './db/schema.js';
import { nextStatuses, type OrderStatus } from './domain/state.js';
import type { OrderEvent } from './order-events.bus.js';
import { OrdersService, type OrderRow } from './orders.service.js';

const PICKUP_CODE_MAX_FAILS = 5;
const PICKUP_CODE_LOCK_SECONDS = 1800;

export type StoreScope = 'new' | 'in_progress' | 'history';
const SCOPES: Record<StoreScope, OrderStatus[]> = {
  new: ['received'],
  in_progress: ['accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'],
  history: ['delivered', 'cancelled', 'refused'],
};

export type StoreAction = 'accept' | 'refuse' | 'prepare' | 'dispatch' | 'ready' | 'complete' | 'cancel';
type Money = { amount: number; currency: 'BRL' };
const money = (amount: number): Money => ({ amount, currency: 'BRL' });

/** Ações da loja por estado (RN-07/RN-08): é o que o painel mostra como botões. */
export function storeActions(order: Pick<OrderRow, 'status' | 'mode'>, deliveryStatus: string | null = null): StoreAction[] {
  const next = new Set(nextStatuses(order.status, 'store', order.mode));
  // WB-229 C6: "voltar para separação" só enquanto a corrida está sem motoboy.
  if (order.status === 'ready_for_collection' && deliveryStatus !== null && deliveryStatus !== 'ready_for_collection') next.delete('in_preparation');
  const actions: StoreAction[] = [];
  if (next.has('accepted')) actions.push('accept');
  if (next.has('refused')) actions.push('refuse');
  if (next.has('in_preparation')) actions.push('prepare');
  if (next.has('out_for_delivery')) actions.push('dispatch');
  if (next.has('ready_for_pickup') || next.has('ready_for_collection')) actions.push('ready'); // pronto para retirada ou para coleta da Webag
  if (next.has('delivered')) actions.push('complete');
  if (next.has('cancelled')) actions.push('cancel');
  return actions;
}

/**
 * Pedidos do ponto de vista da loja (painel do lojista, WB-067 a WB-072). Sempre escopado pela loja da rota: pedido de
 * outra loja é 404 (SEC-020). A loja só vê pedido que chegou a ser PAGO (`paid_at`); o que expirou sem pagamento não existe
 * para ela. Dado do cliente por minimização (LGPD): primeiro nome, e telefone só enquanto o pedido está em andamento.
 */
@Injectable()
export class StoreOrdersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly orders: OrdersService,
    private readonly deliveries: DeliveriesService,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  /**
   * SEC-138: o código de retirada tem 10.000 combinações; 5 erros por pedido bloqueiam a conferência por 30 min e avisam o
   * admin. O contador está no Redis (fora da transação, para não desfazer com o erro) e zera quando o código acerta.
   */
  private async assertPickupCode(orderId: string, expected: string | null, given: string | undefined): Promise<void> {
    const key = `pickup-code-fails:${orderId}`;
    const fails = Number((await this.redis.get(key).catch(() => null)) ?? 0);
    if (fails >= PICKUP_CODE_MAX_FAILS) {
      throw new AppError(429, 'PICKUP_CODE_LOCKED', 'Conferência bloqueada', { detail: 'Muitos códigos errados. Tente de novo em 30 minutos ou fale com o suporte.', retryAfterSeconds: 1800 });
    }
    if (given && expected && given === expected) {
      await this.redis.del(key).catch(() => undefined);
      return;
    }
    const count = await this.redis.incr(key).catch(() => 0);
    if (count === 1) await this.redis.expire(key, PICKUP_CODE_LOCK_SECONDS).catch(() => undefined);
    if (count >= PICKUP_CODE_MAX_FAILS) await this.orders.raiseAlert('pickup_code_locked', { orderId });
    throw errors.unprocessable('PICKUP_CODE_INVALID', 'Código de retirada inválido', { detail: 'Confira o código de 4 dígitos com o cliente.' });
  }

  // =================================================================== leitura

  async list(storeId: string, query: { scope?: StoreScope | undefined; number?: string | undefined; cursor?: string | undefined; limit?: unknown }, showValues: boolean): Promise<Page<Awaited<ReturnType<StoreOrdersService['summaries']>>[number]>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const statuses = query.scope ? SCOPES[query.scope] : [...SCOPES.new, ...SCOPES.in_progress, ...SCOPES.history];
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.storeId, storeId), isNotNull(orders.paidAt), inArray(orders.status, statuses), query.number ? eq(orders.number, query.number.toUpperCase()) : undefined, timestampCursorBefore(orders.createdAt, orders.id, cursor)))
      .orderBy(...timestampOrderDesc(orders.createdAt, orders.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const data = await this.summaries(page, showValues);
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  /** Contagem por grupo (badge "novos" no painel). */
  async counts(storeId: string): Promise<Record<StoreScope, number>> {
    const rows = await this.db.select({ status: orders.status, n: sql<number>`count(*)::int` }).from(orders).where(and(eq(orders.storeId, storeId), isNotNull(orders.paidAt))).groupBy(orders.status);
    const by = new Map(rows.map((r) => [r.status, r.n]));
    const sum = (list: OrderStatus[]) => list.reduce((n, s) => n + (by.get(s) ?? 0), 0);
    return { new: sum(SCOPES.new), in_progress: sum(SCOPES.in_progress), history: sum(SCOPES.history) };
  }

  /** I9: 2 consultas por página (itens e clientes) em vez de 2 por pedido. */
  private async summaries(page: OrderRow[], showValues: boolean) {
    if (page.length === 0) return [];
    const [items, customers] = await Promise.all([
      this.db.select().from(orderItems).where(inArray(orderItems.orderId, page.map((o) => o.id))).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select({ id: users.id, name: users.name }).from(users).where(inArray(users.id, [...new Set(page.map((o) => o.userId))])),
    ]);
    const itemsByOrder = new Map<string, (typeof items)[number][]>();
    for (const item of items) itemsByOrder.set(item.orderId, [...(itemsByOrder.get(item.orderId) ?? []), item]);
    const customerById = new Map(customers.map((c) => [c.id, c]));
    return page.map((order) => {
      const rows = itemsByOrder.get(order.id) ?? [];
      return {
        id: order.id,
        number: order.number,
        status: order.status,
        mode: order.mode,
        createdAt: order.createdAt.toISOString(),
        paidAt: order.paidAt?.toISOString() ?? null,
        acceptDeadlineAt: order.status === 'received' ? (order.acceptDeadlineAt?.toISOString() ?? null) : null,
        customerFirstName: firstName(customerById.get(order.userId)?.name),
        itemCount: rows.reduce((n, i) => n + i.quantity, 0),
        firstItemName: rows[0]?.name ?? '',
        total: showValues ? money(order.totalCents) : null,
        allowedActions: storeActions(order),
      };
    });
  }

  private async load(storeId: string, orderId: string, exec: Db | Tx = this.db, lock = false): Promise<OrderRow> {
    const query = exec.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.storeId, storeId), isNotNull(orders.paidAt)));
    const [order] = lock ? await query.for('update') : await query;
    if (!order) throw errors.notFound('Pedido não encontrado.');
    return order;
  }

  /** Detalhe completo (WB-068): itens, entrega ou retirada, cliente, valores (se permitido) e histórico. */
  async get(storeId: string, orderId: string, showValues: boolean) {
    const order = await this.load(storeId, orderId);
    const [items, events, [customer]] = await Promise.all([
      this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select().from(orderEvents).where(eq(orderEvents.orderId, order.id)).orderBy(asc(orderEvents.id)),
      this.db.select({ name: users.name, phone: users.phone }).from(users).where(eq(users.id, order.userId)),
    ]);
    const active = ['received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'ready_for_pickup'].includes(order.status);
    const delivery = order.mode === 'delivery' ? await this.deliveries.forOrder(order.id) : null;
    const [courier] = delivery?.courierId ? await this.db.select({ name: couriers.name }).from(couriers).where(eq(couriers.id, delivery.courierId)) : [];
    const finance = order.finance as { merchantNetBeforeProviderFeeCents?: number };
    return {
      id: order.id,
      number: order.number,
      status: order.status,
      mode: order.mode,
      createdAt: order.createdAt.toISOString(),
      paidAt: order.paidAt?.toISOString() ?? null,
      acceptedAt: order.acceptedAt?.toISOString() ?? null,
      acceptDeadlineAt: order.status === 'received' ? (order.acceptDeadlineAt?.toISOString() ?? null) : null,
      customer: { firstName: firstName(customer?.name), phone: active && order.mode === 'delivery' ? (customer?.phone ?? null) : null },
      items: items.map((i) => ({ name: i.name, attributes: i.attributes, image: { urls: i.image }, quantity: i.quantity, unitPrice: showValues ? money(i.unitPriceCents) : null, lineTotal: showValues ? money(i.lineTotalCents) : null })),
      delivery: order.mode === 'delivery' && order.address ? { address: order.address, etaMinMinutes: order.etaMinMinutes, etaMaxMinutes: order.etaMaxMinutes } : null,
      // O código de retirada NUNCA é mostrado à loja: é o cliente quem o informa no balcão.
      pickup: order.mode === 'pickup' && order.pickup ? order.pickup : null,
      values: showValues
        ? { subtotal: money(order.subtotalCents), delivery: money(order.deliveryFeeCents), storeDiscount: money(order.storeCouponCents), total: money(order.totalCents), commission: money(order.commissionCents), netBeforeProviderFee: money(finance.merchantNetBeforeProviderFeeCents ?? 0) }
        : null,
      couponCode: order.couponCode,
      timeline: events.map((e) => ({ status: e.toStatus, at: e.at.toISOString(), actor: e.actor, reason: e.reason })),
      cancellation: order.cancelledAt && order.cancelledBy ? { by: order.cancelledBy, reason: order.cancelReason, at: order.cancelledAt.toISOString() } : null,
      allowedActions: storeActions(order, delivery?.status ?? null),
      // DEC-036: a loja só vê o estado da corrida e o primeiro nome do motoboy (sem telefone) enquanto espera a coleta.
      logistics: delivery ? { status: delivery.status, courierFirstName: courier ? (courier.name.trim().split(/\s+/)[0] ?? null) : null, volumes: delivery.volumes } : null,
    };
  }

  /** Comanda para impressão (WB-069): só o que a cozinha/separação precisa, sem preços. */
  async ticket(storeId: string, orderId: string) {
    const order = await this.load(storeId, orderId);
    const [items, [customer]] = await Promise.all([
      this.db.select().from(orderItems).where(eq(orderItems.orderId, order.id)).orderBy(asc(orderItems.createdAt), asc(orderItems.id)),
      this.db.select({ name: users.name }).from(users).where(eq(users.id, order.userId)),
    ]);
    const address = order.address as { street?: string; number?: string; complement?: string | null; neighborhood?: string } | null;
    return {
      number: order.number,
      mode: order.mode,
      createdAt: order.createdAt.toISOString(),
      customerFirstName: firstName(customer?.name),
      destination: order.mode === 'delivery' && address ? [address.street, address.number, address.complement, address.neighborhood].filter(Boolean).join(', ') : 'Retirada na loja',
      items: items.map((i) => ({ quantity: i.quantity, name: i.name, attributes: i.attributes })),
    };
  }

  // =================================================================== ações

  private async act(storeId: string, orderId: string, userId: string, fn: (tx: Tx, order: OrderRow) => Promise<{ event: OrderEvent | null; refund?: Parameters<OrdersService['finishRefund']>[0] }>): Promise<void> {
    let result: { event: OrderEvent | null; refund?: Parameters<OrdersService['finishRefund']>[0] } | null = null;
    await this.db.transaction(async (tx) => {
      result = await fn(tx, await this.load(storeId, orderId, tx, true));
    });
    const done = result as { event: OrderEvent | null; refund?: Parameters<OrdersService['finishRefund']>[0] } | null;
    if (!done) return;
    await this.orders.finishRefund(done.refund ?? null);
    if (done.event) await this.orders.bus.emit(done.event);
    void userId;
  }

  async accept(storeId: string, orderId: string, userId: string): Promise<void> {
    await this.act(storeId, orderId, userId, async (tx, order) => ({ event: await this.orders.advance(tx, order, 'accepted', 'store', userId) }));
  }

  /** Recusa com motivo obrigatório (RN-08): estorno total automático. */
  async refuse(storeId: string, orderId: string, userId: string, reason: string): Promise<void> {
    await this.act(storeId, orderId, userId, async (tx, order) => {
      if (order.status === 'refused') return { event: null };
      const { event, refund } = await this.orders.closeOrder(tx, order, 'refused', 'store', reason, userId);
      return { event, refund };
    });
  }

  async advance(storeId: string, orderId: string, userId: string, to: 'in_preparation' | 'ready_for_collection' | 'ready_for_pickup' | 'delivered', pickupCode?: string, extra: { volumes?: number | undefined; note?: string | undefined } = {}): Promise<void> {
    let ready: OrderRow | null = null;
    await this.act(storeId, orderId, userId, async (tx, order) => {
      if (to === 'ready_for_collection') {
        // Entrega Webag (DEC-036): "pronto para coleta" cria a corrida na mesma transação; o resto é da logística.
        const created = await this.orders.readyForCollection(tx, order, userId, extra);
        if (created) ready = order;
        return { event: created };
      }
      if (to === 'in_preparation' && order.status === 'ready_for_collection') {
        // Desfazer o "pronto": só sem motoboy atribuído; com motoboy, só o admin (avisa o motoboy).
        const delivery = await this.deliveries.forOrder(order.id, tx);
        if (delivery && delivery.status !== 'ready_for_collection') throw errors.conflict('DELIVERY_ALREADY_ASSIGNED', 'Já há motoboy a caminho', 'Já há motoboy atribuído. Peça à Webag para desfazer.');
        if (delivery) await this.deliveries.cancelForOrderInTx(tx, order.id, 'Loja voltou o pedido para a separação', { id: userId, role: 'store' }, { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
      }
      if (to === 'delivered' && order.mode === 'pickup' && order.status !== 'delivered') {
        // Retirada se conclui com o código que o CLIENTE informa no balcão (RN-07, SEC-067).
        await this.assertPickupCode(order.id, order.pickupCode, pickupCode);
      }
      return { event: await this.orders.advance(tx, order, to, 'store', userId) };
    });
    if (ready) await this.orders.afterReadyForCollection(ready);
  }

  /** Loja cancela depois do aceite ("entrega não realizada" inclusa): motivo obrigatório, estorno total, conta no índice da loja (RN-08). */
  /** SEC-143: "recebi de volta" — a loja confirma a devolução da corrida; só então o pedido é cancelado e estornado. */
  async confirmReturnReceived(storeId: string, orderId: string, userId: string, ctx: RequestContext): Promise<void> {
    await this.act(storeId, orderId, userId, async (tx, order) => this.orders.confirmStoreReturnInTx(tx, order, 'store', ctx, null));
  }

  async cancel(storeId: string, orderId: string, userId: string, reason: string): Promise<void> {
    await this.act(storeId, orderId, userId, async (tx, order) => {
      if (order.status === 'cancelled' && order.cancelledBy === 'store') return { event: null };
      const { event, refund } = await this.orders.closeOrder(tx, order, 'cancelled', 'store', reason, userId);
      return { event, refund };
    });
  }
}

const firstName = (name: string | undefined): string => (name ?? '').trim().split(/\s+/)[0] ?? '';
