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
import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { decryptSecret, encryptSecret, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { errors } from '../../platform/http/app-error.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { PrincipalService } from '../identity/index.js';
import { OrdersService } from './orders.service.js';
export const CARD_INTENT_TTL_SECONDS = 900;
const DOCUMENT_INFO = 'card-intent-payer-document';
/**
 * B.2: cartão em produção SEM o app tocar em dado de cartão (regra inviolável nº 2). O app pede uma INTENÇÃO (o que quer comprar e o total
 * que viu); a página segura da web (`/pagar/cartao?i=<token>`, MP.js/Bricks/3DS) lê o valor, tokeniza o cartão no navegador e completa a
 * intenção; o servidor cria o pedido com o token do provedor. A intenção é de USO ÚNICO (256 bits, só o hash no Redis, 15 min, ligada a
 * usuário e sessão), então o link não serve a mais ninguém nem depois de usado. O app acompanha o pedido por REST.
 */
let CardIntentService = class CardIntentService {
    redis;
    config;
    principals;
    orders;
    constructor(redis, config, principals, orders) {
        this.redis = redis;
        this.config = config;
        this.principals = principals;
        this.orders = orders;
    }
    key(token) {
        return `card-intent:${sha256Hex(token)}`;
    }
    async create(principal, input) {
        const token = randomToken(32);
        const expiresAt = new Date(Date.now() + CARD_INTENT_TTL_SECONDS * 1000);
        const { payerDocument, ...rest } = input;
        const stored = {
            userId: principal.userId,
            sessionId: principal.sessionId,
            input: rest,
            ...(payerDocument ? { payerDocumentEnc: encryptSecret(payerDocument, this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true }), DOCUMENT_INFO, principal.userId) } : {}),
            expiresAt: expiresAt.toISOString(),
        };
        await this.redis.set(this.key(token), JSON.stringify(stored), 'EX', CARD_INTENT_TTL_SECONDS);
        const base = this.config.get('WEB_PUBLIC_URL', { infer: true }).replace(/\/$/, '');
        return { token, url: `${base}/pagar/cartao?i=${token}`, expiresAt: expiresAt.toISOString(), amount: { amount: input.expectedTotalCents, currency: 'BRL' } };
    }
    async read(token, consume) {
        const gone = () => errors.gone('CARD_INTENT_INVALID', 'Link inválido ou já usado', 'Volte ao app e escolha pagar com cartão de novo.');
        if (!/^[A-Za-z0-9_-]{20,100}$/.test(token))
            throw gone();
        const raw = consume ? await this.redis.getdel(this.key(token)) : await this.redis.get(this.key(token));
        if (!raw)
            throw gone();
        return JSON.parse(raw);
    }
    /** O que a página segura mostra: valor e provedor. Não consome a intenção e não devolve nada do pedido além do total. */
    async view(token) {
        const intent = await this.read(token, false);
        return {
            amount: { amount: intent.input.expectedTotalCents, currency: 'BRL' },
            provider: this.config.get('PAYMENT_PROVIDER', { infer: true }),
            publicKey: this.config.get('MP_PUBLIC_KEY', { infer: true }) ?? null,
            installmentsMax: 3,
            expiresAt: intent.expiresAt,
        };
    }
    /** Completa: consome a intenção (uso único), recarrega a sessão do dono e cria o pedido com o token do cartão. */
    async complete(token, card) {
        const intent = await this.read(token, true);
        const loaded = await this.principals.load(intent.userId, intent.sessionId);
        if (!loaded)
            throw errors.gone('CARD_INTENT_INVALID', 'A sessão do app foi encerrada', 'Volte ao app e entre de novo.');
        const key = `card-intent-${sha256Hex(token).slice(0, 40)}`;
        const payerDocument = intent.payerDocumentEnc ? decryptSecret(intent.payerDocumentEnc, this.config.get('PAYMENT_TOKEN_ENC_KEY', { infer: true }), DOCUMENT_INFO, intent.userId) : undefined;
        const { orderId } = await this.orders.create(loaded.principal, { ...intent.input, ...(payerDocument ? { payerDocument } : {}), paymentMethod: 'card', card }, key);
        const order = await this.orders.getForCustomer(intent.userId, orderId);
        return { orderId, status: order.status, payment: order.payment, threeDsUrl: (await this.orders.paymentForCustomer(intent.userId, orderId)).threeDsUrl };
    }
};
CardIntentService = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Redis,
        ConfigService,
        PrincipalService,
        OrdersService])
], CardIntentService);
export { CardIntentService };
//# sourceMappingURL=card-intent.service.js.map