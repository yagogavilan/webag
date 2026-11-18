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
