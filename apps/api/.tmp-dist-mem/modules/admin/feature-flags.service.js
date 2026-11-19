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
import { eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { AuditService } from './audit.service.js';
import { featureFlags } from './db/schema.js';
import { FEATURE_FLAG_DEFINITIONS, FLAG_KEYS } from './feature-flags.definitions.js';
let FeatureFlagsService = class FeatureFlagsService {
    db;
    audit;
    constructor(db, audit) {
        this.db = db;
        this.audit = audit;
    }
    async list() {
        const rows = await this.db.select().from(featureFlags);
        const byKey = new Map(rows.map((row) => [row.key, row]));
        return FEATURE_FLAG_DEFINITIONS.map((definition) => {
            const row = byKey.get(definition.key);
            return {
                key: definition.key,
                enabled: row?.enabled ?? definition.default,
                description: definition.description,
                updatedAt: row?.updatedAt.toISOString() ?? null,
            };
        });
    }
    /** Mapa chave → ligada, para o app (cache de até 60 s no cliente, WB-120 C4). */
    async publicMap() {
        return Object.fromEntries((await this.list()).map((flag) => [flag.key, flag.enabled]));
    }
    async isEnabled(key) {
        const found = (await this.list()).find((flag) => flag.key === key);
        if (!found)
            throw new Error(`Feature flag desconhecida: ${key}`);
        return found.enabled;
    }
    async set(key, enabled, ctx, reason) {
        const definition = FEATURE_FLAG_DEFINITIONS.find((flag) => flag.key === key);
        if (!definition || !FLAG_KEYS.has(key))
            throw errors.notFound('Feature flag não encontrada.');
        await this.db.transaction(async (tx) => {
            const [current] = await tx.select().from(featureFlags).where(eq(featureFlags.key, key)).for('update');
            const before = current?.enabled ?? definition.default;
            await tx
                .insert(featureFlags)
                .values({ key, enabled, description: definition.description, updatedBy: ctx.principal?.userId ?? null })
                .onConflictDoUpdate({
                target: featureFlags.key,
                set: { enabled, updatedAt: new Date(), updatedBy: ctx.principal?.userId ?? null },
            });
            await this.audit.record(tx, ctx, {
                action: 'feature_flag.set',
                targetType: 'feature_flag',
                targetId: key,
                before: { enabled: before },
                after: { enabled },
                reason,
            });
        });
        const view = (await this.list()).find((flag) => flag.key === key);
        if (!view)
            throw errors.notFound();
        return view;
    }
    /** Seed idempotente. */
    async ensureDefaults() {
        await this.db
            .insert(featureFlags)
            .values(FEATURE_FLAG_DEFINITIONS.map((flag) => ({ key: flag.key, enabled: flag.default, description: flag.description })))
            .onConflictDoNothing();
    }
};
FeatureFlagsService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuditService])
], FeatureFlagsService);
export { FeatureFlagsService };
//# sourceMappingURL=feature-flags.service.js.map