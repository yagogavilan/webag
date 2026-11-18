import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, eq, isNull, ne } from 'drizzle-orm';
import { Subject } from 'rxjs';
import type { RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { hmacHex, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { accessLog, refreshTokens, sessions, users } from './db/schema.js';

export const JWT_ISSUER = 'webag-api';
export const JWT_AUDIENCE = 'webag-clients';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  /** Segundos de validade do access token. */
  expiresIn: number;
  tokenType: 'Bearer';
}

export interface AccessClaims {
  sub: string;
  sid: string;
  typ: 'access';
}

/** Emitido quando sessões são encerradas; o gateway de tempo real (ADR-004) assina para derrubar sockets (SEC-014). */
export interface SessionRevokedEvent {
  userId: string;
  sessionIds: string[];
  reason: string;
}

@Injectable()
export class SessionService {
  private readonly logger = new Logger(SessionService.name);
  readonly revoked$ = new Subject<SessionRevokedEvent>();

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<Env, true>,
  ) {}

  private get hmacKey(): string {
    return this.config.get('AUTH_HMAC_KEY', { infer: true });
  }

  /** Refresh seguinte, derivado do anterior: permite devolver o MESMO token se o cliente repetir o pedido (SEC-011). */
  private deriveNextRefresh(previousHash: string): string {
    return Buffer.from(hmacHex(this.hmacKey, `refresh-next:${previousHash}`), 'hex').toString('base64url');
  }

  private signAccess(userId: string, sessionId: string): Promise<string> {
    return this.jwt.signAsync(
      { sub: userId, sid: sessionId, typ: 'access' } satisfies AccessClaims,
      {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithm: 'HS256',
        expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      },
    );
  }

  /** SEC-010: algoritmo fixo, iss/aud/exp/typ conferidos. */
  async verifyAccess(token: string): Promise<AccessClaims | null> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims>(token, {
        secret: this.config.get('JWT_ACCESS_SECRET', { infer: true }),
        algorithms: ['HS256'],
        issuer: JWT_ISSUER,
        audience: JWT_AUDIENCE,
      });
      if (claims.typ !== 'access' || !claims.sub || !claims.sid) return null;
      return claims;
    } catch {
      return null;
    }
  }

  private async pair(userId: string, sessionId: string, refreshToken: string): Promise<TokenPair> {
    return {
      accessToken: await this.signAccess(userId, sessionId),
      refreshToken,
      expiresIn: this.config.get('JWT_ACCESS_TTL_SECONDS', { infer: true }),
      tokenType: 'Bearer',
    };
  }

  private slidingExpiry(absolute: Date): Date {
    const sliding = Date.now() + this.config.get('REFRESH_TTL_DAYS', { infer: true }) * 86_400_000;
    return new Date(Math.min(sliding, absolute.getTime()));
  }

  async createSession(
    executor: DbOrTx,
    userId: string,
    ctx: RequestContext,
    options: { mfaVerified: boolean; reauth?: boolean },
  ): Promise<{ sessionId: string; tokens: TokenPair }> {
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
        reauthAt: options.reauth ? new Date() : null,
      })
      .returning({ id: sessions.id });
    if (!session) throw new Error('Falha ao criar sessão');
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
  async refresh(rawToken: string, ctx: RequestContext): Promise<TokenPair> {
    const hash = sha256Hex(rawToken);
    const windowMs = this.config.get('REFRESH_REUSE_WINDOW_SECONDS', { infer: true }) * 1000;

    type Outcome =
      | { kind: 'ok'; userId: string; sessionId: string; refresh: string }
      | { kind: 'reuse'; userId: string; sessionId: string }
      | { kind: 'invalid'; code: string };

    const outcome: Outcome = await this.db.transaction(async (tx) => {
      const [token] = await tx.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, hash)).for('update');
      if (!token) return { kind: 'invalid', code: 'REFRESH_INVALID' } as const;
      const [row] = await tx
        .select({ session: sessions, userStatus: users.status })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(eq(sessions.id, token.sessionId));
      if (!row) return { kind: 'invalid', code: 'REFRESH_INVALID' } as const;
      const { session } = row;
      const now = new Date();
      if (session.revokedAt) return { kind: 'invalid', code: 'SESSION_REVOKED' } as const;
      if (row.userStatus !== 'active') return { kind: 'invalid', code: 'SESSION_REVOKED' } as const;
      if (token.expiresAt <= now || session.absoluteExpiresAt <= now) return { kind: 'invalid', code: 'REFRESH_EXPIRED' } as const;

      const next = this.deriveNextRefresh(hash);
      if (token.usedAt) {
        if (now.getTime() - token.usedAt.getTime() <= windowMs) {
          await tx.insert(accessLog).values({ userId: session.userId, event: 'token_refresh_replayed:inside_window', ip: ctx.ip, userAgent: ctx.userAgent });
          return { kind: 'ok', userId: session.userId, sessionId: session.id, refresh: next } as const;
        }
        return { kind: 'reuse', userId: session.userId, sessionId: session.id } as const;
      }
      await tx.update(refreshTokens).set({ usedAt: now }).where(eq(refreshTokens.id, token.id));
      await tx
        .insert(refreshTokens)
        .values({ sessionId: session.id, tokenHash: sha256Hex(next), expiresAt: this.slidingExpiry(session.absoluteExpiresAt) })
        .onConflictDoNothing();
      await tx.update(sessions).set({ lastUsedAt: now }).where(eq(sessions.id, session.id));
      await tx.insert(accessLog).values({ userId: session.userId, event: 'refresh', ip: ctx.ip, userAgent: ctx.userAgent });
      return { kind: 'ok', userId: session.userId, sessionId: session.id, refresh: next } as const;
    });

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
  async revokeSessions(
    executor: DbOrTx,
    userId: string,
    reason: string,
    options: { onlySessionId?: string; exceptSessionId?: string } = {},
  ): Promise<string[]> {
    const conditions = [eq(sessions.userId, userId), isNull(sessions.revokedAt)];
    if (options.onlySessionId) conditions.push(eq(sessions.id, options.onlySessionId));
    if (options.exceptSessionId) conditions.push(ne(sessions.id, options.exceptSessionId));
    const rows = await executor
      .update(sessions)
      .set({ revokedAt: new Date(), revokedReason: reason })
      .where(and(...conditions))
      .returning({ id: sessions.id });
    const ids = rows.map((row) => row.id);
    if (ids.length > 0) this.revoked$.next({ userId, sessionIds: ids, reason });
    return ids;
  }

  async markReauth(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async markMfaVerified(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ mfaVerifiedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  async touch(sessionId: string): Promise<void> {
    await this.db.update(sessions).set({ lastUsedAt: new Date() }).where(eq(sessions.id, sessionId));
  }

  /** Falha de verificação de sessão inexistente vira 401 padrão. */
  static unauthorized(): AppError {
    return errors.unauthenticated('Sua sessão foi encerrada. Entre de novo.');
  }
}
