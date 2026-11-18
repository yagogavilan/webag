import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, desc, eq, gte, inArray, isNull, lt, lte, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import {
  paymentAlerts,
  paymentAttempts,
  paymentRefunds,
  webhookEvents,
  type PaymentMethod,
  type PaymentStatus,
} from './db/schema.js';
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment } from './payment-provider.js';

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;
export type WebhookEvent = typeof webhookEvents.$inferSelect;

export interface CreatePaymentInput {
  externalReference: string;
  method: PaymentMethod;
  amountCents: number;
  storeId: string | null;
  applicationFeeCents?: number;
  installments?: number;
  cardToken?: string;
}

/** Retentativa exponencial do processamento de webhook (WB-153 C3): 5 s, 10 s, 20 s... até 1 h; depois, "falhas". */
const MAX_WEBHOOK_ATTEMPTS = 8;
const backoffSeconds = (attempts: number): number => Math.min(5 * 2 ** (attempts - 1), 3600);
const REPLAY_TTL_SECONDS = 86_400;

/** Transições permitidas da tentativa (SEC-033): só avança; evento repetido ou regressivo é ignorado. */
const ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  pending: ['pending_3ds', 'approved', 'declined', 'expired', 'cancelled'],
  pending_3ds: ['approved', 'declined', 'expired', 'cancelled'],
  approved: ['refunded'],
  declined: [],
  expired: [],
  cancelled: [],
  refunded: [],
  divergent: [],
};
export const canTransition = (from: PaymentStatus, to: PaymentStatus): boolean => ALLOWED[from].includes(to);

@Injectable()
export class PaymentsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(PaymentsService.name);
  private timers: NodeJS.Timeout[] = [];
  private readonly inflight = new Set<Promise<unknown>>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  /** Fila durável no Postgres: processa eventos vencidos e concilia pendentes (SEC-042). Desligado em teste. */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timers.push(setInterval(() => void this.processDue().catch((e: Error) => this.logger.error(e.message)), 15_000).unref());
    this.timers.push(setInterval(() => void this.reconcile().catch((e: Error) => this.logger.error(e.message)), 5 * 60_000).unref());
  }

  onApplicationShutdown(): void {
    this.timers.forEach(clearInterval);
  }

  // ------------------------------------------------------------------ criação

  /**
   * Cria a tentativa. O servidor decide valor e limites (SEC-030): a entrada só traz o que o cliente pode escolher.
   * Aceita método só se a feature flag estiver ligada (WB-120 C2).
   */
  async createPayment(input: CreatePaymentInput): Promise<PaymentAttempt> {
    if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
      throw errors.validation([{ field: 'amountCents', message: 'Valor em centavos, inteiro e maior que zero.' }]);
    }
    const max = await this.params.getNumber('pedido_max_cents');
    if (input.amountCents > max) {
      throw errors.unprocessable('ORDER_ABOVE_LIMIT', 'Valor acima do limite por pedido', { detail: `O limite por pedido é de ${max} centavos.` });
    }
    const fee = input.applicationFeeCents ?? 0;
    if (!Number.isInteger(fee) || fee < 0 || fee > input.amountCents) {
      throw errors.validation([{ field: 'applicationFeeCents', message: 'Comissão inválida.' }]);
    }
    if (!(await this.flags.isEnabled(input.method === 'pix' ? 'pix' : 'cartao'))) {
      throw errors.conflict('PAYMENT_METHOD_DISABLED', 'Forma de pagamento indisponível', 'Escolha outra forma de pagamento.');
    }

    let installments = 1;
    if (input.method === 'card') {
      installments = input.installments ?? 1;
      const [maxInstallments, minInstallment] = await Promise.all([this.params.getNumber('parcelas_max'), this.params.getNumber('parcela_min_cents')]);
      if (installments < 1 || installments > maxInstallments || (installments > 1 && Math.floor(input.amountCents / installments) < minInstallment)) {
        throw errors.unprocessable('INSTALLMENTS_NOT_ALLOWED', 'Parcelamento não permitido', { detail: `Até ${maxInstallments}x, parcela mínima de ${minInstallment} centavos.` });
      }
      if (!input.cardToken) throw errors.validation([{ field: 'cardToken', message: 'Informe o token do cartão.' }]);
    }

    const pixMinutes = await this.params.getNumber('pix_expiracao_min');
    const expiresAt = input.method === 'pix' ? new Date(Date.now() + pixMinutes * 60_000) : undefined;
    const attemptId = crypto.randomUUID();
    // Timeout do provedor propaga como 504; nada foi gravado, então repetir é seguro (X-Idempotency-Key = attemptId).
    let remote: ProviderPayment;
    try {
      remote = await this.provider.createPayment({
        attemptId,
        method: input.method,
        amountCents: input.amountCents,
        applicationFeeCents: fee,
        externalReference: input.externalReference,
        storeId: input.storeId,
        installments,
        cardToken: input.cardToken,
        expiresAt,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ProviderTimeoutError') {
        throw new AppError(504, 'PROVIDER_TIMEOUT', 'O provedor de pagamento demorou a responder', { detail: 'Tente novamente.', retryAfterSeconds: 3 });
      }
      throw error;
    }

    const [attempt] = await this.db
      .insert(paymentAttempts)
      .values({
        id: attemptId,
        provider: this.provider.name,
        providerPaymentId: remote.providerPaymentId,
        externalReference: input.externalReference,
        storeId: input.storeId,
        method: input.method,
        status: remote.status,
        amountCents: input.amountCents,
        applicationFeeCents: fee,
        installments,
        pixCopyPaste: remote.pixCopyPaste ?? null,
        expiresAt: expiresAt ?? null,
        declineReason: remote.declineReason ?? null,
      })
      .returning();
    if (!attempt) throw new Error('Falha ao gravar tentativa de pagamento');
    return attempt;
  }

  async getAttempt(id: string): Promise<PaymentAttempt> {
    const [row] = await this.db.select().from(paymentAttempts).where(eq(paymentAttempts.id, id));
    if (!row) throw errors.notFound('Pagamento não encontrado.');
    return row;
  }

  // --------------------------------------------------------------------- webhook

  /**
   * Recebe a notificação: valida a assinatura (401 sem enfileirar), aplica antirreplay de 24 h por x-request-id e grava
   * o evento (idempotente). Responde rápido; o processamento é assíncrono (SEC-032/033, WB-153).
   */
  async receiveWebhook(input: { headers: Record<string, string | string[] | undefined>; query: Record<string, unknown> }): Promise<{ queued: boolean }> {
    const notification = this.provider.verifyWebhook(input);

    const first = await this.redis
      .set(`webhook:seen:${this.provider.name}:${notification.eventKey}`, '1', 'EX', REPLAY_TTL_SECONDS, 'NX')
      .catch(() => 'OK'); // Redis fora: a unicidade do banco abaixo continua garantindo a idempotência.
    if (first === null) return { queued: false };

    const inserted = await this.db
      .insert(webhookEvents)
      .values({
        provider: this.provider.name,
        eventKey: notification.eventKey,
        providerPaymentId: notification.providerPaymentId,
        type: notification.type,
      })
      .onConflictDoNothing()
      .returning({ id: webhookEvents.id });
    if (inserted.length === 0) return { queued: false };

    // Processa em seguida, fora do ciclo da resposta (a fila durável retenta se falhar).
    setImmediate(() => this.track(this.processDue()));
    return { queued: true };
  }

  private track(work: Promise<unknown>): void {
    const tracked = work
      .catch((e: Error) => this.logger.error(`processamento de webhook: ${e.message}`))
      .finally(() => this.inflight.delete(tracked));
    this.inflight.add(tracked);
  }

  /** Espera o processamento em andamento terminar (simulação em dev e testes determinísticos). */
  async drain(): Promise<void> {
    await new Promise((resolve) => setImmediate(resolve));
    while (this.inflight.size > 0) await Promise.allSettled([...this.inflight]);
  }

  /** Processa eventos vencidos. Cada evento é "reservado" por 60 s antes de falar com o provedor. */
  async processDue(limit = 20): Promise<number> {
    const claimed = await this.db.transaction(async (tx) => {
      const due = await tx
        .select()
        .from(webhookEvents)
        .where(and(eq(webhookEvents.status, 'pending'), lte(webhookEvents.nextAttemptAt, new Date())))
        .orderBy(webhookEvents.id)
        .limit(limit)
        .for('update', { skipLocked: true });
      if (due.length > 0) {
        await tx
          .update(webhookEvents)
          .set({ nextAttemptAt: new Date(Date.now() + 60_000) })
          .where(inArray(webhookEvents.id, due.map((e) => e.id)));
      }
      return due;
    });
    for (const event of claimed) await this.processEvent(event);
    return claimed.length;
  }

  async processEvent(event: WebhookEvent): Promise<void> {
    try {
      const outcome = await this.applyEvent(event);
      await this.db
        .update(webhookEvents)
        .set({ status: outcome === 'discarded' ? 'discarded' : 'processed', processedAt: new Date(), attempts: event.attempts + 1, lastError: null })
        .where(eq(webhookEvents.id, event.id));
    } catch (error) {
      const attempts = event.attempts + 1;
      const dead = attempts >= MAX_WEBHOOK_ATTEMPTS;
      await this.db
        .update(webhookEvents)
        .set({
          attempts,
          status: dead ? 'failed' : 'pending',
          nextAttemptAt: new Date(Date.now() + backoffSeconds(attempts) * 1000),
          lastError: (error as Error).message.slice(0, 300),
        })
        .where(eq(webhookEvents.id, event.id));
      if (dead) await this.alert(null, 'webhook_failed', { eventId: event.id, providerPaymentId: event.providerPaymentId });
      this.logger.warn(`webhook ${event.id} falhou (tentativa ${attempts}): ${(error as Error).message}`);
    }
  }

  /**
   * Núcleo (SEC-034): a notificação só diz "olhe o pagamento X". O estado vem da RE-CONSULTA ao provedor, e só
   * aprova se valor, moeda, referência, recebedor e comissão baterem com o que gravamos na criação.
   */
  private async applyEvent(event: WebhookEvent): Promise<'applied' | 'discarded'> {
    const [attempt] = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.provider, event.provider), eq(paymentAttempts.providerPaymentId, event.providerPaymentId)));
    if (!attempt) {
      await this.alert(null, 'unknown_payment', { providerPaymentId: event.providerPaymentId });
      return 'discarded';
    }
    const remote = await this.provider.getPayment(attempt.providerPaymentId, { storeId: attempt.storeId });
    if (!remote) {
      await this.alert(attempt.id, 'provider_payment_missing', { providerPaymentId: attempt.providerPaymentId });
      return 'discarded';
    }
    await this.sync(attempt, remote);
    return 'applied';
  }

  /** Aplica o estado do provedor à tentativa, com a máquina de estados e as conferências de SEC-034/SEC-040. */
  private async sync(attempt: PaymentAttempt, remote: ProviderPayment): Promise<void> {
    if (remote.status === 'approved') {
      const mismatches = this.mismatches(attempt, remote);
      if (mismatches.length > 0) {
        if (attempt.status === 'pending' || attempt.status === 'pending_3ds') {
          await this.db.update(paymentAttempts).set({ status: 'divergent', updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
        }
        await this.alert(attempt.id, 'conciliation_mismatch', { mismatches });
        return;
      }
      // SEC-040: PIX tardio ou pagamento em tentativa já encerrada → estorno total automático e idempotente.
      if (attempt.status === 'expired' || attempt.status === 'cancelled') {
        await this.refundInternal(attempt.id, attempt.amountCents, 'late_payment', `auto-refund:${attempt.id}`);
        await this.alert(attempt.id, 'late_payment_refunded', { previousStatus: attempt.status });
        return;
      }
    }
    if (!canTransition(attempt.status, remote.status)) return; // repetido ou regressivo: sem efeito

    await this.db
      .update(paymentAttempts)
      .set({ status: remote.status, declineReason: remote.declineReason ?? attempt.declineReason, updatedAt: new Date() })
      .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, attempt.status)));
  }

  private mismatches(attempt: PaymentAttempt, remote: ProviderPayment): string[] {
    const found: string[] = [];
    if (remote.amountCents !== attempt.amountCents) found.push('amount');
    if (remote.currency !== attempt.currency) found.push('currency');
    if (remote.externalReference !== attempt.externalReference) found.push('external_reference');
    if (remote.applicationFeeCents !== attempt.applicationFeeCents) found.push('application_fee');
    if (attempt.storeId && remote.receiverId !== this.provider.expectedReceiverId(attempt.storeId)) found.push('receiver');
    return found;
  }

  // ----------------------------------------------------------------------- estorno

  /**
   * Estorno ao meio original (SEC-039, parte de dados): lock da linha e soma de estornos <= pago. Quem pode estornar,
   * limites por perfil e reautenticação ficam no endpoint do admin (Onda 4A).
   */
  async refund(attemptId: string, amountCents: number, reason: string, idempotencyKey: string, ctx: RequestContext): Promise<void> {
    const refund = await this.refundInternal(attemptId, amountCents, reason, idempotencyKey);
    await this.audit.recordStandalone(ctx, {
      action: 'payment.refund',
      targetType: 'payment_attempt',
      targetId: attemptId,
      after: { amountCents, reason, providerRefundId: refund?.providerRefundId ?? null },
      reason,
    });
  }

  private async refundInternal(attemptId: string, amountCents: number, reason: string, idempotencyKey: string) {
    return this.db.transaction(async (tx) => {
      const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId)).for('update');
      if (!attempt) throw errors.notFound('Pagamento não encontrado.');
      if (!Number.isInteger(amountCents) || amountCents <= 0) throw errors.validation([{ field: 'amountCents', message: 'Valor inválido.' }]);
      // Repetição da mesma chave: devolve o estorno já feito (idempotência).
      const [existing] = await tx.select().from(paymentRefunds).where(and(eq(paymentRefunds.attemptId, attemptId), eq(paymentRefunds.idempotencyKey, idempotencyKey)));
      if (existing) return null;

      const [{ total } = { total: 0 }] = await tx
        .select({ total: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int` })
        .from(paymentRefunds)
        .where(eq(paymentRefunds.attemptId, attemptId));
      const refundable = attempt.status === 'approved' || attempt.status === 'expired' || attempt.status === 'cancelled';
      if (!refundable) throw errors.conflict('PAYMENT_NOT_REFUNDABLE', 'Pagamento não pode ser estornado');
      if (total + amountCents > attempt.amountCents) {
        throw errors.unprocessable('REFUND_EXCEEDS_PAID', 'Estorno maior que o valor pago');
      }
      const remote = await this.provider.refund(attempt.providerPaymentId, amountCents, idempotencyKey, { storeId: attempt.storeId });
      await tx.insert(paymentRefunds).values({
        attemptId,
        providerRefundId: remote.providerRefundId,
        idempotencyKey,
        amountCents,
        reason,
      });
      if (total + amountCents === attempt.amountCents) {
        await tx.update(paymentAttempts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(paymentAttempts.id, attemptId));
      }
      return remote;
    });
  }

  // ------------------------------------------------------------------ conciliação

  /**
   * SEC-042: compara com o provedor o que ficou pendente há mais de 5 min e o que foi aprovado nas últimas 48 h.
   * Pega pagamento sem webhook (perdido) e divergência de valor/comissão; gera alerta.
   */
  async reconcile(now = new Date()): Promise<{ checked: number; synced: number; alerts: number }> {
    const pendingBefore = new Date(now.getTime() - 5 * 60_000);
    const since48h = new Date(now.getTime() - 48 * 3_600_000);
    const candidates = await this.db
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.provider, this.provider.name),
          or(
            and(inArray(paymentAttempts.status, ['pending', 'pending_3ds']), lt(paymentAttempts.createdAt, pendingBefore)),
            and(eq(paymentAttempts.status, 'approved'), gte(paymentAttempts.createdAt, since48h)),
          ),
        ),
      )
      .limit(200);

    let synced = 0;
    let alerts = 0;
    for (const attempt of candidates) {
      const remote = await this.provider.getPayment(attempt.providerPaymentId, { storeId: attempt.storeId });
      if (!remote) {
        await this.alert(attempt.id, 'provider_payment_missing', { providerPaymentId: attempt.providerPaymentId });
        alerts++;
        continue;
      }
      const before = attempt.status;
      const mismatches = remote.status === 'approved' || attempt.status === 'approved' ? this.mismatches(attempt, remote) : [];
      if (mismatches.length > 0) {
        await this.sync(attempt, { ...remote, status: 'approved' });
        alerts++;
        continue;
      }
      // PIX vencido que o provedor ainda mostra pendente: expira aqui (a reserva de estoque cai junto, Onda 4).
      const effective: ProviderPayment =
        remote.status === 'pending' && attempt.expiresAt && attempt.expiresAt <= now ? { ...remote, status: 'expired' } : remote;
      await this.sync(attempt, effective);
      const [after] = await this.db.select({ status: paymentAttempts.status }).from(paymentAttempts).where(eq(paymentAttempts.id, attempt.id));
      if (after && after.status !== before) synced++;
    }
    return { checked: candidates.length, synced, alerts };
  }

  // -------------------------------------------------------------------------- admin

  private async alert(attemptId: string | null, kind: string, details: Record<string, unknown>): Promise<void> {
    // Não duplica o mesmo alerta aberto da mesma tentativa e tipo.
    const [open] = await this.db
      .select({ id: paymentAlerts.id })
      .from(paymentAlerts)
      .where(and(attemptId ? eq(paymentAlerts.attemptId, attemptId) : isNull(paymentAlerts.attemptId), eq(paymentAlerts.kind, kind), isNull(paymentAlerts.resolvedAt), sql`${paymentAlerts.details} = ${JSON.stringify(details)}::jsonb`));
    if (open) return;
    await this.db.insert(paymentAlerts).values({ attemptId, kind, details });
    this.logger.warn(`alerta de pagamento: ${kind}`);
  }

  async listAlerts(query: { cursor?: string; limit?: unknown; openOnly?: boolean }): Promise<Page<typeof paymentAlerts.$inferSelect>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(paymentAlerts)
      .where(and(query.openOnly ? isNull(paymentAlerts.resolvedAt) : undefined, cursor ? sql`(${paymentAlerts.createdAt}, ${paymentAlerts.id}) < (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined))
      .orderBy(desc(paymentAlerts.createdAt), desc(paymentAlerts.id))
      .limit(limit + 1);
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }

  /** WB-153 C4: reprocessa um evento (com a mesma idempotência: a transição do estado é monotônica) e audita. */
  async reprocess(eventId: number, ctx: RequestContext): Promise<void> {
    const [event] = await this.db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId));
    if (!event) throw errors.notFound('Evento não encontrado.');
    await this.db.update(webhookEvents).set({ status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null }).where(eq(webhookEvents.id, eventId));
    await this.audit.recordStandalone(ctx, { action: 'payment.webhook_reprocess', targetType: 'webhook_event', targetId: String(eventId) });
    await this.processDue();
  }
}
