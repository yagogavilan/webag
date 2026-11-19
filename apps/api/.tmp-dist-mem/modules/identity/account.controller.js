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
import { and, desc, eq, isNull } from 'drizzle-orm';
import { Inject } from '@nestjs/common';
import { z } from 'zod';
import { Ctx, CurrentPrincipal } from '../../platform/auth/decorators.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { ZodPipe } from '../../platform/http/zod.pipe.js';
import { UsersService } from '../users/index.js';
import { changePasswordSchema, merchantRoleSchema, phoneSchema } from './auth.schemas.js';
import { AuthService } from './auth.service.js';
import { adminProfiles, sessions, userRoles, users } from './db/schema.js';
import { SessionService } from './session.service.js';
const updateProfileSchema = z.strictObject({
    name: z.string().trim().min(2).max(120).optional(),
    phone: phoneSchema.optional(),
});
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Perfil, senha, papel de lojista e sessões do próprio usuário. */
let AccountController = class AccountController {
    db;
    auth;
    users;
    sessions;
    constructor(db, auth, users, sessions) {
        this.db = db;
        this.auth = auth;
        this.users = users;
        this.sessions = sessions;
    }
    async profile(userId) {
        const [user] = await this.db.select().from(users).where(eq(users.id, userId));
        if (!user)
            throw errors.notFound();
        const [roles, [admin]] = await Promise.all([
            this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId)),
            this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, userId)),
        ]);
        const roleList = roles.map((r) => r.role);
        return {
            id: user.id,
            email: user.email,
            emailVerified: user.emailVerifiedAt !== null,
            name: user.name,
            phone: user.phone,
            roles: roleList,
            adminProfile: admin?.active ? admin.profile : null,
            pendingTerms: await this.users.pendingTerms(userId, roleList),
        };
    }
    me(principal) {
        return this.profile(principal.userId);
    }
    /** Campos fixos e estritos: `role`, `email`, `status`, `emailVerified` etc. voltam 400 (SEC-022). */
    async update(principal, body) {
        if (Object.keys(body).length > 0) {
            await this.db.update(users).set({ ...body, updatedAt: new Date() }).where(eq(users.id, principal.userId));
        }
        return this.profile(principal.userId);
    }
    async changePassword(principal, ctx, body) {
        return { tokens: await this.auth.changePassword(principal, body, ctx) };
    }
    async merchantRole(principal, ctx, body) {
        await this.auth.grantMerchantRole(principal, body.acceptedDocuments, ctx);
    }
    async listSessions(principal) {
        const rows = await this.db
            .select()
            .from(sessions)
            .where(and(eq(sessions.userId, principal.userId), isNull(sessions.revokedAt)))
            .orderBy(desc(sessions.lastUsedAt))
            .limit(50);
        return {
            data: rows.map((row) => ({
                id: row.id,
                current: row.id === principal.sessionId,
                createdAt: row.createdAt.toISOString(),
                lastUsedAt: row.lastUsedAt.toISOString(),
                userAgent: row.userAgent,
                ip: row.ip,
            })),
            nextCursor: null,
        };
    }
    /** Sessão de outro usuário responde 404 (SEC-020). */
    async revokeSession(principal, sessionId) {
        if (!UUID.test(sessionId))
            throw errors.notFound();
        const [row] = await this.db
            .select({ id: sessions.id })
            .from(sessions)
            .where(and(eq(sessions.id, sessionId), eq(sessions.userId, principal.userId), isNull(sessions.revokedAt)));
        if (!row)
            throw errors.notFound('Sessão não encontrada.');
        await this.sessions.revokeSessions(this.db, principal.userId, 'user_revoked', { onlySessionId: sessionId });
    }
};
__decorate([
    Get(),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", void 0)
], AccountController.prototype, "me", null);
__decorate([
    Patch(),
    __param(0, CurrentPrincipal()),
    __param(1, Body(new ZodPipe(updateProfileSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "update", null);
__decorate([
    Post('password'),
    HttpCode(200),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(changePasswordSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "changePassword", null);
__decorate([
    Post('merchant-role'),
    HttpCode(204),
    __param(0, CurrentPrincipal()),
    __param(1, Ctx()),
    __param(2, Body(new ZodPipe(merchantRoleSchema))),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, Object, Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "merchantRole", null);
__decorate([
    Get('sessions'),
    __param(0, CurrentPrincipal()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "listSessions", null);
__decorate([
    Delete('sessions/:sessionId'),
    HttpCode(204),
    __param(0, CurrentPrincipal()),
    __param(1, Param('sessionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object, String]),
    __metadata("design:returntype", Promise)
], AccountController.prototype, "revokeSession", null);
AccountController = __decorate([
    Controller('v1/me'),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, AuthService,
        UsersService,
        SessionService])
], AccountController);
export { AccountController };
//# sourceMappingURL=account.controller.js.map