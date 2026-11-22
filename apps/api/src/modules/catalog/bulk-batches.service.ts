import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, type Db, type Tx } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc, type Page } from '../../platform/http/pagination.js';
import { StoresService } from '../stores/index.js';
import { productBulkBatches, productBulkBatchItems, type BulkKind, type BulkSource } from './db/schema.js';

/** Janela do "Desfazer" do reajuste de preço (WB-377 C4). */
export const UNDO_WINDOW_MS = 10 * 60_000;

export type BulkBatch = typeof productBulkBatches.$inferSelect;
export type BulkBatchItem = typeof productBulkBatchItems.$inferSelect;

export interface BulkBatchInput {
  storeId: string;
  kind: BulkKind;
  source: BulkSource;
  actorUserId: string;
  /** Quantos produtos mudaram de fato. */
  itemsCount: number;
  /** O que foi pedido; nunca texto livre. */
  params: Record<string, unknown>;
  /** Só `price_adjust`: o que era e o que ficou, por produto. */
  items?: Omit<BulkBatchItem, 'batchId'>[];
}

export interface BulkBatchView {
  id: string;
  kind: BulkKind;
  itemsCount: number;
  source: BulkSource;
  actorName: string;
  at: string;
  undoUntil: string | null;
  undone: boolean;
}

/**
 * Lotes de ação em massa (WB-377 C4/C7, WB-353 C6; ADR-018 D17/D18): gravação, histórico e as leituras/marcas do desfazer. SÓ persistência: quem orquestra o desfazer
 * (travar produtos, `version`, auditoria) é o `CatalogService`, para este serviço não depender dele (sem ciclo). Toda escrita recebe a transação do chamador:
 * o lote nasce e some junto com o efeito (e com a resposta guardada da `Idempotency-Key`).
 */
@Injectable()
export class BulkBatchesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly stores: StoresService,
  ) {}

  /** Grava o lote (e os itens do reajuste). `undoUntil` só existe em reajuste de preço. */
  async record(tx: Tx, input: BulkBatchInput): Promise<{ id: string; undoUntil: Date | null }> {
    const undoUntil = input.kind === 'price_adjust' ? new Date(Date.now() + UNDO_WINDOW_MS) : null;
    const [batch] = await tx
      .insert(productBulkBatches)
      .values({ storeId: input.storeId, kind: input.kind, source: input.source, actorUserId: input.actorUserId, itemsCount: input.itemsCount, params: input.params, undoUntil })
      .returning({ id: productBulkBatches.id });
    if (!batch) throw new Error('lote não gravado');
    if (input.items && input.items.length > 0) await tx.insert(productBulkBatchItems).values(input.items.map((item) => ({ ...item, batchId: batch.id })));
    return { id: batch.id, undoUntil };
  }

  /** `listBulkBatches`: mais recentes primeiro, cursor por (hora, id). Lote da Webag mostra só "Webag", nunca o nome da pessoa (J27). */
  async list(storeId: string, query: { cursor?: string | undefined; limit?: unknown }): Promise<Page<BulkBatchView>> {
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const rows = await this.db
      .select()
      .from(productBulkBatches)
      .where(and(eq(productBulkBatches.storeId, storeId), timestampCursorBefore(productBulkBatches.createdAt, productBulkBatches.id, cursor)))
      .orderBy(...timestampOrderDesc(productBulkBatches.createdAt, productBulkBatches.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const names = await this.stores.userNames(page.filter((b) => b.source === 'merchant' && b.actorUserId).map((b) => b.actorUserId as string));
    const last = page.at(-1);
    return {
      data: page.map((b) => ({
        id: b.id,
        kind: b.kind,
        itemsCount: b.itemsCount,
        source: b.source,
        actorName: b.source === 'admin' ? 'Webag' : ((b.actorUserId && names.get(b.actorUserId)) ?? 'Membro da loja'),
        at: b.createdAt.toISOString(),
        undoUntil: b.undoUntil ? b.undoUntil.toISOString() : null,
        undone: b.undoneAt !== null,
      })),
      nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null,
    };
  }

  /** Trava o lote da loja para o desfazer (duas chamadas simultâneas se serializam aqui). 404 para lote de outra loja ou inexistente. */
  async lockForUndo(tx: Tx, storeId: string, batchId: string): Promise<BulkBatch> {
    const [batch] = await tx.select().from(productBulkBatches).where(and(eq(productBulkBatches.id, batchId), eq(productBulkBatches.storeId, storeId))).for('update');
    if (!batch) throw errors.notFound('Lote não encontrado.');
    return batch;
  }

  async itemsOf(tx: Tx, batchId: string): Promise<BulkBatchItem[]> {
    return tx.select().from(productBulkBatchItems).where(eq(productBulkBatchItems.batchId, batchId)).orderBy(asc(productBulkBatchItems.productId));
  }

  async markUndone(tx: Tx, batchId: string, userId: string, result: NonNullable<BulkBatch['undoResult']>): Promise<void> {
    await tx.update(productBulkBatches).set({ undoneAt: sql`now()`, undoneBy: userId, undoResult: result }).where(eq(productBulkBatches.id, batchId));
  }
}
