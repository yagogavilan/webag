import { sql } from 'drizzle-orm';
import { bigserial, check, index, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { enumCheck } from '../../../platform/database/enum-check.js';
import { users } from '../../identity/db/schema.js';
import { stores } from '../../stores/db/schema.js';

/**
 * v1.1 R2 (WB-367 C5 a C7): porta falsa do módulo Análises. LOG de respostas por loja: o toque em "Quero testar" (`clicked`) e cada resposta com a faixa de preço de EXEMPLO
 * (`answered`; HIP-A1: não é preço decidido nem promessa, DEC-093). A resposta vigente é a ÚLTIMA de cada loja (`DISTINCT ON (store_id)`); as anteriores ficam para o admin (C6).
 * Texto livre de até 200 caracteres, associado à LOJA e não a pessoa, sem dado de cliente e fora de qualquer evento de analytics. Retenção de 12 meses por job (R2.2).
 * A R1.4 acrescenta neste módulo as tabelas da coleta de eventos (`analytics_events` e agregados); nada daqui depende delas.
 */
export const ANALYTICS_PRICE_BANDS = ['up_to_19', '20_to_39', '40_to_79', '80_plus', 'would_not_pay'] as const;
export const analyticsInterestEvents = pgTable(
  'analytics_interest_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    storeId: uuid().notNull().references(() => stores.id),
    /** O dono (ou o funcionário com a permissão `analises`) que respondeu. */
    userId: uuid().notNull().references(() => users.id),
    kind: text({ enum: ['clicked', 'answered'] }).notNull(),
    priceBand: text({ enum: ANALYTICS_PRICE_BANDS }),
    note: varchar({ length: 200 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('analytics_interest_events_store_idx').on(t.storeId, t.createdAt.desc(), t.id.desc()),
    enumCheck('analytics_interest_events_kind_enum', t.kind, ['clicked', 'answered']),
    enumCheck('analytics_interest_events_band_enum', t.priceBand, ANALYTICS_PRICE_BANDS),
    // O toque não leva faixa nem texto; a resposta leva a faixa.
    check('analytics_interest_events_shape', sql`(${t.kind} = 'answered') = (${t.priceBand} is not null) and (${t.kind} = 'answered' or ${t.note} is null)`),
  ],
);
