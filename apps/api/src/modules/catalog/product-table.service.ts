import { Inject, Injectable } from '@nestjs/common';
import { and, count, eq, ilike, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { decodeCursor, encodeCursor, parseLimit, timestampCursorBefore, timestampOrderDesc } from '../../platform/http/pagination.js';
import { type Store } from '../stores/index.js';
import { CatalogService } from './catalog.service.js';
import { products, productVariants } from './db/schema.js';

/**
 * Tabela de preço e estoque (WB-377, `listProductTable`): lista enxuta para a edição em linha. Rascunho e arquivado não entram. Três consultas no total
 * (página, agregado das variações da página, contagem exata do filtro), sem N+1.
 */
@Injectable()
export class ProductTableService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly catalog: CatalogService,
  ) {}

  /**
   * `includeReceive`: só quem gerencia o catálogo vê a comissão (WB-377 C6, DEC-118 item 2); com "Ver como" é SEMPRE falso (VA-14, o apresentador é decidido pela
   * credencial da visão, nunca pelo usuário). O funcionário sem `catalog` lê a tabela, mas sem `youReceiveCents`.
   */
  async list(store: Store, query: { q?: string | undefined; status?: 'active' | 'paused' | undefined; sectionId?: string | undefined; cursor?: string | undefined; limit?: unknown }, includeReceive: boolean) {
    this.catalog.assertWritable(store);
    const limit = parseLimit(query.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(query.cursor);
    const escaped = query.q?.replace(/[\\%_]/g, (c) => `\\${c}`);
    const filter = and(
      eq(products.storeId, store.id),
      query.status ? eq(products.status, query.status) : inArray(products.status, ['active', 'paused']),
      query.sectionId ? eq(products.sectionId, query.sectionId) : undefined,
      escaped ? ilike(products.name, `%${escaped}%`) : undefined,
    );
    const [rows, total] = await Promise.all([
      this.db
        .select()
        .from(products)
        .where(and(filter, timestampCursorBefore(products.createdAt, products.id, cursor)))
        .orderBy(...timestampOrderDesc(products.createdAt, products.id))
        .limit(limit + 1),
      this.db.select({ total: count() }).from(products).where(filter),
    ]);
    const page = rows.slice(0, limit);
    const ids = page.map((row) => row.id);
    const [aggregates, covers, estimate] = await Promise.all([
      ids.length === 0
        ? Promise.resolve([])
        : this.db
            .select({
              productId: productVariants.productId,
              available: sql<number>`coalesce(sum(${productVariants.stock} - ${productVariants.reserved}), 0)::int`,
              reserved: sql<number>`coalesce(sum(${productVariants.reserved}), 0)::int`,
              variantCount: sql<number>`count(*)::int`,
              firstVariantId: sql<string>`(array_agg(${productVariants.id} order by ${productVariants.createdAt}, ${productVariants.id}))[1]`,
            })
            .from(productVariants)
            .where(and(inArray(productVariants.productId, ids), eq(productVariants.active, true)))
            .groupBy(productVariants.productId),
      this.catalog.coverUrls(ids),
      includeReceive ? this.catalog.receiveEstimator(store.id) : Promise.resolve(null),
    ]);
    const byProduct = new Map(aggregates.map((row) => [row.productId, row]));
    const data = page.map((product) => {
      const agg = byProduct.get(product.id);
      return {
        id: product.id,
        name: product.name,
        status: product.status as 'active' | 'paused',
        moderationStatus: product.moderationStatus,
        cover: covers.get(product.id) ?? null,
        basePriceCents: product.basePriceCents,
        youReceiveCents: estimate && product.basePriceCents !== null ? estimate(product.basePriceCents, product.categoryId) : null,
        available: agg?.available ?? 0,
        reserved: agg?.reserved ?? 0,
        variantCount: agg?.variantCount ?? 0,
        singleVariantId: agg?.variantCount === 1 ? agg.firstVariantId : null,
        version: product.version,
        updatedAt: product.updatedAt.toISOString(),
      };
    });
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null, matchingCount: total[0]?.total ?? 0 };
  }
}
