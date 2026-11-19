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
import { Body, Controller, Get, Header, HttpCode, Param, Post, StreamableFile } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { z } from 'zod';
import { Ctx, CurrentPrincipal, Public } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { codeSchema, emailSchema, passwordSchema } from '../identity/index.js';
import { AccountDeletionService } from './account-deletion.service.js';
import { WebAccountDeletionService } from './web-deletion.service.js';
import { DataExportService } from './data-export.service.js';
const deleteAccountSchema = z.strictObject({ password: passwordSchema });
const webStartSchema = z.strictObject({ email: emailSchema, password: passwordSchema.optional() });
const webVerifySchema = z.strictObject({ email: emailSchema, code: codeSchema });
const webTicketSchema = z.strictObject({ deleteTicket: z.string().min(20).max(200) });
const cancelDeletionSchema = z.strictObject({ email: emailSchema, password: passwordSchema, code: z.string().regex(/^\d{6}$/).optional() });
/** WB-213: excluir minha conta (cliente, lojista dono ou funcionário). Admin tem outro caminho (WB-101). */
let AccountDeletionController = class AccountDeletionController {
    deletion;
    constructor(deletion) {
        this.deletion = deletion;
    }
    overview(principal) {
        return this.deletion.overview(principal);
    }
    /** SEC-096: só a senha. 409 `DELETION_BLOCKED` traz `blockers`; senha errada 403 `INVALID_PASSWORD` (conta no limite do login). */
    request(principal, ctx, body) {
        return this.deletion.request(principal, body.password, ctx);
    }
};
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountDeletionController.prototype, "overview", null);
__decorate([
    Post(),
    HttpCode(200),
    RateLimit({ name: 'account-deletion', limit: 10, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(deleteAccountSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AccountDeletionController.prototype, "request", null);
AccountDeletionController = __decorate([
    Controller('v1/me/deletion'),
    __metadata("design:paramtypes", [AccountDeletionService])
], AccountDeletionController);
export { AccountDeletionController };
let AccountDeletionPublicController = class AccountDeletionPublicController {
    deletion;
    web;
    constructor(deletion, web) {
        this.deletion = deletion;
        this.web = web;
    }
    /**
     * WB-214 / SEC-096, passo 1. Sem `password` (via A): envia o código `delete_web` SÓ se a conta existe, está confirmada e não é de admin;
     * a resposta é sempre `{ sent: true }`. Com `password` (via B, única com e-mail não confirmado): devolve o `deleteTicket`
     * (401 `INVALID_CREDENTIALS` igual para senha errada, e-mail inexistente e admin). Nenhuma sessão é criada.
     */
    async start(ctx, body) {
        if (body.password === undefined) {
            await this.web.requestCode(body.email, ctx);
            return { sent: true };
        }
        return this.web.withPassword(body.email, body.password, ctx);
    }
    /** Via A, passo 2: o código vira `deleteTicket`. */
    verifyCode(ctx, body) {
        return this.web.verifyCode(body.email, body.code, ctx);
    }
    /** Passo 3: o que será apagado e os bloqueios. 410 `DELETE_TICKET_INVALID` se o ticket venceu ou já foi usado. */
    review(body) {
        return this.web.review(body.deleteTicket);
    }
    /** Passo final: consome o ticket e fecha a conta (mesmas regras do app). */
    finish(ctx, body) {
        return this.web.confirm(body.deleteTicket, ctx);
    }
    /** Arrependimento: e-mail e senha da conta em período de exclusão. Falha sempre responde igual ao login (401). */
    async cancel(ctx, body) {
        await this.deletion.cancel(body.email, body.password, ctx, body.code);
    }
};
__decorate([
    Public(),
    Post('start'),
    HttpCode(200),
    RateLimit({ name: 'account-deletion-web', limit: 30, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(webStartSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountDeletionPublicController.prototype, "start", null);
__decorate([
    Public(),
    Post('verify-code'),
    HttpCode(200),
    RateLimit({ name: 'account-deletion-verify', limit: 30, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(webVerifySchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountDeletionPublicController.prototype, "verifyCode", null);
__decorate([
    Public(),
    Post('review'),
    HttpCode(200),
    RateLimit({ name: 'account-deletion-review', limit: 60, windowSeconds: 3600 }),
    __param(0, Body(new ZodPipe(webTicketSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountDeletionPublicController.prototype, "review", null);
__decorate([
    Public(),
    Post('finish'),
    HttpCode(200),
    RateLimit({ name: 'account-deletion-confirm', limit: 20, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(webTicketSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AccountDeletionPublicController.prototype, "finish", null);
__decorate([
    Public(),
    Post('cancel'),
    HttpCode(204),
    RateLimit({ name: 'account-deletion-cancel', limit: 10, windowSeconds: 3600 }),
    __param(0, Ctx()),
    __param(1, Body(new ZodPipe(cancelDeletionSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountDeletionPublicController.prototype, "cancel", null);
AccountDeletionPublicController = __decorate([
    Controller('v1/auth/account-deletion'),
    __metadata("design:paramtypes", [AccountDeletionService,
        WebAccountDeletionService])
], AccountDeletionPublicController);
export { AccountDeletionPublicController };
const exportSchema = z.strictObject({ password: passwordSchema });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** WB-212: exportar meus dados (assíncrono, com senha). */
let DataExportController = class DataExportController {
    exports;
    config;
    constructor(exports, config) {
        this.exports = exports;
        this.config = config;
    }
    latest(principal) {
        return this.exports.latest(principal.userId);
    }
    /** 202: o arquivo é montado em segundo plano e o e-mail avisa. 409 `EXPORT_IN_PROGRESS`, 429 `EXPORT_DAILY_LIMIT`, 403 `EMAIL_VERIFICATION_REQUIRED` / `INVALID_PASSWORD`. */
    request(principal, ctx, body) {
        return this.exports.request(principal, body.password, ctx);
    }
    /** Link de uso único e curta duração para baixar o arquivo (só o dono; outro usuário recebe 404). */
    async link(principal, exportId) {
        if (!UUID.test(exportId))
            throw errors.notFound('Exportação não encontrada.');
        const link = await this.exports.createDownloadLink(principal.userId, exportId);
        return { url: `${this.config.get('API_PUBLIC_URL', { infer: true }).replace(/\/$/, '')}${link.url}`, expiresAt: link.expiresAt };
    }
};
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], DataExportController.prototype, "latest", null);
__decorate([
    Post(),
    HttpCode(202),
    RateLimit({ name: 'data-export', limit: 10, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(exportSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], DataExportController.prototype, "request", null);
__decorate([
    Post(':exportId/download-link'),
    HttpCode(200),
    RateLimit({ name: 'data-export-link', limit: 20, windowSeconds: 3600 }),
    __param(0, CurrentPrincipal()),
    __param(1, Param('exportId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], DataExportController.prototype, "link", null);
DataExportController = __decorate([
    Controller('v1/me/data-exports'),
    __metadata("design:paramtypes", [DataExportService,
        ConfigService])
], DataExportController);
export { DataExportController };
let DataExportDownloadController = class DataExportDownloadController {
    exports;
    constructor(exports) {
        this.exports = exports;
    }
    /** O token do link é a credencial: uso único, vence em `exportacao_link_min`. Falha de qualquer tipo: 410 `EXPORT_LINK_INVALID`. */
    async download(token) {
        const { body, fileName } = await this.exports.redeem(token);
        return new StreamableFile(body, { type: 'application/json; charset=utf-8', disposition: `attachment; filename="${fileName}"` });
    }
};
__decorate([
    Public(),
    Get('download/:token'),
    Header('Cache-Control', 'no-store'),
    RateLimit({ name: 'data-export-download', limit: 30, windowSeconds: 3600 }),
    __param(0, Param('token')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], DataExportDownloadController.prototype, "download", null);
DataExportDownloadController = __decorate([
    Controller('v1/data-exports'),
    __metadata("design:paramtypes", [DataExportService])
], DataExportDownloadController);
export { DataExportDownloadController };
//# sourceMappingURL=privacy.controller.js.map