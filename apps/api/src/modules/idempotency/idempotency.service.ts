import { createHash } from 'node:crypto';
import { Inject, Injectable } from '@nestjs/common';
import { and, eq, lt, sql } from 'drizzle-orm';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
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

export interface IdempotencyOptions {
  reusedStatus?: number;
  /** Decide se um erro de negócio (4xx) é definitivo e deve ser repetido igual. Padrão: todo 4xx (compatível com o uso antigo). */
  keepError?: (error: AppError) => boolean;
}

@Injectable()
export class IdempotencyService {
  constructor(@Inject(DRIZZLE) private readonly db: Db) {}

  /**
   * Executa `fn` uma única vez por (escopo, chave). Repetição igual devolve a resposta guardada; corpo diferente é 422;
   * repetição durante a execução é 409 (o app tenta de novo). Falha de `fn` libera a chave (a tentativa pode se repetir).
   * Sem chave (`key = null`), só executa.
   */
  async run<T>(scope: string, key: string | null, payload: unknown, fn: () => Promise<T>, options: IdempotencyOptions = {}): Promise<T> {
    if (!key) return fn();
    const requestHash = hashRequest(payload);
    for (let attempt = 0; attempt < 3; attempt++) {
      const [claimed] = await this.db
        .insert(idempotencyKeys)
        .values({ scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) })
        .onConflictDoNothing()
        .returning({ id: idempotencyKeys.id });
      if (claimed) return this.execute(claimed.id, fn, options.keepError);

      const [row] = await this.db.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
      if (!row) continue; // apagada entre as duas consultas
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

  /**
   * SEC-208 / ADR-018 D18: reivindicação da chave, efeito de negócio e resposta guardada na MESMA transação. Se a transação não commita
   * (erro de `fn`, versão que não bate, queda do processo), nada fica: nem efeito, nem chave órfã, e a repetição executa do zero. Se commita,
   * a resposta guardada existe junto, então a repetição devolve o mesmo corpo e NUNCA reaplica (+10% aplicado duas vezes).
   *
   * Diferenças para `run` (de propósito): (a) sem `STALE_CLAIM_MS` (linha sem resposta só existe enquanto a transação está aberta; o `unique` faz a
   * concorrente ESPERAR o commit ou o rollback da primeira, e então repete ou executa); (b) qualquer erro de `fn` desfaz tudo e libera a chave
   * (erro 4xx de estado, como `BULK_VERSION_CONFLICT`, exige refazer a prévia; não é resposta para repetir); (c) o escopo é montado por quem chama
   * como `rota:storeId:userId`, nunca só a rota. `fn` recebe a transação e TEM de gravar tudo por ela.
   */
  async runInTransaction<T>(scope: string, key: string, payload: unknown, fn: (tx: Tx) => Promise<T>): Promise<T> {
    const requestHash = hashRequest(payload);
    return this.db.transaction(async (tx) => {
      // Chave vencida (24 h) some antes de reivindicar: a mesma chave volta a valer como nova.
      await tx.delete(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key), lt(idempotencyKeys.expiresAt, new Date())));
      const [claimed] = await tx
        .insert(idempotencyKeys)
        .values({ scope, key, requestHash, expiresAt: new Date(Date.now() + TTL_MS) })
        .onConflictDoNothing()
        .returning({ id: idempotencyKeys.id });
      if (!claimed) {
        // O `INSERT ... ON CONFLICT DO NOTHING` só chega aqui depois que a transação que tinha a chave terminou: a linha lida é a COMMITADA.
        const [row] = await tx.select().from(idempotencyKeys).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
        if (!row) throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento', { detail: 'A mesma requisição ainda está sendo processada. Tente de novo em instantes.', retryAfterSeconds: 2 });
        if (row.requestHash !== requestHash) {
          throw new AppError(422, 'IDEMPOTENCY_KEY_REUSED', 'Chave de idempotência já usada com outro conteúdo', { detail: 'Use uma nova Idempotency-Key para uma requisição diferente.' });
        }
        if (row.responseStatus === null) throw new AppError(409, 'IDEMPOTENCY_IN_PROGRESS', 'Requisição em andamento', { detail: 'A mesma requisição ainda está sendo processada. Tente de novo em instantes.', retryAfterSeconds: 2 });
        return row.responseBody as T;
      }
      const result = await fn(tx);
      await tx.update(idempotencyKeys).set({ responseStatus: 200, responseBody: result ?? null }).where(eq(idempotencyKeys.id, claimed.id));
      return result;
    });
  }

  private async execute<T>(id: string, fn: () => Promise<T>, keepError: (error: AppError) => boolean = () => true): Promise<T> {
    try {
      const result = await fn();
      await this.db.update(idempotencyKeys).set({ responseStatus: 200, responseBody: (result ?? null) }).where(eq(idempotencyKeys.id, id));
      return result;
    } catch (error) {
      // I1: só o erro que `keepError` reconhece como DEFINITIVO (teve efeito ou não muda) fica guardado e se repete igual por 24 h.
      // Erro que depende do estado do mundo (loja fechada, 429, estoque) e erro inesperado liberam a chave: a repetição reavalia.
      if (error instanceof AppError && error.getStatus() < 500 && keepError(error)) {
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
