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
import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post } from '@nestjs/common';
import { AdminOnly, AllowPendingMfa, Ctx, CurrentPrincipal, RequireReauth, } from '../../platform/auth/decorators.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { AdminUsersService } from './admin-users.service.js';
import { inviteAdminSchema, resetAdminAccessSchema, totpConfirmSchema, updateAdminSchema } from './auth.schemas.js';
import { TotpService } from './totp.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const uuid = (value) => {
    if (!UUID.test(value))
        throw errors.notFound();
    return value;
};
/** Gestão de admins (WB-101): só super admin, com reautenticação por TOTP recente nas ações que mudam acesso (SEC-016). */
let AdminUsersController = class AdminUsersController {
    adminUsers;
    totp;
    constructor(adminUsers, totp) {
        this.adminUsers = adminUsers;
        this.totp = totp;
    }
    async list() {
        return { data: await this.adminUsers.list(), pendingInvitations: await this.adminUsers.pendingInvitations(), nextCursor: null };
    }
    async invite(body, ctx) {
        const { invitationId, expiresAt } = await this.adminUsers.invite(body, ctx);
        return { invitationId, expiresAt: expiresAt.toISOString() };
    }
    async revokeInvitation(id, ctx) {
        await this.adminUsers.revokeInvitation(uuid(id), ctx);
    }
    async update(userId, body, ctx) {
        await this.adminUsers.update(uuid(userId), body, ctx);
    }
    async resetTotp(principal, userId, body, ctx) {
        await this.totp.resetFor(principal, uuid(userId), body, ctx);
    }
};
__decorate([
    AdminOnly('admins:manage'),
    Get(),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "list", null);
__decorate([
    AdminOnly('admins:manage'),
    RequireReauth(),
    Post(),
    __param(0, Body(new ZodPipe(inviteAdminSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "invite", null);
__decorate([
    AdminOnly('admins:manage'),
    RequireReauth(),
    HttpCode(204),
    Delete('invitations/:invitationId'),
    __param(0, Param('invitationId')),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "revokeInvitation", null);
__decorate([
    AdminOnly('admins:manage'),
    RequireReauth(),
    HttpCode(204),
    Patch(':userId'),
    __param(0, Param('userId')),
    __param(1, Body(new ZodPipe(updateAdminSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "update", null);
__decorate([
    AdminOnly('admins:manage'),
    RequireReauth(),
    HttpCode(204),
    Post(':userId/totp/reset'),
    __param(0, CurrentPrincipal()),
    __param(1, Param('userId')),
    __param(2, Body(new ZodPipe(resetAdminAccessSchema))),
    __param(3, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String, Object, Object]),
    __metadata("design:returntype", Promise)
], AdminUsersController.prototype, "resetTotp", null);
AdminUsersController = __decorate([
    Controller('v1/admin/admins'),
    __metadata("design:paramtypes", [AdminUsersService,
        TotpService])
], AdminUsersController);
export { AdminUsersController };
/** Configuração do próprio TOTP: única área que um admin sem segundo fator concluído alcança (WB-222 C3). */
let AdminTotpController = class AdminTotpController {
    totp;
    constructor(totp) {
        this.totp = totp;
    }
    setup(principal) {
        return this.totp.setup(principal);
    }
    /** SEC-092: 10 códigos novos, os antigos morrem. Reautenticação por TOTP recente; avisa o titular por e-mail. */
    regenerate(principal, ctx) {
        return this.totp.regenerateRecoveryCodes(principal, ctx);
    }
    /** Quantos códigos de recuperação restam (o painel avisa com 3 ou menos). */
    status(principal) {
        return this.totp.status(principal);
    }
    confirm(principal, body, ctx) {
        return this.totp.confirm(principal, body.code, ctx);
    }
};
__decorate([
    AllowPendingMfa(),
    Post('setup'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminTotpController.prototype, "setup", null);
__decorate([
    RequireReauth(),
    HttpCode(200),
    Post('recovery-codes'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AdminTotpController.prototype, "regenerate", null);
__decorate([
    Get('status'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AdminTotpController.prototype, "status", null);
__decorate([
    AllowPendingMfa(),
    HttpCode(200),
    Post('confirm'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(totpConfirmSchema))),
    __param(2, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", void 0)
], AdminTotpController.prototype, "confirm", null);
AdminTotpController = __decorate([
    Controller('v1/admin/totp'),
    __metadata("design:paramtypes", [TotpService])
], AdminTotpController);
export { AdminTotpController };
//# sourceMappingURL=admin-users.controller.js.map