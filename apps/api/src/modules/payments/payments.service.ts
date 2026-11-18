import { safeErrorMessage } from '../../platform/logging/mask.js';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { and, asc, desc, eq, gte, inArray, isNotNull, isNull, lt, lte, ne, or, sql } from 'drizzle-orm';
import { Redis } from 'ioredis';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import {
  paymentAlerts,
  paymentAttempts,
  paymentRefundIntents,
  paymentRefunds,
  webhookEvents,
  type PaymentMethod,
  type PaymentStatus,
} from './db/schema.js';
import { PAYMENT_PROVIDER, type PaymentProvider, type ProviderPayment } from './payment-provider.js';

export type PaymentAttempt = typeof paymentAttempts.$inferSelect;

/**
 * Quem reage ao pagamento (o pedido, Onda 4) se registra aqui, sem o módulo de pagamentos importar o de pedidos (sem
 * ciclo). Os ganchos rodam na MESMA transação da mudança: falha no gancho desfaz a transição e o webhook é retentado.
 */
export interface PaymentListener {
  onAttemptTransition?(tx: Tx, attempt: PaymentAttempt, from: PaymentStatus, remote: ProviderPayment | null): Promise<void>;
  /** Depois do commit (chamadas ao provedor, push): falha aqui não desfaz a transição. */
  afterTransition?(attempt: PaymentAttempt, from: PaymentStatus, remote: ProviderPayment | null): Promise<void>;
  onRefundConfirmed?(tx: Tx, attempt: PaymentAttempt, refund: { amountCents: number; idempotencyKey: string; reason: string; refundedTotalCents: number }): Promise<void>;
}
export type WebhookEvent = typeof webhookEvents.$inferSelect;

export interface CreatePaymentInput {
  externalReference: string;
  method: PaymentMethod;
  amountCents: number;
  storeId: string | null;
  applicationFeeCents?: number;
  installments?: number;
  cardToken?: string;
  payer?: { email: string; document?: string };
  card?: { paymentMethodId?: string; issuerId?: string };
  /** Validade do PIX em minutos; por padrão `pix_expiracao_min`. */
}

/** Retentativa exponencial do processamento de webhook (WB-153 C3): 5 s, 10 s, 20 s... até 1 h; depois, "falhas". */
const MAX_WEBHOOK_ATTEMPTS = 8;
const backoffSeconds = (attempts: number): number => Math.min(5 * 2 ** (attempts - 1), 3600);
const REPLAY_TTL_SECONDS = 86_400;

/** Transições permitidas da tentativa (SEC-033): só avança; evento repetido ou regressivo é ignorado. */
const ALLOWED: Record<PaymentStatus, readonly PaymentStatus[]> = {
  creating: ['pending', 'pending_3ds', 'approved', 'declined', 'expired', 'cancelled'],
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
  private readonly listeners: PaymentListener[] = [];

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(PAYMENT_PROVIDER) readonly provider: PaymentProvider,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly audit: AuditService,
  ) {}

  registerListener(listener: PaymentListener): void {
    this.listeners.push(listener);
  }

  private async notifyTransition(tx: Tx, attempt: PaymentAttempt, from: PaymentStatus, remote: ProviderPayment | null): Promise<void> {
    for (const listener of this.listeners) await listener.onAttemptTransition?.(tx, attempt, from, remote);
  }

  private async notifyAfter(attempt: PaymentAttempt, from: PaymentStatus, remote: ProviderPayment | null): Promise<void> {
    for (const listener of this.listeners) {
      try {
        await listener.afterTransition?.(attempt, from, remote);
      } catch (error) {
        this.logger.error(`gancho pós-commit do pagamento ${attempt.id}: ${safeErrorMessage(error)}`);
      }
    }
  }

  /** Fila durável no Postgres: processa eventos vencidos e concilia pendentes (SEC-042). Desligado em teste. */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
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
    // Review I3: a tentativa é gravada ANTES de cobrar. Se o banco falhar depois da cobrança no provedor, a linha já
    // existe e a conciliação repete a criação com o mesmo `attemptId` (X-Idempotency-Key do provedor).
    await this.db.insert(paymentAttempts).values({
      id: attemptId,
      provider: this.provider.name,
      providerPaymentId: null,
      externalReference: input.externalReference,
      storeId: input.storeId,
      method: input.method,
      status: 'creating',
      amountCents: input.amountCents,
      applicationFeeCents: fee,
      installments,
      expiresAt: expiresAt ?? null,
    });
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
        payer: input.payer,
        card: input.card,
        expiresAt,
      });
    } catch (error) {
      if (error instanceof Error && error.name === 'ProviderTimeoutError') {
        // Pode ter sido criado do outro lado: a tentativa fica `creating` e a conciliação resolve (PIX repete com a
        // mesma chave; cartão vira alerta). O cliente pode tentar de novo.
        throw new AppError(504, 'PROVIDER_TIMEOUT', 'O provedor de pagamento demorou a responder', { detail: 'Tente novamente.', retryAfterSeconds: 3 });
      }
      await this.db
        .update(paymentAttempts)
        .set({ status: 'cancelled', declineReason: 'provider_error', updatedAt: new Date() })
        .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.status, 'creating')));
      throw error;
    }
    return this.completeCreation(attemptId, remote);
  }

  /** Preenche a tentativa `creating` com a resposta do provedor (também usada pela conciliação). */
  private async completeCreation(attemptId: string, remote: ProviderPayment): Promise<PaymentAttempt> {
    const attempt = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(paymentAttempts)
        .set({
          providerPaymentId: remote.providerPaymentId,
          status: remote.status,
          pixCopyPaste: remote.pixCopyPaste ?? null,
          pixQrBase64: remote.pixQrBase64 ?? null,
          threeDsUrl: remote.threeDsUrl ?? null,
          declineReason: remote.declineReason ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(paymentAttempts.id, attemptId), eq(paymentAttempts.status, 'creating')))
        .returning();
      if (updated && remote.status !== 'pending') await this.notifyTransition(tx, updated, 'creating', remote);
      return updated;
    });
    if (attempt) {
      if (remote.status !== 'pending') await this.notifyAfter(attempt, 'creating', remote);
      return attempt;
    }
    return this.getAttempt(attemptId);
  }

  /** Soma dos estornos concluídos e em andamento (a conta que limita novos estornos). */
  async refundedOrPendingCents(tx: Tx | Db, attemptId: string): Promise<number> {
    const [row] = await tx
      .select({ total: sql<number>`coalesce(sum(${paymentRefundIntents.amountCents}), 0)::int` })
      .from(paymentRefundIntents)
      .where(and(eq(paymentRefundIntents.attemptId, attemptId), ne(paymentRefundIntents.status, 'failed')));
    return row?.total ?? 0;
  }

  /** Tentativa mais recente do pedido (`external_reference`), para o app reabrir o PIX. */
  async latestForReference(reference: string): Promise<PaymentAttempt | null> {
    const [row] = await this.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, reference)).orderBy(desc(paymentAttempts.createdAt)).limit(1);
    return row ?? null;
  }

  /**
   * PIX vencido: re-consulta o provedor e expira o que ainda estiver pendente (o pedido libera o estoque pelo gancho).
   * Roda a cada poucos segundos; a conciliação de 5 min fica como rede de segurança.
   */
  async expireDue(now = new Date()): Promise<number> {
    const due = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.provider, this.provider.name), inArray(paymentAttempts.status, ['pending', 'pending_3ds']), isNotNull(paymentAttempts.providerPaymentId), isNotNull(paymentAttempts.expiresAt), lte(paymentAttempts.expiresAt, now)))
      .orderBy(asc(paymentAttempts.expiresAt))
      .limit(100);
    let expired = 0;
    for (const attempt of due) {
      try {
        const remote = await this.provider.getPayment(attempt.providerPaymentId!, { storeId: attempt.storeId });
        if (!remote) continue;
        await this.sync(attempt, remote.status === 'pending' ? { ...remote, status: 'expired' } : remote);
        expired++;
      } catch (error) {
        this.logger.warn(`expiração do pagamento ${attempt.id} falhou: ${safeErrorMessage(error)}`);
      }
    }
    return expired;
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
    // Review I6: o MP também notifica `merchant_order` e outros tipos; o `data.id` deles não é de pagamento.
    if (notification.type !== 'payment') return { queued: false };

    const seenKey = `webhook:seen:${this.provider.name}:${notification.eventKey}`;
    // Atalho no Redis (só leitura): se já vimos E gravamos antes, nem vai ao banco.
    const seen = await this.redis.get(seenKey).catch(() => null);
    if (seen !== null) return { queued: false };

    // Review I2: grava no banco PRIMEIRO. Se falhar, lança (500), a chave do Redis NÃO foi marcada e a reentrega do
    // provedor processa. A unicidade `(provider, event_key)` é a garantia real de idempotência.
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
    await this.redis.set(seenKey, '1', 'EX', REPLAY_TTL_SECONDS).catch(() => undefined);
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
      this.logger.warn(`webhook ${event.id} falhou (tentativa ${attempts}): ${safeErrorMessage(error)}`);
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
    const remote = await this.provider.getPayment(event.providerPaymentId, { storeId: attempt.storeId });
    if (!remote) {
      await this.alert(attempt.id, 'provider_payment_missing', { providerPaymentId: event.providerPaymentId });
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
        await this.refundBySystem(attempt.id, attempt.amountCents, 'late_payment', `auto-refund:${attempt.id}`);
        await this.alert(attempt.id, 'late_payment_refunded', { previousStatus: attempt.status });
        return;
      }
    }
    if (!canTransition(attempt.status, remote.status)) return; // repetido ou regressivo: sem efeito

    const changed = await this.db.transaction(async (tx) => {
      const [updated] = await tx
        .update(paymentAttempts)
        .set({ status: remote.status, declineReason: remote.declineReason ?? attempt.declineReason, threeDsUrl: remote.status === 'pending_3ds' ? (remote.threeDsUrl ?? attempt.threeDsUrl) : null, updatedAt: new Date() })
        .where(and(eq(paymentAttempts.id, attempt.id), eq(paymentAttempts.status, attempt.status)))
        .returning();
      // Só quem de fato mudou o estado dispara o gancho (evento repetido ou concorrente não repete o efeito no pedido).
      if (updated) await this.notifyTransition(tx, updated, attempt.status, remote);
      return updated;
    });
    if (changed) await this.notifyAfter(changed, attempt.status, remote);
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
   * limites por perfil e reautenticação ficam no endpoint do admin (Onda 4A). Auditoria na MESMA transação que confirma
   * o estorno (SEC-074).
   */
  async refund(attemptId: string, amountCents: number, reason: string, idempotencyKey: string, ctx: RequestContext): Promise<void> {
    await this.refundInternal(attemptId, amountCents, reason, idempotencyKey, {
      actorId: ctx.principal?.userId ?? null,
      actorRole: ctx.principal?.adminProfile ?? ctx.principal?.roles.join(',') ?? null,
      requestId: ctx.requestId,
    });
  }

  /**
   * Fase 1 do estorno, na transação de quem chama: trava a tentativa, confere estado e soma e grava a INTENÇÃO (`pending`).
   * O pedido usa isto para cancelar e agendar o estorno na MESMA transação: se o processo cair depois do commit, a
   * conciliação (`recoverRefundIntents`) conclui o estorno com a mesma chave.
   */
  async reserveRefundIntent(
    tx: Tx,
    attemptId: string,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    actor: { actorId: string | null; actorRole: string | null; requestId: string | null },
  ): Promise<{ kind: 'already' } | { kind: 'go'; attempt: PaymentAttempt }> {
    const [attempt] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId)).for('update');
    if (!attempt) throw errors.notFound('Pagamento não encontrado.');
    const [existing] = await tx
      .select()
      .from(paymentRefundIntents)
      .where(and(eq(paymentRefundIntents.attemptId, attemptId), eq(paymentRefundIntents.idempotencyKey, idempotencyKey)));
    if (existing) {
      if (existing.amountCents !== amountCents) {
        throw errors.unprocessable('IDEMPOTENCY_KEY_REUSED', 'Chave de idempotência já usada com outro valor', { detail: 'Use outra chave para outro estorno.' });
      }
      if (existing.status === 'done') return { kind: 'already' as const };
      if (existing.status === 'failed') {
        await tx.update(paymentRefundIntents).set({ status: 'pending', updatedAt: new Date() }).where(eq(paymentRefundIntents.id, existing.id));
      }
      return { kind: 'go' as const, attempt };
    }

    const [{ total } = { total: 0 }] = await tx
      .select({ total: sql<number>`coalesce(sum(${paymentRefundIntents.amountCents}), 0)::int` })
      .from(paymentRefundIntents)
      .where(and(eq(paymentRefundIntents.attemptId, attemptId), ne(paymentRefundIntents.status, 'failed')));
    const refundable = attempt.status === 'approved' || attempt.status === 'expired' || attempt.status === 'cancelled';
    if (!refundable || !attempt.providerPaymentId) throw errors.conflict('PAYMENT_NOT_REFUNDABLE', 'Pagamento não pode ser estornado');
    if (total + amountCents > attempt.amountCents) {
      throw errors.unprocessable('REFUND_EXCEEDS_PAID', 'Estorno maior que o valor pago');
    }
    await tx.insert(paymentRefundIntents).values({ attemptId, idempotencyKey, amountCents, reason, actorId: actor.actorId, actorRole: actor.actorRole, requestId: actor.requestId });
    return { kind: 'go' as const, attempt };
  }

  /** Conclui, fora de transação, um estorno já agendado por `reserveRefundIntent` (mesma chave; repetir não estorna de novo). */
  async executeScheduledRefund(attemptId: string, amountCents: number, reason: string, idempotencyKey: string): Promise<void> {
    await this.refundBySystem(attemptId, amountCents, reason, idempotencyKey);
  }

  /** Estorno do sistema (pedido cancelado/recusado/expirado, PIX tardio): ator nulo, trilha com `actorRole = system`. */
  async refundBySystem(attemptId: string, amountCents: number, reason: string, idempotencyKey: string): Promise<void> {
    await this.refundInternal(attemptId, amountCents, reason, idempotencyKey, { actorId: null, actorRole: 'system', requestId: null });
  }

  /**
   * Review I4. Fase 1 (transação curta, com lock): confere estado e soma e grava a INTENÇÃO (`pending`). Fase 2 (sem
   * transação): chama o provedor com a chave de idempotência. Fase 3 (transação): grava o estorno confirmado, fecha a
   * intenção, atualiza o status e audita. A mesma chave com valor diferente é 422; repetir a chave não estorna de novo.
   */
  private async refundInternal(
    attemptId: string,
    amountCents: number,
    reason: string,
    idempotencyKey: string,
    actor: { actorId: string | null; actorRole: string | null; requestId: string | null } = { actorId: null, actorRole: 'system', requestId: null },
    recovered = false,
  ): Promise<{ providerRefundId: string } | null> {
    if (!Number.isInteger(amountCents) || amountCents <= 0) throw errors.validation([{ field: 'amountCents', message: 'Valor inválido.' }]);

    const phase1 = await this.db.transaction((tx) => this.reserveRefundIntent(tx, attemptId, amountCents, reason, idempotencyKey, actor));
    if (phase1.kind === 'already') return null;
    const { attempt } = phase1;

    let remote: { providerRefundId: string };
    try {
      remote = await this.provider.refund(attempt.providerPaymentId!, amountCents, idempotencyKey, { storeId: attempt.storeId });
    } catch (error) {
      // Timeout é ambíguo (o provedor pode ter estornado): a intenção fica `pending` e a conciliação repete com a mesma chave.
      if (!(error instanceof Error && error.name === 'ProviderTimeoutError')) {
        await this.db
          .update(paymentRefundIntents)
          .set({ status: 'failed', updatedAt: new Date() })
          .where(and(eq(paymentRefundIntents.attemptId, attemptId), eq(paymentRefundIntents.idempotencyKey, idempotencyKey)));
      }
      throw error;
    }

    await this.db.transaction(async (tx) => {
      const [locked] = await tx.select().from(paymentAttempts).where(eq(paymentAttempts.id, attemptId)).for('update');
      await tx
        .insert(paymentRefunds)
        .values({ attemptId, providerRefundId: remote.providerRefundId, idempotencyKey, amountCents, reason })
        .onConflictDoNothing();
      await tx
        .update(paymentRefundIntents)
        .set({ status: 'done', providerRefundId: remote.providerRefundId, updatedAt: new Date() })
        .where(and(eq(paymentRefundIntents.attemptId, attemptId), eq(paymentRefundIntents.idempotencyKey, idempotencyKey)));
      const [{ done } = { done: 0 }] = await tx
        .select({ done: sql<number>`coalesce(sum(${paymentRefunds.amountCents}), 0)::int` })
        .from(paymentRefunds)
        .where(eq(paymentRefunds.attemptId, attemptId));
      if (locked && done === locked.amountCents) {
        await tx.update(paymentAttempts).set({ status: 'refunded', updatedAt: new Date() }).where(eq(paymentAttempts.id, attemptId));
      }
      if (locked) for (const listener of this.listeners) await listener.onRefundConfirmed?.(tx, locked, { amountCents, idempotencyKey, reason, refundedTotalCents: done });
      // N1: a auditoria vale para TODO estorno confirmado, inclusive o concluído pela conciliação (usa o ator gravado na
      // intenção, não o de quem rodou a recuperação). Na mesma transação: falha de auditoria desfaz o estorno gravado.
      const [intent] = await tx
        .select()
        .from(paymentRefundIntents)
        .where(and(eq(paymentRefundIntents.attemptId, attemptId), eq(paymentRefundIntents.idempotencyKey, idempotencyKey)));
      await this.audit.record(
        tx,
        { ip: null, userAgent: null, requestId: intent?.requestId ?? null, deviceId: null, principal: null },
        {
          action: 'payment.refund',
          targetType: 'payment_attempt',
          targetId: attemptId,
          after: { amountCents, reason, providerRefundId: remote.providerRefundId, ...(recovered ? { concludedBy: 'reconciliation' } : {}) },
          reason,
          actorId: intent?.actorId ?? null,
          actorRole: intent?.actorRole ?? 'system',
        },
      );
    });
    return remote;
  }

  /** Repete, com a mesma chave, estornos que ficaram `pending` (timeout, queda entre o provedor e o commit). */
  private async recoverRefundIntents(now: Date): Promise<number> {
    const stale = await this.db
      .select()
      .from(paymentRefundIntents)
      .where(and(eq(paymentRefundIntents.status, 'pending'), lt(paymentRefundIntents.updatedAt, new Date(now.getTime() - 2 * 60_000))))
      .orderBy(asc(paymentRefundIntents.updatedAt))
      .limit(50);
    let recovered = 0;
    for (const intent of stale) {
      try {
        await this.refundInternal(intent.attemptId, intent.amountCents, intent.reason, intent.idempotencyKey, { actorId: intent.actorId, actorRole: intent.actorRole, requestId: intent.requestId }, true);
        recovered++;
      } catch (error) {
        this.logger.warn(`recuperação de estorno ${intent.id} falhou: ${safeErrorMessage(error)}`);
        await this.alert(intent.attemptId, 'refund_unresolved', { intentId: intent.id });
      }
    }
    return recovered;
  }

  // ------------------------------------------------------------------ conciliação

  /**
   * SEC-042: compara com o provedor o que ficou pendente há mais de 5 min e o que foi aprovado nas últimas 48 h.
   * Pega pagamento sem webhook (perdido) e divergência de valor/comissão; gera alerta. Review I5: um erro do provedor em
   * UM pagamento não derruba o laço (conta falhas), a ordem é estável e só uma instância concilia por vez.
   */
  async reconcile(now = new Date()): Promise<{ checked: number; synced: number; alerts: number; failures: number; skipped?: true }> {
    // Trava entre instâncias: a transação segura o lock até o fim; o trabalho em si usa o pool normal.
    return this.db.transaction(async (lockTx) => {
      const [lock] = (await lockTx.execute(sql`select pg_try_advisory_xact_lock(hashtext('webag:payments:reconcile')) as ok`)).rows as { ok: boolean }[];
      if (!lock?.ok) return { checked: 0, synced: 0, alerts: 0, failures: 0, skipped: true as const };
      return this.reconcileLocked(now);
    });
  }

  private async reconcileLocked(now: Date): Promise<{ checked: number; synced: number; alerts: number; failures: number }> {
    const pendingBefore = new Date(now.getTime() - 5 * 60_000);
    const since48h = new Date(now.getTime() - 48 * 3_600_000);
    await this.recoverCreating(new Date(now.getTime() - 2 * 60_000)).catch((e: Error) => this.logger.error(`conciliação (creating): ${e.message}`));
    await this.recoverRefundIntents(now).catch((e: Error) => this.logger.error(`conciliação (estornos): ${e.message}`));

    const candidates = await this.db
      .select()
      .from(paymentAttempts)
      .where(
        and(
          eq(paymentAttempts.provider, this.provider.name),
          isNotNull(paymentAttempts.providerPaymentId),
          or(
            and(inArray(paymentAttempts.status, ['pending', 'pending_3ds']), lt(paymentAttempts.createdAt, pendingBefore)),
            and(eq(paymentAttempts.status, 'approved'), gte(paymentAttempts.createdAt, since48h)),
          ),
        ),
      )
      .orderBy(asc(paymentAttempts.updatedAt), asc(paymentAttempts.id))
      .limit(200);

    let synced = 0;
    let alerts = 0;
    let failures = 0;
    for (const attempt of candidates) {
      try {
        const remote = await this.provider.getPayment(attempt.providerPaymentId!, { storeId: attempt.storeId });
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
        // `updatedAt` marca "visto agora" e faz a próxima rodada começar pelos mais antigos.
        await this.db.update(paymentAttempts).set({ updatedAt: new Date() }).where(eq(paymentAttempts.id, attempt.id));
      } catch (error) {
        failures++;
        this.logger.warn(`conciliação do pagamento ${attempt.id} falhou: ${safeErrorMessage(error)}`);
      }
    }
    // Taxa alta de falhas no provedor vira alerta (o provedor pode estar fora do ar).
    if (candidates.length >= 5 && failures / candidates.length > 0.5) {
      await this.alert(null, 'reconcile_provider_failures', { failures, checked: candidates.length, day: now.toISOString().slice(0, 13) });
    }
    return { checked: candidates.length, synced, alerts, failures };
  }

  /**
   * Tentativas `creating` há mais de 2 min: o processo caiu entre gravar e cobrar (ou entre cobrar e gravar a
   * resposta). PIX: repete a criação com o MESMO `attemptId` (idempotente no provedor). Cartão: não temos o token,
   * então vira alerta para o admin resolver (nunca cobra de novo).
   */
  private async recoverCreating(before: Date): Promise<void> {
    const stuck = await this.db
      .select()
      .from(paymentAttempts)
      .where(and(eq(paymentAttempts.status, 'creating'), eq(paymentAttempts.provider, this.provider.name), lt(paymentAttempts.createdAt, before)))
      .orderBy(asc(paymentAttempts.createdAt))
      .limit(50);
    for (const attempt of stuck) {
      try {
        if (attempt.method !== 'pix') {
          await this.alert(attempt.id, 'creation_unresolved', { method: attempt.method });
          continue;
        }
        const remote = await this.provider.createPayment({
          attemptId: attempt.id,
          method: 'pix',
          amountCents: attempt.amountCents,
          applicationFeeCents: attempt.applicationFeeCents,
          externalReference: attempt.externalReference,
          storeId: attempt.storeId,
          installments: 1,
          expiresAt: attempt.expiresAt ?? undefined,
        });
        await this.completeCreation(attempt.id, remote);
      } catch (error) {
        this.logger.warn(`recuperação da criação ${attempt.id} falhou: ${safeErrorMessage(error)}`);
      }
    }
  }

  // -------------------------------------------------------------------------- admin

  /** Alerta de conciliação/risco para o painel do financeiro (também usado pelo módulo de lojas, SEC-047/048). */
  async raiseAlert(attemptId: string | null, kind: string, details: Record<string, unknown>): Promise<void> {
    await this.alert(attemptId, kind, details);
  }

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
