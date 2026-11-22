import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, smallint, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { categories } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { mediaAssets } from '../../media/db/schema.js';
import { stores } from '../../stores/db/schema.js';

export const PRODUCT_STATUSES = ['draft', 'active', 'paused', 'archived'] as const;
/** Por onde o cadastro nasceu (WB-379, ADR-018 D1): câmera, duplicar, colar texto, planilha ou formulário completo. */
export const PRODUCT_VIAS = ['camera', 'duplicate', 'paste', 'spreadsheet', 'form'] as const;
export type ProductVia = (typeof PRODUCT_VIAS)[number];
export type ProductStatus = (typeof PRODUCT_STATUSES)[number];
/** Status de moderação SEPARADO do status do lojista; só o admin altera (R-12d). `review` = sinalizado, não bloqueado. */
export const MODERATION_STATUSES = ['ok', 'review', 'paused', 'removed'] as const;
export type ModerationStatus = (typeof MODERATION_STATUSES)[number];

export const storeSections = pgTable(
  'store_sections',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    name: varchar({ length: 40 }).notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [index('store_sections_store_idx').on(t.storeId, t.position)],
);

export const products = pgTable(
  'products',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    name: varchar({ length: 80 }).notNull(),
    description: varchar({ length: 1000 }),
    /** Tabela de medidas (WB-246): texto livre; reduz troca por tamanho. */
    sizeChart: varchar({ length: 2000 }),
    /** Produto marcado "sem troca voluntária" pela loja (sob medida, personalizado, íntimo, higiene): tamanho/cor ficam inertes; arrependimento e defeito seguem (DEC-037). */
    noVoluntaryExchange: boolean().notNull().default(false),
    categoryId: uuid().references(() => categories.id),
    sectionId: uuid().references(() => storeSections.id, { onDelete: 'set null' }),
    position: integer().notNull().default(0),
    status: text({ enum: PRODUCT_STATUSES }).notNull().default('draft'),
    moderationStatus: text({ enum: MODERATION_STATUSES }).notNull().default('ok'),
    moderationReason: text(),
    moderatedBy: uuid().references(() => users.id),
    moderatedAt: timestamp({ withTimezone: true }),
    /** Preço base em centavos (R$ 0,01 a R$ 99.999,99). Nulo só em rascunho. */
    basePriceCents: integer(),
    promoPriceCents: integer(),
    promoStartsAt: timestamp({ withTimezone: true }),
    promoEndsAt: timestamp({ withTimezone: true }),
    /** Nomes dos atributos de variação (até 3). Vazio = "sem variação" (uma variação implícita). */
    variantAttributes: jsonb().$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    /** `Idempotency-Key` do cliente: duplo clique em "criar" gera 1 produto (O2-PRD-10). */
    idempotencyKey: varchar({ length: 80 }),
    publishedAt: timestamp({ withTimezone: true }),
    archivedAt: timestamp({ withTimezone: true }),
    /** ADR-018 D2: sobe 1 a cada EDIÇÃO de catálogo (lojista ou admin), por um único helper do serviço; reserva, venda e devolução de estoque (só `product_variants`) nunca a mexem. */
    version: integer().notNull().default(1),
    /** ADR-018 D1: origem do cadastro (nulo nos produtos anteriores à v1.1). */
    via: text({ enum: PRODUCT_VIAS }),
    /** Rascunho aberto por admin em nome da loja (autoria visível, WB-353). */
    createdByAdminId: uuid().references(() => users.id),
    /** RN-Q4: produto de origem da cópia ("duplicado de <id>"); sem FK para não prender a exclusão do rascunho de origem. */
    duplicatedFrom: uuid(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('products_store_idx').on(t.storeId, t.status),
    /** Teto de rascunhos por loja e vencimento de 30 dias sem alteração (RN-Q2). */
    index('products_store_drafts_idx').on(t.storeId, t.updatedAt).where(sql`${t.status} = 'draft'`),
    index('products_moderation_idx').on(t.moderationStatus, t.createdAt),
    uniqueIndex('products_idempotency_uq').on(t.storeId, t.idempotencyKey).where(sql`${t.idempotencyKey} is not null`),
    // Preço e estoque nunca fora da faixa, nem por bug de aplicação (RN-05).
    check('products_price_range', sql`${t.basePriceCents} is null or (${t.basePriceCents} between 1 and 9999999)`),
    // ADR-018 D1 / I9: rascunho aceita nome vazio ("Novo produto" abre antes da câmera); fora de rascunho o nome tem 2 a 80 caracteres.
    check('products_name_len', sql`${t.status} = 'draft' or char_length(${t.name}) between 2 and 80`),
    check('products_version_positive', sql`${t.version} >= 1`),
    check('products_via_valid', sql`${t.via} is null or ${t.via} in ('camera', 'duplicate', 'paste', 'spreadsheet', 'form')`),
  ],
);

export const productImages = pgTable(
  'product_images',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id),
    position: smallint().notNull(),
  },
  (t) => [uniqueIndex('product_images_pos_uq').on(t.productId, t.position)],
);

/**
 * Variação com estoque próprio (RN-06). `CHECK (stock >= reserved)` e limites no banco: estoque negativo não existe
 * nem por bug de aplicação. `storeId` repete a loja para o SKU ser único por loja.
 */
export const productVariants = pgTable(
  'product_variants',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    attributes: jsonb().$type<Record<string, string>>().notNull(),
    attributesKey: text().notNull(),
    sku: varchar({ length: 40 }),
    priceCents: integer(),
    stock: integer().notNull().default(0),
    reserved: integer().notNull().default(0),
    /** Gatilho do alerta de estoque baixo: 1 vez por variação, rearma ao subir acima do limite (R-14). */
    lowStockArmed: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('product_variants_combo_uq').on(t.productId, t.attributesKey).where(sql`${t.active}`),
    uniqueIndex('product_variants_sku_uq').on(t.storeId, sql`lower(${t.sku})`).where(sql`${t.sku} is not null and ${t.active}`),
  ],
);

export const MODERATION_TERM_KINDS = ['forbidden_category', 'suspect_word'] as const;
export type ModerationTermKind = (typeof MODERATION_TERM_KINDS)[number];

/** Listas editáveis do admin (WB-107 C3): categorias proibidas BLOQUEIAM o cadastro; palavras suspeitas só SINALIZAM. */
export const moderationTerms = pgTable(
  'moderation_terms',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: MODERATION_TERM_KINDS }).notNull(),
    /** `suspect_word`: palavra normalizada (sem acento, minúscula). `forbidden_category`: id da categoria. */
    value: text().notNull(),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('moderation_terms_uq').on(t.kind, t.value)],
);

/**
 * Histórico de moderação (append-only na prática): base da regra "3 remoções em 30 dias". BUG-042: `product_id` é anulável com `ON DELETE SET NULL`: apagar um
 * rascunho (a rota de excluir ou o vencimento de 30 dias) não pode falhar por causa do evento, e a remoção já contada para a loja continua contando (`store_id`).
 */
export const productModerationEvents = pgTable(
  'product_moderation_events',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    productId: uuid().references(() => products.id, { onDelete: 'set null' }),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    action: text({ enum: ['flag', 'pause', 'remove', 'restore'] }).notNull(),
    reason: text(),
    actorId: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('product_moderation_events_store_idx').on(t.storeId, t.action, t.createdAt),
    // FK sem índice faria cada rascunho apagado varrer a tabela (SET NULL procura as filhas por `product_id`).
    index('product_moderation_events_product_idx').on(t.productId),
  ],
);

/**
 * WB-379 / ADR-018 D11: medição do cadastro, 1 linha por produto criado pelo cadastro rápido. Só tempos, `via` e contagens (sem nome,
 * descrição nem preço). `started_at` = criação do rascunho; a mediana só usa o cadastro CONTÍNUO (publicado até `cadastro_sessao_max_min`).
 * O produto apagado (rascunho vencido) leva a linha junto (cascata): a medição de quem nunca publicou não interessa.
 */
export const productCreationMetrics = pgTable(
  'product_creation_metrics',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id),
    productId: uuid()
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    via: text({ enum: PRODUCT_VIAS }).notNull(),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    firstPhotoAt: timestamp({ withTimezone: true }),
    publishedAt: timestamp({ withTimezone: true }),
    photosCount: smallint(),
    variationsCount: smallint(),
  },
  (t) => [
    uniqueIndex('product_creation_metrics_product_uq').on(t.productId),
    index('product_creation_metrics_published_idx').on(t.publishedAt).where(sql`${t.publishedAt} is not null`),
    index('product_creation_metrics_store_idx').on(t.storeId, t.publishedAt),
  ],
);
