import { Inject, Injectable } from '@nestjs/common';
import { inArray, sql } from 'drizzle-orm';
import { CacheService } from '../../platform/cache/cache.service.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { ParametersService } from '../admin/index.js';
import { MediaService } from '../media/index.js';
import { mediaAssets } from '../media/db/schema.js';
import { storeExtraCategories, storeHolidays, storeHours } from '../stores/db/schema.js';
import { DeliveryFeesService, pickTier } from '../logistics/index.js';
import { type WeeklyHours } from '../stores/index.js';
import { hoursToday, isOpen, nextOpening, type OpeningInput } from '../stores/index.js';
import { type GeoPoint, pointKey, pointSql } from './geo.js';

export type DiscoveryMode = 'delivery' | 'pickup';

/** Loja visível ao cliente naquele ponto (RN-03), já com distância, taxa e estado de abertura. Serializável (cache). */
export interface FeedStore {
  id: string;
  name: string;
  description: string | null;
  mainCategoryId: string | null;
  categoryIds: string[];
  logo: Record<string, string> | null;
  approvedAt: string;
  distanceM: number;
  deliversHere: boolean;
  feeCents: number | null;
  freeAboveCents: number;
  minOrderCents: number;
  etaMinMinutes: number;
  etaMaxMinutes: number;
  pickupEnabled: boolean;
  acceptsExchange: boolean;
  open: boolean;
  opensAt: string | null;
  hoursToday: { start: string; end: string }[];
  ratingAverage: number | null;
  ratingCount: number;
  isNew: boolean;
}

interface StoreRow extends Record<string, unknown> {
  id: string;
  name: string;
  description: string | null;
  main_category_id: string | null;
  logo_asset_id: string | null;
  approved_at: Date;
  accepts_delivery: boolean;
  address_city_id: string | null;
  eta_min_minutes: number;
  eta_max_minutes: number;
  pickup_enabled: boolean;
  voluntary_exchange_days: number;
  paused_until: Date | null;
  paused_indefinitely: boolean;
  distance_m: number;
  avg_rating: number | null;
  rating_count: number;
}

const FEED_TTL_SECONDS = 30;
const NEW_STORE_DAYS = 30;

/**
 * Lojas que o cliente enxerga num ponto (RN-03, RN-04). UMA consulta PostGIS (`ST_DWithin` sobre o GiST de
 * `stores.location`) devolve os candidatos dentro do raio máximo; a regra final de entrega (raio da loja, faixas
 * `[de, até)`) usa `deliveryFee`, a MESMA função do checkout e da prévia do lojista. Loja fora do raio some.
 */
@Injectable()
export class StoreFeedService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly cache: CacheService,
    private readonly params: ParametersService,
    private readonly media: MediaService,
    private readonly fees: DeliveryFeesService,
  ) {}

  async at(point: GeoPoint, mode: DiscoveryMode): Promise<FeedStore[]> {
    return this.cache.wrap('feed', `${mode}:${pointKey(point)}`, FEED_TTL_SECONDS, () => this.compute(point, mode));
  }

  private async compute(point: GeoPoint, mode: DiscoveryMode): Promise<FeedStore[]> {
    const now = new Date();
    const maxKm = await this.params.getNumber(mode === 'pickup' ? 'retirada_distancia_max_km' : 'raio_max_km');
    const minRatings = await this.params.getNumber('avaliacao_min_exibicao');
    const result = await this.db.execute<StoreRow>(sql`
      select s.id, s.name, s.description, s.main_category_id, s.logo_asset_id, s.approved_at,
             s.address_city_id, ss.accepts_delivery,
             ss.eta_min_minutes, ss.eta_max_minutes, ss.pickup_enabled, ss.voluntary_exchange_days,
             ss.paused_until, ss.paused_indefinitely,
             round(ST_Distance(s.location, ${pointSql(point)}))::int as distance_m,
             r.avg_rating, coalesce(r.rating_count, 0)::int as rating_count
        from stores s
        join store_settings ss on ss.store_id = s.id
        join cities c on c.id = s.address_city_id and c.active
        left join lateral (
          select avg(rating)::float8 as avg_rating, count(*) as rating_count
            from reviews where store_id = s.id and product_id is null and status = 'published'
        ) r on true
       where s.status = 'approved'
         and s.location is not null
         and ST_DWithin(s.location, ${pointSql(point)}, ${maxKm * 1000})
         and exists (select 1 from payment_accounts pa where pa.store_id = s.id and pa.status = 'active')
         and exists (select 1 from products p where p.store_id = s.id and p.status = 'active' and p.moderation_status in ('ok', 'review'))
         and ${mode === 'pickup' ? sql`ss.pickup_enabled` : sql`ss.accepts_delivery`}
    `);
    const rows = result.rows;
    if (rows.length === 0) return [];
    const ids = rows.map((row) => row.id);

    const today = new Date(now.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    const [hourRows, holidayRows, extraRows, logoRows] = await Promise.all([
      this.db.select().from(storeHours).where(inArray(storeHours.storeId, ids)),
      this.db.select().from(storeHolidays).where(inArray(storeHolidays.storeId, ids)),
      this.db.select().from(storeExtraCategories).where(inArray(storeExtraCategories.storeId, ids)),
      this.db.select().from(mediaAssets).where(inArray(mediaAssets.id, rows.map((row) => row.logo_asset_id).filter((id): id is string => id !== null))),
    ]);
    const logos = new Map(logoRows.map((asset) => [asset.id, this.media.publicVariants(asset)]));

    const [freeAbove, minOrder, radiusKm] = await Promise.all([this.params.getNumber('frete_gratis_acima_cents'), this.params.getNumber('pedido_minimo_cents'), this.params.getNumber('raio_max_km')]);
    const tableCache = new Map<string | null, Promise<Awaited<ReturnType<DeliveryFeesService['resolve']>>>>();
    const feeTables = { get: (cityId: string | null) => tableCache.get(cityId) ?? tableCache.set(cityId, this.fees.resolve({ cityId, neighborhoodId: null })).get(cityId)! };
    const feed: FeedStore[] = [];
    for (const row of rows) {
      const distanceM = Number(row.distance_m);
      // L.1 (DEC-036): taxa da tabela do admin (cidade da loja como estimativa; o carrinho usa o destino exato) e raio global.
      const table = row.address_city_id ? ((await feeTables.get(row.address_city_id)) ?? (await feeTables.get(null))) : await feeTables.get(null);
      const picked = row.accepts_delivery && distanceM <= radiusKm * 1000 && table ? pickTier(table.tiers, distanceM) : null;
      const fee = picked ? picked.tier.feeCents : null;
      const deliversHere = fee !== null;
      if (mode === 'delivery' && !deliversHere) continue; // fora do raio da loja: some da lista (RN-04)

      const weekly: WeeklyHours = {};
      for (const h of hourRows.filter((x) => x.storeId === row.id)) (weekly[h.weekday] ??= []).push({ startMin: h.startMin, endMin: h.endMin });
      const opening: OpeningInput = {
        hours: weekly,
        holidays: new Set(holidayRows.filter((h) => h.storeId === row.id && h.day >= today).map((h) => h.day)),
        pausedUntil: row.paused_until,
        pausedIndefinitely: row.paused_indefinitely,
      };
      const open = isOpen(opening, now);
      const count = Number(row.rating_count);
      feed.push({
        id: row.id,
        name: row.name,
        description: row.description,
        mainCategoryId: row.main_category_id,
        categoryIds: [...new Set([...(row.main_category_id ? [row.main_category_id] : []), ...extraRows.filter((e) => e.storeId === row.id).map((e) => e.categoryId)])],
        logo: row.logo_asset_id ? (logos.get(row.logo_asset_id) ?? null) : null,
        approvedAt: new Date(row.approved_at).toISOString(),
        distanceM,
        deliversHere,
        feeCents: fee,
        freeAboveCents: freeAbove,
        minOrderCents: minOrder,
        etaMinMinutes: row.eta_min_minutes,
        etaMaxMinutes: row.eta_max_minutes,
        pickupEnabled: row.pickup_enabled,
        acceptsExchange: row.voluntary_exchange_days > 0,
        open,
        opensAt: open ? null : (nextOpening(opening, now)?.toISOString() ?? null),
        hoursToday: hoursToday(opening, now),
        // Média pública só a partir de `avaliacao_min_exibicao` avaliações (RN-12); antes disso, "Novo".
        ratingAverage: count >= minRatings && row.avg_rating !== null ? Math.round(row.avg_rating * 10) / 10 : null,
        ratingCount: count,
        isNew: count < minRatings,
      });
    }
    return feed;
  }

  /** Ordem da home e da relevância (RN-03, HIP-032): abertas primeiro, depois distância, depois avaliação. */
  static byRelevance(a: FeedStore, b: FeedStore): number {
    if (a.open !== b.open) return a.open ? -1 : 1;
    if (a.distanceM !== b.distanceM) return a.distanceM - b.distanceM;
    return (b.ratingAverage ?? 0) - (a.ratingAverage ?? 0) || a.name.localeCompare(b.name);
  }

  static isRecent(store: FeedStore, now: Date): boolean {
    return now.getTime() - new Date(store.approvedAt).getTime() <= NEW_STORE_DAYS * 86_400_000;
  }
}
