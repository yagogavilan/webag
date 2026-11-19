import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgSequence, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

export const DELETION_STATUSES = ['pending', 'completed', 'cancelled'] as const;
export type DeletionStatus = (typeof DELETION_STATUSES)[number];

/**
 * WB-213/214/215: pedido de exclusão de conta. A conta fecha na hora (`users.status = 'deleted'`); a anonimização roda em
 * `effective_at` (imediata quando o período de arrependimento é 0). `summary` guarda só contagens (nunca dado pessoal).
 * A linha de `users` continua existindo (anonimizada) para manter a integridade de pedidos e ledger.
 */
export const accountDeletions = pgTable(
  'account_deletions',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    via: text({ enum: ['app', 'web'] }).notNull(),
    status: text({ enum: DELETION_STATUSES }).notNull().default('pending'),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** Quando a anonimização roda; antes disso o titular ainda pode se arrepender. */
    effectiveAt: timestamp({ withTimezone: true }).notNull(),
    completedAt: timestamp({ withTimezone: true }),
    cancelledAt: timestamp({ withTimezone: true }),
    summary: jsonb().$type<Record<string, number>>(),
    /** Loja do dono encerrada junto com a conta e o estado anterior (o arrependimento a reabre). */
    storeId: uuid(),
    storePreviousStatus: text(),
    /** Última falha da anonimização (mensagem sem dado pessoal); o job tenta de novo. */
    lastError: text(),
    failures: integer().notNull().default(0),
  },
  (t) => [
    uniqueIndex('account_deletions_pending_uq').on(t.userId).where(sql`${t.status} = 'pending'`),
    index('account_deletions_due_idx').on(t.effectiveAt).where(sql`${t.status} = 'pending'`),
  ],
);

export const EXPORT_STATUSES = ['queued', 'processing', 'ready', 'failed', 'expired'] as const;
export type ExportStatus = (typeof EXPORT_STATUSES)[number];

/** WB-212: exportação dos dados do titular. O arquivo fica no bucket privado e some em `expires_at`. */
export const dataExports = pgTable(
  'data_exports',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    status: text({ enum: EXPORT_STATUSES }).notNull().default('queued'),
    requestedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp({ withTimezone: true }),
    readyAt: timestamp({ withTimezone: true }),
    expiresAt: timestamp({ withTimezone: true }),
    objectKey: text(),
    sizeBytes: integer(),
    failures: integer().notNull().default(0),
    lastError: text(),
    downloadCount: integer().notNull().default(0),
  },
  (t) => [
    index('data_exports_user_idx').on(t.userId, t.requestedAt),
    // Uma exportação em andamento por conta (C4); a corrida de duplo toque cai aqui.
    uniqueIndex('data_exports_open_uq').on(t.userId).where(sql`${t.status} in ('queued','processing')`),
    index('data_exports_queue_idx').on(t.requestedAt).where(sql`${t.status} = 'queued'`),
  ],
);

/** Link de download: 256 bits (só o hash fica no banco), uso único, validade curta, ligado a uma exportação e ao dono. */
export const dataExportLinks = pgTable(
  'data_export_links',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    exportId: uuid()
      .notNull()
      .references(() => dataExports.id, { onDelete: 'cascade' }),
    tokenHash: text().notNull(),
    expiresAt: timestamp({ withTimezone: true }).notNull(),
    usedAt: timestamp({ withTimezone: true }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('data_export_links_token_uq').on(t.tokenHash), index('data_export_links_export_idx').on(t.exportId)],
);

/** Número do protocolo (PV-0001): sequência do banco, sem colisão entre instâncias. */
export const privacyProtocolSeq = pgSequence('privacy_protocol_seq', { startWith: 1 });

export const DSR_TYPES = ['access', 'correction', 'deletion', 'portability', 'objection', 'other'] as const;
export type DsrType = (typeof DSR_TYPES)[number];
export const DSR_STATUSES = ['new', 'in_progress', 'answered'] as const;
export type DsrStatus = (typeof DSR_STATUSES)[number];
export const DSR_CHANNELS = ['form', 'email', 'app'] as const;

/**
 * WB-217: pedido de titular (LGPD art. 18). O e-mail do solicitante é dado pessoal: a lista do admin o mostra mascarado e
 * revelar exige reautenticação e grava auditoria. Sai da casca anonimizada quando a conta é excluída.
 */
export const privacyRequests = pgTable(
  'privacy_requests',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    /** Protocolo curto legível (PV-0031). */
    protocol: varchar({ length: 16 }).notNull(),
    type: text({ enum: DSR_TYPES }).notNull(),
    channel: text({ enum: DSR_CHANNELS }).notNull(),
    status: text({ enum: DSR_STATUSES }).notNull().default('new'),
    /** Conta, se o solicitante está logado ou se o e-mail bate com uma conta (só para o atendimento). */
    userId: uuid().references(() => users.id),
    requesterEmail: text().notNull(),
    message: varchar({ length: 1000 }),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    /** `received_at` + 15 dias (prazo legal). */
    dueAt: timestamp({ withTimezone: true }).notNull(),
    /** Alerta aos 10 dias (WB-217 C2): enviado uma vez. */
    alertedAt: timestamp({ withTimezone: true }),
    answeredAt: timestamp({ withTimezone: true }),
    answeredBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    answer: varchar({ length: 1000 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('privacy_requests_protocol_uq').on(t.protocol),
    index('privacy_requests_due_idx').on(t.status, t.dueAt),
    index('privacy_requests_user_idx').on(t.userId),
  ],
);

/** Histórico append-only do pedido de titular (C3): o que foi feito e respondido. */
export const privacyRequestEvents = pgTable(
  'privacy_request_events',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    requestId: uuid()
      .notNull()
      .references(() => privacyRequests.id, { onDelete: 'cascade' }),
    action: text().notNull(),
    actorId: uuid().references(() => users.id, { onDelete: 'set null' }),
    note: varchar({ length: 1000 }),
    at: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('privacy_request_events_request_idx').on(t.requestId, t.at)],
);

/** WB-215 C3: cada execução do expurgo, só com contagens (sem dado pessoal). */
export const retentionRuns = pgTable(
  'retention_runs',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    startedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp({ withTimezone: true }),
    counts: jsonb().$type<Record<string, number>>().notNull().default({}),
    errors: jsonb().$type<string[]>().notNull().default([]),
  },
  (t) => [index('retention_runs_started_idx').on(t.startedAt)],
);
