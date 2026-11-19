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
import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AllowPendingMfa, Ctx, CurrentPrincipal, Public, } from '../../platform/auth/decorators.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { RateLimit } from '../../platform/ratelimit/rate-limit.guard.js';
import { AdminUsersService } from './admin-users.service.js';
import { acceptInvitationSchema, completeResetSchema, correctEmailSchema, emailExistsSchema, forgotPasswordSchema, loginSchema, mfaVerifySchema, reauthSchema, refreshSchema, registerSchema, resetPasswordSchema, verifyEmailSchema, } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
let AuthController = class AuthController {
    auth;
    adminUsers;
    constructor(auth, adminUsers) {
        this.auth = auth;
        this.adminUsers = adminUsers;
    }
    register(body, ctx) {
        return this.auth.register(body, ctx);
    }
    async emailExists(body, ctx) {
        return { exists: await this.auth.emailExists(body.email, ctx) };
    }
    login(body, ctx) {
        return this.auth.login(body, ctx);
    }
    verifyMfa(body, ctx) {
        return this.auth.verifyMfa(body, ctx);
    }
    refresh(body, ctx) {
        return this.auth.refresh(body.refreshToken, ctx);
    }
    async logout(principal) {
        await this.auth.logout(principal);
    }
    async logoutAll(principal) {
        await this.auth.logoutAll(principal);
    }
    async verifyEmail(principal, body) {
        await this.auth.verifyEmail(principal, body.code);
    }
    async resend(principal, ctx) {
        await this.auth.resendVerification(principal, ctx);
    }
    async correct(principal, ctx, body) {
        await this.auth.correctEmail(principal, body.newEmail, body.password, ctx);
    }
    async forgot(body, ctx) {
        await this.auth.forgotPassword(body.email, ctx);
        return { message: 'Se o e-mail existir, enviamos um código.' };
    }
    reset(body, ctx) {
        return this.auth.resetPassword(body, ctx);
    }
    completeReset(body, ctx) {
        return this.auth.completeReset(body, ctx);
    }
    async reauth(principal, ctx, body) {
        await this.auth.reauth(principal, body, ctx);
    }
    async acceptInvitation(body, ctx) {
        const { tokens } = await this.adminUsers.accept(body.token, body.password, ctx);
        return { tokens, mfaSetupRequired: true };
    }
};
__decorate([
    Public(),
    RateLimit({ name: 'register', limit: 20, windowSeconds: 3600 }),
    Post('register'),
    __param(0, Body(new ZodPipe(registerSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "register", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'email-exists', limit: 10, windowSeconds: 60 }),
    Post('email-exists'),
    __param(0, Body(new ZodPipe(emailExistsSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "emailExists", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'login', limit: 60, windowSeconds: 60 }),
    Post('login'),
    __param(0, Body(new ZodPipe(loginSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "login", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'mfa-verify', limit: 30, windowSeconds: 60 }),
    Post('mfa/verify'),
    __param(0, Body(new ZodPipe(mfaVerifySchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "verifyMfa", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'refresh', limit: 30, windowSeconds: 60 }),
    Post('refresh'),
    __param(0, Body(new ZodPipe(refreshSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "refresh", null);
__decorate([
    HttpCode(204),
    AllowPendingMfa(),
    Post('logout'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logout", null);
__decorate([
    HttpCode(204),
    AllowPendingMfa(),
    Post('logout-all'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "logoutAll", null);
__decorate([
    HttpCode(204),
    Post('email/verify'),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(verifyEmailSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "verifyEmail", null);
__decorate([
    HttpCode(204),
    Post('email/resend'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "resend", null);
__decorate([
    HttpCode(204),
    Post('email/correct'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(correctEmailSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "correct", null);
__decorate([
    Public(),
    HttpCode(202),
    RateLimit({ name: 'password-forgot', limit: 20, windowSeconds: 900 }),
    Post('password/forgot'),
    __param(0, Body(new ZodPipe(forgotPasswordSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "forgot", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'password-reset', limit: 30, windowSeconds: 900 }),
    Post('password/reset'),
    __param(0, Body(new ZodPipe(resetPasswordSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "reset", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'password-reset-complete', limit: 30, windowSeconds: 900 }),
    Post('password/reset/complete'),
    __param(0, Body(new ZodPipe(completeResetSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", void 0)
], AuthController.prototype, "completeReset", null);
__decorate([
    HttpCode(204),
    AllowPendingMfa(),
    Post('reauth'),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(reauthSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "reauth", null);
__decorate([
    Public(),
    HttpCode(200),
    RateLimit({ name: 'invitation-accept', limit: 20, windowSeconds: 900 }),
    Post('invitations/accept'),
    __param(0, Body(new ZodPipe(acceptInvitationSchema))),
    __param(1, Ctx()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AuthController.prototype, "acceptInvitation", null);
AuthController = __decorate([
    Controller('v1/auth'),
    __metadata("design:paramtypes", [AuthService,
        AdminUsersService])
], AuthController);
export { AuthController };
//# sourceMappingURL=auth.controller.js.map