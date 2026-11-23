import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { productVariants, products } from '../../catalog/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { stores } from '../../stores/db/schema.js';
import { campaigns } from '../../campaigns/db/schema.js';

export const COUPON_KINDS = ['percent', 'fixed', 'free_shipping'] as const;
export type CouponKind = (typeof COUPON_KINDS)[number];
export const COUPON_SCOPES = ['store', 'platform'] as const;
export type CouponScope = (typeof COUPON_SCOPES)[number];

/**
 * Cupom (RN-09). `value`: percentual (1 a 100) ou centavos (fixo); ignorado em frete grátis. Escopo `store` (custo do
 * lojista, `storeId` obrigatório) ou `platform` (custo Webag, limitado à comissão do pedido, DEC-016). A gestão pelo
 * lojista e pelo admin é WB-073/WB-116; aqui só a leitura e a validação no carrinho.
 */
export const coupons = pgTable(
  'coupons',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** 4 a 20 caracteres A-Z0-9, guardado em maiúsculas. */
    code: varchar({ length: 20 }).notNull(),
    kind: text({ enum: COUPON_KINDS }).notNull(),
    scope: text({ enum: COUPON_SCOPES }).notNull(),
    storeId: uuid().references(() => stores.id, { onDelete: 'cascade' }),
    value: integer().notNull().default(0),
    /** Teto do desconto percentual (centavos); nulo = sem teto. */
    percentCapCents: integer(),
    minOrderCents: integer().notNull().default(0),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    maxUses: integer(),
    perCustomerLimit: integer().notNull().default(1),
    firstPurchaseOnly: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
    /** WB-254: cupom pessoal e intransferível (compensação por atraso); só o dono o enxerga e usa. Apagado com a conta (LGPD). */
    ownerUserId: uuid().references(() => users.id, { onDelete: 'cascade' }),
    /** WB-254 C5: pedido atrasado que originou o cupom; único, e por isso um cupom por pedido mesmo se reprocessar. */
    sourceOrderId: uuid(),
    /**
     * v1.1 R2 (ADR-019 D3): código de uma CAMPANHA. Nulo = cupom legado (WB-116) ou de compensação por atraso, que seguem pela regra de hoje e FICAM FORA do orçamento (D13).
     * Quando preenchido, `kind`, `value`, `min_order`, `starts_at`, `ends_at`, `max_uses`, `per_customer_limit`, `first_purchase_only` e `scope` são ESPELHOS da campanha, escritos pelo serviço
     * na mesma transação (a campanha não muda depois de ativa); a verdade das regras, do orçamento e do estado é a linha de `campaigns`.
     */
    campaignId: uuid().references(() => campaigns.id),
    /** `private`: código gerado pelo servidor (8 ou mais caracteres aleatórios, C-CUP-06); nunca entra na vitrine. */
    visibility: text({ enum: ['public', 'private'] }).notNull().default('public'),
    codeOrigin: text({ enum: ['manual', 'generated'] }).notNull().default('manual'),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('coupons_campaign_idx').on(t.campaignId).where(sql`${t.campaignId} is not null`),
    check('coupons_private_code_strength', sql`${t.visibility} = 'public' or (${t.codeOrigin} = 'generated' and char_length(${t.code}) >= 8)`),
    uniqueIndex('coupons_source_order_uq').on(t.sourceOrderId).where(sql`${t.sourceOrderId} is not null`),
    index('coupons_owner_idx').on(t.ownerUserId).where(sql`${t.ownerUserId} is not null`),
    uniqueIndex('coupons_code_uq').on(sql`upper(${t.code})`),
    check('coupons_code_format', sql`${t.code} ~ '^[A-Z0-9]{4,20}$'`),
    check('coupons_store_scope', sql`(${t.scope} = 'store') = (${t.storeId} is not null)`),
    check('coupons_value_range', sql`(${t.kind} = 'free_shipping') or (${t.kind} = 'percent' and ${t.value} between 1 and 100) or (${t.kind} = 'fixed' and ${t.value} >= 1)`),
    check('coupons_period', sql`${t.endsAt} > ${t.startsAt}`),
  ],
);

/**
 * Uso de cupom por pedido (limite total e por cliente). Quem grava é a criação do pedido (Onda 4), na mesma transação
 * do pedido; cancelamento devolve o uso (RN-08). Sem FK para `orders` até a Onda 4.
 */
export const couponRedemptions = pgTable(
  'coupon_redemptions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    couponId: uuid()
      .notNull()
      .references(() => coupons.id),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    orderId: uuid().notNull(),
    discountCents: integer().notNull(),
    releasedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('coupon_redemptions_order_uq').on(t.orderId), index('coupon_redemptions_coupon_idx').on(t.couponId, t.userId)],
);

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
