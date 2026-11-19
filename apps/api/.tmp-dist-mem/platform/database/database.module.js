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
import { Global, Inject, Injectable, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema.js';
export const PG_POOL = Symbol('PG_POOL');
export const DRIZZLE = Symbol('DRIZZLE');
/** Fecha o pool no shutdown gracioso. */
let PgPoolLifecycle = class PgPoolLifecycle {
    pool;
    constructor(pool) {
        this.pool = pool;
    }
    async onApplicationShutdown() {
        await this.pool.end();
    }
};
PgPoolLifecycle = __decorate([
    Injectable(),
    __param(0, Inject(PG_POOL)),
    __metadata("design:paramtypes", [Object])
], PgPoolLifecycle);
/** Conexão com o PostgreSQL e Drizzle (ADR-001/007) sobre o mesmo pool. */
let DatabaseModule = class DatabaseModule {
};
DatabaseModule = __decorate([
    Global(),
    Module({
        providers: [
            {
                provide: PG_POOL,
                inject: [ConfigService],
                useFactory: (config) => new pg.Pool({
                    connectionString: config.get('DATABASE_URL', { infer: true }),
                    max: 10,
                    connectionTimeoutMillis: 3_000,
                    idleTimeoutMillis: 30_000,
                }),
            },
            {
                provide: DRIZZLE,
                inject: [PG_POOL],
                useFactory: (pool) => drizzle(pool, { schema, casing: 'snake_case' }),
            },
            PgPoolLifecycle,
        ],
        exports: [PG_POOL, DRIZZLE],
    })
], DatabaseModule);
export { DatabaseModule };
//# sourceMappingURL=database.module.js.map