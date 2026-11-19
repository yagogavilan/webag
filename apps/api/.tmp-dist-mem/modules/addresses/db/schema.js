import { sql } from 'drizzle-orm';
import { boolean, doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { cities, neighborhoods } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
export const ADDRESS_LABELS = ['home', 'work', 'other'];
/**
 * Endereço salvo do cliente (WB-003, DEC-028). Dado pessoal: só o dono lê (BOLA, SEC-020); nunca vai a log.
 * `lat`/`lng` são a fonte; a coluna `location geography(Point,4326)` é GERADA no banco (migração 0009) com índice GiST.
 * No máximo um padrão por usuário (índice único parcial) e o limite (`enderecos_max`) é conferido sob trava do usuário.
 */
export const userAddresses = pgTable('user_addresses', {
    id: uuid().primaryKey().default(sql `gen_random_uuid()`),
    userId: uuid()
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    label: text({ enum: ADDRESS_LABELS }),
    cep: varchar({ length: 8 }).notNull(),
    street: varchar({ length: 120 }).notNull(),
    /** "S/N" quando não há número (WB-002 C4). */
    number: varchar({ length: 20 }).notNull(),
    complement: varchar({ length: 80 }),
    neighborhood: varchar({ length: 80 }).notNull(),
    cityName: varchar({ length: 80 }).notNull(),
    state: varchar({ length: 2 }).notNull().default('SP'),
    /** Região atendida resolvida na gravação (cidade ativa; bairro só se cadastrado). */
    cityId: uuid().references(() => cities.id),
    neighborhoodId: uuid().references(() => neighborhoods.id),
    lat: doublePrecision().notNull(),
    lng: doublePrecision().notNull(),
    /** SEC-169: o ponto foi conferido contra o centro do CEP (geocodificador ligado e no ar). `false` = aceito sem conferir (geocodificador desligado ou fora). */
    pinVerified: boolean().notNull().default(false),
    isDefault: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [
    index('user_addresses_user_idx').on(t.userId, t.createdAt),
    uniqueIndex('user_addresses_default_uq').on(t.userId).where(sql `${t.isDefault}`),
    // Toque duplo / reenvio em 3G: o mesmo endereço não entra duas vezes (o serviço devolve o existente).
    uniqueIndex('user_addresses_dedupe_uq').on(t.userId, t.cep, sql `lower(${t.number})`, sql `lower(coalesce(${t.complement}, ''))`),
]);
//# sourceMappingURL=schema.js.map