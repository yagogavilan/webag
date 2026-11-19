import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import type { Env } from '../../../platform/config/env.js';
import { AppError } from '../../../platform/http/app-error.js';
import { REDIS } from '../../../platform/redis/redis.module.js';
import {
  ProviderTimeoutError,
  type CreateProviderPaymentInput,
  type PaymentProvider,
  type ProviderPayment,
  type WebhookNotification,
} from '../payment-provider.js';
import { signedWebhookHeaders, validateWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from '../webhook-signature.js';

export type FakeOutcome = 'approved' | 'declined' | 'expired';

export interface SimulateOptions {
  outcome: FakeOutcome;
  /** Injeta divergência para testar a conciliação (SEC-034): o "provedor" informa outro valor/referência/recebedor. */
  reportedAmountCents?: number;
  reportedReference?: string;
  reportedReceiverId?: string;
  reportedFeeCents?: number;
  /** Tarifa do provedor (`fee_details`) informada na aprovação; por padrão, a estimativa do PRD. */
  reportedProviderFeeCents?: number;
}

/** Tokens de texto documentados no README (WB-150 C3): resultado do cartão sem decorar sufixos. */
const FAKE_TOKENS: Record<string, string> = { fake_tok_approved: '0000', fake_tok_insufficient: '0001', fake_tok_3ds: '0002', fake_tok_timeout: '0003', fake_tok_wrong_fee: '0004' };
/** Tarifa simulada (`fee_details`): PIX 0,99% e cartão 4,98%, as estimativas do PRD (HIP-016). */
const feeOf = (payment: ProviderPayment, method: 'pix' | 'card'): number => Math.round((payment.amountCents * (method === 'pix' ? 99 : 498)) / 10_000);

const KEY = (id: string): string => `fake-provider:payment:${id}`;
const IDEM_CREATE = (attemptId: string): string => `fake-provider:idem:create:${attemptId}`;
const IDEM_REFUND = (id: string, key: string): string => `fake-provider:idem:refund:${id}:${key}`;
const TTL_SECONDS = 7 * 86_400;

/**
 * Provedor simulado (WB-150, ADR-002). O "lado do provedor" vive no Redis, então re-consultar o pagamento
 * (`getPayment`) é uma ida ao "provedor" de verdade, como no Mercado Pago.
 *
 * Cartão de teste (últimos 4 dígitos do `cardToken`, ex.: `tok_0001`): 0000 aprova, 0001 recusa por saldo,
 * 0002 exige 3DS (fica pendente até simular), 0003 dá timeout, 0004 aprova com comissão e recebedor errados (SEC-133); qualquer outro recusa por cartão inválido.
 */
@Injectable()
export class FakePaymentProvider implements PaymentProvider {
  readonly name = 'fake' as const;

  constructor(
    @Inject(REDIS) private readonly redis: Redis,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get webhookSecret(): string {
    return this.config.get('FAKE_PAYMENT_WEBHOOK_SECRET', { infer: true });
  }

  expectedReceiverId(storeId: string | null): string | null {
    return storeId ? `fake-seller-${storeId}` : null;
  }

  async createPayment(input: CreateProviderPaymentInput): Promise<ProviderPayment> {
    // Idempotência como a do MP (X-Idempotency-Key): a mesma `attemptId` devolve o MESMO pagamento (review I3).
    const known = await this.redis.get(IDEM_CREATE(input.attemptId));
    if (known) {
      const existing = await this.getPayment(known);
      if (existing) return existing;
    }
    // `fk` + hex minúsculo: alfanumérico, como o ID de pagamento do MP (o manifesto lê o data.id em minúsculas).
    const id = `fk${randomBytes(12).toString('hex')}`;
    const base: ProviderPayment = {
      providerPaymentId: id,
      status: 'pending',
      amountCents: input.amountCents,
      currency: 'BRL',
      externalReference: input.externalReference,
      applicationFeeCents: input.applicationFeeCents,
      receiverId: this.expectedReceiverId(input.storeId),
      refundedCents: 0,
    };

    if (input.method === 'pix') {
      // Código "copia e cola" falso, mas com o formato de um BR Code (começa com 000201).
      base.pixCopyPaste = `00020126580014br.gov.bcb.pix0136${randomUUID()}5204000053039865802BR5909WEBAG FAKE6009SAO PAULO62070503***6304FAKE`;
    } else {
      const last4 = FAKE_TOKENS[input.cardToken ?? ''] ?? (input.cardToken ?? '').slice(-4);
      if (last4 === '0003') throw new ProviderTimeoutError();
      if (last4 === '0000') Object.assign(base, { status: 'approved', providerFeeCents: feeOf(base, 'card') });
      else if (last4 === '0004') Object.assign(base, { status: 'approved', applicationFeeCents: 0, receiverId: 'fake-seller-outro', providerFeeCents: feeOf(base, 'card') }); // aprovado, mas com comissão e recebedor errados (SEC-133)
      else if (last4 === '0001') Object.assign(base, { status: 'declined', declineReason: 'insufficient_funds' });
      else if (last4 === '0002') Object.assign(base, { status: 'pending_3ds', threeDsUrl: `https://fake-3ds.webag.local/challenge/${id}` });
      else Object.assign(base, { status: 'declined', declineReason: 'invalid_card' });
    }
    await this.save(base);
    await this.redis.set(IDEM_CREATE(input.attemptId), id, 'EX', TTL_SECONDS);
    return base;
  }

  async getPayment(id: string): Promise<ProviderPayment | null> {
    const raw = await this.redis.get(KEY(id));
    return raw ? (JSON.parse(raw) as ProviderPayment) : null;
  }

  async refund(id: string, amountCents: number, idempotencyKey: string): Promise<{ providerRefundId: string; amountCents: number }> {
    // O MP deduplica por X-Idempotency-Key: repetir a chave devolve o mesmo estorno, sem estornar de novo (review I4b).
    const done = await this.redis.get(IDEM_REFUND(id, idempotencyKey));
    if (done) return JSON.parse(done) as { providerRefundId: string; amountCents: number };
    const payment = await this.getPayment(id);
    if (!payment) throw new AppError(404, 'PROVIDER_PAYMENT_NOT_FOUND', 'Pagamento não encontrado no provedor');
    if (payment.status !== 'approved' && payment.status !== 'refunded') {
      throw new AppError(409, 'PROVIDER_NOT_REFUNDABLE', 'Pagamento não pode ser estornado');
    }
    if (payment.refundedCents + amountCents > payment.amountCents) {
      throw new AppError(422, 'PROVIDER_REFUND_EXCEEDS', 'Estorno maior que o valor pago');
    }
    payment.refundedCents += amountCents;
    if (payment.refundedCents === payment.amountCents) payment.status = 'refunded';
    await this.save(payment);
    const result = { providerRefundId: `fkrf${randomBytes(8).toString('hex')}`, amountCents };
    await this.redis.set(IDEM_REFUND(id, idempotencyKey), JSON.stringify(result), 'EX', TTL_SECONDS);
    return result;
  }

  /** Lado do "provedor": muda o estado como se o cliente tivesse pago/recusado e devolve a notificação assinada. */
  async simulate(id: string, options: SimulateOptions): Promise<{ headers: Record<string, string>; query: Record<string, string>; body: unknown }> {
    const payment = await this.getPayment(id);
    if (!payment) throw new AppError(404, 'PROVIDER_PAYMENT_NOT_FOUND', 'Pagamento não encontrado no provedor');
    payment.status = options.outcome === 'approved' ? 'approved' : options.outcome === 'declined' ? 'declined' : 'expired';
    if (options.outcome === 'declined') payment.declineReason = 'rejected_by_issuer';
    if (options.outcome === 'approved') payment.providerFeeCents = options.reportedProviderFeeCents ?? feeOf(payment, payment.pixCopyPaste ? 'pix' : 'card');
    if (options.reportedAmountCents !== undefined) payment.amountCents = options.reportedAmountCents;
    if (options.reportedReference !== undefined) payment.externalReference = options.reportedReference;
    if (options.reportedReceiverId !== undefined) payment.receiverId = options.reportedReceiverId;
    if (options.reportedFeeCents !== undefined) payment.applicationFeeCents = options.reportedFeeCents;
    await this.save(payment);
    return this.signedNotification(id, options.outcome === 'approved' ? 'payment.updated' : 'payment.updated');
  }

  /** Notificação como o provedor a enviaria: assinada, `data.id` na query, corpo só informativo. */
  signedNotification(id: string, type: string, requestId: string = randomUUID()) {
    return {
      headers: signedWebhookHeaders(this.webhookSecret, id, requestId),
      query: { 'data.id': id, type: 'payment' } as Record<string, string>,
      body: { type, action: type, data: { id } },
    };
  }

  verifyWebhook({ headers, query }: Parameters<PaymentProvider['verifyWebhook']>[0]): WebhookNotification {
    const signature = headers['x-signature'];
    const requestId = headers['x-request-id'];
    const dataId = query['data.id'];
    const verdict = validateWebhookSignature({
      secret: this.webhookSecret,
      signatureHeader: typeof signature === 'string' ? signature : undefined,
      requestId: typeof requestId === 'string' ? requestId : null,
      dataId: typeof dataId === 'string' ? dataId : undefined,
      toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS,
    });
    if (!verdict.ok) {
      throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Assinatura inválida', { detail: `Notificação recusada (${verdict.reason}).` });
    }
    const type = typeof query.type === 'string' ? query.type : 'payment';
    return {
      eventKey: typeof requestId === 'string' && requestId ? requestId : `${String(dataId)}:${type}:${verdict.tsMs}`,
      providerPaymentId: String(dataId),
      type,
    };
  }

  private async save(payment: ProviderPayment): Promise<void> {
    await this.redis.set(KEY(payment.providerPaymentId), JSON.stringify(payment), 'EX', TTL_SECONDS);
  }
}
