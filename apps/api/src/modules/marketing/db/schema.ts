import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, jsonb, pgTable, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { cities } from '../../admin/db/schema.js';
import { users } from '../../identity/db/schema.js';

export const CAMPAIGN_STATUSES = ['scheduled', 'sending', 'sent', 'cancelled'] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

/**
 * WB-197: campanha de push de marketing. O público é RECALCULADO na hora do envio (o consentimento pode ter sido revogado e o limite
 * semanal mudou desde o agendamento). Contagens ficam na própria linha; nenhuma lista de pessoas é exposta ao admin.
 */
export const pushCampaigns = pgTable(
  'push_campaigns',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    title: varchar({ length: 60 }).notNull(),
    body: varchar({ length: 120 }).notNull(),
    destination: jsonb().$type<{ type: 'home' | 'store' | 'category' | 'coupon'; id?: string; code?: string }>().notNull(),
    segment: jsonb().$type<Record<string, unknown>>().notNull(),
    status: text({ enum: CAMPAIGN_STATUSES }).notNull().default('scheduled'),
    /** Quando deve sair (já ajustado à janela de marketing, 9h a 20h). */
    sendAt: timestamp({ withTimezone: true }).notNull(),
    sentAt: timestamp({ withTimezone: true }),
    estimatedCount: integer().notNull(),
    /** Pessoas que receberam (pelo menos um aparelho aceito) e mensagens aceitas pelo provedor. */
    recipientsCount: integer().notNull().default(0),
    deliveredCount: integer().notNull().default(0),
    excludedByCapCount: integer().notNull().default(0),
    cancelReason: text(),
    /** SEC-165: tentativas de envio (teto de 3) e quando a última começou (campanha presa em `sending` por 30 min vira cancelada com alerta, sem reenvio). */
    attempts: integer().notNull().default(0),
    sendingStartedAt: timestamp({ withTimezone: true }),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('push_campaigns_due_idx').on(t.sendAt).where(sql`${t.status} = 'scheduled'`), index('push_campaigns_created_idx').on(t.createdAt)],
);

/** Quem recebeu qual campanha: base do limite semanal, da abertura e dos descadastros. Sem o conteúdo do aparelho. */
export const pushCampaignRecipients = pgTable(
  'push_campaign_recipients',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    campaignId: uuid()
      .notNull()
      .references(() => pushCampaigns.id, { onDelete: 'cascade' }),
    userId: uuid()
      .notNull()
      .references(() => users.id),
    sentAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    openedAt: timestamp({ withTimezone: true }),
  },
  (t) => [uniqueIndex('push_campaign_recipients_uq').on(t.campaignId, t.userId), index('push_campaign_recipients_user_idx').on(t.userId, t.sentAt)],
);

/**
 * WB-115 C4: destaque fixado na Início (loja OU produto), por cidade e período. Aparece ANTES dos critérios automáticos e só se o item
 * estiver visível para o cliente (RN-03); `city_id` nulo = todas.
 */
export const homeHighlights = pgTable(
  'home_highlights',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    kind: text({ enum: ['store', 'product'] }).notNull(),
    targetId: uuid().notNull(),
    cityId: uuid().references(() => cities.id, { onDelete: 'cascade' }),
    startsAt: timestamp({ withTimezone: true }).notNull(),
    endsAt: timestamp({ withTimezone: true }).notNull(),
    position: integer().notNull().default(0),
    active: boolean().notNull().default(true),
    createdBy: uuid().references(() => users.id, { onDelete: 'set null' }),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('home_highlights_active_idx').on(t.active, t.startsAt, t.endsAt), check('home_highlights_period', sql`${t.endsAt} > ${t.startsAt}`)],
);
