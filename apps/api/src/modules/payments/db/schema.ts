import { sql } from 'drizzle-orm';
import {
  bigserial,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  index,
} from 'drizzle-orm/pg-core';

export const PAYMENT_METHODS = ['pix', 'card'] as const;
/** Estados da tentativa. Só avançam (approved nunca volta a pending; refunded é final). */
export const PAYMENT_STATUSES = [
  'pending',
  'pending_3ds',
  'approved',
  'declined',
  'expired',
  'cancelled',
  'refunded',
  'divergent',
] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];
export type PaymentStatus = (typeof PAYMENT_STATUSES)[number];

/**
 * Tentativa de pagamento (ADR-002). Em dinheiro tudo é centavos inteiro (SEC-030).
 * Não há coluna de CPF/cartão do pagador (SEC-044, regra inviolável nº 2).
 */
export const paymentAttempts = pgTable(
  'payment_attempts',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    provider: text().notNull(),
    providerPaymentId: text().notNull(),
    /** Referência ao pedido (Onda 4); hoje um identificador livre. */
    externalReference: text().notNull(),
    /** Loja recebedora, resolvida na criação (SEC-034). */
    storeId: uuid(),
    method: text({ enum: PAYMENT_METHODS }).notNull(),
    status: text({ enum: PAYMENT_STATUSES }).notNull().default('pending'),
    amountCents: integer().notNull(),
    currency: text().notNull().default('BRL'),
    applicationFeeCents: integer().notNull().default(0),
    installments: integer().notNull().default(1),
    /** PIX copia e cola / QR e data de expiração. */
    pixCopyPaste: text(),
    expiresAt: timestamp({ withTimezone: true }),
    declineReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('payment_attempts_provider_id_uq').on(t.provider, t.providerPaymentId),
    index('payment_attempts_reference_idx').on(t.externalReference),
  ],
);

export const paymentRefunds = pgTable(
  'payment_refunds',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    attemptId: uuid()
      .notNull()
      .references(() => paymentAttempts.id),
    providerRefundId: text().notNull(),
    /** Chave de idempotência do estorno (SEC-031): repetir a mesma chave não estorna de novo. */
    idempotencyKey: text().notNull(),
    amountCents: integer().notNull(),
    reason: text().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('payment_refunds_attempt_idx').on(t.attemptId),
    uniqueIndex('payment_refunds_idempotency_uq').on(t.attemptId, t.idempotencyKey),
  ],
);

export const WEBHOOK_STATUSES = ['pending', 'processed', 'failed', 'discarded'] as const;

/**
 * Fila durável e registro de idempotência dos webhooks (SEC-033): `event_key` = x-request-id (24 h)
 * ou `provider:data.id:action` quando não houver. Processamento com retentativa exponencial.
 */
export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: bigserial({ mode: 'number' }).primaryKey(),
    provider: text().notNull(),
    eventKey: text().notNull(),
    providerPaymentId: text().notNull(),
    type: text().notNull(),
    status: text({ enum: WEBHOOK_STATUSES }).notNull().default('pending'),
    attempts: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastError: text(),
    receivedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp({ withTimezone: true }),
  },
  (t) => [
    uniqueIndex('webhook_events_key_uq').on(t.provider, t.eventKey),
    index('webhook_events_due_idx').on(t.status, t.nextAttemptAt),
  ],
);

/** Alertas de conciliação/divergência para o admin (SEC-034, SEC-042). */
export const paymentAlerts = pgTable(
  'payment_alerts',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    attemptId: uuid().references(() => paymentAttempts.id),
    kind: text().notNull(),
    details: jsonb().$type<Record<string, unknown>>().notNull(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    resolvedAt: timestamp({ withTimezone: true }),
  },
  (t) => [index('payment_alerts_open_idx').on(t.resolvedAt, t.createdAt)],
);
