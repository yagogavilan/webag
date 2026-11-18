import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, type Page } from '../../platform/http/pagination.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { storeDecisionEmail } from '../../platform/mail/templates.js';
import { OBJECT_STORAGE, PRIVATE_URL_TTL_SECONDS, type ObjectStorage } from '../../platform/storage/object-storage.js';
import { AuditService } from '../admin/index.js';
import { users } from '../identity/db/schema.js';
import { mediaAssets } from '../media/db/schema.js';
import { paymentAccounts, storeDocuments, storeReviewItems, storeStatusHistory, stores } from './db/schema.js';
import { isOverdue } from './domain/business-days.js';
import { maskDocument } from './domain/document.js';
import { canTransitionStore, type StoreStatus } from './domain/state.js';
import { StoresService, type Store } from './stores.service.js';

export type DocumentAccessReason = 'initial_review' | 'doubt' | 'report';

/** Fila de aprovação e decisões sobre a loja (WB-103, WB-104, WB-218). Só super admin e operação decidem (SEC-021). */
@Injectable()
export class AdminStoresService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    @Inject(OBJECT_STORAGE) private readonly storage: ObjectStorage,
    private readonly storesService: StoresService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  async list(query: { status?: StoreStatus; cursor?: string; limit?: unknown; now?: Date }): Promise<Page<Record<string, unknown>>> {
    const limit = parseLimit(query.limit);
    const status = query.status ?? 'in_review';
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(stores)
      .where(
        and(
          eq(stores.status, status),
          cursor ? sql`(date_trunc('milliseconds', coalesce(${stores.submittedAt}, ${stores.createdAt})), ${stores.id}) > (${cursor.at}::timestamptz, ${cursor.id}::uuid)` : undefined,
        ),
      )
      .orderBy(sql`date_trunc('milliseconds', coalesce(${stores.submittedAt}, ${stores.createdAt})) asc`, asc(stores.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const sla = await this.storesService.slaDays();
    const now = query.now ?? new Date();
    const accounts = page.length > 0 ? await this.db.select({ storeId: paymentAccounts.storeId, status: paymentAccounts.status }).from(paymentAccounts).where(and(inArray(paymentAccounts.storeId, page.map((s) => s.id)), ne(paymentAccounts.status, 'disconnected'))) : [];
    const last = page.at(-1);
    return {
      data: page.map((store) => ({
        id: store.id,
        name: store.name,
        status: store.status,
        documentMasked: maskDocument(store.documentNumber),
        city: store.addressCityName,
        submittedAt: store.submittedAt?.toISOString() ?? null,
        // Fora da contagem do prazo enquanto aguarda o lojista (correção pedida).
        overdue: store.status === 'in_review' && store.slaStartedAt ? isOverdue(store.slaStartedAt, sla, now) : false,
        holderMismatch: accounts.some((a) => a.storeId === store.id && a.status === 'under_review'),
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: (last.submittedAt ?? last.createdAt).toISOString(), id: last.id }) : null,
    };
  }

  async detail(storeId: string) {
    const store = await this.storesService.getStore(storeId);
    const [documents, items, history, account, owner, sameDocument] = await Promise.all([
      this.db.select().from(storeDocuments).where(eq(storeDocuments.storeId, storeId)).orderBy(asc(storeDocuments.createdAt)),
      this.storesService.openReviewItems(storeId),
      this.storesService.statusHistory(storeId),
      this.db.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, storeId), ne(paymentAccounts.status, 'disconnected'))),
      this.storesService.ownerEmail(store),
      this.db.select({ id: stores.id, status: stores.status }).from(stores).where(and(eq(stores.documentNumber, store.documentNumber), ne(stores.id, storeId))),
    ]);
    return { store, documents, items, history, account: account[0] ?? null, owner, sameDocument };
  }

  /** WB-218: só admin com permissão, motivo obrigatório da lista curta, auditoria ANTES da URL (falha fechada), URL de 5 min. */
  async documentAccessUrl(storeId: string, documentId: string, reason: DocumentAccessReason, ctx: RequestContext) {
    const [row] = await this.db
      .select({ doc: storeDocuments, asset: mediaAssets })
      .from(storeDocuments)
      .innerJoin(mediaAssets, eq(mediaAssets.id, storeDocuments.assetId))
      .where(and(eq(storeDocuments.id, documentId), eq(storeDocuments.storeId, storeId)));
    if (!row || !row.asset.contentType) throw errors.notFound('Documento não encontrado.');
    return this.db.transaction(async (tx) => {
      await this.audit.record(tx, ctx, { action: 'store.document_view', targetType: 'store_document', targetId: documentId, reason, after: { storeId, kind: row.doc.kind } });
      const url = await this.storage.presignedGetUrl('private', row.asset.objectKey, { expiresSeconds: PRIVATE_URL_TTL_SECONDS, contentType: row.asset.contentType!, downloadName: `${row.doc.kind}` });
      return { url, expiresInSeconds: PRIVATE_URL_TTL_SECONDS, contentType: row.asset.contentType };
    });
  }

  /**
   * Decisão com lock da linha: duas decisões simultâneas resultam em exatamente uma; a outra recebe 409 "Já decidida por
   * [nome]". `from` é o estado exigido pela AÇÃO (aprovar só de "em análise"; reativar só de "suspensa", RN-16).
   */
  private async decide(
    storeId: string,
    admin: Principal,
    from: StoreStatus,
    to: StoreStatus,
    ctx: RequestContext,
    work: (tx: Parameters<Parameters<Db['transaction']>[0]>[0], store: Store) => Promise<Partial<typeof stores.$inferInsert>>,
    reason?: string,
  ): Promise<{ store: Store; before: Store }> {
    const result = await this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(stores).where(eq(stores.id, storeId)).for('update');
      if (!before) throw errors.notFound('Loja não encontrada.');
      if (before.status !== from || !canTransitionStore(before.status, to, 'admin')) return { kind: 'invalid' as const, current: before };
      const extra = await work(tx, before);
      const [after] = await tx
        .update(stores)
        .set({ status: to, decidedAt: new Date(), decidedBy: admin.userId, decisionReason: reason ?? null, updatedAt: new Date(), ...extra })
        .where(eq(stores.id, storeId))
        .returning();
      if (!after) throw new Error('Falha ao atualizar a loja');
      await tx.insert(storeStatusHistory).values({ storeId, fromStatus: before.status, toStatus: to, actorId: admin.userId, reason });
      await this.audit.record(tx, ctx, { action: `store.${DECISION_ACTION[to]}`, targetType: 'store', targetId: storeId, reason, before: { status: before.status }, after: { status: to } });
      return { kind: 'ok' as const, store: after, before };
    });
    if (result.kind === 'invalid') {
      const current = result.current;
      // Transição inválida: recusada com erro e AUDITADA (R-29).
      await this.audit.recordStandalone(ctx, { action: 'store.invalid_transition', targetType: 'store', targetId: storeId, before: { status: current.status }, after: { attempted: to } }).catch(() => undefined);
      const decisions: StoreStatus[] = ['approved', 'rejected', 'correction_requested'];
      if (from === 'in_review' && decisions.includes(current.status) && current.decidedBy) {
        const who = await this.nameOf(current.decidedBy);
        throw errors.conflict('STORE_ALREADY_DECIDED', 'Loja já decidida', who ? `Já decidida por ${who}.` : 'Já decidida.');
      }
      throw errors.conflict('INVALID_STORE_TRANSITION', 'Transição inválida', `Não é possível ir de ${current.status} para ${to}.`);
    }
    return { store: result.store, before: result.before };
  }

  private async nameOf(userId: string): Promise<string | null> {
    const [row] = await this.db.select({ name: users.name }).from(users).where(eq(users.id, userId));
    return row?.name ?? null;
  }

  async approve(storeId: string, admin: Principal, ctx: RequestContext): Promise<Store> {
    const { store } = await this.decide(storeId, admin, 'in_review', 'approved', ctx, (_tx, before) => Promise.resolve({ approvedAt: before.approvedAt ?? new Date(), suspendedAt: null, suspensionReason: null }));
    await this.notify(store, 'approved');
    return store;
  }

  /** Pedir correção: um motivo por item reprovado; o prazo do SLA fica pausado até o reenvio. */
  async requestCorrection(storeId: string, admin: Principal, items: { item: string; reason: string }[], ctx: RequestContext): Promise<Store> {
    const { store } = await this.decide(
      storeId,
      admin,
      'in_review',
      'correction_requested',
      ctx,
      async (tx, before) => {
        await tx.insert(storeReviewItems).values(items.map((i) => ({ storeId, item: i.item, reason: i.reason, createdBy: admin.userId })));
        return { slaElapsedMs: Math.max(0, Date.now() - (before.slaStartedAt?.getTime() ?? Date.now())) };
      },
      items.map((i) => `${i.item}: ${i.reason}`).join('; '),
    );
    await this.notify(store, 'correction', items.map((i) => `- ${i.item}: ${i.reason}`).join('\n'));
    return store;
  }

  async reject(storeId: string, admin: Principal, reason: string, ctx: RequestContext): Promise<Store> {
    const { store } = await this.decide(storeId, admin, 'in_review', 'rejected', ctx, () => Promise.resolve({}), reason);
    await this.notify(store, 'rejected', reason);
    return store;
  }

  async suspend(storeId: string, admin: Principal, reason: string, ctx: RequestContext): Promise<Store> {
    const { store } = await this.decide(storeId, admin, 'approved', 'suspended', ctx, () => Promise.resolve({ suspendedAt: new Date(), suspensionReason: reason }), reason);
    await this.notify(store, 'suspended', reason);
    return store;
  }

  async reactivate(storeId: string, admin: Principal, ctx: RequestContext): Promise<Store> {
    const { store } = await this.decide(storeId, admin, 'suspended', 'approved', ctx, () => Promise.resolve({ suspendedAt: null, suspensionReason: null }));
    await this.notify(store, 'reactivated');
    return store;
  }

  /** Alteração de nome/documento pendente (R-23): aprova ou descarta; a loja continuou vendendo com os dados antigos. */
  async decideDataReview(storeId: string, approve: boolean, reason: string, ctx: RequestContext): Promise<Store> {
    return this.db.transaction(async (tx) => {
      const [before] = await tx.select().from(stores).where(eq(stores.id, storeId)).for('update');
      if (!before?.pendingChanges) throw errors.conflict('NO_PENDING_CHANGES', 'Não há alteração pendente');
      const [after] = await tx
        .update(stores)
        .set({ ...(approve ? { name: before.pendingChanges.name ?? before.name } : {}), pendingChanges: null, updatedAt: new Date() })
        .where(eq(stores.id, storeId))
        .returning();
      if (!after) throw new Error('Falha ao decidir a alteração');
      await this.audit.record(tx, ctx, { action: approve ? 'store.data_review_approve' : 'store.data_review_reject', targetType: 'store', targetId: storeId, reason, before: { pending: before.pendingChanges }, after: { name: after.name } });
      return after;
    });
  }

  private async notify(store: Store, kind: 'approved' | 'correction' | 'rejected' | 'suspended' | 'reactivated', detail?: string): Promise<void> {
    const owner = await this.storesService.ownerEmail(store);
    if (owner.email) this.mail.enqueue({ to: owner.email, ...storeDecisionEmail(kind, store.name ?? 'sua loja', detail) });
  }
}

const DECISION_ACTION: Record<StoreStatus, string> = {
  draft: 'draft',
  in_review: 'submit',
  approved: 'approve',
  correction_requested: 'request_correction',
  rejected: 'reject',
  suspended: 'suspend',
};
