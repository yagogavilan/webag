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
import { Body, Controller, Get, Put, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { DeliveryFeesService } from './delivery-fees.service.js';
import { FEE_SCOPE_TYPES } from './db/schema.js';
const tierSchema = z.strictObject({
    fromM: z.number().int().min(0),
    toM: z.number().int().min(1),
    feeCents: z.number().int().min(0).max(5000),
    /** Ausente = 50% da taxa de entrega, arredondado para cima (DEC-039a). */
    exchangeFeeCents: z.number().int().min(0).max(10_000).optional(),
    expectedCostCents: z.number().int().min(0).max(20_000).default(0),
    etaMinutes: z.number().int().min(0).max(240).default(0),
});
const putSchema = z.strictObject({
    scopeType: z.enum(FEE_SCOPE_TYPES),
    scopeId: z.uuid().nullable().optional(),
    tiers: z.array(tierSchema).min(1).max(6),
    effectiveFrom: z.iso.datetime().optional(),
    reason: z.string().trim().min(3).max(300),
    expectedVersion: z.number().int().min(0),
});
const scopeQuery = z.strictObject({ scopeType: z.enum(FEE_SCOPE_TYPES), scopeId: z.uuid().optional() });
const previewQuery = z.strictObject({
    storeId: z.uuid(),
    lat: z.coerce.number().min(-90).max(90),
    lng: z.coerce.number().min(-180).max(180),
    cityId: z.uuid().optional(),
    neighborhoodId: z.uuid().optional(),
    subtotalCents: z.coerce.number().int().min(0).max(100_000_000).default(0),
});
const present = (table) => ({
    id: table.id,
    scopeType: table.scopeType,
    scopeId: table.scopeType === 'default' ? null : table.scopeKey,
    version: table.version,
    effectiveFrom: table.effectiveFrom.toISOString(),
    reason: table.reason,
    createdAt: table.createdAt.toISOString(),
    tiers: table.tiers,
});
/** Tabela de taxa de entrega, pedido mínimo e frete grátis (WB-236). Pedido mínimo e frete grátis são os parâmetros globais. */
let DeliveryFeesAdminController = class DeliveryFeesAdminController {
    fees;
    constructor(fees) {
        this.fees = fees;
    }
    async list() {
        // Uma tabela em vigor por escopo (poucas dezenas: cidades e bairros da região), sem cursor.
        const rows = await this.fees.list();
        return { data: rows.map((row) => ({ ...present(row), scopeName: row.scopeName })), nextCursor: null };
    }
    async history(query) {
        const rows = await this.fees.history(query.scopeType, query.scopeId ?? null);
        return { data: rows.map(present), nextCursor: null };
    }
    /** Mesma função do carrinho (`quote`): o valor da prévia é igual ao do checkout (WB-236 C6). */
    async preview(query) {
        const quote = await this.fees.quote(query.storeId, { lat: query.lat, lng: query.lng, cityId: query.cityId ?? null, neighborhoodId: query.neighborhoodId ?? null }, query.subtotalCents);
        return {
            available: quote.available,
            reason: quote.reason,
            distanceM: quote.distanceM,
            fee: quote.feeCents === null ? null : { amount: quote.feeCents, currency: 'BRL' },
            freeShipping: quote.freeShipping,
            belowMinimum: quote.belowMinimum,
            minOrder: { amount: quote.minOrderCents, currency: 'BRL' },
            etaMinutes: quote.etaMinutes,
            expectedCost: quote.snapshot ? { amount: quote.snapshot.expectedCostCents, currency: 'BRL' } : null,
            exchangeFee: quote.snapshot ? { amount: quote.snapshot.exchangeFeeCents, currency: 'BRL' } : null,
            /** Margem prevista = taxa cobrada menos custo previsto do motoboy (negativa = prejuízo, WB-236 C7). */
            expectedMargin: quote.snapshot && quote.feeCents !== null ? { amount: quote.feeCents - quote.snapshot.expectedCostCents, currency: 'BRL' } : null,
        };
    }
    async put(body, ctx) {
        const table = await this.fees.put({
            scopeType: body.scopeType,
            scopeId: body.scopeId ?? null,
            tiers: body.tiers.map((t) => ({ ...t, exchangeFeeCents: t.exchangeFeeCents ?? Math.ceil(t.feeCents / 2) })),
            effectiveFrom: body.effectiveFrom ? new Date(body.effectiveFrom) : undefined,
            reason: body.reason,
            expectedVersion: body.expectedVersion,
        }, ctx);
        return present(table);
    }
};
__decorate([
    AdminOnly('delivery-fees:read'),
    Get(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], DeliveryFeesAdminController.prototype, "list", null);
__decorate([
    AdminOnly('delivery-fees:read'),
    Get('history'),
    __param(0, Query(new ZodPipe(scopeQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DeliveryFeesAdminController.prototype, "history", null);
__decorate([
    AdminOnly('delivery-fees:read'),
    Get('preview'),
    __param(0, Query(new ZodPipe(previewQuery))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], DeliveryFeesAdminController.prototype, "preview", null);
__decorate([
    AdminOnly('delivery-fees:write'),
    Put(),
    __param(0, Body(new ZodPipe(putSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], DeliveryFeesAdminController.prototype, "put", null);
DeliveryFeesAdminController = __decorate([
    Controller('v1/admin/delivery-fees'),
    __metadata("design:paramtypes", [DeliveryFeesService])
], DeliveryFeesAdminController);
export { DeliveryFeesAdminController };
//# sourceMappingURL=delivery-fees.controller.js.map