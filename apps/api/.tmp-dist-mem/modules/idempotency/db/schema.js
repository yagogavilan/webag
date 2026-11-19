import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
/**
 * `Idempotency-Key` de escrita repetida pelo app em rede instável (contrato-api, I4/I9). Escopo livre (ex.: `stock:<loja>`,
 * `order:<usuário>`), chave do cliente e hash do corpo: a mesma chave com corpo diferente é erro, não devolve o 1º
 * resultado em silêncio. Vale 24 h.
 */
export const idempotencyKeys = pgTable('idempotency_keys', {
    id: uuid().primaryKey().default(sql `gen_random_uuid()`),
    scope: varchar({ length: 120 }).notNull(),
    key: varchar({ length: 80 }).notNull(),
    requestHash: text().notNull(),
    /** `null` enquanto a 1ª requisição executa. */
    responseStatus: integer(),
    responseBody: jsonb(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
}, (t) => [uniqueIndex('idempotency_keys_scope_key_uq').on(t.scope, t.key), index('idempotency_keys_expires_idx').on(t.expiresAt)]);
//# sourceMappingURL=schema.js.map