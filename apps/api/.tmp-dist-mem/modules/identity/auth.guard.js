var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
import { Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ADMIN_PERMISSION, ALLOW_PENDING_MFA, buildContext, IS_PUBLIC, REQUIRE_REAUTH, ROLES, STORE_PERMISSION, } from '../../platform/auth/decorators.js';
import { adminHasPermission, memberHasStorePermission, } from '../../platform/auth/permissions.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { PrincipalService } from './principal.service.js';
import { SessionService } from './session.service.js';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Atualiza `last_used_at` no máximo 1x por minuto (evita escrita em toda requisição). */
const TOUCH_INTERVAL_MS = 60_000;
/**
 * Guard global: NEGA POR PADRÃO (SEC-021). Rota pública só com @Public().
 * Ordem: token (HS256, iss, aud, typ) → sessão ativa no banco → expiração por inatividade do admin →
 * segundo fator do admin → permissão de admin / papel / loja → reautenticação.
 */
let AuthGuard = class AuthGuard {
    reflector;
    sessionsService;
    principals;
    params;
    audit;
    constructor(reflector, sessionsService, principals, params, audit) {
        this.reflector = reflector;
        this.sessionsService = sessionsService;
        this.principals = principals;
        this.params = params;
        this.audit = audit;
    }
    async canActivate(context) {
        // Mensagens do Socket.IO (I10): a autenticação foi feita no handshake (RealtimeGateway), que grava `userId` no socket. NEGA POR PADRÃO:
        // todo `@SubscribeMessage` novo exige socket autenticado; mensagem de socket sem identidade é recusada.
        if (context.getType() === 'ws')
            return Boolean((context.switchToWs().getClient().data ?? {}).userId);
        if (context.getType() !== 'http')
            return false;
        const targets = [context.getHandler(), context.getClass()];
        if (this.reflector.getAllAndOverride(IS_PUBLIC, targets))
            return true;
        const req = context.switchToHttp().getRequest();
        const header = req.headers.authorization;
        const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
        if (!token)
            throw errors.unauthenticated();
        const claims = await this.sessionsService.verifyAccess(token);
        if (!claims)
            throw errors.unauthenticated('Sessão inválida. Entre de novo.');
        const loaded = await this.principals.load(claims.sub, claims.sid);
        if (!loaded)
            throw SessionService.unauthorized();
        const { principal } = loaded;
        req.principal = principal;
        if (principal.adminProfile) {
            const idleMs = (await this.params.getNumber('admin_inatividade_min')) * 60_000;
            if (Date.now() - loaded.sessionLastUsedAt.getTime() > idleMs) {
                throw new AppError(401, 'SESSION_IDLE', 'Sessão expirada por inatividade', { detail: 'Entre de novo.' });
            }
        }
        if (Date.now() - loaded.sessionLastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
            await this.sessionsService.touch(principal.sessionId);
        }
        if (principal.adminProfile && !principal.mfaVerified) {
            if (!this.reflector.getAllAndOverride(ALLOW_PENDING_MFA, targets)) {
                throw errors.forbidden('MFA_REQUIRED', 'Conclua a verificação em duas etapas para continuar.');
            }
        }
        const adminPermission = this.reflector.getAllAndOverride(ADMIN_PERMISSION, targets);
        if (adminPermission) {
            if (!principal.adminProfile || !adminHasPermission(principal.adminProfile, adminPermission)) {
                // WB-100 C4: tentativa de não-admin (ou de perfil sem a permissão) é negada e registrada.
                await this.audit
                    .recordStandalone(buildContext(req), {
                    action: 'admin.access_denied',
                    targetType: 'route',
                    targetId: `${req.method} ${req.path}`,
                    after: { permission: adminPermission },
                })
                    .catch(() => undefined);
                throw errors.forbidden();
            }
        }
        const roles = this.reflector.getAllAndOverride(ROLES, targets);
        if (roles && !roles.some((role) => principal.roles.includes(role)))
            throw errors.forbidden();
        const storePermission = this.reflector.getAllAndOverride(STORE_PERMISSION, targets);
        if (storePermission)
            await this.checkStore(req, principal.userId, storePermission);
        if (this.reflector.getAllAndOverride(REQUIRE_REAUTH, targets)) {
            const windowMs = (await this.params.getNumber('reauth_min')) * 60_000;
            if (!principal.reauthAt || Date.now() - principal.reauthAt.getTime() > windowMs) {
                throw errors.forbidden('REAUTH_REQUIRED', 'Confirme sua identidade para continuar.');
            }
        }
        return true;
    }
    /** Loja da rota `:storeId`. Não-membro recebe 404 (não revela que a loja existe); membro sem a permissão, 403. */
    async checkStore(req, userId, permission) {
        const storeId = req.params.storeId;
        if (!storeId || !UUID.test(storeId))
            throw errors.notFound();
        const member = await this.principals.storeMembership(userId, storeId);
        if (!member)
            throw errors.notFound();
        if (!memberHasStorePermission(member, permission))
            throw errors.forbidden();
    }
};
AuthGuard = __decorate([
    Injectable(),
    __metadata("design:paramtypes", [Reflector,
        SessionService,
        PrincipalService,
        ParametersService,
        AuditService])
], AuthGuard);
export { AuthGuard };
//# sourceMappingURL=auth.guard.js.map