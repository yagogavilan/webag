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
import { Global, Inject, Injectable, Logger, Module, } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
export const REDIS = Symbol('REDIS');
const logger = new Logger('Redis');
let RedisLifecycle = class RedisLifecycle {
    redis;
    constructor(redis) {
        this.redis = redis;
    }
    /** Conecta ao subir (rate limit e antirreplay dependem disso); falha só gera aviso e o ioredis retenta. */
    onModuleInit() {
        if (this.redis.status === 'wait') {
            this.redis.connect().catch((error) => logger.warn(`Redis indisponível no boot: ${error.message}`));
        }
    }
    onApplicationShutdown() {
        this.redis.disconnect();
    }
};
RedisLifecycle = __decorate([
    Injectable(),
    __param(0, Inject(REDIS)),
    __metadata("design:paramtypes", [Redis])
], RedisLifecycle);
/** Cliente Redis compartilhado (cache, rate limit). BullMQ e Socket.IO criam conexões próprias. */
let RedisModule = class RedisModule {
};
RedisModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: REDIS,
                inject: [ConfigService],
                useFactory: (config) => {
                    const client = new Redis(config.get('REDIS_URL', { infer: true }), {
                        lazyConnect: true,
                        maxRetriesPerRequest: 1,
                        connectTimeout: 3_000,
                        // Sem fila offline: comando com Redis fora falha na hora em vez de ficar pendurado.
                        enableOfflineQueue: false,
                    });
                    // Sem listener o ioredis imprime "Unhandled error event" fora do logger estruturado.
                    // A URL não entra no log (pode conter senha).
                    client.on('error', (error) => logger.warn(`Redis indisponível: ${error.message}`));
                    return client;
                },
            },
            RedisLifecycle,
        ],
        exports: [REDIS],
    })
], RedisModule);
export { RedisModule };
//# sourceMappingURL=redis.module.js.map