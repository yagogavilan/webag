import { randomInt } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNull, sql } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { businessDeadline } from '../stores/index.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { safeErrorMessage } from '../../platform/logging/mask.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { LedgerService } from '../finance/index.js';
import { PaymentsService } from '../payments/index.js';
import { couriers, deliveries, deliveryEvents } from './db/schema.js';
import { ACTIVE_STATUSES, canMove, isStoreFault, nextStatuses, TERMINAL_STATUSES, WITH_COURIER, type DeliveryKind, type DeliveryStatus, type NotDeliveredReason } from './domain/state.js';
import { buildCourierMessage, whatsappLink, type DeliveryMessageData } from './domain/whatsapp.js';

export type Delivery = typeof deliveries.$inferSelect;

/** Campos calculados da fila: espera sem motoboy, atraso sobre a faixa prometida (DEC-053) e sugestão de lote por área. */
export interface DeliveryListExtras {
  waitingMinutes: number | null;
  sla: 'ok' | 'long' | 'late' | null;
  /** Passou do fim da faixa de entrega prometida ao cliente. */
  overdue: boolean;
  overdueMinutes: number | null;
  /** Área (bairro, senão cidade) e quantas corridas prontas, sem motoboy, há nela agora: candidatas a sair no mesmo lote. */
  area: { key: string | null; readyCount: number };
}
export type DeliveryEvent = typeof deliveryEvents.$inferSelect;
export type DeliveryActor = { id: string | null; role: string };

/** Quem reage à corrida (o pedido, a troca) se registra aqui, sem o módulo de logística importar os deles (sem ciclo). */
export interface DeliveryListener {
  /** Mesma transação da mudança: falha aqui desfaz a transição. */
  onDeliveryChange?(tx: Tx, delivery: Delivery, from: DeliveryStatus | null, to: DeliveryStatus, actor: DeliveryActor, reason: string | null): Promise<void>;
  /** Depois do commit (aviso ao cliente, tempo real): falha aqui não desfaz nada. */
  afterDeliveryChange?(delivery: Delivery, from: DeliveryStatus | null, to: DeliveryStatus, actor: DeliveryActor, reason: string | null): Promise<void>;
  /** WB-241 C7: a coleta de troca estourou o prazo sem motoboy (uma vez por corrida, depois do commit); `newDeadlineAt` é o novo prazo ao cliente. */
  onCollectionLate?(delivery: Delivery, newDeadlineAt: Date): Promise<void>;
}

export interface CreateDeliveryInput {
  kind?: DeliveryKind;
  orderId: string;
  exchangeId?: string | null;
  storeId: string;
  volumes?: number;
  note?: string | null;
  cityId?: string | null;
  neighborhoodId?: string | null;
  feeCents: number;
  expectedCostCents: number;
  /** DEC-053: fim da faixa de entrega prometida (do pedido); base do alerta de atraso. */
  etaToAt?: Date | null;
  /** Foto mínima para o despacho (ver `DeliveryMessageData`). */
  contact: DeliveryMessageData;
  /** Quem criou (a loja, por exemplo); por padrão vem do contexto da requisição. */
  actor?: DeliveryActor;
}

export interface ActInput {
  reason?: string | undefined;
  code?: string | undefined;
  failReason?: NotDeliveredReason | undefined;
  overrideReason?: string | undefined;
}
export type DeliveryAction = 'confirm' | 'picked_up' | 'delivered' | 'not_delivered' | 'reattempt' | 'return_confirmed' | 'reassign' | 'cancel';
const ACTION_TARGET: Record<DeliveryAction, DeliveryStatus> = {
  confirm: 'courier_en_route',
  picked_up: 'out_for_delivery',
  delivered: 'delivered',
  not_delivered: 'not_delivered',
  reattempt: 'out_for_delivery',
  return_confirmed: 'returned_to_store',
  reassign: 'ready_for_collection',
  cancel: 'cancelled',
};
const CODE_MAX_FAILS = 5;

/**
 * Corridas da Webag (L.3, DEC-036): fila, atribuição, estados, custo, WhatsApp e auditoria. Toda mudança grava evento
 * (append-only) e auditoria na MESMA transação; quem depende da corrida (pedido, troca) reage por `DeliveryListener`.
 */
@Injectable()
export class DeliveriesService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(DeliveriesService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly listeners: DeliveryListener[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly flags: FeatureFlagsService,
    private readonly params: ParametersService,
    private readonly payments: PaymentsService,
    private readonly ledger: LedgerService,
  ) {}

  /** Auto-conclusão a cada 5 min. Desligada em teste e na CLI (os testes chamam `autoConcludeDue`). */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timers.push(setInterval(() => void this.autoConcludeDue().catch((e: Error) => this.logger.error(e.message)), 5 * 60_000).unref());
    this.timers.push(setInterval(() => void this.alertLateDue().catch((e: Error) => this.logger.error(e.message)), 60_000).unref());
    this.timers.push(setInterval(() => void this.clearContactDue().catch((e: Error) => this.logger.error(e.message)), 60 * 60_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  /**
   * DT-046 / RN-18: corrida em "saiu para entrega" há mais de `auto_conclusao_entrega_h` (24 h) é concluída pelo sistema, com o
   * ator "sistema" no histórico e na auditoria, e o pedido (ou a troca) acompanha. Sem código de entrega: ninguém confirmou.
   */
  async autoConcludeDue(now = new Date()): Promise<number> {
    const hours = await this.params.getNumber('auto_conclusao_entrega_h');
    const cutoff = new Date(now.getTime() - hours * 3_600_000);
    const due = await this.db
      .select({ id: deliveries.id })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'out_for_delivery'), sql`(select max(e.created_at) from ${deliveryEvents} e where e.delivery_id = ${deliveries.id} and e.to_status = 'out_for_delivery') <= ${cutoff.toISOString()}::timestamptz`))
      .limit(100);
    let concluded = 0;
    for (const row of due) {
      try {
        await this.act(row.id, 'delivered', { reason: `Conclusão automática: ${hours} h sem ocorrência` }, { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
        concluded += 1;
      } catch (error) {
        this.logger.warn(`auto-conclusão da corrida ${row.id} falhou: ${safeErrorMessage(error)}`);
      }
    }
    return concluded;
  }

  /**
   * I7: ordem GLOBAL de locks = PEDIDO -> TROCA -> CORRIDA (ADR-011 §14). Quem muda a corrida e dispara os ouvintes (que travam o pedido
   * ou a troca) trava o pai ANTES da corrida; assim não cruza com `closeOrder`/`closeInTx`, que já travam o pai e depois a corrida.
   * A corrida de entrega é filha do pedido; a de coleta/reentrega de troca, da troca.
   */
  private async lockParent(tx: Tx, delivery: Pick<Delivery, 'orderId' | 'exchangeId'>): Promise<void> {
    if (delivery.exchangeId) await tx.execute(sql`select id from exchange_requests where id = ${delivery.exchangeId}::uuid for update`);
    else await tx.execute(sql`select id from orders where id = ${delivery.orderId}::uuid for update`);
  }

  registerListener(listener: DeliveryListener): void {
    this.listeners.push(listener);
  }

  private actorOf(ctx: RequestContext): DeliveryActor {
    return { id: ctx.principal?.userId ?? null, role: ctx.principal?.adminProfile ?? ctx.principal?.roles.join(',') ?? 'system' };
  }

  private async notifyAfter(delivery: Delivery, from: DeliveryStatus | null, to: DeliveryStatus, actor: DeliveryActor, reason: string | null): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.afterDeliveryChange?.(delivery, from, to, actor, reason);
      } catch (error) {
        this.logger.warn(`gancho pós-commit da corrida ${delivery.id}: ${safeErrorMessage(error)}`);
      }
    }
  }

  // ------------------------------------------------------------------ criação

  /**
   * Cria a corrida na transação de quem chama (o pedido ficando pronto). Idempotente por pedido (toque duplo em "pronto para
   * coleta" não cria duas). O código de entrega nasce aqui quando a flag `codigo_entrega` está ligada.
   */
  async createInTx(tx: Tx, input: CreateDeliveryInput, ctx: RequestContext): Promise<{ delivery: Delivery; created: boolean }> {
    const kind = input.kind ?? 'delivery';
    const code = kind === 'delivery' && (await this.flags.isEnabled('codigo_entrega')) ? String(randomInt(0, 10_000)).padStart(4, '0') : null;
    const [created] = await tx
      .insert(deliveries)
      .values({
        kind,
        orderId: input.orderId,
        exchangeId: input.exchangeId ?? null,
        storeId: input.storeId,
        volumes: Math.max(1, Math.min(input.volumes ?? 1, 99)),
        note: input.note?.slice(0, 100) ?? null,
        cityId: input.cityId ?? null,
        neighborhoodId: input.neighborhoodId ?? null,
        etaToAt: input.etaToAt ?? null,
        feeCents: input.feeCents,
        expectedCostCents: input.expectedCostCents,
        contact: input.contact as unknown as Record<string, unknown>,
        deliveryCode: code,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const [existing] = await tx.select().from(deliveries).where(and(eq(deliveries.orderId, input.orderId), eq(deliveries.kind, kind), input.exchangeId ? eq(deliveries.exchangeId, input.exchangeId) : isNull(deliveries.exchangeId)));
      if (!existing) throw new Error('corrida duplicada sem original');
      if (existing.status === 'cancelled' && kind === 'delivery') {
        // A loja desfez o "pronto" e marcou de novo: a MESMA corrida volta para a fila (uma por pedido), com horário e código novos.
        const actor = input.actor ?? this.actorOf(ctx);
        const [revived] = await tx
          .update(deliveries)
          .set({ status: 'ready_for_collection', readyAt: new Date(), courierId: null, whatsappSentAt: null, attempts: 1, failReason: null, failNote: null, deliveryCode: code, codeFailures: 0, volumes: Math.max(1, Math.min(input.volumes ?? 1, 99)), note: input.note?.slice(0, 100) ?? null, contact: input.contact as unknown as Record<string, unknown>, updatedAt: new Date() })
          .where(eq(deliveries.id, existing.id))
          .returning();
        await tx.insert(deliveryEvents).values({ deliveryId: existing.id, fromStatus: 'cancelled', toStatus: 'ready_for_collection', action: 'recreate', actorId: actor.id, actorRole: actor.role });
        await this.audit.record(tx, ctx, { action: 'delivery.recreate', targetType: 'delivery', targetId: existing.id, after: { status: 'ready_for_collection' }, actorId: actor.id, actorRole: actor.role });
        for (const listener of this.listeners) await listener.onDeliveryChange?.(tx, revived!, 'cancelled', 'ready_for_collection', actor, null);
        return { delivery: revived!, created: true };
      }
      return { delivery: existing, created: false };
    }
    const actor = input.actor ?? this.actorOf(ctx);
    await tx.insert(deliveryEvents).values({ deliveryId: created.id, fromStatus: null, toStatus: 'ready_for_collection', action: 'create', actorId: actor.id, actorRole: actor.role, meta: { kind, volumes: created.volumes } });
    await this.audit.record(tx, ctx, { action: 'delivery.create', targetType: 'delivery', targetId: created.id, after: { kind, orderId: input.orderId, status: 'ready_for_collection' }, actorId: actor.id, actorRole: actor.role });
    for (const listener of this.listeners) await listener.onDeliveryChange?.(tx, created, null, 'ready_for_collection', actor, null);
    return { delivery: created, created: true };
  }

  /** Corrida de entrega do pedido (ou `null`). Para o pedido mostrar o acompanhamento ao cliente. */
  async forOrder(orderId: string, exec: Db | Tx = this.db, lock = false): Promise<Delivery | null> {
    const query = exec.select().from(deliveries).where(and(eq(deliveries.orderId, orderId), eq(deliveries.kind, 'delivery')));
    const [row] = lock ? await query.for('update') : await query;
    return row ?? null;
  }

  /**
   * O pedido foi cancelado (admin) com a corrida em aberto: encerra a corrida na mesma transação, em qualquer estado ativo
   * (o motoboy pode já estar com o pacote; o custo do deslocamento é lançado depois pela operação).
   */
  async cancelForOrderInTx(tx: Tx, orderId: string, reason: string, actor: DeliveryActor, ctx: RequestContext): Promise<void> {
    const [current] = await tx.select().from(deliveries).where(and(eq(deliveries.orderId, orderId), eq(deliveries.kind, 'delivery'))).for('update');
    if (!current || TERMINAL_STATUSES.includes(current.status)) return;
    const [updated] = await tx.update(deliveries).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(deliveries.id, current.id)).returning();
    const hadCourier = WITH_COURIER.includes(current.status);
    await this.record(tx, ctx, actor, current, updated!, 'cancel', reason, { source: 'order_cancelled', ...(hadCourier ? { hadCourier: true } : {}) });
    // SEC-175 item 4: o motoboy já estava com a corrida (a caminho ou com o pacote) e o pedido foi encerrado: a operação precisa avisá-lo.
    if (hadCourier) await this.payments.raiseAlertIn(tx, 'delivery_cancelled_with_courier', { deliveryId: current.id, orderId, status: current.status, courierId: current.courierId });
  }

  /** Cancela as corridas ainda canceláveis de uma troca (cliente desistiu, taxa não paga, prazo vencido). Corrida já com o pacote fica como está. */
  async cancelForExchangeInTx(tx: Tx, exchangeId: string, reason: string, actor: DeliveryActor, ctx: RequestContext): Promise<void> {
    const rows = await tx.select().from(deliveries).where(eq(deliveries.exchangeId, exchangeId)).for('update');
    for (const current of rows) {
      if (TERMINAL_STATUSES.includes(current.status) || !canMove(current.status, 'cancelled')) continue;
      const [updated] = await tx.update(deliveries).set({ status: 'cancelled', updatedAt: new Date() }).where(eq(deliveries.id, current.id)).returning();
      await this.record(tx, ctx, actor, current, updated!, 'cancel', reason, { source: 'exchange_closed' });
    }
  }

  /** Corridas de uma troca (coleta e reentrega), da mais antiga para a mais nova. */
  async forExchange(exchangeId: string, exec: Db | Tx = this.db): Promise<Delivery[]> {
    return exec.select().from(deliveries).where(eq(deliveries.exchangeId, exchangeId)).orderBy(deliveries.createdAt);
  }

  // ------------------------------------------------------------------ leitura

  async get(id: string): Promise<Delivery> {
    const [row] = await this.db.select().from(deliveries).where(eq(deliveries.id, id));
    if (!row) throw errors.notFound('Corrida não encontrada.');
    return row;
  }

  async events(id: string): Promise<DeliveryEvent[]> {
    return this.db.select().from(deliveryEvents).where(eq(deliveryEvents.deliveryId, id)).orderBy(asc(deliveryEvents.createdAt), asc(deliveryEvents.id));
  }

  /**
   * Fila (WB-230): `active` = mais antiga primeiro (do horário de "pronto", que NÃO muda ao reatribuir); `done` = concluídas
   * hoje, mais novas primeiro. Filtros no servidor; paginada por cursor.
   */
  async list(query: { tab?: 'active' | 'done'; status?: DeliveryStatus; kind?: DeliveryKind; courierId?: string; storeId?: string; cityId?: string; cursor?: string; limit?: unknown }): Promise<Page<Delivery & DeliveryListExtras>> {
    const limit = parseLimit(query.limit);
    const tab = query.tab ?? 'active';
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const startOfDay = new Date(Date.now() - 3 * 3_600_000);
    startOfDay.setUTCHours(3, 0, 0, 0); // meia-noite de Brasília (UTC-3)
    const [slaWarn, slaCritical] = await Promise.all([this.params.getNumber('logistica_sla_atribuir_min'), this.params.getNumber('logistica_sla_atribuir_critico_min')]);
    const base = and(
      tab === 'active' ? inArray(deliveries.status, [...ACTIVE_STATUSES]) : and(inArray(deliveries.status, [...TERMINAL_STATUSES]), gte(deliveries.updatedAt, startOfDay)),
      query.status ? eq(deliveries.status, query.status) : undefined,
      query.kind ? eq(deliveries.kind, query.kind) : undefined,
      query.courierId ? eq(deliveries.courierId, query.courierId) : undefined,
      query.storeId ? eq(deliveries.storeId, query.storeId) : undefined,
      query.cityId ? eq(deliveries.cityId, query.cityId) : undefined,
    );
    const column = tab === 'active' ? deliveries.readyAt : deliveries.updatedAt;
    const after = cursor ? (tab === 'active' ? sql`(date_trunc('milliseconds', ${column}), ${deliveries.id}) > (${new Date(cursor.at).toISOString()}::timestamptz, ${cursor.id}::uuid)` : sql`(date_trunc('milliseconds', ${column}), ${deliveries.id}) < (${new Date(cursor.at).toISOString()}::timestamptz, ${cursor.id}::uuid)`) : undefined;
    const rows = await this.db
      .select()
      .from(deliveries)
      .where(and(base, after))
      .orderBy(...(tab === 'active' ? [sql`date_trunc('milliseconds', ${column}) asc`, asc(deliveries.id)] : [sql`date_trunc('milliseconds', ${column}) desc`, desc(deliveries.id)]))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1);
    const now = Date.now();
    const legacyAlertMin = await this.params.getNumber('logistica_alerta_entrega_min');
    const collectionDays = await this.params.getNumber('coleta_agendamento_dias_uteis');
    const areaCounts = tab === 'active' ? await this.readyByArea() : new Map<string, number>();
    return {
      data: page.map((d) => {
        const waiting = d.status === 'ready_for_collection' ? Math.floor((now - d.readyAt.getTime()) / 60_000) : null;
        const areaKey = d.neighborhoodId ?? d.cityId;
        const { overdue, overdueMinutes } = overdueOf(d, now, legacyAlertMin, collectionDays);
        return {
          ...d,
          waitingMinutes: waiting,
          sla: waiting === null ? null : waiting >= slaCritical ? 'late' : waiting >= slaWarn ? 'long' : 'ok',
          overdue,
          overdueMinutes,
          area: { key: areaKey, readyCount: areaKey ? (areaCounts.get(areaKey) ?? 0) : 0 },
        };
      }),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: (tab === 'active' ? last.readyAt : last.updatedAt).toISOString(), id: last.id }) : null,
    };
  }

  /** Corridas prontas e sem motoboy por área (bairro, senão cidade): base da sugestão de lote (DEC-053). */
  private async readyByArea(): Promise<Map<string, number>> {
    const rows = await this.db
      .select({ key: sql<string>`coalesce(${deliveries.neighborhoodId}, ${deliveries.cityId})::text`, n: sql<number>`count(*)::int` })
      .from(deliveries)
      .where(and(eq(deliveries.status, 'ready_for_collection'), eq(deliveries.kind, 'delivery')))
      .groupBy(sql`coalesce(${deliveries.neighborhoodId}, ${deliveries.cityId})`);
    return new Map(rows.filter((r) => r.key).map((r) => [r.key, r.n]));
  }

  /**
   * DEC-053: alerta de atraso. Corrida de entrega ainda ativa cujo prazo (fim da faixa prometida, ou o limite antigo para as
   * sem ETA) passou gera UM alerta ao admin e ao financeiro. Idempotente: `lateAlertedAt` marca a corrida.
   */
  async alertLateDue(now = new Date()): Promise<number> {
    const legacyAlertMin = await this.params.getNumber('logistica_alerta_entrega_min');
    const collectionDays = await this.params.getNumber('coleta_agendamento_dias_uteis');
    const candidates = await this.db
      .select()
      .from(deliveries)
      .where(and(inArray(deliveries.kind, ['delivery', 'exchange_pickup']), inArray(deliveries.status, [...ACTIVE_STATUSES]), isNull(deliveries.lateAlertedAt)));
    let alerted = 0;
    for (const d of candidates) {
      const { overdue, overdueMinutes } = overdueOf(d, now.getTime(), legacyAlertMin, collectionDays);
      if (!overdue) continue;
      const [claimed] = await this.db.update(deliveries).set({ lateAlertedAt: now }).where(and(eq(deliveries.id, d.id), isNull(deliveries.lateAlertedAt))).returning({ id: deliveries.id });
      if (!claimed) continue;
      await this.payments.raiseAlert(null, d.kind === 'exchange_pickup' ? 'collection_late' : 'delivery_late', { deliveryId: d.id, orderId: d.orderId, status: d.status, overdueMinutes }).catch((e: Error) => this.logger.error(e.message));
      if (d.kind === 'exchange_pickup') await this.noticeCollectionLate(d, now, collectionDays);
      alerted += 1;
    }
    return alerted;
  }

  /**
   * WB-241 C7: o cliente é avisado do novo prazo da coleta atrasada. Novo prazo = `coleta_agendamento_dias_uteis` dias úteis a contar
   * do aviso [HIPÓTESE: o PRD não fixa o número; ver `docs/gestao/fila-backend-dev.md`]. Fica no histórico da corrida; falha de canal
   * nunca desfaz nada.
   */
  private async noticeCollectionLate(d: Delivery, now: Date, collectionDays: number): Promise<void> {
    const newDeadlineAt = businessDeadline(now, collectionDays);
    try {
      await this.db.insert(deliveryEvents).values({ deliveryId: d.id, fromStatus: d.status, toStatus: d.status, action: 'collection_late_notice', actorId: null, actorRole: 'system', meta: { newDeadlineAt: newDeadlineAt.toISOString() } });
    } catch (error) {
      this.logger.warn(`histórico do aviso de coleta atrasada ${d.id}: ${safeErrorMessage(error)}`);
    }
    for (const listener of this.listeners) {
      try {
        await listener.onCollectionLate?.(d, newDeadlineAt);
      } catch (error) {
        this.logger.warn(`aviso de coleta atrasada da corrida ${d.id}: ${safeErrorMessage(error)}`);
      }
    }
  }

  // ------------------------------------------------------------------ atribuição

  /**
   * DEC-053: lote por área. Atribui ao MESMO motoboy várias corridas prontas da mesma cidade (até `entrega_lote_max`); o
   * operador com poucos motoboys leva os pedidos de uma região numa saída só. Cada corrida segue a regra de `assign`
   * (primeiro que chega vence, endereço conferido); a resposta diz o que foi e o que não foi atribuído.
   */
  async assignBatch(deliveryIds: string[], courierId: string, input: { addressConfirmed?: boolean }, ctx: RequestContext): Promise<{ assigned: Delivery[]; failed: { deliveryId: string; code: string }[] }> {
    const unique = [...new Set(deliveryIds)];
    const max = await this.params.getNumber('entrega_lote_max');
    if (unique.length < 2 || unique.length > max) throw errors.unprocessable('INVALID_BATCH', 'Lote inválido', { detail: `Escolha de 2 a ${max} corridas.` });
    const rows = await this.db.select().from(deliveries).where(inArray(deliveries.id, unique));
    if (rows.length !== unique.length) throw errors.notFound('Corrida não encontrada.');
    if (rows.some((d) => d.kind !== 'delivery' || d.status !== 'ready_for_collection')) throw errors.unprocessable('INVALID_BATCH', 'Lote inválido', { detail: 'Só corridas de entrega prontas e sem motoboy entram no lote.' });
    if (new Set(rows.map((d) => d.cityId)).size !== 1 || rows[0]!.cityId === null) throw errors.unprocessable('BATCH_DIFFERENT_AREA', 'Áreas diferentes', { detail: 'O lote precisa ser de corridas da mesma cidade.' });
    const assigned: Delivery[] = [];
    const failed: { deliveryId: string; code: string }[] = [];
    // Ordem estável (mais antigas primeiro): o lote nunca deixa uma corrida velha para trás.
    for (const d of [...rows].sort((a, b) => a.readyAt.getTime() - b.readyAt.getTime() || a.id.localeCompare(b.id))) {
      try {
        assigned.push(await this.assign(d.id, courierId, input, ctx));
      } catch (error) {
        if (!(error instanceof AppError)) throw error;
        failed.push({ deliveryId: d.id, code: error.code });
      }
    }
    return { assigned, failed };
  }

  /** Atribui o motoboy: PRONTA -> AGUARDANDO. Dois operadores: vale o primeiro, o outro recebe 409 com quem atribuiu (WB-232 C8). */
  async assign(id: string, courierId: string, input: { addressConfirmed?: boolean }, ctx: RequestContext): Promise<Delivery> {
    const actor = this.actorOf(ctx);
    const result = await this.db.transaction(async (tx) => {
      const [courier] = await tx.select().from(couriers).where(eq(couriers.id, courierId));
      if (!courier || !courier.active) throw errors.unprocessable('COURIER_INACTIVE', 'Motoboy indisponível', { detail: 'Escolha um motoboy ativo.' });
      const [peek] = await tx.select().from(deliveries).where(eq(deliveries.id, id));
      if (!peek) throw errors.notFound('Corrida não encontrada.');
      await this.lockParent(tx, peek);
      const [current] = await tx.select().from(deliveries).where(eq(deliveries.id, id)).for('update');
      if (!current) throw errors.notFound('Corrida não encontrada.');
      if (current.status !== 'ready_for_collection') {
        if (current.courierId && WITH_COURIER_STATUSES.has(current.status)) {
          const [who] = await tx.select({ name: couriers.name }).from(couriers).where(eq(couriers.id, current.courierId));
          const [by] = await tx.select({ actorRole: deliveryEvents.actorRole, actorId: deliveryEvents.actorId }).from(deliveryEvents).where(and(eq(deliveryEvents.deliveryId, id), eq(deliveryEvents.action, 'assign'))).orderBy(desc(deliveryEvents.createdAt)).limit(1);
          throw errors.conflict('DELIVERY_ALREADY_ASSIGNED', 'Corrida já atribuída', `Já atribuído a ${who?.name ?? 'outro motoboy'}${by?.actorRole ? ` por ${by.actorRole}` : ''}.`);
        }
        throw errors.conflict('INVALID_DELIVERY_TRANSITION', 'Transição não permitida', `A corrida está em ${current.status}.`);
      }
      // Endereço incompleto: o operador confirma com o cliente antes de enviar (WB-232 C6).
      const contact = current.contact as unknown as DeliveryMessageData | null;
      if (contact && !addressLooksComplete(contact.dropoffAddress) && !input.addressConfirmed) {
        throw errors.unprocessable('ADDRESS_INCOMPLETE', 'Endereço incompleto', { detail: 'Endereço incompleto. Confirme com o cliente e marque "Já confirmei".' });
      }
      const [busy] = await tx.select({ n: sql<number>`count(*)::int` }).from(deliveries).where(and(eq(deliveries.courierId, courierId), inArray(deliveries.status, ['awaiting_courier', 'courier_en_route', 'out_for_delivery', 'not_delivered'])));
      const [updated] = await tx.update(deliveries).set({ status: 'awaiting_courier', courierId, whatsappSentAt: null, updatedAt: new Date() }).where(and(eq(deliveries.id, id), eq(deliveries.status, 'ready_for_collection'))).returning();
      if (!updated) throw errors.conflict('DELIVERY_ALREADY_ASSIGNED', 'Corrida já atribuída', 'Esta corrida acabou de ser atribuída por outra pessoa.');
      await this.record(tx, ctx, actor, current, updated, 'assign', null, { courierId, courierName: courier.name, courierActiveDeliveries: busy?.n ?? 0, addressConfirmed: input.addressConfirmed === true });
      return { updated, busy: busy?.n ?? 0 };
    });
    await this.notifyAfter(result.updated, 'ready_for_collection', 'awaiting_courier', actor, null);
    return result.updated;
  }

  /** Texto e link do WhatsApp (só dados mínimos). O telefone do cliente só sai com a corrida atribuída e ativa. */
  async whatsapp(id: string): Promise<{ courierPhone: string; message: string; link: string; courierActiveDeliveries: number }> {
    const delivery = await this.get(id);
    if (!delivery.courierId || !ACTIVE_STATUSES.includes(delivery.status) || !delivery.contact) throw errors.conflict('DELIVERY_NOT_ASSIGNED', 'Corrida sem motoboy', 'Atribua um motoboy antes de enviar a mensagem.');
    const [courier] = await this.db.select().from(couriers).where(eq(couriers.id, delivery.courierId));
    if (!courier) throw errors.notFound('Motoboy não encontrado.');
    const [busy] = await this.db.select({ n: sql<number>`count(*)::int` }).from(deliveries).where(and(eq(deliveries.courierId, courier.id), inArray(deliveries.status, ['awaiting_courier', 'courier_en_route', 'out_for_delivery', 'not_delivered'])));
    const message = buildCourierMessage({ ...(delivery.contact as unknown as DeliveryMessageData), volumes: delivery.volumes, note: delivery.note, kind: delivery.kind });
    return { courierPhone: courier.phone, message, link: whatsappLink(courier.phone, message), courierActiveDeliveries: busy?.n ?? 0 };
  }

  /** Registra que a mensagem foi enviada (`delivery_whatsapp_sent`, WB-232 C2). */
  async markWhatsappSent(id: string, ctx: RequestContext): Promise<void> {
    const actor = this.actorOf(ctx);
    await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(deliveries).where(eq(deliveries.id, id)).for('update');
      if (!current) throw errors.notFound('Corrida não encontrada.');
      await tx.update(deliveries).set({ whatsappSentAt: new Date() }).where(eq(deliveries.id, id));
      await tx.insert(deliveryEvents).values({ deliveryId: id, fromStatus: current.status, toStatus: current.status, action: 'whatsapp_sent', actorId: actor.id, actorRole: actor.role });
      await this.audit.record(tx, ctx, { action: 'delivery.whatsapp_sent', targetType: 'delivery', targetId: id });
    });
  }

  // ------------------------------------------------------------------ estados

  /**
   * Avança a corrida (WB-233). Só as transições válidas de RN-18; voltar (reatribuir, cancelar) exige motivo. "Entregue" confere o
   * código de entrega quando a flag está ligada (5 erros bloqueiam; super admin conclui com motivo, auditado).
   */
  async act(id: string, action: DeliveryAction, input: ActInput, ctx: RequestContext): Promise<Delivery> {
    const actor = this.actorOf(ctx);
    const to = ACTION_TARGET[action];
    this.validateAction(action, input);

    const before = await this.get(id);
    if (!canMove(before.status, to)) throw errors.conflict('INVALID_DELIVERY_TRANSITION', 'Transição não permitida', `A corrida não pode ir de ${before.status} para ${to}.`);
    if (action === 'delivered') await this.checkCode(before, input, actor);
    if (action === 'reattempt') {
      const max = await this.params.getNumber('entrega_reentrega_max');
      if (before.attempts > max) throw errors.conflict('REATTEMPT_LIMIT', 'Limite de reentregas', 'O limite de reentregas sem custo foi atingido. Ofereça nova tentativa paga ou devolva à loja.');
    }

    const result = await this.db.transaction(async (tx) => {
      await this.lockParent(tx, before);
      return this.applyInTx(tx, id, action, input, ctx, actor);
    });
    await this.notifyAfter(result, before.status, to, actor, input.reason ?? null);
    return result;
  }

  /**
   * SEC-175: a mesma transição, dentro da transação de quem chama (o aceite do cancelamento por atraso). O CHAMADOR já travou o pai
   * (pedido ou troca, I7) e roda `after()` DEPOIS do commit. Só vale para ações do sistema/operação que não conferem código
   * (`not_delivered`, `cancel`, `reassign`...): `delivered` pede o código e continua só em `act`.
   */
  async actInTx(tx: Tx, id: string, action: Exclude<DeliveryAction, 'delivered'>, input: ActInput, ctx: RequestContext): Promise<{ delivery: Delivery; after: () => Promise<void> }> {
    const actor = this.actorOf(ctx);
    this.validateAction(action, input);
    const [current] = await tx.select().from(deliveries).where(eq(deliveries.id, id));
    if (!current) throw errors.notFound('Corrida não encontrada.');
    const delivery = await this.applyInTx(tx, id, action, input, ctx, actor);
    return { delivery, after: () => this.notifyAfter(delivery, current.status, ACTION_TARGET[action], actor, input.reason ?? null) };
  }

  private validateAction(action: DeliveryAction, input: ActInput): void {
    if ((action === 'reassign' || action === 'cancel') && !input.reason?.trim()) throw errors.validation([{ field: 'reason', message: 'Informe o motivo.' }]);
    if (action === 'not_delivered' && !input.failReason) throw errors.validation([{ field: 'failReason', message: 'Informe o motivo da falha.' }]);
    if (action === 'not_delivered' && input.failReason === 'other' && !input.reason?.trim()) throw errors.validation([{ field: 'reason', message: 'Descreva o motivo.' }]);
  }

  private async applyInTx(tx: Tx, id: string, action: DeliveryAction, input: ActInput, ctx: RequestContext, actor: DeliveryActor): Promise<Delivery> {
    const to = ACTION_TARGET[action];
    const [current] = await tx.select().from(deliveries).where(eq(deliveries.id, id)).for('update');
    if (!current || !canMove(current.status, to)) throw errors.conflict('INVALID_DELIVERY_TRANSITION', 'Transição não permitida', 'A corrida mudou enquanto você agia. Recarregue.');
    const set: Partial<typeof deliveries.$inferInsert> = { status: to, updatedAt: new Date() };
    if (action === 'reassign') {
      set.courierId = null;
      set.whatsappSentAt = null;
    }
    if (action === 'not_delivered') {
      set.failReason = input.failReason!;
      set.failNote = input.reason?.slice(0, 200) ?? null;
    }
    if (action === 'reattempt') set.attempts = current.attempts + 1;
    if (action === 'delivered') set.deliveryCode = null; // o código de uso único não vale depois da entrega
    const [updated] = await tx.update(deliveries).set(set).where(and(eq(deliveries.id, id), eq(deliveries.status, current.status))).returning();
    if (!updated) throw errors.conflict('INVALID_DELIVERY_TRANSITION', 'Transição não permitida', 'A corrida mudou enquanto você agia. Recarregue.');
    const meta: Record<string, unknown> = {
      ...(action === 'not_delivered' ? { failReason: input.failReason, storeFault: isStoreFault(input.failReason!) } : {}),
      ...(action === 'reassign' ? { previousCourierId: current.courierId, keepsReadyAt: current.readyAt.toISOString() } : {}),
      ...(action === 'delivered' && input.overrideReason ? { codeOverrideReason: input.overrideReason } : {}),
    };
    await this.record(tx, ctx, actor, current, updated, action, input.reason ?? null, meta);
    return updated;
  }

  private async checkCode(delivery: Delivery, input: { code?: string | undefined; overrideReason?: string | undefined }, actor: DeliveryActor): Promise<void> {
    if (!delivery.deliveryCode || delivery.kind !== 'delivery') return; // flag desligada ou corrida sem código
    if (actor.role === 'system') return; // auto-conclusão por prazo: não há quem digite o código
    if (input.overrideReason?.trim()) {
      if (actor.role !== 'super_admin') throw new AppError(403, 'SUPER_ADMIN_REQUIRED', 'Só o super admin conclui sem o código', { detail: 'Peça ao super admin para concluir sem o código.' });
      return;
    }
    if (delivery.codeFailures >= CODE_MAX_FAILS) throw new AppError(429, 'DELIVERY_CODE_LOCKED', 'Código bloqueado', { detail: 'Muitos códigos errados. Só o super admin conclui esta entrega.' });
    if (input.code && input.code === delivery.deliveryCode) return;
    const [bumped] = await this.db.update(deliveries).set({ codeFailures: sql`${deliveries.codeFailures} + 1` }).where(eq(deliveries.id, delivery.id)).returning({ fails: deliveries.codeFailures });
    throw errors.unprocessable('DELIVERY_CODE_INVALID', 'Código incorreto', { detail: `Código incorreto (${bumped?.fails ?? 0} de ${CODE_MAX_FAILS}).` });
  }

  private async record(tx: Tx, ctx: RequestContext, actor: DeliveryActor, before: Delivery, after: Delivery, action: string, reason: string | null, meta: Record<string, unknown>): Promise<void> {
    await tx.insert(deliveryEvents).values({ deliveryId: after.id, fromStatus: before.status, toStatus: after.status, action, actorId: actor.id, actorRole: actor.role, reason: reason?.slice(0, 300) ?? null, meta });
    await this.audit.record(tx, ctx, { action: `delivery.${action}`, targetType: 'delivery', targetId: after.id, before: { status: before.status, courierId: before.courierId }, after: { status: after.status, courierId: after.courierId }, ...(reason ? { reason } : {}) });
    for (const listener of this.listeners) await listener.onDeliveryChange?.(tx, after, before.status, after.status, actor, reason);
  }

  nextActions(delivery: Pick<Delivery, 'status'>): readonly DeliveryStatus[] {
    return nextStatuses(delivery.status);
  }

  // ------------------------------------------------------------------ custo (WB-239)

  /**
   * Custo pago ao motoboy: a correção exige motivo e preserva o valor anterior (evento + auditoria). SEC-145: acima do teto
   * (`entrega_custo_max_cents`) é 422; acima de 1,5x o previsto da faixa ou do limite de alerta (`entrega_custo_alerta_cents`)
   * exige motivo e alerta o financeiro.
   */
  async setCost(id: string, costCents: number, reason: string | undefined, ctx: RequestContext): Promise<Delivery> {
    const actor = this.actorOf(ctx);
    const [maxCents, alertCents] = [await this.params.getNumber('entrega_custo_max_cents'), await this.params.getNumber('entrega_custo_alerta_cents')];
    if (costCents > maxCents) throw errors.unprocessable('COST_ABOVE_LIMIT', 'Custo acima do limite', { detail: `O custo por corrida não pode passar de ${maxCents} centavos; fale com o super admin.` });
    let flagged = false;
    const updated = await this.db.transaction(async (tx) => {
      const [current] = await tx.select().from(deliveries).where(eq(deliveries.id, id)).for('update');
      if (!current) throw errors.notFound('Corrida não encontrada.');
      if (!['delivered', 'not_delivered', 'returned_to_store', 'cancelled'].includes(current.status)) throw errors.conflict('DELIVERY_NOT_FINISHED', 'Corrida ainda em andamento', 'O custo é lançado quando a corrida termina.');
      if (current.costCents !== null && !reason?.trim()) throw errors.validation([{ field: 'reason', message: 'Informe o motivo da correção.' }]);
      if (current.costPaidAt) throw errors.conflict('COST_ALREADY_PAID', 'Custo já pago', 'Este custo já foi marcado como pago.');
      flagged = costCents > alertCents || (current.expectedCostCents > 0 && costCents * 2 > current.expectedCostCents * 3);
      if (flagged && !reason?.trim()) throw errors.unprocessable('COST_REASON_REQUIRED', 'Custo acima do esperado', { detail: 'Este custo passa do previsto da faixa ou do limite de alerta: informe o motivo.' });
      const [row] = await tx.update(deliveries).set({ costCents, costRegisteredBy: actor.id, costRegisteredAt: new Date(), updatedAt: new Date() }).where(eq(deliveries.id, id)).returning();
      await this.ledger.recordLogisticsCost(tx, { orderId: current.orderId, deliveryId: id, costCents, kind: current.kind }); // DT-049: despesa de logística no ledger
      await tx.insert(deliveryEvents).values({ deliveryId: id, fromStatus: current.status, toStatus: current.status, action: current.costCents === null ? 'cost_set' : 'cost_corrected', actorId: actor.id, actorRole: actor.role, reason: reason?.slice(0, 300) ?? null, meta: { previousCostCents: current.costCents, costCents, ...(flagged ? { flagged: true } : {}) } });
      await this.audit.record(tx, ctx, { action: 'delivery.cost', targetType: 'delivery', targetId: id, before: { costCents: current.costCents }, after: { costCents }, ...(reason ? { reason } : {}) });
      return row!;
    });
    if (flagged) await this.payments.raiseAlert(null, 'delivery_cost_high', { deliveryId: id, costCents, expectedCostCents: updated.expectedCostCents, registeredBy: actor.id }).catch((e: Error) => this.logger.warn(`alerta de custo da corrida ${id}: ${e.message}`));
    return updated;
  }

  /** "Marcar como pago": controle do PIX feito fora do app para um lote de corridas de UM motoboy (WB-239 C4). */
  async markPaid(deliveryIds: string[], paidOn: Date, ctx: RequestContext, overrideReason?: string): Promise<{ count: number; totalCents: number }> {
    const actor = this.actorOf(ctx);
    return this.db.transaction(async (tx) => {
      const rows = await tx.select().from(deliveries).where(inArray(deliveries.id, deliveryIds)).for('update');
      if (rows.length !== deliveryIds.length) throw errors.notFound('Corrida não encontrada.');
      if (new Set(rows.map((r) => r.courierId)).size !== 1 || rows.some((r) => !r.courierId)) throw errors.unprocessable('PAYOUT_MIXED_COURIERS', 'Lote de motoboys diferentes', { detail: 'Marque como pago um lote de corridas de um único motoboy.' });
      if (rows.some((r) => r.costCents === null)) throw errors.unprocessable('PAYOUT_COST_MISSING', 'Corrida sem custo', { detail: 'Registre o custo de todas as corridas antes de marcar como pago.' });
      if (rows.some((r) => r.costPaidAt)) throw errors.conflict('COST_ALREADY_PAID', 'Custo já pago', 'Há corrida deste lote já marcada como paga.');
      // SEC-145: separação de funções. Quem lançou (ou corrigiu) o custo não aprova o pagamento; só o super admin, com motivo, e fica auditado.
      const ownCost = actor.id !== null && rows.some((r) => r.costRegisteredBy === actor.id);
      if (ownCost && !(actor.role === 'super_admin' && overrideReason?.trim())) {
        throw new AppError(403, 'SEGREGATION_OF_DUTIES', 'Quem lançou o custo não marca como pago', { detail: 'Peça a outra pessoa do financeiro ou ao super admin para marcar o lote como pago.' });
      }
      await tx.update(deliveries).set({ costPaidAt: paidOn, updatedAt: new Date() }).where(inArray(deliveries.id, deliveryIds));
      const totalCents = rows.reduce((sum, r) => sum + (r.costCents ?? 0), 0);
      for (const row of rows) {
        await tx.insert(deliveryEvents).values({ deliveryId: row.id, fromStatus: row.status, toStatus: row.status, action: 'cost_paid', actorId: actor.id, actorRole: actor.role, meta: { paidOn: paidOn.toISOString(), costCents: row.costCents } });
        await this.ledger.recordCourierPayout(tx, { orderId: row.orderId, deliveryId: row.id, costCents: row.costCents ?? 0, paidOn }); // DT-049: quita o a pagar ao motoboy
      }
      await this.audit.record(tx, ctx, { action: 'delivery.cost_paid', targetType: 'courier', targetId: rows[0]!.courierId!, after: { deliveryIds, paidOn: paidOn.toISOString(), totalCents, ...(ownCost ? { segregationOverride: true } : {}) }, ...(ownCost ? { reason: overrideReason! } : {}) });
      return { count: rows.length, totalCents };
    });
  }

  // ------------------------------------------------------------------ contato do cliente (SEC-144)

  /**
   * "Revelar" o contato (telefone e endereço) de uma corrida ativa: exige motivo e grava a leitura na auditoria (quem, quando,
   * por quê; sem o dado). Depois da retenção o contato não existe mais (409).
   */
  async revealContact(id: string, reason: string, ctx: RequestContext): Promise<Delivery> {
    const delivery = await this.get(id);
    if (delivery.piiClearedAt || !delivery.contact || !ACTIVE_STATUSES.includes(delivery.status)) {
      throw errors.conflict('CONTACT_NOT_AVAILABLE', 'Contato indisponível', 'A corrida já terminou e o contato do cliente foi apagado (LGPD).');
    }
    await this.audit.recordStandalone(ctx, { action: 'delivery.contact_revealed', targetType: 'delivery', targetId: id, reason });
    return delivery;
  }

  /**
   * Retenção (LGPD, SEC-144): `pii_corrida_retencao_dias` depois que a corrida termina, o contato guarda só o necessário para o
   * histórico (loja, nº do pedido, volumes e BAIRRO/CIDADE). O endereço completo continua no pedido (fiscal e disputa).
   */
  async clearContactDue(now = new Date()): Promise<number> {
    const days = await this.params.getNumber('pii_corrida_retencao_dias');
    const cutoff = new Date(now.getTime() - days * 86_400_000);
    const due = await this.db
      .select()
      .from(deliveries)
      .where(and(inArray(deliveries.status, [...TERMINAL_STATUSES]), isNull(deliveries.piiClearedAt), sql`${deliveries.contact} is not null`, sql`(select max(e.created_at) from ${deliveryEvents} e where e.delivery_id = ${deliveries.id} and e.from_status <> e.to_status and e.to_status in ('delivered', 'returned_to_store', 'cancelled')) <= ${cutoff.toISOString()}::timestamptz`))
      .limit(200);
    for (const row of due) {
      const contact = (row.contact ?? {}) as Partial<DeliveryMessageData>;
      const area = (contact.dropoffAddress ?? '').split(',').map((p) => p.trim()).filter(Boolean).slice(-2).join(', ');
      const kept: Record<string, unknown> = { number: contact.number ?? null, kind: contact.kind ?? row.kind, storeName: contact.storeName ?? null, volumes: contact.volumes ?? row.volumes, dropoffAddress: area || null };
      await this.db.transaction(async (tx) => {
        const [updated] = await tx.update(deliveries).set({ contact: kept, piiClearedAt: now }).where(and(eq(deliveries.id, row.id), isNull(deliveries.piiClearedAt))).returning({ id: deliveries.id });
        if (updated) await this.audit.record(tx, { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null }, { action: 'delivery.contact_cleared', targetType: 'delivery', targetId: row.id, actorRole: 'system' });
      });
    }
    return due.length;
  }

  // ------------------------------------------------------------------ devolução à loja (SEC-143)

  /**
   * A loja recebeu a mercadoria de volta (ou o admin registra por ela, com motivo). Na transação de quem chama: confirma na
   * corrida `returned_to_store` e ainda não confirmada. Quem declarou a devolução (a operação) não confirma pela loja,
   * exceto o super admin. Devolve a corrida atualizada.
   */
  async confirmStoreReturnInTx(tx: Tx, orderId: string, via: 'store' | 'admin', ctx: RequestContext, reason: string | null): Promise<Delivery> {
    const actor = this.actorOf(ctx);
    const [current] = await tx.select().from(deliveries).where(and(eq(deliveries.orderId, orderId), eq(deliveries.kind, 'delivery'))).for('update');
    if (!current || current.status !== 'returned_to_store' || current.storeReturnConfirmedAt) {
      throw errors.conflict('RETURN_NOT_PENDING', 'Não há devolução aguardando confirmação', 'Este pedido não tem uma devolução à loja pendente.');
    }
    if (via === 'admin' && actor.role !== 'super_admin') {
      const [declared] = await tx.select().from(deliveryEvents).where(and(eq(deliveryEvents.deliveryId, current.id), eq(deliveryEvents.action, 'return_confirmed'))).orderBy(desc(deliveryEvents.createdAt)).limit(1);
      if (declared?.actorId && declared.actorId === actor.id) {
        throw new AppError(403, 'SEGREGATION_OF_DUTIES', 'Quem declarou a devolução não confirma pela loja', { detail: 'Peça a outra pessoa da operação para registrar a confirmação da loja.' });
      }
    }
    const [updated] = await tx.update(deliveries).set({ storeReturnConfirmedAt: new Date(), storeReturnConfirmedBy: actor.id, storeReturnConfirmedVia: via, updatedAt: new Date() }).where(eq(deliveries.id, current.id)).returning();
    await tx.insert(deliveryEvents).values({ deliveryId: current.id, fromStatus: current.status, toStatus: current.status, action: 'store_return_confirmed', actorId: actor.id, actorRole: via === 'store' ? 'store' : actor.role, reason: reason?.slice(0, 300) ?? null, meta: { via } });
    await this.audit.record(tx, ctx, { action: 'delivery.store_return_confirmed', targetType: 'delivery', targetId: current.id, after: { via }, ...(reason ? { reason } : {}) });
    return updated!;
  }
}

const WITH_COURIER_STATUSES: ReadonlySet<DeliveryStatus> = new Set(['awaiting_courier', 'courier_en_route', 'out_for_delivery', 'not_delivered']);

/** "Rua, nº, ..., bairro, cidade": precisa de ao menos rua, número e bairro (3 partes com o número). */
export function addressLooksComplete(address: string): boolean {
  const parts = address.split(',').map((p) => p.trim()).filter(Boolean);
  return parts.length >= 4 && parts.some((p) => /\d/.test(p));
}

/** Atraso sobre a faixa prometida (DEC-053); sem ETA gravado, usa o limite antigo a partir do "pronto" (`logistica_alerta_entrega_min`). */
function overdueOf(d: Pick<Delivery, 'kind' | 'status' | 'etaToAt' | 'readyAt'>, nowMs: number, legacyAlertMin: number, collectionDays = 3): { overdue: boolean; overdueMinutes: number | null } {
  // BUG-017 / WB-241 C7: a coleta de troca sem motoboy atribuído depois de `coleta_agendamento_dias_uteis` dias úteis está "Atrasada".
  if (d.kind === 'exchange_pickup' && d.status === 'ready_for_collection') {
    const limit = businessDeadline(d.readyAt, collectionDays).getTime();
    return nowMs <= limit ? { overdue: false, overdueMinutes: null } : { overdue: true, overdueMinutes: Math.floor((nowMs - limit) / 60_000) };
  }
  if (d.kind !== 'delivery' || !ACTIVE_STATUSES.includes(d.status)) return { overdue: false, overdueMinutes: null };
  const limit = d.etaToAt ? d.etaToAt.getTime() : d.readyAt.getTime() + legacyAlertMin * 60_000;
  if (nowMs <= limit) return { overdue: false, overdueMinutes: null };
  return { overdue: true, overdueMinutes: Math.floor((nowMs - limit) / 60_000) };
}
