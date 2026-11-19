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
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Put } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { LEGAL_DOCUMENT_TYPES } from '../admin/index.js';
import { CONSENT_PURPOSES } from './db/schema.js';
import { UsersService } from './users.service.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
const setConsentSchema = z.strictObject({ granted: z.boolean() });
const acceptTermsSchema = z.strictObject({
    acceptedDocuments: z
        .array(z.strictObject({ type: z.enum(LEGAL_DOCUMENT_TYPES), version: z.number().int().positive() }))
        .min(1)
        .max(5),
});
let UsersController = class UsersController {
    users;
    db;
    constructor(users, db) {
        this.users = users;
        this.db = db;
    }
    async terms(principal) {
        return { pending: await this.users.pendingTerms(principal.userId, principal.roles) };
    }
    async accept(principal, ctx, body) {
        return { pending: await this.users.acceptTerms(principal.userId, principal.roles, body.acceptedDocuments, ctx) };
    }
    async consents(principal) {
        return { consents: await this.users.consentState(principal.userId) };
    }
    async setConsent(principal, ctx, purpose, body) {
        if (!CONSENT_PURPOSES.includes(purpose))
            throw errors.notFound('Finalidade desconhecida.');
        await this.users.setConsent(this.db, principal.userId, purpose, body.granted, 'app', ctx);
        return { consents: await this.users.consentState(principal.userId) };
    }
};
__decorate([
    Get('terms'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "terms", null);
__decorate([
    Post('terms/accept'),
    HttpCode(200),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(acceptTermsSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "accept", null);
__decorate([
    Get('consents'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "consents", null);
__decorate([
    Put('consents/:purpose'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Param('purpose')),
    __param(3, Body(new ZodPipe(setConsentSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, String, Object]),
    __metadata("design:returntype", Promise)
], UsersController.prototype, "setConsent", null);
UsersController = __decorate([
    Controller('v1/me'),
    __param(1, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [UsersService, Object])
], UsersController);
export { UsersController };
//# sourceMappingURL=users.controller.js.map