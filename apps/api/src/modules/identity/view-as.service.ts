import { createHash, randomBytes } from 'node:crypto';
import { Inject, Injectable, Logger, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Response } from 'express';
import { Redis } from 'ioredis';
import { VIEW_AS, type AuthedRequest, type Principal, type RequestContext } from '../../platform/auth/decorators.js';
import { ADMIN_PERMISSIONS, adminHasPermission } from '../../platform/auth/permissions.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { REDIS } from '../../platform/redis/redis.module.js';
import { AuditService, ParametersService } from '../admin/index.js';
import { adminViewSessions, sessions, type VIEW_AS_CLOSE_CAUSES, type VIEW_AS_REASON_CODES } from './db/schema.js';

type CloseCause = (typeof VIEW_AS_CLOSE_CAUSES)[number];
type ViewRow = typeof adminViewSessions.$inferSelect;

/** Formato da credencial (threat model §14.4 passo 4): `vas_` + 32 bytes em base64url. */
export const VIEW_AS_TOKEN = /^vas_[A-Za-z0-9_-]{43}$/;
export const VIEW_AS_TTL_MS = 30 * 60_000;
/** Limites [HIPÓTESE, §14.7]: parâmetros de código até o Security confirmar os números. */
export const VIEW_AS_LIMITS = { opensPerHour: 10, readsPerMinute: 120, denialsToAbuse: 20, storesPerDayAlert: 20, deniedAuditWindowSeconds: 60, sweepMs: 10 * 60_000 } as const;

export type ViewAsDenial = 'VIEW_AS_READ_ONLY' | 'VIEW_AS_EXPIRED';
const MESSAGES: Record<ViewAsDenial, string> = {
  VIEW_AS_READ_ONLY: 'A visualização do admin é somente leitura.',
  VIEW_AS_EXPIRED: 'A visualização terminou. Abra de novo para continuar.',
};

export const hashViewAsToken = (token: string): string => createHash('sha256').update(token).digest('hex');
export const newViewAsToken = (): string => `vas_${randomBytes(32).toString('base64url')}`;

/**
 * Classifica o cabeçalho `X-View-As` (§15.2): vazio ou REPETIDO (ou com vírgula) = `READ_ONLY`; formato inválido = `EXPIRED`. Pura, testável sem banco.
 * `occurrences` conta as linhas `X-View-As` na requisição crua (o Node junta as repetidas com ", ").
 */
export function classifyViewAsHeader(value: unknown, occurrences: number): { ok: true; token: string } | { ok: false; code: ViewAsDenial } {
  if (occurrences !== 1 || typeof value !== 'string' || value === '' || value.includes(',')) return { ok: false, code: 'VIEW_AS_READ_ONLY' };
  if (!VIEW_AS_TOKEN.test(value)) return { ok: false, code: 'VIEW_AS_EXPIRED' };
  return { ok: true, token: value };
}

export function viewAsHeaderOccurrences(req: { rawHeaders?: string[] }): number {
  let n = 0;
  for (let i = 0; i < (req.rawHeaders?.length ?? 0); i += 2) if (req.rawHeaders?.[i]?.toLowerCase() === 'x-view-as') n += 1;
  return n;
}

export const viewAsDenied = (code: ViewAsDenial): AppError => errors.forbidden(code, MESSAGES[code]);

export interface ViewAsOpened {
  id: string;
  token: string;
  storeId: string;
  expiresAt: Date;
  reason: { code: (typeof VIEW_AS_REASON_CODES)[number]; note?: string };
}

/**
 * "Ver como o lojista" (WB-352, ADR-018 D8, threat model §14). A credencial `vas_` NÃO autentica: qualifica uma requisição já autenticada como do
 * admin que abriu a visão (mesma sessão). `authorize` roda no `AuthGuard` (passo de loja, só quando o cabeçalho existe) e NEGA POR PADRÃO.
 */
@Injectable()
export class ViewAsService implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly logger = new Logger(ViewAsService.name);
  private timer: NodeJS.Timeout | undefined;

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    @Inject(REDIS) private readonly redis: Redis,
    private readonly reflector: Reflector,
    private readonly params: ParametersService,
  ) {}

  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test' || process.env.WEBAG_CLI === '1') return;
    this.timer = setInterval(() => void this.sweep().catch((e: Error) => this.logger.error(e.message)), VIEW_AS_LIMITS.sweepMs).unref();
  }

  onApplicationShutdown(): void {
    if (this.timer) clearInterval(this.timer);
  }

  // ===================================================================== abrir e encerrar

  async open(principal: Principal, storeId: string, reason: { code: (typeof VIEW_AS_REASON_CODES)[number]; note?: string | undefined }, ctx: RequestContext): Promise<ViewAsOpened> {
    await this.limiter.enforce(`rl:view-as-open:${principal.userId}`, VIEW_AS_LIMITS.opensPerHour, 3600);
    const [session] = await this.db.select({ absoluteExpiresAt: sessions.absoluteExpiresAt }).from(sessions).where(eq(sessions.id, principal.sessionId));
    if (!session) throw errors.unauthenticated();
    const now = new Date();
    const expiresAt = new Date(Math.min(now.getTime() + VIEW_AS_TTL_MS, session.absoluteExpiresAt.getTime()));
    const token = newViewAsToken();
    const previous = await this.openOf(principal.userId);
    const previousStats = previous ? await this.stats(previous.id) : null;
    let row: ViewRow;
    try {
      row = await this.db.transaction(async (tx) => {
        // Uma visão ativa por admin: abrir outra encerra a anterior (`replaced`) na mesma transação.
        const replaced = await tx.update(adminViewSessions).set({ closedAt: now, closeCause: 'replaced' }).where(and(eq(adminViewSessions.adminUserId, principal.userId), isNull(adminViewSessions.closedAt))).returning();
        for (const old of replaced) {
          await this.audit.record(tx, ctx, { action: 'view_as.close', targetType: 'store', targetId: old.storeId, storeId: old.storeId, after: { viewAsId: old.id, cause: 'replaced', ...(previousStats?.id === old.id ? previousStats.counts : { reads: 0, byOperation: {} }) } });
        }
        const [inserted] = await tx
          .insert(adminViewSessions)
          .values({ tokenHash: hashViewAsToken(token), adminUserId: principal.userId, adminSessionId: principal.sessionId, storeId, reasonCode: reason.code, reasonNote: reason.note ?? null, openedAt: now, expiresAt })
          .returning();
        if (!inserted) throw new Error('visão não criada');
        // A auditoria vai na MESMA transação, antes de a credencial ser devolvida: se falhar, nada fica (VA-19).
        await this.audit.record(tx, ctx, {
          action: 'view_as.open',
          targetType: 'store',
          targetId: storeId,
          storeId,
          // `sanitizeForAudit` esconde chave que contém "code"/"token": o motivo vai como `motive`.
          after: { viewAsId: inserted.id, adminSessionId: principal.sessionId, motive: reason.code, motiveNote: reason.note ?? null, expiresAt: expiresAt.toISOString() },
          reason: reason.note ?? reason.code,
        });
        return inserted;
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('VIEW_AS_OPEN_CONFLICT', 'Já há uma abertura em andamento', 'Duas aberturas ao mesmo tempo. Tente de novo.');
      throw error;
    }
    if (previous) await this.redis.del(this.readsKey(previous.id), this.deniesKey(previous.id)).catch(() => undefined);
    await this.noteDistinctStore(principal.userId, storeId);
    return { id: row.id, token, storeId, expiresAt, reason: { code: reason.code, ...(reason.note ? { note: reason.note } : {}) } };
  }

  /** `endViewAs`: só o admin que abriu; a de outro admin é 404. Já encerrada: 204 sem nova linha (idempotente). */
  async end(principal: Principal, viewAsId: string, ctx: RequestContext): Promise<void> {
    const [row] = await this.db.select().from(adminViewSessions).where(and(eq(adminViewSessions.id, viewAsId), eq(adminViewSessions.adminUserId, principal.userId)));
    if (!row) throw errors.notFound('Visualização não encontrada.');
    if (row.closedAt) return;
    await this.close(row, 'ended', new Date(), ctx);
  }

  // ===================================================================== autorizar (AuthGuard, passo de loja)

  /**
   * §14.4, nesta ordem e negando por padrão: (1) método GET/HEAD; (2) handler com `@ViewAs`; (3) admin com `view-as:open`; (4) formato; (5) linha por
   * SHA-256 do mesmo admin e da MESMA sessão, aberta e não vencida; (6) `:storeId` da rota = loja da linha; (7) limite de leituras.
   * Erro de formato do cabeçalho: ver `classifyViewAsHeader`. Preenche `req.viewAs` e `req.storeAccess`; `req.principal` fica como o do admin.
   */
  async authorize(req: AuthedRequest, res: Response, principal: Principal, handler: object): Promise<void> {
    res.setHeader('Cache-Control', 'private, no-store');
    const header = classifyViewAsHeader(req.headers['x-view-as'], viewAsHeaderOccurrences(req));
    if (req.method !== 'GET' && req.method !== 'HEAD') await this.deny(req, principal, 'VIEW_AS_READ_ONLY');
    const operationId = this.reflector.get<string | undefined>(VIEW_AS, handler as never);
    if (!operationId) await this.deny(req, principal, 'VIEW_AS_READ_ONLY');
    if (!header.ok) await this.deny(req, principal, header.code);
    if (!principal.adminProfile || !adminHasPermission(principal.adminProfile, 'view-as:open')) await this.deny(req, principal, 'VIEW_AS_EXPIRED');
    const token = header.ok ? header.token : '';
    const [row] = await this.db
      .select()
      .from(adminViewSessions)
      .where(and(eq(adminViewSessions.tokenHash, hashViewAsToken(token)), eq(adminViewSessions.adminUserId, principal.userId), eq(adminViewSessions.adminSessionId, principal.sessionId), isNull(adminViewSessions.closedAt), sql`${adminViewSessions.expiresAt} > now()`));
    if (!row) return this.deny(req, principal, 'VIEW_AS_EXPIRED');
    const routeStore = (req.params as Record<string, string | undefined>).storeId;
    if (!routeStore || routeStore.toLowerCase() !== row.storeId) return this.deny(req, principal, 'VIEW_AS_EXPIRED');
    await this.limiter.enforce(`rl:view-as:${row.id}`, VIEW_AS_LIMITS.readsPerMinute, 60, false);
    req.viewAs = { id: row.id, storeId: row.storeId, adminUserId: row.adminUserId, adminSessionId: row.adminSessionId, reasonCode: row.reasonCode, expiresAt: row.expiresAt, level: 'viewer' };
    req.storeAccess = 'viewer';
    await this.countRead(row.id, operationId as string);
    const resource = Object.entries(req.params as Record<string, string>).find(([k]) => k !== 'storeId')?.[1];
    this.logger.log({ event: 'view_as.read', viewAsId: row.id, adminId: principal.userId, storeId: row.storeId, operationId, ...(resource ? { resourceId: resource } : {}) });
  }

  /** Nega com o código certo, registra (no máximo 1 linha por minuto por sessão e código) e conta rumo ao encerramento por abuso. Sempre lança. */
  async deny(req: AuthedRequest, principal: Principal | undefined, code: ViewAsDenial): Promise<never> {
    if (principal) await this.recordDenied(req, principal, code).catch((e: Error) => this.logger.warn(`view_as.denied: ${e.message}`));
    throw viewAsDenied(code);
  }

  private async recordDenied(req: AuthedRequest, principal: Principal, code: ViewAsDenial): Promise<void> {
    const open = await this.openOf(principal.userId);
    const gate = await this.redis.set(`view-as:denied-audit:${principal.sessionId}:${code}`, '1', 'EX', VIEW_AS_LIMITS.deniedAuditWindowSeconds, 'NX');
    if (gate === 'OK') {
      await this.audit.recordStandalone(this.ctxOf(req, principal), {
        action: 'view_as.denied',
        targetType: 'route',
        targetId: `${req.method} ${req.path}`,
        ...(open ? { storeId: open.storeId } : {}),
        after: { denial: code, method: req.method, ...(open ? { viewAsId: open.id } : {}) },
      });
    }
    if (!open) return;
    const denies = await this.redis.incr(this.deniesKey(open.id));
    if (denies === 1) await this.redis.expire(this.deniesKey(open.id), 3600);
    if (denies >= VIEW_AS_LIMITS.denialsToAbuse) await this.close(open, 'abuse', new Date(), this.ctxOf(req, principal));
  }

  // ===================================================================== encerramento e varredura

  /** Fecha a linha (uma vez só) e grava `view_as.close` com a causa e as leituras por `operationId`. */
  private async close(row: ViewRow, cause: CloseCause, at: Date, ctx: RequestContext): Promise<boolean> {
    const stats = await this.stats(row.id);
    const closed = await this.db.transaction(async (tx) => {
      const [done] = await tx.update(adminViewSessions).set({ closedAt: at, closeCause: cause }).where(and(eq(adminViewSessions.id, row.id), isNull(adminViewSessions.closedAt))).returning({ id: adminViewSessions.id });
      if (!done) return false;
      // I4: sem principal na chamada (varredura) o autor é o SISTEMA (`actorId` nulo, `actorRole` 'system'), nunca o admin com papel nulo, que o histórico leria como "lojista".
      // De quem era a visão fica em `after.adminUserId`. Encerramento pelo próprio admin ou por abuso (há principal) segue com o admin como autor.
      const bySystem = !ctx.principal;
      await this.audit.record(tx, ctx, {
        action: 'view_as.close',
        targetType: 'store',
        targetId: row.storeId,
        storeId: row.storeId,
        actorId: bySystem ? null : row.adminUserId,
        ...(bySystem ? { actorRole: 'system' } : {}),
        after: { viewAsId: row.id, cause, at: at.toISOString(), ...(bySystem ? { adminUserId: row.adminUserId } : {}), ...stats.counts },
      });
      return true;
    });
    if (closed) await this.redis.del(this.readsKey(row.id), this.deniesKey(row.id)).catch(() => undefined);
    return closed;
  }

  /**
   * Varredura de 10 min: vencida = `expired` (com `at = expires_at`); sessão do admin revogada, vencida ou inativa = `session_ended`; perfil sem
   * `view-as:open` ou admin desativado = `permission_lost`. Devolve quantas linhas fechou.
   */
  async sweep(): Promise<number> {
    const idleMin = await this.params.getNumber('admin_inatividade_min');
    const rows = await this.db.execute<{ id: string; why: string }>(sql`
      select v.id,
        case when v.expires_at <= now() then 'expired'
             when s.revoked_at is not null or s.absolute_expires_at <= now() or u.status <> 'active' or s.last_used_at < now() - make_interval(mins => ${idleMin}) then 'session_ended'
             else 'permission_lost' end as why
        from admin_view_sessions v
        left join sessions s on s.id = v.admin_session_id
        left join users u on u.id = v.admin_user_id
        left join admin_profiles a on a.user_id = v.admin_user_id
       where v.closed_at is null
         and (v.expires_at <= now() or s.id is null or s.revoked_at is not null or s.absolute_expires_at <= now() or u.status <> 'active' or s.last_used_at < now() - make_interval(mins => ${idleMin})
              or a.user_id is null or a.active = false or a.profile not in (${sql.join(VIEW_AS_PROFILES.map((p) => sql`${p}`), sql`, `)}))`);
    let closed = 0;
    for (const { id, why } of rows.rows) {
      const [row] = await this.db.select().from(adminViewSessions).where(eq(adminViewSessions.id, id));
      if (!row || row.closedAt) continue;
      const cause = why as CloseCause;
      const at = cause === 'expired' ? row.expiresAt : new Date();
      if (await this.close(row, cause, at, SYSTEM_CTX)) closed += 1;
    }
    return closed;
  }

  // ===================================================================== apoio

  private openOf(adminUserId: string): Promise<ViewRow | null> {
    return this.db.select().from(adminViewSessions).where(and(eq(adminViewSessions.adminUserId, adminUserId), isNull(adminViewSessions.closedAt))).then((r) => r[0] ?? null);
  }

  private readsKey = (id: string): string => `view-as:reads:${id}`;
  private deniesKey = (id: string): string => `view-as:denies:${id}`;

  private async countRead(id: string, operationId: string): Promise<void> {
    try {
      await this.redis.multi().hincrby(this.readsKey(id), operationId, 1).expire(this.readsKey(id), 7200).exec();
    } catch (error) {
      this.logger.warn(`contador de leituras indisponível: ${(error as Error).message}`);
    }
  }

  private async stats(id: string): Promise<{ id: string; counts: { reads: number; byOperation: Record<string, number> } }> {
    const byOperation: Record<string, number> = {};
    try {
      for (const [op, n] of Object.entries(await this.redis.hgetall(this.readsKey(id)))) byOperation[op] = Number(n);
    } catch {
      /* contador é melhor-esforço */
    }
    return { id, counts: { reads: Object.values(byOperation).reduce((a, b) => a + b, 0), byOperation } };
  }

  /** Alerta à operação acima de 20 lojas distintas por dia por admin [HIPÓTESE, §14.7]; hoje é um log `warn` (o painel de alertas vem depois). */
  private async noteDistinctStore(adminId: string, storeId: string): Promise<void> {
    try {
      const key = `view-as:stores:${adminId}:${new Date().toISOString().slice(0, 10)}`;
      await this.redis.sadd(key, storeId);
      await this.redis.expire(key, 2 * 86_400);
      const n = await this.redis.scard(key);
      if (n > VIEW_AS_LIMITS.storesPerDayAlert) this.logger.warn({ event: 'view_as.many_stores', adminId, stores: n });
    } catch {
      /* melhor-esforço */
    }
  }

  private ctxOf(req: AuthedRequest, principal: Principal): RequestContext {
    return { ip: req.ip ?? null, userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null, requestId: typeof req.id === 'string' ? req.id : null, deviceId: null, principal };
  }
}

const VIEW_AS_PROFILES: readonly string[] = ADMIN_PERMISSIONS['view-as:open'];
const SYSTEM_CTX: RequestContext = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

function isUniqueViolation(error: unknown): boolean {
  const code = (error as { code?: string; cause?: { code?: string } } | null);
  return code?.code === '23505' || code?.cause?.code === '23505';
}
