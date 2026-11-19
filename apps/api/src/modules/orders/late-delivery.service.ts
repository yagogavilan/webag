import { randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown, type OnModuleInit } from '@nestjs/common';
import { and, eq, inArray, isNull, lt, lte, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { capOldest } from '../../platform/bounded.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { coupons } from '../cart/db/schema.js';
import { deliveryEvents, DeliveriesService, type Delivery, type DeliveryListener, type DeliveryStatus } from '../logistics/index.js';
import { PaymentsService } from '../payments/index.js';
import { orderCancelRequests, orders } from './db/schema.js';
import { COMPENSATION_VALID_DAYS, compensationCoupon, CUSTOMER_FAULT_REASONS, deservesCompensation, LATE_IMMEDIATE_CANCEL_STATUSES, LATE_TRACKED_STATUSES, lateStateOf, type CompensationKind } from './domain/late.js';
import { OrderEventBus, type OrderEvent } from './order-events.bus.js';
import { OrdersService, type CancelRequestView } from './orders.service.js';

export const LATE_CANCEL_REASON = 'Atraso na entrega';
const SUPERSEDED_NOTE = 'Encerrado: o pedido já mudou de estado antes da resposta';
const SYSTEM_CTX: RequestContext = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/**
 * Atraso da entrega Webag (RN-19 item 4; WB-253 a WB-255). Três coisas, todas decididas no servidor:
 * 1) aviso (1 push por pedido) ao passar do fim da faixa; 2) cancelamento sem custo depois da tolerância (imediato antes da saída;
 * pedido à operação em saída, com aceite automático no silêncio); 3) compensação ao entregar com atraso (cupom pessoal, 1 por pedido).
 */
@Injectable()
export class LateDeliveryService implements DeliveryListener, OnModuleInit, OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(LateDeliveryService.name);
  private timers: NodeJS.Timeout[] = [];
  /** Compensações criadas na transação da entrega, avisadas depois do commit. */
  private readonly granted = new Map<string, OrderEvent>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly params: ParametersService,
    private readonly orders: OrdersService,
    private readonly deliveries: DeliveriesService,
    private readonly payments: PaymentsService,
    private readonly audit: AuditService,
    private readonly bus: OrderEventBus,
  ) {}

  onModuleInit(): void {
    this.deliveries.registerListener(this);
  }

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.sweep().catch((e: Error) => this.logger.error(e.message)), 30_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // ------------------------------------------------------------------ cancelamento sem custo (WB-253)

  /**
   * "Cancelar sem custo". Antes da saída: cancela na hora (CANCELADO, ator cliente, motivo `atraso`), estoque liberado e estorno TOTAL
   * com a taxa de entrega. Em saída: abre o pedido de cancelamento à operação. Idempotente (toque duplo: um só efeito).
   */
  async cancelLate(userId: string, orderId: string): Promise<{ status: 'cancelled' } | { status: 'requested'; cancelRequest: CancelRequestView }> {
    const tolerance = await this.params.getNumber('entrega_atraso_tolerancia_min');
    let done: Awaited<ReturnType<OrdersService['closeOrder']>> | null = null;
    let requested: { orderNumber: string; requestId: string; created: boolean; order: typeof orders.$inferSelect } | null = null;
    let already = false;
    await this.db.transaction(async (tx) => {
      const [order] = await tx.select().from(orders).where(and(eq(orders.id, orderId), eq(orders.userId, userId))).for('update');
      if (!order) throw errors.notFound('Pedido não encontrado.');
      if (order.status === 'delivered') throw errors.conflict('ORDER_ALREADY_DELIVERED', 'Seu pedido já foi entregue', 'Não dá mais para cancelar. Se algo deu errado, fale com a Webag.');
      if (order.status === 'cancelled' && order.cancelledBy === 'customer' && order.cancelReason === LATE_CANCEL_REASON) {
        already = true;
        return;
      }
      const state = lateStateOf(order, tolerance, new Date());
      if (!state.canCancelWithoutCost || !state.cancelMode) {
        throw errors.conflict('LATE_CANCEL_NOT_AVAILABLE', 'O cancelamento sem custo ainda não está disponível', state.cancelAvailableAt ? `Ele fica disponível se o pedido passar das ${state.cancelAvailableAt.toISOString()}.` : 'Este pedido não tem atraso.');
      }
      if (state.cancelMode === 'immediate' && LATE_IMMEDIATE_CANCEL_STATUSES.includes(order.status)) {
        done = await this.orders.closeOrder(tx, order, 'cancelled', 'customer', LATE_CANCEL_REASON, userId, { skipTransitionCheck: true });
        return;
      }
      const [open] = await tx.select().from(orderCancelRequests).where(and(eq(orderCancelRequests.orderId, orderId), eq(orderCancelRequests.kind, 'late'), eq(orderCancelRequests.status, 'pending')));
      if (open) {
        requested = { orderNumber: order.number, requestId: open.id, created: false, order };
        return;
      }
      const [created] = await tx.insert(orderCancelRequests).values({ orderId, kind: 'late', reason: LATE_CANCEL_REASON }).returning();
      requested = { orderNumber: order.number, requestId: created!.id, created: true, order };
    });
    if (already) return { status: 'cancelled' };
    if (done) {
      const result = done as Awaited<ReturnType<OrdersService['closeOrder']>>;
      await this.orders.finishRefund(result.refund);
      await this.bus.emit(result.event);
      return { status: 'cancelled' };
    }
    const req = requested as unknown as { requestId: string; created: boolean; order: typeof orders.$inferSelect };
    if (req.created) {
      await this.payments.raiseAlert(null, 'late_cancel_requested', { orderId, orderNumber: req.order.number, requestId: req.requestId, storeId: req.order.storeId }).catch(() => undefined);
      await this.bus.emit({ orderId, number: req.order.number, userId, storeId: req.order.storeId, from: req.order.status, to: req.order.status, actor: 'customer', reason: 'Cliente pediu o cancelamento por atraso', at: new Date() }).catch(() => undefined);
    }
    const view = await this.orders.lateCancelRequestOf(orderId);
    return { status: 'requested', cancelRequest: view! };
  }

  /**
   * A operação responde ao pedido de cancelamento por atraso em saída: `accept` (a corrida vira "não entregue" e segue o fluxo de
   * devolução à loja, que cancela e estorna tudo depois que a loja confirma) ou `arrive_soon` (informa que chega em até N min).
   * Sem resposta em `entrega_cancel_resposta_min`, o sistema aceita (`sweep`).
   */
  async respond(orderId: string, input: { action: 'accept' | 'arrive_soon'; note?: string | undefined }, ctx: RequestContext): Promise<CancelRequestView> {
    return this.decide(orderId, input.action === 'accept' ? 'approved' : 'refused', input.note ?? null, ctx.principal ? 'admin' : 'system', ctx);
  }

  /**
   * SEC-175: tudo sob trava (pedido, pedido de cancelamento e corrida, na ordem global PEDIDO -> CORRIDA). Só decide se o pedido e a
   * corrida AINDA estão em `out_for_delivery`; se um deles já mudou (entregue, não entregue, cancelado), o pedido de cancelamento vira
   * `superseded` e nada é aceito nem avisado (no-op idempotente). O aceite e a transição da corrida ocorrem na MESMA transação: se a
   * corrida não puder mudar, nada é aceito e o pedido fica `pending` para a varredura repetir.
   */
  private async decide(orderId: string, decision: 'approved' | 'refused', note: string | null, by: 'admin' | 'system', ctx: RequestContext): Promise<CancelRequestView> {
    let order: typeof orders.$inferSelect | undefined;
    let superseded = false;
    let afterAct: (() => Promise<void>) | null = null;
    const noteText = note?.slice(0, 200) ?? (decision === 'refused' ? 'Chegamos em até 10 minutos' : null);
    await this.db.transaction(async (tx) => {
      [order] = await tx.select().from(orders).where(eq(orders.id, orderId)).for('update');
      if (!order) throw errors.notFound('Pedido não encontrado.');
      const [request] = await tx.select().from(orderCancelRequests).where(and(eq(orderCancelRequests.orderId, orderId), eq(orderCancelRequests.kind, 'late'), eq(orderCancelRequests.status, 'pending'))).for('update');
      if (!request) throw errors.conflict('NO_CANCEL_REQUEST', 'Não há pedido de cancelamento por atraso', 'O cliente não pediu o cancelamento, ou ele já foi respondido.');
      const delivery = await this.deliveries.forOrder(orderId, tx, true);
      if (order.status !== 'out_for_delivery' || !delivery || delivery.status !== 'out_for_delivery') {
        superseded = true;
        await tx.update(orderCancelRequests).set({ status: 'superseded', decidedAt: new Date(), decidedBy: by, decisionNote: SUPERSEDED_NOTE }).where(eq(orderCancelRequests.id, request.id));
        await this.audit.record(tx, ctx, { action: 'order.late_cancel_superseded', targetType: 'order', targetId: orderId, after: { decidedBy: by, orderStatus: order.status, deliveryStatus: delivery?.status ?? null } });
        return;
      }
      await tx.update(orderCancelRequests).set({ status: decision, decidedAt: new Date(), decidedBy: by, decisionNote: noteText }).where(eq(orderCancelRequests.id, request.id));
      await this.audit.record(tx, ctx, { action: `order.late_cancel_${decision === 'approved' ? 'accepted' : 'answered'}`, targetType: 'order', targetId: orderId, after: { decidedBy: by, note: noteText } });
      // A corrida segue o fluxo existente: "não entregue" -> devolução à loja -> a loja confirma -> pedido cancelado e estorno total (SEC-143).
      if (decision === 'approved') {
        const moved = await this.deliveries.actInTx(tx, delivery.id, 'not_delivered', { failReason: 'other', reason: 'Cancelamento por atraso aceito: devolver à loja' }, ctx);
        afterAct = moved.after;
      }
    });
    const current = order as unknown as typeof orders.$inferSelect;
    if (!superseded) {
      if (afterAct) await (afterAct as () => Promise<void>)();
      await this.bus.emit({ orderId, number: current.number, userId: current.userId, storeId: current.storeId, from: current.status, to: current.status, actor: by, reason: decision === 'approved' ? 'Cancelamento por atraso aceito' : noteText, at: new Date() }).catch(() => undefined);
    }
    return (await this.orders.lateCancelRequestOf(orderId))!;
  }

  // ------------------------------------------------------------------ varredura

  /** Aviso de atraso (1 por pedido) e aceite automático do pedido de cancelamento sem resposta. Idempotente. */
  async sweep(now = new Date()): Promise<{ notified: number; autoAccepted: number }> {
    return { notified: await this.notifyLate(now), autoAccepted: await this.autoAccept(now) };
  }

  /** WB-253 C1: passou do fim da faixa (qualquer estado até SAIU): 1 push por pedido; a reivindicação é atômica. */
  async notifyLate(now: Date): Promise<number> {
    const rows = await this.db
      .select()
      .from(orders)
      .where(and(eq(orders.mode, 'delivery'), inArray(orders.status, [...LATE_TRACKED_STATUSES]), isNull(orders.lateNotifiedAt), lt(orders.etaToAt, now)))
      .limit(100);
    let notified = 0;
    for (const row of rows) {
      const [claimed] = await this.db.update(orders).set({ lateNotifiedAt: now }).where(and(eq(orders.id, row.id), isNull(orders.lateNotifiedAt), inArray(orders.status, [...LATE_TRACKED_STATUSES]))).returning({ id: orders.id });
      if (!claimed) continue;
      await this.bus.emit({ orderId: row.id, number: row.number, userId: row.userId, storeId: row.storeId, from: row.status, to: row.status, actor: 'system', reason: null, at: now, notice: 'late' });
      notified += 1;
    }
    return notified;
  }

  /** Sem resposta da operação em `entrega_cancel_resposta_min`: aceita (padrão de silêncio, RN-19 4d). */
  async autoAccept(now: Date): Promise<number> {
    const minutes = await this.params.getNumber('entrega_cancel_resposta_min');
    const cutoff = new Date(now.getTime() - minutes * 60_000);
    const due = await this.db.select().from(orderCancelRequests).where(and(eq(orderCancelRequests.kind, 'late'), eq(orderCancelRequests.status, 'pending'), lte(orderCancelRequests.requestedAt, cutoff))).limit(50);
    let accepted = 0;
    for (const request of due) {
      try {
        await this.decide(request.orderId, 'approved', 'Aceito pelo sistema: sem resposta no prazo', 'system', SYSTEM_CTX);
        accepted += 1;
      } catch (error) {
        this.logger.warn(`aceite automático do cancelamento por atraso (pedido ${request.orderId}) falhou: ${(error as Error).message}`);
      }
    }
    return accepted;
  }

  // ------------------------------------------------------------------ compensação (WB-254)

  /** Na mesma transação da entrega concluída: cria o cupom pessoal se passou do fim da faixa + tolerância. Um por pedido. */
  async onDeliveryChange(tx: Tx, delivery: Delivery, _from: DeliveryStatus | null, to: DeliveryStatus): Promise<void> {
    if (delivery.kind !== 'delivery') return;
    // SEC-175: a corrida terminou (ou falhou) com um pedido de cancelamento por atraso ainda sem resposta: ele perde o objeto e é encerrado
    // aqui, na mesma transação (o pedido já está travado por quem muda a corrida), para que o aceite automático nunca "aceite" depois.
    if (to === 'delivered' || to === 'not_delivered' || to === 'cancelled' || to === 'returned_to_store') {
      await tx
        .update(orderCancelRequests)
        .set({ status: 'superseded', decidedAt: new Date(), decidedBy: 'system', decisionNote: SUPERSEDED_NOTE })
        .where(and(eq(orderCancelRequests.orderId, delivery.orderId), eq(orderCancelRequests.kind, 'late'), eq(orderCancelRequests.status, 'pending')));
    }
    if (to !== 'delivered') return;
    const [order] = await tx.select().from(orders).where(eq(orders.id, delivery.orderId));
    if (!order) return;
    const [tolerance, kind, valueCents] = await Promise.all([this.params.getNumber('entrega_atraso_tolerancia_min'), this.params.get('entrega_compensacao_tipo'), this.params.getNumber('entrega_compensacao_cents')]);
    const now = new Date();
    if (!deservesCompensation(order, now, tolerance)) return;
    // SEC-177: o atraso foi causado pelo cliente/endereço (ausente, endereço não encontrado, recusou) se a corrida já falhou por um desses motivos.
    const [fault] = await tx
      .select({ reason: sql<string>`${deliveryEvents.meta} ->> 'failReason'` })
      .from(deliveryEvents)
      .where(and(eq(deliveryEvents.deliveryId, delivery.id), eq(deliveryEvents.toStatus, 'not_delivered'), sql`${deliveryEvents.meta} ->> 'failReason' in (${sql.join(CUSTOMER_FAULT_REASONS.map((r) => sql`${r}`), sql`, `)})`))
      .limit(1);
    if (fault) {
      await tx.insert(deliveryEvents).values({ deliveryId: delivery.id, fromStatus: 'delivered', toStatus: 'delivered', action: 'compensation_skipped', actorId: null, actorRole: 'system', meta: { cause: fault.reason } });
      return;
    }
    const spec = compensationCoupon(String(kind) as CompensationKind, valueCents);
    if (!spec) return;
    const [created] = await tx
      .insert(coupons)
      .values({
        code: `ATRASO${Array.from(randomBytes(8), (b) => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('')}`,
        kind: spec.kind,
        scope: 'platform',
        value: spec.value,
        minOrderCents: 0,
        startsAt: now,
        endsAt: new Date(now.getTime() + COMPENSATION_VALID_DAYS * 86_400_000),
        maxUses: 1,
        perCustomerLimit: 1,
        ownerUserId: order.userId,
        sourceOrderId: order.id,
      })
      .onConflictDoNothing()
      .returning({ id: coupons.id });
    if (!created) return; // já concedido (reprocesso): um cupom por pedido
    this.granted.set(order.id, { orderId: order.id, number: order.number, userId: order.userId, storeId: order.storeId, from: order.status, to: order.status, actor: 'system', reason: null, at: now, notice: 'late_compensation', compensation: { kind: spec.kind, valueCents: spec.value } });
    capOldest(this.granted);
  }

  async afterDeliveryChange(delivery: Delivery, _from: DeliveryStatus | null, to: DeliveryStatus): Promise<void> {
    if (to !== 'delivered') return;
    const event = this.granted.get(delivery.orderId);
    this.granted.delete(delivery.orderId);
    if (event) await this.bus.emit(event);
  }
}
