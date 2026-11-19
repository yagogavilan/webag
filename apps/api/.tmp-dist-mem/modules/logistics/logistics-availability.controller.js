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
import { Body, Controller, Get, HttpCode, Post } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { LogisticsAvailabilityService } from './logistics-availability.service.js';
const pauseBody = z.strictObject({ cityId: z.uuid().nullable().optional(), reason: z.string().trim().min(3).max(200) });
const resumeBody = z.strictObject({ cityId: z.uuid().nullable().optional() });
/** Horário e pausa da logística (BUG-016, DEC-039c): o admin pausa por cidade ou geral, com motivo, e libera. */
let LogisticsAvailabilityController = class LogisticsAvailabilityController {
    availability;
    constructor(availability) {
        this.availability = availability;
    }
    async get() {
        const [now, pauses] = await Promise.all([this.availability.status(null), this.availability.listPauses()]);
        return {
            open: now.open,
            closedBy: now.closedBy,
            opensAt: now.opensAt?.toISOString() ?? null,
            pauses: pauses.map((p) => ({ id: p.id, cityId: p.cityId, reason: p.reason, pausedAt: p.pausedAt.toISOString() })),
        };
    }
    async pause(body, ctx) {
        const row = await this.availability.pause(body, ctx);
        return { id: row.id, cityId: row.cityId, reason: row.reason, pausedAt: row.pausedAt.toISOString() };
    }
    async resume(body, ctx) {
        await this.availability.resume(body, ctx);
    }
};
__decorate([
    AdminOnly('logistics:read'),
    Get('availability'),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], LogisticsAvailabilityController.prototype, "get", null);
__decorate([
    AdminOnly('logistics:write'),
    HttpCode(200),
    Post('pause'),
    __param(0, Body(new ZodPipe(pauseBody))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LogisticsAvailabilityController.prototype, "pause", null);
__decorate([
    AdminOnly('logistics:write'),
    HttpCode(204),
    Post('resume'),
    __param(0, Body(new ZodPipe(resumeBody))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], LogisticsAvailabilityController.prototype, "resume", null);
LogisticsAvailabilityController = __decorate([
    Controller('v1/admin/logistics'),
    __metadata("design:paramtypes", [LogisticsAvailabilityService])
], LogisticsAvailabilityController);
export { LogisticsAvailabilityController };
//# sourceMappingURL=logistics-availability.controller.js.map