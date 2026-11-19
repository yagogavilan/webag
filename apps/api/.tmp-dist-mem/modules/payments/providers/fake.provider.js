var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
import { randomBytes, randomUUID } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { AppError } from '../../../platform/http/app-error.js';
import { REDIS } from '../../../platform/redis/redis.module.js';
import { ProviderTimeoutError, } from '../payment-provider.js';
import { signedWebhookHeaders, validateWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from '../webhook-signature.js';
/** Tokens de texto documentados no README (WB-150 C3): resultado do cartão sem decorar sufixos. */
const FAKE_TOKENS = { fake_tok_approved: '0000', fake_tok_insufficient: '0001', fake_tok_3ds: '0002', fake_tok_timeout: '0003', fake_tok_wrong_fee: '0004', fake_tok_charged_timeout: '0005' };
/** Tarifa simulada (`fee_details`): PIX 0,99% e cartão 4,98%, as estimativas do PRD (HIP-016). */
const feeOf = (payment, method) => Math.round((payment.amountCents * (method === 'pix' ? 99 : 498)) / 10_000);
const KEY = (id) => `fake-provider:payment:${id}`;
const IDEM_CREATE = (attemptId) => `fake-provider:idem:create:${attemptId}`;
const IDEM_REFUND = (id, key) => `fake-provider:idem:refund:${id}:${key}`;
const REF = (reference) => `fake-provider:ref:${reference}`;
const TTL_SECONDS = 7 * 86_400;
/**
 * Provedor simulado (WB-150, ADR-002). O "lado do provedor" vive no Redis, então re-consultar o pagamento
 * (`getPayment`) é uma ida ao "provedor" de verdade, como no Mercado Pago.
 *
 * Cartão de teste (últimos 4 dígitos do `cardToken`, ex.: `tok_0001`): 0000 aprova, 0001 recusa por saldo,
 * 0002 exige 3DS (fica pendente até simular), 0003 dá timeout, 0004 aprova com comissão e recebedor errados (SEC-133), 0005 cobra e perde a resposta (timeout, SEC-136); qualquer outro recusa por cartão inválido.
 */
let FakePaymentProvider = class FakePaymentProvider {
    redis;
    config;
    name = 'fake';
    constructor(redis, config) {
        this.redis = redis;
        this.config = config;
    }
    get webhookSecret() {
        return this.config.get('FAKE_PAYMENT_WEBHOOK_SECRET', { infer: true });
    }
    expectedReceiverId(storeId) {
        return storeId ? `fake-seller-${storeId}` : null;
    }
    async createPayment(input) {
        // Idempotência como a do MP (X-Idempotency-Key): a mesma `attemptId` devolve o MESMO pagamento (review I3).
        const known = await this.redis.get(IDEM_CREATE(input.attemptId));
        if (known) {
            const existing = await this.getPayment(known);
            if (existing)
                return existing;
        }
        // `fk` + hex minúsculo: alfanumérico, como o ID de pagamento do MP (o manifesto lê o data.id em minúsculas).
        const id = `fk${randomBytes(12).toString('hex')}`;
        const base = {
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
        }
        else {
            const last4 = FAKE_TOKENS[input.cardToken ?? ''] ?? (input.cardToken ?? '').slice(-4);
            if (last4 === '0003')
                throw new ProviderTimeoutError();
            if (last4 === '0005') {
                // Cobrou do lado do provedor, mas a resposta se perdeu: o cliente fica cobrado sem pedido (SEC-136).
                Object.assign(base, { status: 'approved', providerFeeCents: feeOf(base, 'card') });
                await this.save(base);
                await this.redis.set(IDEM_CREATE(input.attemptId), id, 'EX', TTL_SECONDS);
                await this.redis.lpush(REF(input.externalReference), id);
                await this.redis.expire(REF(input.externalReference), TTL_SECONDS);
                throw new ProviderTimeoutError();
            }
            if (last4 === '0000')
                Object.assign(base, { status: 'approved', providerFeeCents: feeOf(base, 'card') });
            else if (last4 === '0004')
                Object.assign(base, { status: 'approved', applicationFeeCents: 0, receiverId: 'fake-seller-outro', providerFeeCents: feeOf(base, 'card') }); // aprovado, mas com comissão e recebedor errados (SEC-133)
            else if (last4 === '0001')
                Object.assign(base, { status: 'declined', declineReason: 'insufficient_funds' });
            else if (last4 === '0002')
                Object.assign(base, { status: 'pending_3ds', threeDsUrl: `https://fake-3ds.webag.local/challenge/${id}` });
            else
                Object.assign(base, { status: 'declined', declineReason: 'invalid_card' });
        }
        await this.save(base);
        await this.redis.set(IDEM_CREATE(input.attemptId), id, 'EX', TTL_SECONDS);
        await this.redis.lpush(REF(input.externalReference), id);
        await this.redis.expire(REF(input.externalReference), TTL_SECONDS);
        return base;
    }
    async findByReference(externalReference) {
        const ids = await this.redis.lrange(REF(externalReference), 0, 9);
        const found = await Promise.all(ids.map((id) => this.getPayment(id)));
        return found.filter((p) => p !== null);
    }
    async getPayment(id) {
        const raw = await this.redis.get(KEY(id));
        return raw ? JSON.parse(raw) : null;
    }
    async refund(id, amountCents, idempotencyKey) {
        // O MP deduplica por X-Idempotency-Key: repetir a chave devolve o mesmo estorno, sem estornar de novo (review I4b).
        const done = await this.redis.get(IDEM_REFUND(id, idempotencyKey));
        if (done)
            return JSON.parse(done);
        const payment = await this.getPayment(id);
        if (!payment)
            throw new AppError(404, 'PROVIDER_PAYMENT_NOT_FOUND', 'Pagamento não encontrado no provedor');
        if (payment.status !== 'approved' && payment.status !== 'refunded') {
            throw new AppError(409, 'PROVIDER_NOT_REFUNDABLE', 'Pagamento não pode ser estornado');
        }
        if (payment.refundedCents + amountCents > payment.amountCents) {
            throw new AppError(422, 'PROVIDER_REFUND_EXCEEDS', 'Estorno maior que o valor pago');
        }
        payment.refundedCents += amountCents;
        if (payment.refundedCents === payment.amountCents)
            payment.status = 'refunded';
        await this.save(payment);
        const result = { providerRefundId: `fkrf${randomBytes(8).toString('hex')}`, amountCents };
        await this.redis.set(IDEM_REFUND(id, idempotencyKey), JSON.stringify(result), 'EX', TTL_SECONDS);
        return result;
    }
    /** Lado do "provedor": muda o estado como se o cliente tivesse pago/recusado e devolve a notificação assinada. */
    async simulate(id, options) {
        const payment = await this.getPayment(id);
        if (!payment)
            throw new AppError(404, 'PROVIDER_PAYMENT_NOT_FOUND', 'Pagamento não encontrado no provedor');
        payment.status = options.outcome === 'approved' ? 'approved' : options.outcome === 'declined' ? 'declined' : 'expired';
        if (options.outcome === 'declined')
            payment.declineReason = 'rejected_by_issuer';
        if (options.outcome === 'approved')
            payment.providerFeeCents = options.reportedProviderFeeCents ?? feeOf(payment, payment.pixCopyPaste ? 'pix' : 'card');
        if (options.disputed !== undefined)
            payment.disputed = options.disputed;
        if (options.reportedAmountCents !== undefined)
            payment.amountCents = options.reportedAmountCents;
        if (options.reportedReference !== undefined)
            payment.externalReference = options.reportedReference;
        if (options.reportedReceiverId !== undefined)
            payment.receiverId = options.reportedReceiverId;
        if (options.reportedFeeCents !== undefined)
            payment.applicationFeeCents = options.reportedFeeCents;
        await this.save(payment);
        return this.signedNotification(id, options.outcome === 'approved' ? 'payment.updated' : 'payment.updated');
    }
    /** Notificação como o provedor a enviaria: assinada, `data.id` na query, corpo só informativo. */
    signedNotification(id, type, requestId = randomUUID()) {
        return {
            headers: signedWebhookHeaders(this.webhookSecret, id, requestId),
            query: { 'data.id': id, type: 'payment' },
            body: { type, action: type, data: { id } },
        };
    }
    verifyWebhook({ headers, query }) {
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
    async save(payment) {
        await this.redis.set(KEY(payment.providerPaymentId), JSON.stringify(payment), 'EX', TTL_SECONDS);
    }
};
FakePaymentProvider = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Redis,
        ConfigService])
], FakePaymentProvider);
export { FakePaymentProvider };
//# sourceMappingURL=fake.provider.js.map