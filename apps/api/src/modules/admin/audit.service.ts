import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db, type DbOrTx } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { users } from '../identity/db/schema.js';
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
      userAgent: ctx.userAgent,
      requestId: ctx.requestId,
      reason: entry.reason ?? null,
    });
  }

  /** Registro fora de transação (ex.: acesso negado, onde não há mudança a desfazer). */
  recordStandalone(ctx: RequestContext, entry: AuditEntry): Promise<void> {
    return this.record(this.db, ctx, entry);
  }

  private where(filters: AuditFilters) {
    return and(
      filters.actorId ? eq(auditLog.actorId, filters.actorId) : undefined,
      filters.action ? eq(auditLog.action, filters.action) : undefined,
      filters.targetType ? eq(auditLog.targetType, filters.targetType) : undefined,
      filters.targetId ? eq(auditLog.targetId, filters.targetId) : undefined,
      filters.from ? gte(auditLog.at, filters.from) : undefined,
      filters.to ? lte(auditLog.at, filters.to) : undefined,
    );
  }

  private select() {
    return this.db
      .select({ entry: auditLog, actorName: users.name })
      .from(auditLog)
      .leftJoin(users, eq(users.id, auditLog.actorId));
  }

  /** Busca paginada por cursor (id decrescente). `actorName` vem do cadastro; `device` é o rótulo curto do aparelho. */
  async search(filters: AuditFilters): Promise<Page<AuditRow>> {
    const limit = parseLimit(filters.limit);
    const cursor = decodeCursor<{ id: number }>(filters.cursor);
    const rows = await this.select()
      .where(and(this.where(filters), cursor ? lt(auditLog.id, Number(cursor.id)) : undefined))
      .orderBy(desc(auditLog.id))
      .limit(limit + 1);
    const data = rows.slice(0, limit).map(toRow);
    const last = data.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null };
  }

  /** Exportação (CSV): até `EXPORT_MAX_ROWS` linhas mais recentes dentro dos filtros. */
  async export(filters: AuditFilters): Promise<{ rows: AuditRow[]; truncated: boolean }> {
    const rows = await this.select().where(this.where(filters)).orderBy(desc(auditLog.id)).limit(EXPORT_MAX_ROWS + 1);
    return { rows: rows.slice(0, EXPORT_MAX_ROWS).map(toRow), truncated: rows.length > EXPORT_MAX_ROWS };
  }
}

export const EXPORT_MAX_ROWS = 5000;

export type AuditRow = Omit<typeof auditLog.$inferSelect, 'userAgent'> & { actorName: string | null; device: string | null };

/** "Chrome em Windows": rótulo curto do aparelho, sem guardar mais do que o cabeçalho já traz. */
export function deviceLabel(userAgent: string | null): string | null {
  if (!userAgent) return null;
  const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : /okhttp|Expo|CFNetwork/i.test(userAgent) ? 'App' : 'Outro';
  const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : null;
  return os ? `${browser} em ${os}` : browser;
}

function toRow({ entry, actorName }: { entry: typeof auditLog.$inferSelect; actorName: string | null }): AuditRow {
  const { userAgent, ...rest } = entry;
  return { ...rest, actorName, device: deviceLabel(userAgent) };
}
