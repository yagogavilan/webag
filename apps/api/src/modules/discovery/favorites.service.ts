import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, lt, or, sql } from 'drizzle-orm';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { errors } from '../../platform/http/app-error.js';
import { decodeCursor, encodeCursor, parseLimit } from '../../platform/http/pagination.js';
import { products, productImages } from '../catalog/db/schema.js';
import { effectivePrice } from '../catalog/domain/price.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { stores } from '../stores/db/schema.js';
import { favorites } from './db/schema.js';

export const MAX_FAVORITES = 200;

export interface FavoriteView {
  kind: 'store' | 'product';
  unavailable: boolean;
  favoritedAt: string;
  store: { id: string; name: string; logo: { urls: Record<string, string> } } | null;
  product: { id: string; name: string; image: { urls: Record<string, string> }; price: { amount: number; currency: 'BRL' } | null; storeId: string; storeName: string } | null;
}

/** Favoritos da conta (WB-019). Só o dono lê e escreve; PUT e DELETE são idempotentes (rede ruim, toque duplo). */
@Injectable()
export class FavoritesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly media: MediaService,
  ) {}

  /** Loja visível (RN-03); senão 404, sem distinguir "não existe" de "não pode ver". */
  private async assertStoreVisible(storeId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: stores.id })
      .from(stores)
      .where(and(eq(stores.id, storeId), eq(stores.status, 'approved'), sql`exists (select 1 from payment_accounts pa where pa.store_id = ${stores.id} and pa.status = 'active')`));
    if (!row) throw errors.notFound('Loja não encontrada.');
  }

  private async assertProductVisible(productId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: products.id })
      .from(products)
      .innerJoin(stores, eq(stores.id, products.storeId))
      .where(and(eq(products.id, productId), eq(products.status, 'active'), eq(stores.status, 'approved')));
    if (!row) throw errors.notFound('Produto não encontrado.');
  }

  private async add(userId: string, target: { storeId: string } | { productId: string }): Promise<void> {
    await this.db.transaction(async (tx) => {
      // Trava por usuário: o teto de favoritos vale mesmo com várias requisições juntas.
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${`fav:${userId}`}, 0))`);
      const column = 'storeId' in target ? favorites.storeId : favorites.productId;
      const id = 'storeId' in target ? target.storeId : target.productId;
      const [existing] = await tx.select({ id: favorites.id }).from(favorites).where(and(eq(favorites.userId, userId), eq(column, id)));
      if (existing) return;
      const [{ count } = { count: 0 }] = await tx.select({ count: sql<number>`count(*)::int` }).from(favorites).where(eq(favorites.userId, userId));
      if (count >= MAX_FAVORITES) throw errors.unprocessable('FAVORITES_LIMIT_REACHED', `Limite de ${MAX_FAVORITES} favoritos`, { detail: 'Remova algum favorito para adicionar outro.' });
      await tx.insert(favorites).values({ userId, ...('storeId' in target ? { storeId: target.storeId } : { productId: target.productId }) });
    });
  }

  async addStore(userId: string, storeId: string): Promise<void> {
    await this.assertStoreVisible(storeId);
    await this.add(userId, { storeId });
  }

  async addProduct(userId: string, productId: string): Promise<void> {
    await this.assertProductVisible(productId);
    await this.add(userId, { productId });
  }

  async removeStore(userId: string, storeId: string): Promise<void> {
    await this.db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.storeId, storeId)));
  }

  async removeProduct(userId: string, productId: string): Promise<void> {
    await this.db.delete(favorites).where(and(eq(favorites.userId, userId), eq(favorites.productId, productId)));
  }

  /** Lista da conta, mais recentes primeiro. Favorito de loja/produto que saiu do ar vem como `unavailable` (WB-019 C3). */
  async list(userId: string, filters: { kind?: 'store' | 'product' | undefined; cursor?: string | undefined; limit?: unknown }) {
    const limit = parseLimit(filters.limit);
    const cursor = decodeCursor<{ at: string; id: string }>(filters.cursor);
    const rows = await this.db
      .select()
      .from(favorites)
      .where(
        and(
          eq(favorites.userId, userId),
          filters.kind === 'store' ? sql`${favorites.storeId} is not null` : filters.kind === 'product' ? sql`${favorites.productId} is not null` : undefined,
          cursor ? or(lt(favorites.createdAt, new Date(cursor.at)), and(eq(favorites.createdAt, new Date(cursor.at)), lt(favorites.id, cursor.id))) : undefined,
        ),
      )
      .orderBy(desc(favorites.createdAt), desc(favorites.id))
      .limit(limit + 1);
    const page = rows.slice(0, limit);
    const storeIds = page.flatMap((f) => (f.storeId ? [f.storeId] : []));
    const productIds = page.flatMap((f) => (f.productId ? [f.productId] : []));
    const [storeRows, productRows] = await Promise.all([
      storeIds.length ? this.db.select({ store: stores, logo: mediaAssets, visible: sql<boolean>`(${stores.status} = 'approved' and exists (select 1 from payment_accounts pa where pa.store_id = ${stores.id} and pa.status = 'active'))` }).from(stores).leftJoin(mediaAssets, eq(mediaAssets.id, stores.logoAssetId)).where(inArray(stores.id, storeIds)) : [],
      productIds.length ? this.db.select({ product: products, storeName: stores.name, storeStatus: stores.status }).from(products).innerJoin(stores, eq(stores.id, products.storeId)).where(inArray(products.id, productIds)) : [],
    ]);
    const covers = new Map<string, Record<string, string>>();
    if (productIds.length) {
      const images = await this.db.select({ productId: productImages.productId, asset: mediaAssets }).from(productImages).innerJoin(mediaAssets, eq(mediaAssets.id, productImages.assetId)).where(and(inArray(productImages.productId, productIds), eq(productImages.position, 0)));
      for (const image of images) covers.set(image.productId, this.media.publicVariants(image.asset) ?? {});
    }
    const now = new Date();
    const data = page.flatMap((fav): FavoriteView[] => {
      const base = { favoritedAt: fav.createdAt.toISOString() };
      if (fav.storeId) {
        const row = storeRows.find((r) => r.store.id === fav.storeId);
        if (!row) return [];
        return [{ ...base, kind: 'store', unavailable: !row.visible, store: { id: row.store.id, name: row.store.name ?? '', logo: { urls: (row.logo ? this.media.publicVariants(row.logo) : null) ?? {} } }, product: null }];
      }
      const row = productRows.find((r) => r.product.id === fav.productId);
      if (!row) return [];
      const p = row.product;
      const price = p.basePriceCents === null ? null : effectivePrice(p.basePriceCents, null, { promoPriceCents: p.promoPriceCents, promoStartsAt: p.promoStartsAt, promoEndsAt: p.promoEndsAt }, now);
      const unavailable = p.status !== 'active' || p.moderationStatus === 'paused' || p.moderationStatus === 'removed' || row.storeStatus !== 'approved';
      return [{ ...base, kind: 'product', unavailable, store: null, product: { id: p.id, name: p.name, image: { urls: covers.get(p.id) ?? {} }, price: price ? { amount: price.priceCents, currency: 'BRL' } : null, storeId: p.storeId, storeName: row.storeName ?? '' } }];
    });
    const last = page.at(-1);
    return { data, nextCursor: rows.length > limit && last ? encodeCursor({ at: last.createdAt.toISOString(), id: last.id }) : null };
  }
}
