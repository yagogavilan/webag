import { sql } from 'drizzle-orm';
import { index, integer, jsonb, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { users } from '../../identity/db/schema.js';

/** Finalidade do arquivo: decide bucket, formatos aceitos e quem pode ler (SEC-050, SEC-051). */
export const MEDIA_PURPOSES = ['store_logo', 'store_cover', 'product_image', 'store_document'] as const;
export type MediaPurpose = (typeof MEDIA_PURPOSES)[number];
export const MEDIA_STATUSES = ['pending', 'ready', 'rejected'] as const;
export type MediaStatus = (typeof MEDIA_STATUSES)[number];

/**
 * Arquivo enviado (ADR-005). A chave do objeto é gerada pelo servidor; o cliente nunca a escolhe. Foto pública: só as
 * variantes re-codificadas (WebP, sem EXIF/GPS) ficam no bucket público; o original fica no privado. Documento: só
 * no bucket privado.
 */
export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid().primaryKey().default(sql`gen_random_uuid()`),
    ownerUserId: uuid()
      .notNull()
      .references(() => users.id),
    /** Loja a que o arquivo pertence (documento, logo, capa, produto). */
    storeId: uuid(),
    purpose: text({ enum: MEDIA_PURPOSES }).notNull(),
    status: text({ enum: MEDIA_STATUSES }).notNull().default('pending'),
    /** Chave do original no bucket privado. */
    objectKey: text().notNull(),
    declaredContentType: text().notNull(),
    declaredSizeBytes: integer().notNull(),
    /** Detectado pelos magic bytes no `complete` (nunca o que o cliente declarou). */
    contentType: text(),
    sizeBytes: integer(),
    width: integer(),
    height: integer(),
    /** `{ "160": "products/<id>/<asset>/160.webp", ... }` no bucket público (só imagens públicas). */
    variants: jsonb().$type<Record<string, string>>(),
    rejectionReason: text(),
    createdAt: timestamp({ withTimezone: true }).notNull().defaultNow(),
    completedAt: timestamp({ withTimezone: true }),
    /** Upload pendente vencido (o cliente tem 15 min para enviar). */
    expiresAt: timestamp({ withTimezone: true }).notNull(),
  },
  (t) => [index('media_assets_owner_idx').on(t.ownerUserId, t.createdAt), index('media_assets_store_idx').on(t.storeId)],
);
