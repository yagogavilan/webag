import { sql } from 'drizzle-orm';
import { boolean, index, integer, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

export const HELP_AUDIENCES = ['customer', 'merchant'] as const;
export type HelpAudience = (typeof HELP_AUDIENCES)[number];
export const HELP_GROUPS = {
  customer: { order: 'Pedido', payment: 'Pagamento', exchange: 'Troca', account: 'Conta' },
  merchant: { orders: 'Pedidos', products: 'Produtos', exchanges: 'Trocas', money: 'Dinheiro', team: 'Equipe' },
} as const;

/** WB-034 C1 / AJ3: perguntas frequentes editáveis pelo admin, sem deploy. */
export const helpFaqs = pgTable(
  'help_faqs',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    audience: text({ enum: HELP_AUDIENCES }).notNull(),
    groupKey: varchar({ length: 20 }).notNull(),
    question: varchar({ length: 100 }).notNull(),
    answer: varchar({ length: 600 }).notNull(),
    position: integer().notNull().default(0),
    published: boolean().notNull().default(true),
    updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('help_faqs_audience_idx').on(t.audience, t.groupKey, t.position)],
);

/** Configuração de conteúdo (WhatsApp, e-mail e horário do suporte, encarregado): chave-valor, auditada. */
export const contentSettings = pgTable('content_settings', {
  key: varchar({ length: 40 }).primaryKey(),
  value: varchar({ length: 200 }).notNull(),
  updatedBy: uuid().references(() => users.id, { onDelete: 'set null' }),
  updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
});

export const REPORT_TARGETS = ['review', 'product', 'store'] as const;
export type ReportTarget = (typeof REPORT_TARGETS)[number];
export const REPORT_REASONS = ['offensive', 'false', 'prohibited', 'scam', 'other'] as const;
export const REPORT_STATUSES = ['open', 'kept', 'removed', 'forwarded'] as const;

/** WB-038 / WB-124: denúncia de avaliação, produto ou loja. Uma por (alvo, denunciante); repetir não cria outra. */
export const contentReports = pgTable(
  'content_reports',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    targetType: text({ enum: REPORT_TARGETS }).notNull(),
    targetId: uuid().notNull(),
    reporterId: uuid()
      .notNull()
      .references(() => users.id),
    reason: text({ enum: REPORT_REASONS }).notNull(),
    text: varchar({ length: 200 }),
    status: text({ enum: REPORT_STATUSES }).notNull().default('open'),
    handledBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    handledAt: timestamp({ withTimezone: true }),
    resolution: varchar({ length: 200 }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('content_reports_unique_uq').on(t.targetType, t.targetId, t.reporterId),
    index('content_reports_queue_idx').on(t.status, t.targetType, t.createdAt),
    index('content_reports_reporter_idx').on(t.reporterId),
  ],
);
