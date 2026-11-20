import { sql } from 'drizzle-orm';
import { index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

/**
 * Aparelho que recebe push (Expo). Um token pertence a UMA conta por vez: quem entra no aparelho assume o token (logout e troca de
 * conta não deixam o push do cliente anterior chegar a outra pessoa). `disabled_at` = o Expo disse `DeviceNotRegistered`.
 * Dado pessoal mínimo: só o token do provedor e a plataforma.
 */
export const pushDevices = pgTable(
  'push_devices',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text().notNull(),
    platform: text({ enum: ['android', 'ios'] }).notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastSeenAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    disabledAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('push_devices_token_uq').on(t.token), index('push_devices_user_idx').on(t.userId)],
);
