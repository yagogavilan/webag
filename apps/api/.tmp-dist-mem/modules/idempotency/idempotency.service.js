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
import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { idempotencyKeys } from './db/schema.js';
const TTL_MS = 24 * 3600_000;
/** Reivindicação sem resposta há mais que isto é de um processo que caiu: a nova tentativa assume. */
const STALE_CLAIM_MS = 120_000;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;
export function parseIdempotencyKey(raw, required = false) {
    if (raw === undefined || raw === '') {
        if (required)
            throw errors.validation([{ field: 'Idempotency-Key', message: 'Envie o header Idempotency-Key.' }]);
        return null;
    }
    if (!IDEMPOTENCY_KEY_PATTERN.test(raw))
        throw errors.validation([{ field: 'Idempotency-Key', message: 'Use de 8 a 80 caracteres (letras, números, - e _).' }]);
    return raw;
}
export function hashRequest(payload) {
    return createHash('sha256').update(stableStringify(payload)).digest('hex');
}
function stableStringify(value) {
    if (value === null || typeof value !== 'object')
        return JSON.stringify(value) ?? 'null';
    if (Array.isArray(value))
        return `[${value.map(stableStringify).join(',')}]`;
    const entries = Object.entries(value).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}
let IdempotencyService = class IdempotencyService {
    db;
    constructor(db) {
        this.db = db;
    }
    /**
     * Executa `fn` uma única vez por (escopo, chave). Repetição igual devolve a resposta guardada; corpo diferente é 422;
     * repetição durante a execução é 409 (o app tenta de novo). Falha de `fn` libera a chave (a tentativa pode se repetir).
     * Sem chave (`key = null`), só executa.
     */
    async run(scope, key, payload, fn, options = {}) {
        if (!key)
            return fn();
        const requestHash = hashRequest(payload);
        for (let attempt = 0; attempt < 3; attempt++) {
            const [claimed] = await this.db
                .insert(idempotencyKeys)
                .values({ scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) })
                .onConflictDoNothing()
                .returning({ id: idempotencyKeys.id });
            if (claimed)
                return this.execute(claimed.id, fn, options.keepError);
            const [row] = await this.db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
            if (!row)
                continue; // apagada entre as duas consultas
            if (row.expiresAt <= new Date()) {
                await this.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.id, row.id), lt(idempotencyKeys.expiresAt, new Date())));
                continue;
            }
            if (row.requestHash !== requestHash) {
                throw new AppError(options.reusedStatus ?? 422, 'IDEMPOTENCY_KEY_REUSED', 'Chave de idempotência já usada com outro conteúdo', {
                    detail: 'Use uma nova Idempotency-Key para uma requisição diferente.',
                });
            }
            if (row.responseStatus !== null) {
                if (row.responseStatus >= 400)
                    throw this.replayError(row.responseStatus, row.responseBody);
                return row.responseBody;
            }
            if (Date.now() - row.createdAt.getTime() > STALE_CLAIM_MS) {
                await this.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.id, row.id), sql `${idempotencyKeys.responseStatus} is null`));
                continue;
            }
            throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento', { detail: 'A mesma requisição ainda está sendo processada. Tente de novo em instantes.', retryAfterSeconds: 2 });
        }
        throw errors.conflict('IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento');
    }
    async execute(id, fn, keepError = () => true) {
        try {
            const result = await fn();
            await this.db.update(idempotencyKeys).set({ responseStatus: 200, responseBody: (result ?? null) }).where(eq(idempotencyKeys.id, id));
            return result;
        }
        catch (error) {
            // I1: só o erro que `keepError` reconhece como DEFINITIVO (teve efeito ou não muda) fica guardado e se repete igual por 24 h.
            // Erro que depende do estado do mundo (loja fechada, 429, estoque) e erro inesperado liberam a chave: a repetição reavalia.
            if (error instanceof AppError && error.getStatus() < 500 && keepError(error)) {
                await this.db
                    .update(idempotencyKeys)
                    .set({ responseStatus: error.getStatus(), responseBody: { code: error.code, title: error.title, problem: error.problem } })
                    .where(eq(idempotencyKeys.id, id));
            }
            else {
                await this.db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
            }
            throw error;
        }
    }
    replayError(status, body) {
        const b = body;
        return new AppError(status, b.code, b.title, b.problem);
    }
    async purgeExpired() {
        const rows = await this.db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, new Date())).returning({ id: idempotencyKeys.id });
        return rows.length;
    }
};
IdempotencyService = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object])
], IdempotencyService);
export { IdempotencyService };
//# sourceMappingURL=idempotency.service.js.map