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
import { and, eq } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { adminProfiles, sessions, storeMembers, userRoles, users } from './db/schema.js';
/** Carrega papéis e perfil do banco a cada requisição (ADR-003: nada de papel dentro do JWT). */
let PrincipalService = class PrincipalService {
    db;
    constructor(db) {
        this.db = db;
    }
    /** Devolve null se a sessão estiver revogada/expirada ou o usuário não estiver ativo (SEC-010, WB-219 C4). */
    async load(userId, sessionId) {
        const [row] = await this.db
            .select({
            session: sessions,
            user: users,
            admin: adminProfiles,
        })
            .from(sessions)
            .innerJoin(users, eq(users.id, sessions.userId))
            .leftJoin(adminProfiles, eq(adminProfiles.userId, users.id))
            .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)));
        if (!row)
            return null;
        const { session, user, admin } = row;
        if (session.revokedAt || session.absoluteExpiresAt <= new Date() || user.status !== 'active')
            return null;
        const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, userId));
        const activeAdmin = admin?.active ? admin : null;
        return {
            sessionLastUsedAt: session.lastUsedAt,
            principal: {
                userId,
                sessionId,
                email: user.email,
                emailVerified: user.emailVerifiedAt !== null,
                roles: roles.map((r) => r.role),
                adminProfile: activeAdmin?.profile ?? null,
                totpConfigured: activeAdmin?.totpConfirmedAt != null,
                mfaVerified: session.mfaVerifiedAt !== null,
                mfaFactor: session.mfaFactor,
                totpReenrollRequired: activeAdmin?.totpReenrollRequiredAt != null,
                reauthAt: session.reauthAt,
            },
        };
    }
    /** Vínculo do usuário com a loja (RBAC por loja). Nulo = não é membro. */
    async storeMembership(userId, storeId) {
        const [row] = await this.db
            .select({ role: storeMembers.role, permissions: storeMembers.permissions })
            .from(storeMembers)
            .where(and(eq(storeMembers.userId, userId), eq(storeMembers.storeId, storeId)));
        return row ?? null;
    }
};
PrincipalService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], PrincipalService);
export { PrincipalService };
//# sourceMappingURL=principal.service.js.map