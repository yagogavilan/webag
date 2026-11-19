import { sql } from 'drizzle-orm';
import { boolean, index, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';
import { legalDocuments } from '../../admin/db/schema.js';
/** WB-210: aceite versionado de termos e privacidade (append-only). */
export const termsAcceptances = pgTable('terms_acceptances', {
    id: uuid().primaryKey().default(sql `gen_random_uuid()`),
    userId: uuid()
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    documentId: uuid()
        .notNull()
        .references(() => legalDocuments.id),
    acceptedAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    ip: text(),
    platform: text(),
}, (t) => [index('terms_acceptances_user_idx').on(t.userId, t.documentId)]);
export const CONSENT_PURPOSES = [
    'marketing_push',
    'marketing_email',
    'precise_location',
    'waitlist',
];
/** WB-211: eventos de consentimento (concessão e revogação). O estado atual é o último evento por finalidade. */
export const consents = pgTable('consents', {
    id: uuid().primaryKey().default(sql `gen_random_uuid()`),
    userId: uuid()
        .notNull()
        .references(() => users.id, { onDelete: 'cascade' }),
    purpose: text({ enum: CONSENT_PURPOSES }).notNull(),
    granted: boolean().notNull(),
    textVersion: text().notNull(),
    channel: text().notNull(),
    ip: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
}, (t) => [index('consents_user_purpose_idx').on(t.userId, t.purpose, t.createdAt)]);
//# sourceMappingURL=schema.js.map