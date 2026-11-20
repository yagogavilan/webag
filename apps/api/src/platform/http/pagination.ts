import { sql, type SQL, type SQLWrapper } from 'drizzle-orm';
import { z } from 'zod';
import { errors } from './app-error.js';

export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

/** `limit` da query: padrão 20, máximo 50 (SEC-066: `limit=1000` devolve no máximo 50). */
export function parseLimit(raw: unknown): number {
  const value = Number(raw ?? DEFAULT_LIMIT);
  if (!Number.isInteger(value) || value < 1) return DEFAULT_LIMIT;
  return Math.min(value, MAX_LIMIT);
}

/**
 * BUG-027: `limit` da query nas listas paginadas (contrato `Limit`: inteiro de 1 a 50). Fora da faixa ou não numérico = 400 VALIDATION_FAILED
 * (antes era ajustado em silêncio). Continua string para os serviços, que chamam `parseLimit` (padrão 20 quando ausente).
 */
export const limitQuery = z
  .string()
  .regex(/^\d{1,3}$/, 'limit deve ser um inteiro de 1 a 50.')
  .refine((value) => Number(value) >= 1 && Number(value) <= MAX_LIMIT, 'limit deve ser um inteiro de 1 a 50.')
  .optional();

export const encodeCursor = (payload: Record<string, string | number>): string =>
  Buffer.from(JSON.stringify(payload)).toString('base64url');

export function decodeCursor<T extends Record<string, string | number>>(cursor: unknown): T | null {
  if (typeof cursor !== 'string' || cursor === '') return null;
  try {
    const parsed: unknown = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as T;
  } catch {
    // cai no erro abaixo
  }
  throw errors.validation([{ field: 'cursor', message: 'Cursor inválido.' }]);
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Cursor por (timestamp, id) estável (I3): o cursor leva o instante em milissegundos (ISO do `Date`), mas a coluna
 * `timestamptz` tem microssegundos. Comparar e ordenar sempre por `date_trunc('milliseconds', col)` + id.
 * Ordem DESC: a próxima página é "estritamente anterior" ao cursor.
 */
export function timestampCursorBefore(column: SQLWrapper, idColumn: SQLWrapper, cursor: { at: string; id: string } | null): SQL | undefined {
  if (!cursor) return undefined;
  if (typeof cursor.at !== 'string' || Number.isNaN(Date.parse(cursor.at)) || typeof cursor.id !== 'string' || !UUID_RE.test(cursor.id)) {
    throw errors.validation([{ field: 'cursor', message: 'Cursor inválido.' }]);
  }
  return sql`(date_trunc('milliseconds', ${column}), ${idColumn}) < (${new Date(cursor.at).toISOString()}::timestamptz, ${cursor.id}::uuid)`;
}

/** `ORDER BY` correspondente (DESC) para `timestampCursorBefore`. */
export const timestampOrderDesc = (column: SQLWrapper, idColumn: SQLWrapper): SQL[] => [sql`date_trunc('milliseconds', ${column}) desc`, sql`${idColumn} desc`];
