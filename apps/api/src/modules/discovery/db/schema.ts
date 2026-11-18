import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uuid, varchar } from 'drizzle-orm/pg-core';
import { cities } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { mediaAssets } from '../../media/db/schema.js';

export const BANNER_DESTINATIONS = ['store', 'category', 'product', 'coupon', 'none'] as const;
export type BannerDestination = (typeof BANNER_DESTINATIONS)[number];

/**
 * Banner da home (WB-011, WB-115). Imagem 2:1 (DEC-024a). `cityId` nulo = todas as cidades. O destino é um ID (loja,
 * categoria, produto) ou um código de cupom; o app abre a tela correspondente. A edição pelo admin é WB-115.
 */
export const banners = pgTable(
  'banners',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: varchar({ length: 80 }).notNull(),
    imageAssetId: uuid()
      .notNull()
      .references(() => mediaAssets.id),
    cityId: uuid().references(() => cities.id, { onDelete: 'cascade' }),
    destinationType: text({ enum: BANNER_DESTINATIONS }).notNull().default('none'),
    destinationId: uuid(),
    destinationCode: varchar({ length: 20 }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('banners_active_idx').on(t.active, t.startsAt, t.endsAt), check('banners_period', sql`${t.endsAt} > ${t.startsAt}`)],
);
