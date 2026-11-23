import { sql } from 'drizzle-orm';
import { check, integer, pgTable, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { productVariants, products } from '../../catalog/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { coupons } from '../../campaigns/db/schema.js';

/**
 * Sacola da conta (ADR-010): uma por usuário, de UMA loja só (DEC-006). `storeId` nulo = vazia. Expira por inatividade
 * (`carrinho_validade_dias`, WB-020 C6). `revision` sobe a cada mudança e o checkout a confere (nada cobrado sem o
 * cliente ver o valor).
 */
export const carts = pgTable(
  'carts',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    storeId: uuid().references(() => stores.id),
    couponId: uuid().references(() => coupons.id, { onDelete: 'set null' }),
    revision: integer().notNull().default(0),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('carts_user_uq').on(t.userId)],
);

export const cartItems = pgTable(
  'cart_items',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cartId: uuid()
      .notNull()
      .references(() => carts.id, { onDelete: 'cascade' }),
    variantId: uuid()
      .notNull()
      .references(() => productVariants.id),
    productId: uuid()
      .notNull()
      .references(() => products.id),
    quantity: integer().notNull(),
    /** Preço unitário que o cliente viu (o do último "aceitar"): base do aviso "o preço mudou". */
    seenPriceCents: integer().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cart_items_variant_uq').on(t.cartId, t.variantId), check('cart_items_qty', sql`${t.quantity} >= 1`)],
);
