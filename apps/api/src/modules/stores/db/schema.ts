import { sql } from 'drizzle-orm';
import {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
  doublePrecision,
} from 'drizzle-orm/pg-core';
import { categories, cities } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';
import { mediaAssets } from '../../media/db/schema.js';
import { STORE_STATUSES } from '../domain/state.js';

export { STORE_STATUSES };

/**
 * Loja (WB-051..WB-059, RN-16). `lat`/`lng` são a fonte; a coluna `location geography(Point,4326)` é GERADA no banco
 * (migração 0005) com índice GiST, e as consultas de distância usam `ST_DWithin`/`ST_Distance` sobre ela (ADR-008).
 * CPF/CNPJ normalizado, único entre lojas não recusadas (1 documento = 1 loja, HIP-031).
 */
export const stores = pgTable(
  'stores',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    status: text({ enum: STORE_STATUSES }).notNull().default('draft'),
    documentType: text({ enum: ['cpf', 'cnpj'] }).notNull(),
    documentNumber: varchar({ length: 14 }).notNull(),
    /** CNPJ: razão social e aceite de responsabilidade fiscal (WB-051 C5). */
    legalName: varchar({ length: 160 }),
    fiscalAcceptedAt: timestamp({ withTimezone: true }),
    fiscalAcceptedDocumentVersion: integer(),
    name: varchar({ length: 80 }),
    mainCategoryId: uuid().references(() => categories.id),
    description: varchar({ length: 300 }),
    phone: varchar({ length: 11 }),
    whatsapp: varchar({ length: 11 }),
    addressCep: varchar({ length: 8 }),
    addressStreet: varchar({ length: 120 }),
    addressNumber: varchar({ length: 20 }),
    addressComplement: varchar({ length: 80 }),
    addressNeighborhood: varchar({ length: 80 }),
    addressCityId: uuid().references(() => cities.id),
    addressCityName: varchar({ length: 80 }),
    addressState: varchar({ length: 2 }),
    lat: doublePrecision(),
    lng: doublePrecision(),
    logoAssetId: uuid().references(() => mediaAssets.id),
    coverAssetId: uuid().references(() => mediaAssets.id),
    /** Onboarding (WB-054, RN-16). `slaStartedAt` já desconta o tempo parado em "correção pedida". */
    submittedAt: timestamp({ withTimezone: true }),
    slaStartedAt: timestamp({ withTimezone: true }),
    slaElapsedMs: integer(),
    decidedAt: timestamp({ withTimezone: true }),
    decidedBy: uuid().references(() => users.id),
    decisionReason: text(),
    approvedAt: timestamp({ withTimezone: true }),
    suspendedAt: timestamp({ withTimezone: true }),
    suspensionReason: text(),
    /** Nome ou documento alterado depois de aprovada: análise de dados, a loja segue vendendo com os antigos (R-23). */
    pendingChanges: jsonb().$type<Record<string, string> | null>(),
    /**
     * Limite de exposição da loja nova (WB-225, DEC-016/020b): `default` aplica os parâmetros `loja_nova_*`; `released` tira o
     * limite; `custom` troca só o teto por pedido (centavos). Toda mudança é auditada com motivo no admin.
     */
    exposureLimitMode: text({ enum: ['default', 'released', 'custom'] }).notNull().default('default'),
    exposureLimitMaxCents: integer(),
    exposureLimitReason: text(),
    exposureLimitSetBy: uuid().references(() => users.id),
    exposureLimitSetAt: timestamp({ withTimezone: true }),
    /** 3 remoções de produto em 30 dias (WB-107 C4). */
    suspensionReviewFlaggedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('stores_owner_uq').on(t.ownerUserId),
    // Recusada com documento livre (R-15); suspensa continua ocupando.
    uniqueIndex('stores_document_uq').on(t.documentNumber).where(sql`${t.status} <> 'rejected'`),
    index('stores_status_idx').on(t.status, t.slaStartedAt),
  ],
);

/** Configuração de entrega, retirada, trocas e pausa (WB-056..WB-059). 1:1 com a loja. */
export const storeSettings = pgTable('store_settings', {
  storeId: uuid()
    .primaryKey()
    .references(() => stores.id, { onDelete: 'cascade' }),
  acceptsDelivery: boolean().notNull().default(true),
  /** Em metros (1 km = 1000): as fronteiras de faixa são exatas. */
  radiusM: integer().notNull().default(5000),
  feeMode: text({ enum: ['fixed', 'by_distance'] }).notNull().default('fixed'),
  feeFixedCents: integer().notNull().default(0),
  minOrderCents: integer().notNull().default(0),
  /** 0 = desligado (R-17c). */
  freeAboveCents: integer().notNull().default(0),
  etaMinMinutes: integer().notNull().default(30),
  etaMaxMinutes: integer().notNull().default(60),
  /** DEC-053: preparo da loja (min) no ETA calculado; nulo usa o parâmetro `entrega_preparo_padrao_min`. Os `eta*Minutes` acima ficam só por compatibilidade com apps antigos. */
  prepMinutes: integer(),
  pickupEnabled: boolean().notNull().default(false),
  pickupUseStoreAddress: boolean().notNull().default(true),
  pickupAddress: varchar({ length: 200 }),
  pickupInstructions: varchar({ length: 200 }),
  pickupPrepMinMinutes: integer().notNull().default(15),
  pickupPrepMaxMinutes: integer().notNull().default(30),
  /** Troca voluntária (tamanho/cor): 0 = não aceita. O piso legal (arrependimento e defeito) NÃO é campo daqui (DEC-011). */
  voluntaryExchangeDays: integer().notNull().default(0),
  collectionFeeCents: integer().notNull().default(0),
  /** Sobe a cada mudança da política: o pedido guarda a versão vigente (snapshot, WB-059 C3). */
  exchangePolicyVersion: integer().notNull().default(1),
  /** Estoque baixo por loja (0..100); nulo usa o parâmetro global. */
  lowStockThreshold: integer(),
  pausedUntil: timestamp({ withTimezone: true }),
  pausedIndefinitely: boolean().notNull().default(false),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const storeDeliveryTiers = pgTable(
  'store_delivery_tiers',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    position: smallint().notNull(),
    fromM: integer().notNull(),
    toM: integer().notNull(),
    feeCents: integer().notNull(),
  },
  (t) => [uniqueIndex('store_delivery_tiers_pos_uq').on(t.storeId, t.position)],
);

/** Intervalos de funcionamento por dia (0 = domingo). Minutos desde 00:00 local; início inclusivo, fim exclusivo. */
export const storeHours = pgTable(
  'store_hours',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    weekday: smallint().notNull(),
    startMin: integer().notNull(),
    endMin: integer().notNull(),
  },
  (t) => [index('store_hours_store_idx').on(t.storeId, t.weekday)],
);

export const storeHolidays = pgTable(
  'store_holidays',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    day: date({ mode: 'string' }).notNull(),
    label: varchar({ length: 60 }),
  },
  (t) => [uniqueIndex('store_holidays_day_uq').on(t.storeId, t.day)],
);

/** Categorias extras da loja (até 2, além da principal). */
export const storeExtraCategories = pgTable(
  'store_extra_categories',
  {
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    categoryId: uuid()
      .notNull()
      .references(() => categories.id),
  },
  (t) => [uniqueIndex('store_extra_categories_uq').on(t.storeId, t.categoryId)],
);

export const STORE_DOCUMENT_KINDS = ['id_front', 'id_back', 'address_proof', 'cnpj_card', 'responsible_id'] as const;
export type StoreDocumentKind = (typeof STORE_DOCUMENT_KINDS)[number];

/** Documentos do onboarding. O reenvio substitui o anterior e mantém o histórico (R-28d). Só admin baixa (WB-218). */
export const storeDocuments = pgTable(
  'store_documents',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    kind: text({ enum: STORE_DOCUMENT_KINDS }).notNull(),
    assetId: uuid()
      .notNull()
      .references(() => mediaAssets.id),
    uploadedBy: uuid()
      .notNull()
      .references(() => users.id),
    supersededAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('store_documents_store_idx').on(t.storeId, t.kind),
    // I6: um documento vigente por (loja, tipo).
    uniqueIndex('store_documents_current_uq').on(t.storeId, t.kind).where(sql`${t.supersededAt} is null`),
  ],
);

/** Itens reprovados pelo admin ("um item por documento exigido mais 'dados da loja'", WB-054 C3). */
export const storeReviewItems = pgTable(
  'store_review_items',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    item: text().notNull(),
    reason: text().notNull(),
    createdBy: uuid().references(() => users.id),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('store_review_items_store_idx').on(t.storeId, t.resolvedAt)],
);

export const storeStatusHistory = pgTable(
  'store_status_history',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    fromStatus: text(),
    toStatus: text().notNull(),
    actorId: uuid().references(() => users.id),
    reason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('store_status_history_store_idx').on(t.storeId, t.createdAt)],
);

/** Registro de atividade da loja ("quem fez o quê", WB-075 C5/C8). Sem dado do cliente. */
export const storeActivity = pgTable(
  'store_activity',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    actorId: uuid().references(() => users.id),
    action: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('store_activity_store_idx').on(t.storeId, t.createdAt)],
);

export const PAYMENT_ACCOUNT_STATUSES = ['active', 'under_review', 'disconnected'] as const;
export type PaymentAccountStatus = (typeof PAYMENT_ACCOUNT_STATUSES)[number];

/**
 * Conta de recebimento da loja (WB-053, WB-155, SEC-045..048). Tokens OAuth só cifrados (AES-256-GCM, AAD = loja +
 * versão da chave), nunca em log, DTO, auditoria ou exportação. 1 conta do provedor = 1 loja (R-37a).
 */
export const paymentAccounts = pgTable(
  'payment_accounts',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    provider: text().notNull(),
    providerAccountId: text().notNull(),
    status: text({ enum: PAYMENT_ACCOUNT_STATUSES }).notNull(),
    /** Documento do titular, mascarado (nunca o número inteiro). */
    holderDocumentMasked: text().notNull(),
    holderMatchesStore: boolean().notNull(),
    tokensEnc: text().notNull(),
    tokensExpireAt: timestamp({ withTimezone: true }),
    connectedBy: uuid()
      .notNull()
      .references(() => users.id),
    connectedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    releasedBy: uuid().references(() => users.id),
    releaseReason: text(),
    disconnectedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    // 1 conta por loja ativa/em análise e 1 loja por conta do provedor.
    uniqueIndex('payment_accounts_store_uq').on(t.storeId).where(sql`${t.status} <> 'disconnected'`),
    uniqueIndex('payment_accounts_provider_uq').on(t.provider, t.providerAccountId).where(sql`${t.status} <> 'disconnected'`),
  ],
);

/** `state` do OAuth (SEC-045): 256 bits, só o hash fica no banco, ligado à sessão E à loja, uso único, 10 min. */
export const paymentOauthStates = pgTable(
  'payment_oauth_states',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    stateHash: text().notNull(),
    storeId: uuid()
      .notNull()
      .references(() => stores.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    sessionId: uuid().notNull(),
    /** PKCE (SEC-140): `code_verifier` cifrado (AAD = hash do state); só o desafio S256 sai na URL. Nulo = PKCE desligado. */
    codeVerifierEnc: text(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_oauth_states_hash_uq').on(t.stateHash), index('payment_oauth_states_store_idx').on(t.storeId)],
);
