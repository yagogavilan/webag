import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { idempotencyKeys } from './db/schema.js';

const TTL_MS = 24 * 3600_000;
/** Reivindicação sem resposta há mais que isto é de um processo que caiu: a nova tentativa assume. */
const STALE_CLAIM_MS = 120_000;
export const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,80}$/;

export function parseIdempotencyKey(raw: string | undefined, required = false): string | null {
  if (raw === undefined || raw === '') {
    if (required) throw errors.validation([{ field: 'Idempotency-Key', message: 'Envie o header Idempotency-Key.' }]);
    return null;
  }
  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) throw errors.validation([{ field: 'Idempotency-Key', message: 'Use de 8 a 80 caracteres (letras, números, - e _).' }]);
  return raw;
}

export function hashRequest(payload: unknown): string {
  return createHash('sha256').update(stableStringify(payload)).digest('hex');
}

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') return JSON.stringify(value) ?? 'null';
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  const entries = Object.entries(value as Record<string, unknown>).filter(([, v]) => v !== undefined).sort(([a], [b]) => (a < b ? -1 : 1));
  return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${stableStringify(v)}`).join(',')}}`;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Executa `fn` uma única vez por (escopo, chave). Repetição igual devolve a resposta guardada; corpo diferente é 422;
   * repetição durante a execução é 409 (o app tenta de novo). Falha de `fn` libera a chave (a tentativa pode se repetir).
   * Sem chave (`key = null`), só executa.
   */
  async run<T>(scope: string, key: string | null, payload: unknown, fn: () => Promise<T>): Promise<T> {
    if (!key) return fn();
    const requestHash = hashRequest(payload);
    for (let attempt = 0; attempt < 3; attempt++) {
      const [claimed] = await this.db
        .insert(idempotencyKeys)
        .values({ scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) })
        .onConflictDoNothing()
        .returning({ id: idempotencyKeys.id });
      if (claimed) return this.execute(claimed.id, fn);

      const [row] = await this.db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
      if (!row) continue; // apagada entre as duas consultas
      if (row.expiresAt <= new Date()) {
        await this.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.id, row.id), lt(idempotencyKeys.expiresAt, new Date())));
        continue;
      }
      if (row.requestHash !== requestHash) {
        throw errors.unprocessable('IDEMPOTENCY_KEY_REUSED', 'Chave de idempotência já usada com outro conteúdo', {
          detail: 'Use uma nova Idempotency-Key para uma requisição diferente.',
        });
      }
      if (row.responseStatus !== null) {
        if (row.responseStatus >= 400) throw this.replayError(row.responseStatus, row.responseBody);
        return row.responseBody as T;
      }
      if (Date.now() - row.createdAt.getTime() > STALE_CLAIM_MS) {
        await this.db.delete(idempotencyKeys).where(and(eq(idempotencyKeys.id, row.id), sql`${idempotencyKeys.responseStatus} is null`));
        continue;
      }
      throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento', { detail: 'A mesma requisição ainda está sendo processada. Tente de novo em instantes.', retryAfterSeconds: 2 });
    }
    throw errors.conflict('IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento');
  }

  private async execute<T>(id: string, fn: () => Promise<T>): Promise<T> {
    try {
      const result = await fn();
      await this.db.update(idempotencyKeys).set({ responseStatus: 200, responseBody: (result ?? null) }).where(eq(idempotencyKeys.id, id));
      return result;
    } catch (error) {
      // Erro de negócio (4xx) é determinístico: guarda e repete igual. Erro inesperado libera a chave.
      if (error instanceof AppError && error.getStatus() < 500) {
        await this.db
          .update(idempotencyKeys)
          .set({ responseStatus: error.getStatus(), responseBody: { code: error.code, title: error.title, problem: error.problem } })
          .where(eq(idempotencyKeys.id, id));
      } else {
        await this.db.delete(idempotencyKeys).where(eq(idempotencyKeys.id, id));
      }
      throw error;
    }
  }

  private replayError(status: number, body: unknown): AppError {
    const b = body as { code: string; title: string; problem: AppError['problem'] };
    return new AppError(status, b.code, b.title, b.problem);
  }

  async purgeExpired(): Promise<number> {
    const rows = await this.db.delete(idempotencyKeys).where(lt(idempotencyKeys.expiresAt, new Date())).returning({ id: idempotencyKeys.id });
    return rows.length;
  }
}
