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
  varchar,
} from 'drizzle-orm/pg-core';

export const PAYMENT_METHODS = ['pix', 'card'] as const;
/** Estados da tentativa. Só avançam (approved nunca volta a pending; refunded é final). */
export const PAYMENT_STATUSES = [
  /** Gravada ANTES de falar com o provedor (review I3). `provider_payment_id` ainda nulo. */
  'creating',
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
    /** Nulo só enquanto `status = 'creating'` (a tentativa é gravada antes da cobrança, review I3). */
    providerPaymentId: text(),
    /** Referência ao pedido (Onda 4); hoje um identificador livre. */
    externalReference: text().notNull(),
    /** Loja recebedora, resolvida na criação (SEC-034). */
    storeId: uuid(),
    /**
     * Conta do provedor que RECEBEU (SEC-130): estorno e re-consulta usam os tokens desta conta, mesmo que a loja a tenha
     * desconectado ou trocado depois. Nulo em tentativas antigas ou sem loja (cai na conta ativa).
     */
    receiverAccountId: text(),
    method: text({ enum: PAYMENT_METHODS }).notNull(),
    status: text({ enum: PAYMENT_STATUSES }).notNull().default('creating'),
    amountCents: integer().notNull(),
    currency: text().notNull().default('BRL'),
    applicationFeeCents: integer().notNull().default(0),
    installments: integer().notNull().default(1),
    /** PIX copia e cola / QR e data de expiração. */
    pixCopyPaste: text(),
    pixQrBase64: text(),
    /** Desafio 3DS do cartão (URL do provedor); só enquanto `pending_3ds`. */
    threeDsUrl: text(),
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

/**
 * `pending`: a tentar (com `next_attempt_at`); `done`: estornado no provedor; `exhausted`: esgotou as tentativas e espera o
 * admin (SEC-130); `covered`: a Webag assumiu o valor e paga o cliente por fora (DEC-020a); `failed`: legado (não é mais gravado).
 */
export const REFUND_INTENT_STATUSES = ['pending', 'done', 'failed', 'exhausted', 'covered'] as const;

/**
 * Intenção de estorno (review I4): gravada na transação que trava a tentativa e confere a soma, ANTES de chamar o
 * provedor (fora da transação). `payment_refunds` continua append-only e só recebe o estorno confirmado.
 */
export const paymentRefundIntents = pgTable(
  'payment_refund_intents',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    attemptId: uuid()
      .notNull()
      .references(() => paymentAttempts.id),
    idempotencyKey: text().notNull(),
    amountCents: integer().notNull(),
    reason: text().notNull(),
    status: text({ enum: REFUND_INTENT_STATUSES }).notNull().default('pending'),
    /** Quem pediu (N1): a conciliação conclui o estorno depois e a auditoria precisa do ator original. Nulo = sistema. */
    actorId: uuid(),
    actorRole: text(),
    requestId: text(),
    providerRefundId: text(),
    /** Falhas definitivas do provedor até aqui e a próxima tentativa (backoff, SEC-130). */
    failures: integer().notNull().default(0),
    nextAttemptAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    lastErrorCode: text(),
    /** SEC-141: lease de quem está chamando o provedor agora; enquanto válido, ninguém cobre nem repete esta intenção. */
    inFlightUntil: timestamp({ withTimezone: true }),
    /** Cobertura da Webag (DEC-020a): quem assumiu, quando e por quê. */
    coveredBy: uuid(),
    coveredAt: timestamp({ withTimezone: true }),
    coverageReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('payment_refund_intents_key_uq').on(t.attemptId, t.idempotencyKey), index('payment_refund_intents_pending_idx').on(t.status, t.updatedAt)],
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
    /** B3 / WB-198: quem encerrou o alerta à mão e a nota (a trilha completa fica na auditoria). Nulos quando o sistema o resolveu sozinho. Sem FK: é só o id do admin. */
    resolvedBy: uuid(),
    resolutionNote: varchar({ length: 300 }),
  },
  (t) => [index('payment_alerts_open_idx').on(t.resolvedAt, t.createdAt)],
);
