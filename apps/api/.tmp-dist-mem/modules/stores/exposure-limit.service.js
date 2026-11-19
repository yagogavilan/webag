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
import { and, count, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ParametersService } from '../admin/index.js';
import { orders } from '../orders/db/schema.js';
import { stores } from './db/schema.js';
import { evaluateExposureLimit } from './exposure-limit.js';
/**
 * Limite de exposição da loja nova (WB-225, SEC-062). Lê os pedidos entregues direto da tabela `orders` (só contagem); o
 * módulo de pedidos depende deste, então não há como chamá-lo sem criar ciclo.
 */
let ExposureLimitService = class ExposureLimitService {
    db;
    params;
    constructor(db, params) {
        this.db = db;
        this.params = params;
    }
    async forStore(storeId, now = new Date()) {
        const [store] = await this.db
            .select({ mode: stores.exposureLimitMode, max: stores.exposureLimitMaxCents, approvedAt: stores.approvedAt, createdAt: stores.createdAt })
            .from(stores)
            .where(eq(stores.id, storeId));
        if (!store)
            throw errors.notFound('Loja não encontrada.');
        const [delivered] = await this.db.select({ n: count() }).from(orders).where(and(eq(orders.storeId, storeId), eq(orders.status, 'delivered')));
        return evaluateExposureLimit({
            mode: store.mode,
            customMaxCents: store.max,
            since: store.approvedAt ?? store.createdAt,
            deliveredOrders: delivered?.n ?? 0,
            now,
            params: {
                days: await this.params.getNumber('loja_nova_dias'),
                orders: await this.params.getNumber('loja_nova_pedidos'),
                maxOrderCents: await this.params.getNumber('loja_nova_pedido_max_cents'),
            },
        });
    }
    async configure(tx, storeId, input) {
        const [before] = await tx.select({ mode: stores.exposureLimitMode, max: stores.exposureLimitMaxCents }).from(stores).where(eq(stores.id, storeId)).for('update');
        if (!before)
            throw errors.notFound('Loja não encontrada.');
        await tx
            .update(stores)
            .set({ exposureLimitMode: input.mode, exposureLimitMaxCents: input.mode === 'custom' ? input.maxOrderCents : null, exposureLimitReason: input.reason, exposureLimitSetBy: input.actorId, exposureLimitSetAt: new Date() })
            .where(eq(stores.id, storeId));
        return { before: { mode: before.mode, maxOrderCents: before.max } };
    }
};
ExposureLimitService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, ParametersService])
], ExposureLimitService);
export { ExposureLimitService };
//# sourceMappingURL=exposure-limit.service.js.map