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
var RateLimitService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { Redis } from 'ioredis';
import { REDIS } from '../redis/redis.module.js';
import { AppError, errors } from '../http/app-error.js';
/**
 * Contadores em Redis com janela fixa (DT-003: storage próprio, sem depender de pacote com peer até Nest 11).
 * `failClosed`: com o Redis fora, bloqueia (503) em vez de liberar. Usado em login, códigos e cadastro.
 */
let RateLimitService = RateLimitService_1 = class RateLimitService {
    redis;
    logger = new Logger(RateLimitService_1.name);
    constructor(redis) {
        this.redis = redis;
    }
    /** Conecta sob demanda (o cliente é `lazyConnect`). */
    async ready() {
        if (this.redis.status === 'wait')
            await this.redis.connect();
    }
    /** Conta um evento na chave e devolve o total da janela. */
    async hit(key, windowSeconds, failClosed = true) {
        try {
            await this.ready();
            const results = await this.redis
                .multi()
                .set(key, 0, 'EX', windowSeconds, 'NX')
                .incr(key)
                .pttl(key)
                .exec();
            const count = Number(results?.[1]?.[1] ?? 0);
            const pttl = Number(results?.[2]?.[1] ?? windowSeconds * 1000);
            return { count, ttlSeconds: Math.max(1, Math.ceil(pttl / 1000)) };
        }
        catch (error) {
            return this.unavailable(error, failClosed);
        }
    }
    /** Lê o contador sem incrementar. */
    async peek(key, failClosed = true) {
        try {
            await this.ready();
            const [raw, pttl] = await Promise.all([this.redis.get(key), this.redis.pttl(key)]);
            return { count: Number(raw ?? 0), ttlSeconds: pttl > 0 ? Math.ceil(pttl / 1000) : 0 };
        }
        catch (error) {
            return this.unavailable(error, failClosed);
        }
    }
    /**
     * Desfaz uma contagem (usado quando o evento contado era legítimo, p.ex. 2º fator certo). Nunca passa de zero (a chave some ao zerar).
     * Padrão "conta antes, confere depois" (SEC-117): só assim requisições paralelas não furam o teto.
     */
    async release(key) {
        try {
            await this.ready();
            await this.redis.eval("local v = redis.call('GET', KEYS[1]) if v and tonumber(v) > 1 then return redis.call('DECR', KEYS[1]) end if v then redis.call('DEL', KEYS[1]) end return 0", 1, key);
        }
        catch (error) {
            this.logger.warn(`Redis indisponível ao devolver contagem: ${error.message}`);
        }
    }
    /** Encurta/estende a janela de uma chave existente (usado quando o limite é atingido). */
    async setWindow(key, windowSeconds) {
        try {
            await this.redis.expire(key, windowSeconds);
        }
        catch (error) {
            this.logger.warn(`Redis indisponível ao ajustar janela: ${error.message}`);
        }
    }
    async reset(key) {
        try {
            await this.redis.del(key);
        }
        catch (error) {
            this.logger.warn(`Redis indisponível ao limpar contador: ${error.message}`);
        }
    }
    /** Conta e lança 429 se passar do limite. */
    async enforce(key, limit, windowSeconds, failClosed = true) {
        const { count, ttlSeconds } = await this.hit(key, windowSeconds, failClosed);
        if (count > limit)
            throw errors.tooMany(ttlSeconds);
    }
    unavailable(error, failClosed) {
        this.logger.warn(`Redis indisponível no rate limit: ${error.message}`);
        if (failClosed) {
            throw new AppError(503, 'RATE_LIMIT_UNAVAILABLE', 'Serviço temporariamente indisponível', {
                detail: 'Tente novamente em instantes.',
                retryAfterSeconds: 5,
            });
        }
        return { count: 0, ttlSeconds: 0 };
    }
};
RateLimitService = RateLimitService_1 = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Redis])
], RateLimitService);
export { RateLimitService };
//# sourceMappingURL=rate-limit.service.js.map