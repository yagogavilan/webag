import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gte, ilike, inArray, lte, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { StorefrontCacheService } from '../../platform/cache/storefront-cache.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { productRemovedEmail } from '../../platform/mail/templates.js';
import { AuditService } from '../admin/index.js';
import { categories } from '../admin/db/schema.js';
import { isUniqueViolation } from '../admin/util.js';
import { StoresService } from '../stores/index.js';
import { stores } from '../stores/db/schema.js';
import { moderationTerms, productModerationEvents, products, type ModerationStatus } from './db/schema.js';
import { normalizeWord, shouldFlagForSuspension } from './domain/moderation.js';

/** Moderação de produtos pelo admin (WB-107): pausar, remover, restaurar, e as duas listas editáveis. */
@Injectable()
export class ModerationService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly audit: AuditService,
    private readonly stores: StoresService,
    private readonly mail: MailService,
    private readonly storefront: StorefrontCacheService,
  ) {}

  async list(filters: { storeId?: string; categoryId?: string; moderationStatus?: ModerationStatus; status?: string; from?: Date; to?: Date; q?: string; cursor?: string; limit?: unknown }): Promise<Page<unknown>> {
    const limit = parseLimit(filters.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(filters.cursor);
    const escaped = filters.q?.replace(/[\\%_]/g, (c) => `\\${c}`);
    const rows = await this.db
      .select({ product: products, storeName: stores.name })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(
        and(
          filters.storeId ? eq(products.storeId, filters.storeId) : undefined,
          filters.categoryId ? eq(products.categoryId, filters.categoryId) : undefined,
          filters.moderationStatus ? eq(products.moderationStatus, filters.moderationStatus) : undefined,
          filters.status ? sql`${products.status} = ${filters.status}` : undefined,
          filters.from ? gte(products.createdAt, filters.from) : undefined,
          filters.to ? lte(products.createdAt, filters.to) : undefined,
          escaped ? ilike(products.name, `%${escaped}%`) : undefined,
          timestampCursorBefore(products.createdAt, products.id, cursor),
        ),
      )
      .orderBy(...timestampOrderDesc(products.createdAt, products.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const last = page.at(-1)?.product;
    return {
      data: page.map(({ product, storeName }) => ({
        id: product.id,
        name: product.name,
        description: product.description,
        storeId: product.storeId,
        storeName,
        categoryId: product.categoryId,
        status: product.status,
        moderationStatus: product.moderationStatus,
        moderationReason: product.moderationReason,
        moderatedAt: product.moderatedAt?.toISOString() ?? null,
        basePriceCents: product.basePriceCents,
        createdAt: product.createdAt.toISOString(),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /**
   * Pausar/remover exigem motivo (422) e avisam o lojista por e-mail com o motivo; restaurar volta a `ok`. Tudo na mesma
   * transação da auditoria. Três remoções da loja em 30 dias a sinalizam para análise de suspensão (WB-107 C4).
   */
  async moderate(principal: Principal, productId: string, input: { action: 'pause' | 'remove' | 'restore'; reason?: string }, ctx: RequestContext) {
    if (input.action !== 'restore' && !input.reason) {
      throw errors.unprocessable('REASON_REQUIRED', 'Informe o motivo', { errors: [{ field: 'reason', message: 'O motivo é obrigatório para pausar ou remover.' }] });
    }
    const outcome = await this.db.transaction(async (tx) => {
      const [product] = await tx.select().from(products).where(eq(products.id, productId)).for('update');
      if (!product) throw errors.notFound('Produto não encontrado.');
      const next: ModerationStatus = input.action === 'pause' ? 'paused' : input.action === 'remove' ? 'removed' : 'ok';
      if (product.moderationStatus === next) throw errors.conflict('ALREADY_IN_STATE', 'Nada a fazer', 'O produto já está nesse estado de moderação.');
      await tx
        .update(products)
        .set({ moderationStatus: next, moderationReason: input.action === 'restore' ? null : (input.reason ?? null), moderatedBy: principal.userId, moderatedAt: new Date(), updatedAt: new Date() })
        .where(eq(products.id, productId));
      await tx.insert(productModerationEvents).values({ productId, storeId: product.storeId, action: input.action, reason: input.reason ?? null, actorId: principal.userId });
      await this.audit.record(tx, ctx, {
        action: `product.moderation_${input.action}`,
        targetType: 'product',
        targetId: productId,
        before: { moderationStatus: product.moderationStatus },
        after: { moderationStatus: next, storeId: product.storeId },
        reason: input.reason,
      });
      let storeFlagged = false;
      if (input.action === 'remove') {
        const removals = await tx
          .select({ at: productModerationEvents.createdAt })
          .from(productModerationEvents)
          .where(and(eq(productModerationEvents.storeId, product.storeId), eq(productModerationEvents.action, 'remove'), gte(productModerationEvents.createdAt, new Date(Date.now() - 30 * 86_400_000))));
        storeFlagged = shouldFlagForSuspension(removals.map((r) => r.at), new Date());
      }
      return { product, next, storeFlagged };
    });

    // DEC-113: pausar, remover ou restaurar muda a vitrine; o produto some (ou volta) em até 5 s, não no fim do TTL. Depois do commit (o escrito já vale).
    await this.storefront.takedown(outcome.product.storeId, productId);

    let storeFlagged = false;
    if (outcome.storeFlagged) {
      storeFlagged = await this.stores.flagSuspensionReview(outcome.product.storeId);
      if (storeFlagged) await this.audit.recordStandalone(ctx, { action: 'store.suspension_review_flagged', targetType: 'store', targetId: outcome.product.storeId, reason: '3 produtos removidos em 30 dias' });
    }
    if (input.action !== 'restore') {
      const store = await this.stores.getStore(outcome.product.storeId);
      const owner = await this.stores.ownerEmail(store);
      if (owner.email) this.mail.enqueue({ to: owner.email, ...productRemovedEmail(outcome.product.name, input.reason ?? '', input.action === 'remove' ? 'removed' : 'paused') });
    }
    return { id: productId, moderationStatus: outcome.next, storeFlagged };
  }

  // ------------------------------------------------------------------ listas

  async terms() {
    const rows = await this.db.select().from(moderationTerms).orderBy(desc(moderationTerms.createdAt));
    const ids = rows.filter((r) => r.kind === 'forbidden_category').map((r) => r.value);
    const names = ids.length > 0 ? await this.db.select({ id: categories.id, name: categories.name }).from(categories).where(inArray(categories.id, ids)) : [];
    return rows.map((row) => ({ id: row.id, kind: row.kind, value: row.value, label: row.kind === 'forbidden_category' ? (names.find((n) => n.id === row.value)?.name ?? null) : row.value, createdAt: row.createdAt.toISOString() }));
  }

  /** Categoria proibida BLOQUEIA o cadastro; palavra suspeita só SINALIZA (palavra inteira, sem caixa nem acento). */
  async addTerm(principal: Principal, input: { kind: 'forbidden_category' | 'suspect_word'; value: string }, ctx: RequestContext) {
    let value = input.value.trim();
    if (input.kind === 'suspect_word') {
      value = normalizeWord(value);
      if (!/^[a-z0-9]+$/.test(value)) throw errors.unprocessable('TERM_INVALID', 'Palavra inválida', { errors: [{ field: 'value', message: 'Use uma palavra só, sem espaços nem símbolos.' }] });
    } else {
      const [category] = await this.db.select({ id: categories.id }).from(categories).where(eq(categories.id, value)).catch(() => []);
      if (!category) throw errors.unprocessable('TERM_INVALID', 'Categoria não encontrada', { errors: [{ field: 'value', message: 'Informe o id de uma categoria existente.' }] });
    }
    try {
      return await this.db.transaction(async (tx) => {
        const [row] = await tx.insert(moderationTerms).values({ kind: input.kind, value, createdBy: principal.userId }).returning();
        if (!row) throw new Error('Falha ao gravar termo');
        await this.audit.record(tx, ctx, { action: 'moderation.term_add', targetType: 'moderation_term', targetId: row.id, after: { kind: input.kind, value } });
        return { id: row.id, kind: row.kind, value: row.value, createdAt: row.createdAt.toISOString() };
      });
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('TERM_EXISTS', 'Já está na lista', 'Esse item já está na lista.');
      throw error;
    }
  }

  async removeTerm(termId: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      const [row] = await tx.delete(moderationTerms).where(eq(moderationTerms.id, termId)).returning();
      if (!row) throw errors.notFound('Item não encontrado.');
      await this.audit.record(tx, ctx, { action: 'moderation.term_remove', targetType: 'moderation_term', targetId: termId, before: { kind: row.kind, value: row.value } });
    });
  }
}
