import { sql } from 'drizzle-orm';
import { index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

export const FEE_SCOPE_TYPES = ['default', 'city', 'neighborhood'] as const;

/**
 * Versão da tabela de taxa de entrega de um escopo (DEC-036, WB-236). Cada gravação é uma versão NOVA (histórico): vale a
 * partir de `effective_from`, nunca é retroativa, e o pedido guarda o snapshot da faixa usada.
 * `scope_key` = 'default' | id da cidade | id do bairro.
 */
export const deliveryFeeTables = pgTable(
  'delivery_fee_tables',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    scopeType: text({ enum: FEE_SCOPE_TYPES }).notNull(),
    scopeKey: text().notNull(),
    version: integer().notNull(),
    effectiveFrom: timestamp({ withTimezone: true }).notNull(),
    reason: text().notNull(),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('delivery_fee_tables_scope_version_uq').on(t.scopeKey, t.version), index('delivery_fee_tables_scope_idx').on(t.scopeKey, t.effectiveFrom)],
);

export const deliveryFeeTiers = pgTable(
  'delivery_fee_tiers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    tableId: uuid()
      .notNull()
      .references(() => deliveryFeeTables.id, { onDelete: 'cascade' }),
    position: integer().notNull(),
    fromM: integer().notNull(),
    toM: integer().notNull(),
    feeCents: integer().notNull(),
    exchangeFeeCents: integer().notNull(),
    expectedCostCents: integer().notNull().default(0),
    etaMinutes: integer().notNull().default(0),
  },
  (t) => [uniqueIndex('delivery_fee_tiers_position_uq').on(t.tableId, t.position)],
);
