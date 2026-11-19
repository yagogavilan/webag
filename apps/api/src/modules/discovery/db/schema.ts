import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, primaryKey, smallint, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { cities } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { products } from '../../catalog/db/schema.js';
import { mediaAssets } from '../../media/db/schema.js';
import { stores } from '../../stores/db/schema.js';

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

export const REVIEW_STATUSES = ['published', 'removed'] as const;

/**
 * Avaliação (RN-12, WB-018). Nesta onda só LEITURA pública: quem grava é a Onda 5A (WB-031), que também liga `orderId`
 * ao pedido (FK) e exige pedido ENTREGUE. `productId` nulo = avaliação da loja. A média pública só aparece a partir
 * de `avaliacao_min_exibicao` avaliações. Remoção pelo admin é `status = 'removed'` (nunca apaga a linha).
 */
export const reviews = pgTable(
  'reviews',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    productId: uuid().references(() => products.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    /** Sem FK até a Onda 4 criar `orders`. */
    orderId: uuid(),
    rating: smallint().notNull(),
    comment: varchar({ length: 500 }),
    /** "Como vestiu?" (WB-247): ajuda os próximos compradores a escolher o tamanho e reduz troca. */
    fit: text({ enum: ['small', 'ok', 'large'] }),
    storeReply: varchar({ length: 500 }),
    storeRepliedAt: timestamp({ withTimezone: true }),
    status: text({ enum: REVIEW_STATUSES }).notNull().default('published'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('reviews_rating_range', sql`${t.rating} between 1 and 5`),
    index('reviews_store_idx').on(t.storeId, t.createdAt),
    index('reviews_product_idx').on(t.productId, t.createdAt),
    // Uma avaliação por produto (e uma da loja) por pedido (RN-12): repetir o envio em rede ruim não duplica.
    uniqueIndex('reviews_order_target_uq')
      .on(t.orderId, sql`coalesce(${t.productId}, '00000000-0000-0000-0000-000000000000'::uuid)`)
      .where(sql`${t.orderId} is not null`),
  ],
);

/** Favoritos (WB-019): de loja OU de produto, sincronizado entre aparelhos. Dado pessoal: só o dono lê. */
export const favorites = pgTable(
  'favorites',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid().references(() => stores.id, { onDelete: 'cascade' }),
    productId: uuid().references(() => products.id, { onDelete: 'cascade' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    check('favorites_one_target', sql`(${t.storeId} is null) <> (${t.productId} is null)`),
    uniqueIndex('favorites_store_uq').on(t.userId, t.storeId).where(sql`${t.storeId} is not null`),
    uniqueIndex('favorites_product_uq').on(t.userId, t.productId).where(sql`${t.productId} is not null`),
    index('favorites_user_idx').on(t.userId, t.createdAt),
  ],
);

/** Histórico de buscas da conta (WB-015): últimos 10 termos distintos; apagável (LGPD). `termKey` = sem acento, minúsculo. */
export const searchHistory = pgTable(
  'search_history',
  {
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    termKey: varchar({ length: 80 }).notNull(),
    term: varchar({ length: 80 }).notNull(),
    searchedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.termKey] }), index('search_history_user_idx').on(t.userId, t.searchedAt)],
);
