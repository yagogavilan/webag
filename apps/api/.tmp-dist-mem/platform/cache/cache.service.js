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
import { Global, Inject, Injectable, Logger, Module } from '@nestjs/common';
import { REDIS } from '../redis/redis.module.js';
const logger = new Logger('Cache');
/**
 * Cache de leitura em Redis (padroes-backend: TTL explícito, nunca dado pessoal). Falha aberta: se o Redis cair,
 * a leitura vai direto ao banco e o erro vira aviso no log. Só guarda JSON; as chaves levam o prefixo `cache:`.
 * Invalidação por versão de namespace: `bump('regions')` torna todas as chaves antigas do namespace inalcançáveis.
 */
let CacheService = class CacheService {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    async version(namespace) {
        try {
            return (await this.redis.get(`cache:v:${namespace}`)) ?? '0';
        }
        catch {
            return '0';
        }
    }
    /** Devolve o valor em cache ou calcula, grava com TTL (segundos, fixo ou decidido pelo valor, p.ex. "não achou" vale menos) e devolve. */
    async wrap(namespace, key, ttlSeconds, compute) {
        const full = `cache:${namespace}:${await this.version(namespace)}:${key}`;
        try {
            const hit = await this.redis.get(full);
            if (hit !== null)
                return JSON.parse(hit);
        }
        catch (error) {
            logger.warn(`Cache indisponível (leitura): ${error.message}`);
        }
        const value = await compute();
        try {
            await this.redis.set(full, JSON.stringify(value), 'EX', typeof ttlSeconds === 'function' ? ttlSeconds(value) : ttlSeconds);
        }
        catch (error) {
            logger.warn(`Cache indisponível (gravação): ${error.message}`);
        }
        return value;
    }
    /** Invalida o namespace inteiro (as chaves antigas expiram sozinhas pelo TTL). */
    async bump(namespace) {
        try {
            await this.redis.incr(`cache:v:${namespace}`);
        }
        catch (error) {
            logger.warn(`Cache indisponível (invalidação): ${error.message}`);
        }
    }
};
CacheService = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Function])
], CacheService);
export { CacheService };
let CacheModule = class CacheModule {
};
CacheModule = __decorate([
    Global(),
    Module({ providers: [CacheService], exports: [CacheService] })
], CacheModule);
export { CacheModule };
//# sourceMappingURL=cache.service.js.map