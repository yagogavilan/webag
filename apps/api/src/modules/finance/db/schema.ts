import { sql } from 'drizzle-orm';
import { bigserial, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { categories } from '../../admin/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { paymentAttempts } from '../../payments/db/schema.js';

/**
 * Comissão por loja com vigência (WB-105). Cada alteração é uma LINHA NOVA (histórico e não retroatividade, C3);
 * `pct_bp` nulo = "volta à regra seguinte". Percentual em pontos-base (1000 = 10,00%), 0 a 30%.
 */
export const storeCommissionRates = pgTable(
  'store_commission_rates',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid().notNull().references(() => stores.id),
    pctBp: integer(),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    reason: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('store_commission_rates_store_idx').on(t.storeId, t.startsAt),
    check('store_commission_rates_pct_chk', sql`${t.pctBp} is null or (${t.pctBp} >= 0 and ${t.pctBp} <= 3000)`),
    check('store_commission_rates_period_chk', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);

export const categoryCommissionRates = pgTable(
  'category_commission_rates',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    categoryId: uuid().notNull().references(() => categories.id),
    pctBp: integer(),
    startsAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    endsAt: timestamp({ withTimezone: true }),
    reason: text().notNull(),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('category_commission_rates_cat_idx').on(t.categoryId, t.startsAt),
    check('category_commission_rates_pct_chk', sql`${t.pctBp} is null or (${t.pctBp} >= 0 and ${t.pctBp} <= 3000)`),
    check('category_commission_rates_period_chk', sql`${t.endsAt} is null or ${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Ledger de dupla entrada, APPEND-ONLY (SEC-041): triggers na migração recusam UPDATE, DELETE e TRUNCATE, e uma
 * constraint trigger adiada recusa transação cujos débitos e créditos não fecham. `dedupe_key` torna a gravação
 * idempotente (webhook repetido, estorno repetido).
 */
export const ledgerTransactions = pgTable(
  'ledger_transactions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Pedido (FK acrescentada na migração dos pedidos). */
    orderId: uuid().notNull(),
    storeId: uuid().references(() => stores.id),
    attemptId: uuid().references(() => paymentAttempts.id),
    kind: text({ enum: ['sale', 'provider_fee', 'refund', 'coverage', 'adjustment'] }).notNull(),
    dedupeKey: text().notNull(),
    /** Percentuais e valores usados (snapshot): auditável sem refazer a conta. */
    meta: jsonb().$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('ledger_transactions_dedupe_uq').on(t.dedupeKey), index('ledger_transactions_order_idx').on(t.orderId), index('ledger_transactions_store_idx').on(t.storeId, t.createdAt)],
);

export const ledgerEntries = pgTable(
  'ledger_entries',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    transactionId: uuid().notNull().references(() => ledgerTransactions.id),
    account: text({ enum: ['provider_clearing', 'merchant_payable', 'commission_revenue', 'service_fee_revenue', 'platform_promo_expense', 'webag_coverage_cash'] }).notNull(),
    direction: text({ enum: ['debit', 'credit'] }).notNull(),
    amountCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('ledger_entries_tx_idx').on(t.transactionId), check('ledger_entries_amount_chk', sql`${t.amountCents} > 0`)],
);
