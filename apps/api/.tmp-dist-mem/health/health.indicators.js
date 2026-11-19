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
import { Inject, Injectable, Logger } from '@nestjs/common';
import { HealthIndicatorService } from '@nestjs/terminus';
import { PG_POOL } from '../platform/database/database.module.js';
import { REDIS } from '../platform/redis/redis.module.js';
const CHECK_TIMEOUT_MS = 2_000;
async function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`timeout de ${ms} ms`)), ms);
    });
    try {
        return await Promise.race([promise, timeout]);
    }
    finally {
        clearTimeout(timer);
    }
}
/**
 * `/health/ready` é público (o orquestrador o consulta): nunca devolve a mensagem do driver, que traz host, porta e
 * usuário do banco/Redis (ex.: `connect ECONNREFUSED 10.0.0.5:5432`). O motivo real vai para o log do servidor.
 */
const PUBLIC_DOWN_MESSAGE = 'indisponível';
const logger = new Logger('Health');
function failure(key, error) {
    logger.warn(`${key} indisponível: ${error instanceof Error ? error.message : 'erro desconhecido'}`);
    return { message: PUBLIC_DOWN_MESSAGE };
}
let DatabaseHealthIndicator = class DatabaseHealthIndicator {
    indicator;
    pool;
    constructor(indicator, pool) {
        this.indicator = indicator;
        this.pool = pool;
    }
    async check(key = 'database') {
        const session = this.indicator.check(key);
        try {
            await withTimeout(this.pool.query('SELECT 1'), CHECK_TIMEOUT_MS);
            return session.up();
        }
        catch (error) {
            return session.down(failure(key, error));
        }
    }
};
DatabaseHealthIndicator = __decorate([
    Injectable(),
    __param(1, Inject(PG_POOL)),
    __metadata("design:paramtypes", [HealthIndicatorService, Object])
], DatabaseHealthIndicator);
export { DatabaseHealthIndicator };
let RedisHealthIndicator = class RedisHealthIndicator {
    indicator;
    redis;
    constructor(indicator, redis) {
        this.indicator = indicator;
        this.redis = redis;
    }
    async check(key = 'redis') {
        const session = this.indicator.check(key);
        try {
            if (this.redis.status === 'wait') {
                await withTimeout(this.redis.connect(), CHECK_TIMEOUT_MS);
            }
            await withTimeout(this.redis.ping(), CHECK_TIMEOUT_MS);
            return session.up();
        }
        catch (error) {
            return session.down(failure(key, error));
        }
    }
};
RedisHealthIndicator = __decorate([
    Injectable(),
    __param(1, Inject(REDIS)),
    __metadata("design:paramtypes", [HealthIndicatorService, Function])
], RedisHealthIndicator);
export { RedisHealthIndicator };
//# sourceMappingURL=health.indicators.js.map