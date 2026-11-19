var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var MercadoPagoPaymentProvider_1;
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MercadoPagoConfig, Payment, PaymentRefund } from 'mercadopago';
import { AppError } from '../../../platform/http/app-error.js';
import { safeErrorMessage } from '../../../platform/logging/mask.js';
import { ProviderTimeoutError, } from '../payment-provider.js';
import { SellerCredentialsRegistry } from '../seller-credentials.js';
import { validateWebhookSignature, WEBHOOK_TOLERANCE_SECONDS } from '../webhook-signature.js';
import { mpExpiration, toProviderPayment, toReais, toCents } from './mercadopago.mapping.js';
/** Tempo máximo por chamada (3G instável do cliente não importa aqui: é servidor a servidor). */
const TIMEOUT_MS = 8_000;
/**
 * Adaptador REAL do Mercado Pago (ADR-002) atrás de `PaymentProvider`: SDK oficial `mercadopago` (npm).
 *  - split: a cobrança sai com o token OAuth do LOJISTA e leva `application_fee` (comissão + taxa de serviço); o
 *    dinheiro cai na conta dele e a Webag recebe a comissão (DEC-016);
 *  - `X-Idempotency-Key` = id da tentativa (criação) ou chave do estorno: repetir não cobra nem estorna de novo;
 *  - o token do cartão vem do checkout do MP no aparelho; este código nunca vê número de cartão;
 *  - webhook: assinatura `x-signature` validada aqui; o estado vem SEMPRE de `getPayment` (re-consulta).
 * Pontos a confirmar no sandbox estão marcados `[confirmar no sandbox]` (nenhuma chamada real foi feita no desenvolvimento).
 */
let MercadoPagoPaymentProvider = MercadoPagoPaymentProvider_1 = class MercadoPagoPaymentProvider {
    config;
    sellers;
    name = 'mercadopago';
    logger = new Logger(MercadoPagoPaymentProvider_1.name);
    constructor(config, sellers) {
        this.config = config;
        this.sellers = sellers;
    }
    requiresPayerDocument(method) {
        return method === 'pix' && this.config.get('MP_PAYER_DOCUMENT_REQUIRED', { infer: true }) === true;
    }
    async expectedReceiverId(storeId) {
        if (!storeId)
            return null;
        return (await this.sellers.resolve(storeId))?.providerAccountId ?? null;
    }
    /** Token do lojista (split). Sem conta conectada não cobra: nunca cai para o token da plataforma por engano (SEC-034). */
    async clientFor(storeId, retries, accountId) {
        let accessToken;
        if (storeId) {
            accessToken = (await this.sellers.resolve(storeId, accountId))?.accessToken;
            if (!accessToken)
                throw new AppError(409, 'STORE_PAYMENT_ACCOUNT_UNAVAILABLE', 'Loja sem conta de recebimento ativa', { detail: 'Esta loja não pode receber pagamentos agora.' });
        }
        else {
            accessToken = this.config.get('MP_ACCESS_TOKEN', { infer: true });
        }
        if (!accessToken)
            throw new AppError(503, 'PAYMENT_PROVIDER_NOT_CONFIGURED', 'Pagamento não configurado');
        return new MercadoPagoConfig({ accessToken, options: { timeout: TIMEOUT_MS, maxRetries: retries } });
    }
    async createPayment(input) {
        // Criação sem retentativa do SDK: a idempotência é nossa (mesmo attemptId) e a conciliação resolve o ambíguo.
        const client = await this.clientFor(input.storeId, 0);
        const notificationUrl = `${this.config.get('API_PUBLIC_URL', { infer: true })}/v1/webhooks/mercadopago`;
        const payer = { email: input.payer?.email ?? 'cliente@webag.com.br', ...(input.payer?.document ? { identification: { type: 'CPF', number: input.payer.document } } : {}) };
        const common = {
            transaction_amount: toReais(input.amountCents),
            // Split: comissão + taxa de serviço, em reais (não pode ser negativa nem maior que o total).
            application_fee: toReais(input.applicationFeeCents),
            external_reference: input.externalReference,
            notification_url: notificationUrl,
            payer,
        };
        const body = input.method === 'pix'
            ? { ...common, payment_method_id: 'pix', ...(input.expiresAt ? { date_of_expiration: mpExpiration(input.expiresAt) } : {}) }
            : {
                ...common,
                token: input.cardToken,
                installments: input.installments,
                ...(input.card?.paymentMethodId ? { payment_method_id: input.card.paymentMethodId } : {}),
                ...(input.card?.issuerId && /^\d+$/.test(input.card.issuerId) ? { issuer_id: Number(input.card.issuerId) } : {}),
                // [confirmar no sandbox] captura no aceite (HIP-010): `capture:false` + application_fee; hoje captura imediata + estorno na recusa.
                capture: true,
            };
        try {
            const created = (await new Payment(client).create({ body, requestOptions: { idempotencyKey: input.attemptId } }));
            return toProviderPayment(created);
        }
        catch (error) {
            throw this.mapError(error, 'criar pagamento', true);
        }
    }
    async getPayment(providerPaymentId, context) {
        const client = await this.clientFor(context.storeId, 2, context.receiverAccountId);
        try {
            return toProviderPayment((await new Payment(client).get({ id: providerPaymentId })));
        }
        catch (error) {
            if (error.status === 404)
                return null;
            throw this.mapError(error, 'consultar pagamento', false);
        }
    }
    async findByReference(externalReference, context) {
        const client = await this.clientFor(context.storeId, 1, context.receiverAccountId);
        try {
            const found = await new Payment(client).search({ options: { external_reference: externalReference, sort: 'date_created', criteria: 'desc', limit: 10 } });
            const ids = (found.results ?? []).map((r) => r.id).filter((id) => typeof id === 'string' || typeof id === 'number');
            const payments = [];
            // A busca devolve um resumo; o detalhe completo (taxas, recebedor) vem do `get`, o mesmo que o webhook usa.
            for (const id of ids)
                payments.push(toProviderPayment(await new Payment(client).get({ id: String(id) })));
            return payments;
        }
        catch (error) {
            throw this.mapError(error, 'buscar pagamento por referência', false);
        }
    }
    async refund(providerPaymentId, amountCents, idempotencyKey, context) {
        const client = await this.clientFor(context.storeId, 0, context.receiverAccountId);
        try {
            // `amount` explícito vale para o estorno parcial e para o total (o MP recusa acima do saldo do pagamento).
            // [confirmar no sandbox] como a `application_fee` é devolvida no estorno parcial (proporcional ao MP).
            const refund = await new PaymentRefund(client).create({ payment_id: providerPaymentId, body: { amount: toReais(amountCents) }, requestOptions: { idempotencyKey } });
            return { providerRefundId: String(refund.id), amountCents: toCents(refund.amount ?? toReais(amountCents)) };
        }
        catch (error) {
            throw this.mapError(error, 'estornar pagamento', true);
        }
    }
    verifyWebhook({ headers, query }) {
        const secret = this.config.get('MP_WEBHOOK_SECRET', { infer: true });
        if (!secret)
            throw new AppError(503, 'WEBHOOK_NOT_CONFIGURED', 'Webhook não configurado');
        const signature = headers['x-signature'];
        const requestId = headers['x-request-id'];
        const dataId = query['data.id'];
        const verdict = validateWebhookSignature({
            secret,
            signatureHeader: typeof signature === 'string' ? signature : undefined,
            requestId: typeof requestId === 'string' ? requestId : null,
            dataId: typeof dataId === 'string' ? dataId : undefined,
            toleranceSeconds: WEBHOOK_TOLERANCE_SECONDS,
        });
        // Notificação sem x-signature (IPN legado, QR) cai aqui como `missing`: 401 (SEC-032).
        if (!verdict.ok)
            throw new AppError(401, 'WEBHOOK_SIGNATURE_INVALID', 'Assinatura inválida', { detail: `Notificação recusada (${verdict.reason}).` });
        const type = typeof query.type === 'string' ? query.type : 'payment';
        return {
            eventKey: typeof requestId === 'string' && requestId ? requestId : `${String(dataId)}:${type}:${verdict.tsMs}`,
            providerPaymentId: String(dataId),
            type,
        };
    }
    /**
     * Erro do SDK para o domínio. Timeout e 5xx são AMBÍGUOS na escrita (o MP pode ter criado): viram
     * `ProviderTimeoutError` e a conciliação resolve com a mesma chave. 4xx é recusa determinística: `AppError` 422 sem
     * repassar o texto do provedor (pode ter dado de cartão ou do pagador).
     */
    mapError(error, action, write) {
        if (error instanceof AppError)
            return error;
        const e = error;
        const status = typeof e.status === 'number' ? e.status : 0;
        this.logger.warn(`Mercado Pago: falha ao ${action} (status ${status || e.name || 'desconhecido'}): ${safeErrorMessage(error)}`);
        const aborted = e.name === 'AbortError' || e.name === 'TimeoutError' || e.name === 'MPConnectionError' || (status === 0 && /fetch failed|abort|timeout|ECONN|ETIMEDOUT/i.test(e.message ?? ''));
        if (aborted || status >= 500)
            return write ? new ProviderTimeoutError() : new Error(`Mercado Pago indisponível ao ${action}`);
        if (status === 401 || status === 403)
            return new AppError(502, 'PAYMENT_PROVIDER_AUTH', 'Conta de pagamento da loja não autorizada', { detail: 'A conexão da loja com o Mercado Pago precisa ser refeita.' });
        if (status === 429)
            return new AppError(503, 'PAYMENT_PROVIDER_BUSY', 'Pagamento indisponível', { detail: 'Tente novamente em instantes.', retryAfterSeconds: 5 });
        return new AppError(422, 'PAYMENT_PROVIDER_REJECTED', 'Pagamento recusado pelo provedor', { detail: 'Não foi possível processar o pagamento. Confira os dados ou tente outra forma de pagamento.' });
    }
};
MercadoPagoPaymentProvider = MercadoPagoPaymentProvider_1 = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [ConfigService,
        SellerCredentialsRegistry])
], MercadoPagoPaymentProvider);
export { MercadoPagoPaymentProvider };
//# sourceMappingURL=mercadopago.provider.js.map