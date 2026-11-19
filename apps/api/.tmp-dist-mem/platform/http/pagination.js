import { sql } from 'drizzle-orm';
import { errors } from './app-error.js';
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 50;
/** `limit` da query: padrão 20, máximo 50 (SEC-066: `limit=1000` devolve no máximo 50). */
export function parseLimit(raw) {
    const value = Number(raw ?? DEFAULT_LIMIT);
    if (!Number.isInteger(value) || value < 1)
        return DEFAULT_LIMIT;
    return Math.min(value, MAX_LIMIT);
}
export const encodeCursor = (payload) => Buffer.from(JSON.stringify(payload)).toString('base64url');
export function decodeCursor(cursor) {
    if (typeof cursor !== 'string' || cursor === '')
        return null;
    try {
        const parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed))
            return parsed;
    }
    catch {
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
export function timestampCursorBefore(column, idColumn, cursor) {
    if (!cursor)
        return undefined;
    if (typeof cursor.at !== 'string' || Number.isNaN(Date.parse(cursor.at)) || typeof cursor.id !== 'string' || !UUID_RE.test(cursor.id)) {
        throw errors.validation([{ field: 'cursor', message: 'Cursor inválido.' }]);
    }
    return sql `(date_trunc('milliseconds', ${column}), ${idColumn}) < (${new Date(cursor.at).toISOString()}::timestamptz, ${cursor.id}::uuid)`;
}
/** `ORDER BY` correspondente (DESC) para `timestampCursorBefore`. */
export const timestampOrderDesc = (column, idColumn) => [sql `date_trunc('milliseconds', ${column}) desc`, sql `${idColumn} desc`];
//# sourceMappingURL=pagination.js.map