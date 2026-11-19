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
import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { z } from 'zod';
import { AdminOnly, Ctx, Public, RequireReauth } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { emailSchema } from '../identity/index.js';
import { DSR_STATUSES, DSR_TYPES } from './db/schema.js';
import { DsrService } from './dsr.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value) => {
    if (!UUID.test(value))
        throw errors.notFound('Pedido não encontrado.');
    return value;
};
const submitSchema = z.strictObject({ type: z.enum(DSR_TYPES), email: emailSchema, message: z.string().trim().max(1000).optional() });
const registerSchema = z.strictObject({ type: z.enum(DSR_TYPES), email: emailSchema, message: z.string().trim().max(1000).optional(), receivedAt: z.coerce.date().optional() });
const listSchema = z.strictObject({
    status: z.enum(DSR_STATUSES).optional(),
    overdue: z.enum(['true', 'false']).transform((v) => v === 'true').optional(),
    cursor: z.string().max(300).optional(),
    limit: z.coerce.number().int().min(1).max(50).optional(),
});
const revealSchema = z.strictObject({ reason: z.string().trim().min(10).max(300) });
const answerSchema = z.strictObject({ answer: z.string().trim().min(5).max(1000) });
/** WB-217 C5: formulário público do titular (app e web), sem login e com resposta igual exista ou não conta. */
let PrivacyRequestPublicController = class PrivacyRequestPublicController {
    dsr;
    constructor(dsr) {
        this.dsr = dsr;
    }
    submit(ctx, body) {
        return this.dsr.submit(body, ctx);
    }
};
__decorate([
    Public(),
    Post(),
    HttpCode(202),
    RateLimit({ name: 'privacy-request', limit: 5, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(submitSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], PrivacyRequestPublicController.prototype, "submit", null);
PrivacyRequestPublicController = __decorate([
    Controller('v1/privacy/requests'),
    __metadata("design:paramtypes", [DsrService])
], PrivacyRequestPublicController);
export { PrivacyRequestPublicController };
/** WB-217 C2/C3 e OP3: fila de pedidos de titulares. Só super admin. */
let AdminPrivacyRequestsController = class AdminPrivacyRequestsController {
    dsr;
    constructor(dsr) {
        this.dsr = dsr;
    }
    list(query) {
        return this.dsr.list(query);
    }
    /** Registro manual de pedido recebido por e-mail do encarregado. */
    register(ctx, body) {
        return this.dsr.register(ctx, body);
    }
    get(id) {
        return this.dsr.get(uuid(id));
    }
    reveal(ctx, id, body) {
        return this.dsr.reveal(ctx, uuid(id), body.reason);
    }
    progress(ctx, id) {
        return this.dsr.progress(ctx, uuid(id));
    }
    answer(ctx, id, body) {
        return this.dsr.answer(ctx, uuid(id), body.answer);
    }
};
__decorate([
    AdminOnly('privacy:manage'),
    Get(),
    __param(0, Query(new ZodPipe(listSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "list", null);
__decorate([
    AdminOnly('privacy:manage'),
    Post(),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(registerSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "register", null);
__decorate([
    AdminOnly('privacy:manage'),
    Get(':id'),
    __param(0, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "get", null);
__decorate([
    AdminOnly('privacy:manage'),
    RequireReauth(),
    Post(':id/reveal'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(revealSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "reveal", null);
__decorate([
    AdminOnly('privacy:manage'),
    Post(':id/in-progress'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "progress", null);
__decorate([
    AdminOnly('privacy:manage'),
    Post(':id/answer'),
    HttpCode(200),
    __param(0, Ctx()),
    __param(1, Param('id')),
    __param(2, Body(new ZodPipe(answerSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object]),
    __metadata("design:returntype", void 0)
], AdminPrivacyRequestsController.prototype, "answer", null);
AdminPrivacyRequestsController = __decorate([
    Controller('v1/admin/privacy-requests'),
    __metadata("design:paramtypes", [DsrService])
], AdminPrivacyRequestsController);
export { AdminPrivacyRequestsController };
//# sourceMappingURL=dsr.controller.js.map