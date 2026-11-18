import { sql } from 'drizzle-orm';
import {
  type AnyPgColumn,
  bigserial,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

/** WB-118: regiões. Geografia (PostGIS) entra com o ADR-008 na Onda 3. */
export const cities = pgTable(
  'cities',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    name: varchar({ length: 80 }).notNull(),
    state: varchar({ length: 2 }).notNull().default('SP'),
    slug: varchar({ length: 80 }).notNull(),
    active: boolean().notNull().default(false),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('cities_slug_uq').on(t.slug)],
);

export const neighborhoods = pgTable(
  'neighborhoods',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    cityId: uuid()
      .notNull()
      .references(() => cities.id, { onDelete: 'cascade' }),
    name: varchar({ length: 80 }).notNull(),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('neighborhoods_city_name_uq').on(t.cityId, sql`lower(${t.name})`)],
);

/** WB-106: 2 níveis (categoria > subcategoria). */
export const categories = pgTable(
  'categories',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    parentId: uuid().references((): AnyPgColumn => categories.id),
    name: varchar({ length: 30 }).notNull(),
    icon: varchar({ length: 40 }).notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Nome único dentro do mesmo nível (parent nulo = raiz).
    uniqueIndex('categories_level_name_uq').on(
      sql`coalesce(${t.parentId}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(${t.name})`,
    ),
  ],
);

/** WB-119: valor atual de cada parâmetro (definição, faixa e padrão vivem em `parameters.definitions.ts`). */
export const parameters = pgTable('parameters', {
  key: varchar({ length: 80 }).primaryKey(),
  value: jsonb().$type<string | number>().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
});

/** Histórico de alterações (append-only). */
export const parameterHistory = pgTable(
  'parameter_history',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    key: varchar({ length: 80 }).notNull(),
    oldValue: jsonb().$type<string | number | null>(),
    newValue: jsonb().$type<string | number>().notNull(),
    reason: text().notNull(),
    changedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    changedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('parameter_history_key_idx').on(t.key, t.changedAt)],
);

/** WB-120. */
export const featureFlags = pgTable('feature_flags', {
  key: varchar({ length: 60 }).primaryKey(),
  enabled: boolean().notNull(),
  description: text().notNull(),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
});

export const LEGAL_DOCUMENT_TYPES = ['customer_terms', 'merchant_terms', 'privacy'] as const;
export type LegalDocumentType = (typeof LEGAL_DOCUMENT_TYPES)[number];

/** WB-117: versões imutáveis. A vigente é a de maior versão com `effective_at <= now()`. */
export const legalDocuments = pgTable(
  'legal_documents',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    type: text({ enum: LEGAL_DOCUMENT_TYPES }).notNull(),
    version: integer().notNull(),
    title: varchar({ length: 120 }).notNull(),
    content: text().notNull(),
    effectiveAt: timestamp({ withTimezone: true }).notNull(),
    /** Mudança relevante: exige novo aceite no próximo uso (WB-117 C2). */
    relevantChange: boolean().notNull().default(false),
    publishedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('legal_documents_type_version_uq').on(t.type, t.version)],
);

/** WB-123 / SEC-074: append-only (trigger na migração `append_only_guards`). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    /** Perfil de admin ou papel do ator no momento da ação. */
    actorRole: text(),
    action: text().notNull(),
    targetType: text(),
    targetId: text(),
    before: jsonb().$type<Record<string, unknown> | null>(),
    after: jsonb().$type<Record<string, unknown> | null>(),
    ip: text(),
    requestId: text(),
    reason: text(),
  },
  (t) => [
    index('audit_log_at_idx').on(t.at),
    index('audit_log_actor_idx').on(t.actorId, t.at),
    index('audit_log_target_idx').on(t.targetType, t.targetId, t.at),
    index('audit_log_action_idx').on(t.action, t.at),
  ],
);
