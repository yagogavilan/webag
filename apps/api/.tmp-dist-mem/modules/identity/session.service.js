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
var SessionService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { Subject } from 'rxjs';
import { hmacHex, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { ParametersService } from '../admin/index.js';
import { accessLog, adminProfiles, refreshTokens, sessions, users } from './db/schema.js';
export const JWT_ISSUER = 'webag-api';
export const JWT_AUDIENCE = 'webag-clients';
let SessionService = SessionService_1 = class SessionService {
    db;
    jwt;
    config;
    params;
    logger = new Logger(SessionService_1.name);
    revoked$ = new Subject();
    constructor(db, jwt, config, params) {
        this.db = db;
        this.jwt = jwt;
        this.config = config;
        this.params = params;
    }
    get hmacKey() {
        return this.config.get('AUTH_HMAC_KEY', { infer: true });
    }
    /** Refresh seguinte, derivado do anterior: permite devolver o MESMO token se o cliente repetir o pedido (SEC-011). */
    deriveNextRefresh(previousHash) {
        return Buffer.from(hmacHex(this.hmacKey, `refresh-next:${previousHash}`), 'hex').toString('base64url');
    }
    signAccess(userId, sessionId) {
        return this.jwt.signAsync({ sub: userId, sid: sessionId, typ: 'access' }, {
            secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
            algorithm: 'HS256',
            expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
            issuer: JWT_ISSUER,
            audience: JWT_AUDIENCE,
        });
    }
    /** SEC-010: algoritmo fixo, iss/aud/exp/typ conferidos. */
    async verifyAccess(token) {
        try {
            const claims = await this.jwt.verifyAsync(token, {
                secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
                algorithms: ['HS256'],
                issuer: JWT_ISSUER,
                audience: JWT_AUDIENCE,
            });
            if (claims.typ !== 'access' || !claims.sub || !claims.sid)
                return null;
            return claims;
        }
        catch {
            return null;
        }
    }
    async pair(userId, sessionId, refreshToken) {
        return {
            accessToken: await this.signAccess(userId, sessionId),
            refreshToken,
            expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
            tokenType: 'Bearer',
        };
    }
    slidingExpiry(absolute) {
        const sliding = Date.now() + this.config.get('REFRESH_TTL_DAYS', { infer: true }) * 86_400_000;
        return new Date(Math.min(sliding, absolute.getTime()));
    }
    async createSession(executor, userId, ctx, options) {
        const absolute = new Date(Date.now() + this.config.get('REFRESH_ABSOLUTE_TTL_DAYS', { infer: true }) * 86_400_000);
        const [session] = await executor
            .insert(sessions)
            .values({
            userId,
            ip: ctx.ip,
            userAgent: ctx.userAgent,
            deviceId: ctx.deviceId,
            absoluteExpiresAt: absolute,
            mfaVerifiedAt: options.mfaVerified ? new Date() : null,
            mfaFactor: options.mfaFactor ?? null,
            reauthAt: options.reauth ? new Date() : null,
        })
            .returning({ id: sessions.id });
        if (!session)
            throw new Error('Falha ao criar sessão');
        const refresh = randomToken(32);
        await executor.insert(refreshTokens).values({
            sessionId: session.id,
            tokenHash: sha256Hex(refresh),
            expiresAt: this.slidingExpiry(absolute),
        });
        return { sessionId: session.id, tokens: await this.pair(userId, session.id, refresh) };
    }
    /**
     * Rotação do refresh (SEC-011, WB-220):
     * - uso normal: troca por um novo e marca o antigo como usado;
     * - repetição em até 30 s: devolve o mesmo novo token (retry de rede em 3G);
     * - reuso depois da janela: revoga a sessão inteira.
     */
    async refresh(rawToken, ctx) {
        const hash = sha256Hex(rawToken);
        const windowMs = this.config.get('REFRESH_REUSE_WINDOW_SECONDS', { infer: true }) * 1000;
        // Review I1: a inatividade do admin (WB-100 C3) vale também para o refresh, senão um refresh roubado renovaria a
        // sessão por até 30 dias. Lê o parâmetro antes da transação para não segurar o lock durante a consulta.
        const adminIdleMs = (await this.params.getNumber('admin_inatividade_min')) * 60_000;
        const outcome = await this.db.transaction(async (tx) => {
            const [token] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).for('update');
            if (!token)
                return { kind: 'invalid', code: 'REFRESH_INVALID' };
            const [row] = await tx
                .select({ session: sessions, userStatus: users.status })
                .from(sessions)
                .innerJoin(users, eq(users.id, sessions.userId))
                .where(eq(sessions.id, token.sessionId));
            if (!row)
                return { kind: 'invalid', code: 'REFRESH_INVALID' };
            const { session } = row;
            const now = new Date();
            if (session.revokedAt)
                return { kind: 'invalid', code: 'SESSION_REVOKED' };
            if (row.userStatus !== 'active')
                return { kind: 'invalid', code: 'SESSION_REVOKED' };
            if (token.expiresAt <= now || session.absoluteExpiresAt <= now)
                return { kind: 'invalid', code: 'REFRESH_EXPIRED' };
            const [admin] = await tx.select({ active: adminProfiles.active }).from(adminProfiles).where(eq(adminProfiles.userId, session.userId));
            if (admin?.active && now.getTime() - session.lastUsedAt.getTime() > adminIdleMs) {
                return { kind: 'idle', userId: session.userId, sessionId: session.id };
            }
            const next = this.deriveNextRefresh(hash);
            if (token.usedAt) {
                if (now.getTime() - token.usedAt.getTime() <= windowMs) {
                    await tx.insert(accessLog).values({ userId: session.userId, event: 'token_refresh_replayed:inside_window', ip: ctx.ip, userAgent: ctx.userAgent });
                    return { kind: 'ok', userId: session.userId, sessionId: session.id, refresh: next };
                }
                return { kind: 'reuse', userId: session.userId, sessionId: session.id };
            }
            await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, token.id));
            await tx
                .insert(refreshTokens)
                .values({ sessionId: session.id, tokenHash: sha256Hex(next), expiresAt: this.slidingExpiry(session.absoluteExpiresAt) })
                .onConflictDoNothing();
            await tx.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, session.id));
            await tx.insert(accessLog).values({ userId: session.userId, event: 'refresh', ip: ctx.ip, userAgent: ctx.userAgent });
            return { kind: 'ok', userId: session.userId, sessionId: session.id, refresh: next };
        });
        if (outcome.kind === 'idle') {
            await this.revokeSessions(this.db, outcome.userId, 'admin_idle', { onlySessionId: outcome.sessionId });
            throw new AppError(401, 'SESSION_IDLE', 'Sessão expirada por inatividade', { detail: 'Entre de novo.' });
        }
        if (outcome.kind === 'reuse') {
            // Fora da janela: alguém repetiu um token já trocado. Derruba a família inteira (RFC 9700).
            await this.revokeSessions(this.db, outcome.userId, 'refresh_reuse', { onlySessionId: outcome.sessionId });
            await this.db.insert(accessLog).values({ userId: outcome.userId, event: 'token_refresh_replayed:outside_window', ip: ctx.ip, userAgent: ctx.userAgent });
            this.logger.warn(`token_refresh_replayed outside_window session=${outcome.sessionId}`);
            throw new AppError(401, 'REFRESH_REUSED', 'Entre de novo por segurança', { detail: 'Sua sessão foi encerrada por segurança.' });
        }
        if (outcome.kind === 'invalid') {
            throw new AppError(401, outcome.code, outcome.code === 'REFRESH_EXPIRED' ? 'Sessão expirada' : 'Sessão inválida', {
                detail: 'Entre de novo.',
            });
        }
        return this.pair(outcome.userId, outcome.sessionId, outcome.refresh);
    }
    /**
     * Revoga sessões (SEC-014, WB-219). `exceptSessionId` preserva a sessão atual quando fizer sentido.
     * Devolve os IDs revogados e avisa o barramento (sockets).
     */
    async revokeSessions(executor, userId, reason, options = {}) {
        const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
        if (options.onlySessionId)
            conditions.push(eq(sessions.id, options.onlySessionId));
        if (options.exceptSessionId)
            conditions.push(ne(sessions.id, options.exceptSessionId));
        const rows = await executor
            .update(sessions)
            .set({ revokedAt: new Date(), revokedReason: reason })
            .where(and(...conditions))
            .returning({ id: sessions.id });
        const ids = rows.map((row) => row.id);
        if (ids.length > 0)
            this.revoked$.next({ userId, sessionIds: ids, reason });
        return ids;
    }
    async markReauth(sessionId) {
        await this.db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId));
    }
    async markMfaVerified(sessionId) {
        await this.db.update(sessions).set({ mfaVerifiedAt: new Date(), mfaFactor: 'totp' }).where(eq(sessions.id, sessionId));
    }
    async touch(sessionId) {
        await this.db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
    }
    /** Falha de verificação de sessão inexistente vira 401 padrão. */
    static unauthorized() {
        return errors.unauthenticated('Sua sessão foi encerrada. Entre de novo.');
    }
};
SessionService = SessionService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, JwtService,
        ConfigService,
        ParametersService])
], SessionService);
export { SessionService };
//# sourceMappingURL=session.service.js.map