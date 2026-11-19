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
import { and, desc, eq, gte, lt, lte } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { users } from '../identity/db/schema.js';
import { auditLog } from './db/schema.js';
const SENSITIVE_KEY = /pass|secret|token|code|hash|totp|recovery|authorization|cookie/i;
/** Remove segredos antes de gravar (SEC-074: "antes/depois sem segredos"). */
export function sanitizeForAudit(value) {
    if (value === null || value === undefined)
        return null;
    const walk = (input) => {
        if (Array.isArray(input))
            return input.map(walk);
        if (input instanceof Date)
            return input.toISOString();
        if (input && typeof input === 'object') {
            return Object.fromEntries(Object.entries(input).map(([key, val]) => [key, SENSITIVE_KEY.test(key) ? '[REDACTED]' : walk(val)]));
        }
        return input;
    };
    return walk(value);
}
/**
 * Trilha de auditoria (WB-123, SEC-074). A gravação recebe o mesmo `tx` da mudança: se o log falhar, a ação
 * inteira é desfeita (falha fechada, WB-123 C4). A tabela é append-only no banco (migração append_only_guards).
 */
let AuditService = class AuditService {
    db;
    constructor(db) {
        this.db = db;
    }
    async record(executor, ctx, entry) {
        const actorRole = entry.actorRole !== undefined ? entry.actorRole : (ctx.principal?.adminProfile ?? ctx.principal?.roles.join(',') ?? null);
        // SEC-159: ação do PRÓPRIO cliente não grava IP nem aparelho aqui (o `access_log` já guarda por 6 meses, Marco Civil art. 15); a trilha
        // de admin, lojista e equipe mantém (SEC-074, prova de quem opera).
        const ownCustomerAction = actorRole === 'customer';
        await executor.insert(auditLog).values({
            actorId: entry.actorId !== undefined ? entry.actorId : (ctx.principal?.userId ?? null),
            actorRole,
            action: entry.action,
            targetType: entry.targetType ?? null,
            targetId: entry.targetId ?? null,
            before: sanitizeForAudit(entry.before),
            after: sanitizeForAudit(entry.after),
            ip: ownCustomerAction ? null : ctx.ip,
            userAgent: ownCustomerAction ? null : ctx.userAgent,
            requestId: ctx.requestId,
            reason: entry.reason ?? null,
        });
    }
    /** Registro fora de transação (ex.: acesso negado, onde não há mudança a desfazer). */
    recordStandalone(ctx, entry) {
        return this.record(this.db, ctx, entry);
    }
    where(filters) {
        return and(filters.actorId ? eq(auditLog.actorId, filters.actorId) : undefined, filters.action ? eq(auditLog.action, filters.action) : undefined, filters.targetType ? eq(auditLog.targetType, filters.targetType) : undefined, filters.targetId ? eq(auditLog.targetId, filters.targetId) : undefined, filters.from ? gte(auditLog.at, filters.from) : undefined, filters.to ? lte(auditLog.at, filters.to) : undefined);
    }
    select() {
        return this.db
            .select({ entry: auditLog, actorName: users.name })
            .from(auditLog)
            .leftJoin(users, eq(users.id, auditLog.actorId));
    }
    /** Busca paginada por cursor (id decrescente). `actorName` vem do cadastro; `device` é o rótulo curto do aparelho. */
    async search(filters) {
        const limit = parseLimit(filters.limit);
        const cursor = decodeCursor(filters.cursor);
        const rows = await this.select()
            .where(and(this.where(filters), cursor ? lt(auditLog.id, Number(cursor.id)) : undefined))
            .orderBy(desc(auditLog.id))
            .limit(limit + 1);
        const data = rows.slice(0, limit).map(toRow);
        const last = data.at(-1);
        return { data, nextCursor: rows.length > limit && last ? encodeCursor({ id: last.id }) : null };
    }
    /** Exportação (CSV): até `EXPORT_MAX_ROWS` linhas mais recentes dentro dos filtros. */
    async export(filters) {
        const rows = await this.select().where(this.where(filters)).orderBy(desc(auditLog.id)).limit(EXPORT_MAX_ROWS + 1);
        return { rows: rows.slice(0, EXPORT_MAX_ROWS).map(toRow), truncated: rows.length > EXPORT_MAX_ROWS };
    }
};
AuditService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], AuditService);
export { AuditService };
export const EXPORT_MAX_ROWS = 5000;
/** "Chrome em Windows": rótulo curto do aparelho, sem guardar mais do que o cabeçalho já traz. */
export function deviceLabel(userAgent) {
    if (!userAgent)
        return null;
    const browser = /Edg\//.test(userAgent) ? 'Edge' : /Firefox\//.test(userAgent) ? 'Firefox' : /Chrome\//.test(userAgent) ? 'Chrome' : /Safari\//.test(userAgent) ? 'Safari' : /okhttp|Expo|CFNetwork/i.test(userAgent) ? 'App' : 'Outro';
    const os = /Windows/.test(userAgent) ? 'Windows' : /Android/.test(userAgent) ? 'Android' : /iPhone|iPad|iOS/.test(userAgent) ? 'iOS' : /Mac OS X|Macintosh/.test(userAgent) ? 'macOS' : /Linux/.test(userAgent) ? 'Linux' : null;
    return os ? `${browser} em ${os}` : browser;
}
function toRow({ entry, actorName }) {
    const { userAgent, ...rest } = entry;
    return { ...rest, actorName, device: deviceLabel(userAgent) };
}
//# sourceMappingURL=audit.service.js.map