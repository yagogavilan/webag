import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { auditLog } from './db/schema.js';

export interface AuditEntry {
  action: string;
  targetType?: string;
  targetId?: string;
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
  reason?: string;
  /** Ator explícito (ex.: ação sem sessão, como convite aceito). Por padrão vem do contexto. */
  actorId?: string | null;
  actorRole?: string | null;
}

export interface AuditFilters {
  actorId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  from?: Date;
  to?: Date;
  cursor?: string;
  limit?: unknown;
}

const SENSITIVE_KEY = /pass|secret|token|code|hash|totp|recovery|authorization|cookie/i;

/** Remove segredos antes de gravar (SEC-074: "antes/depois sem segredos"). */
export function sanitizeForAudit(value: unknown): Record<string, unknown> | null {
  if (value === null || value === undefined) return null;
  const walk = (input: unknown): unknown => {
    if (Array.isArray(input)) return input.map(walk);
    if (input instanceof Date) return input.toISOString();
    if (input && typeof input === 'object') {
      return Object.fromEntries(
        Object.entries(input).map(([key, val]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : walk(val)]),
      );
    }
    return input;
  };
  return walk(value) as Record<string, unknown>;
}

/**
 * Trilha de auditoria (WB-123, SEC-074). A gravação recebe o mesmo `tx` da mudança: se o log falhar, a ação
 * inteira é desfeita (falha fechada, WB-123 C4). A tabela é append-only no banco (migração append_only_guards).
 */
@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  async record(executor: DbOrTx, ctx: RequestContext, entry: AuditEntry): Promise<void> {
    await executor.insert(auditLog).values({
      actorId: entry.actorId !== undefined ? entry.actorId : (ctx.principal?.userId ?? null),
      actorRole: entry.actorRole !== undefined ? entry.actorRole : (ctx.principal?.adminProfile ?? ctx.principal?.roles.join(',') ?? null),
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      before: sanitizeForAudit(entry.before),
      after: sanitizeForAudit(entry.after),
      ip: ctx.ip,
      requestId: ctx.requestId,
      reason: entry.reason ?? null,
    });
  }

  /** Registro fora de transação (ex.: acesso negado, onde não há mudança a desfazer). */
  recordStandalone(ctx: RequestContext, entry: AuditEntry): Promise<void> {
    return this.record(this.db, ctx, entry);
  }

  async search(filters: AuditFilters): Promise<Page<typeof auditLog.$inferSelect>> {
    const limit = parseLimit(filters.limit);
    const cursor = decodeCursor<{ id: number }>(filters.cursor);
    const where = and(
      filters.actorId ? eq(auditLog.actorId, filters.actorId) : undefined,
      filters.action ? eq(auditLog.action, filters.action) : undefined,
      filters.targetType ? eq(auditLog.targetType, filters.targetType) : undefined,
      filters.targetId ? eq(auditLog.targetId, filters.targetId) : undefined,
      filters.from ? gte(auditLog.at, filters.from) : undefined,
      filters.to ? lte(auditLog.at, filters.to) : undefined,
      cursor ? lt(auditLog.id, Number(cursor.id)) : undefined,
    );
    const rows = await this.db.select().from(auditLog).where(where).orderBy(desc(auditLog.id)).limit(limit + 1);
    const data = rows.slice(0, limit);
    const last = data.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null };
  }
}
