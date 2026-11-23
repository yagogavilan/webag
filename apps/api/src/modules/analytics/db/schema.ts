import { sql } from 'drizzle-orm';
import { check, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { enumCheck } from '../../../platform/database/enum-check.js';
import { users } from '../../identity/db/schema.js';
import { stores } from '../../stores/db/schema.js';

/**
 * v1.1 R2 (WB-367): porta falsa do módulo Análises. UMA linha por loja: o toque em "Quero testar" e, depois, a faixa de preço de EXEMPLO escolhida
 * (HIP-A1; não é preço decidido nem promessa, DEC-093). Texto curto opcional, sem dado de cliente. Retenção de 12 meses por job (R2.2).
 * A R1.4 acrescenta neste módulo as tabelas da coleta de eventos (`analytics_events` e agregados); nada daqui depende delas.
 */
export const ANALYTICS_PRICE_BANDS = ['up_to_19', '20_to_39', '40_to_79', '80_plus', 'would_not_pay'] as const;
export const analyticsInterest = pgTable(
  'analytics_interest',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid().notNull().references(() => stores.id),
    /** O dono que tocou (porta falsa é só do dono). */
    userId: uuid().notNull().references(() => users.id),
    clickedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    priceBand: text({ enum: ANALYTICS_PRICE_BANDS }),
    note: varchar({ length: 140 }),
    answeredAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('analytics_interest_store_uq').on(t.storeId),
    enumCheck('analytics_interest_band_enum', t.priceBand, ANALYTICS_PRICE_BANDS),
    check('analytics_interest_answer', sql`(${t.priceBand} is null) = (${t.answeredAt} is null)`),
  ],
);
