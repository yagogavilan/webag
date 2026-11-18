import { eq } from 'drizzle-orm';
import {
  paymentAccounts,
  products,
  productVariants,
  reviews,
  storeDeliveryTiers,
  storeHours,
  storeSections,
  storeSettings,
} from '../../src/platform/database/schema.js';
import type { TestContext } from './app.js';
import { ensureCity, insertStoreRow, registerUser } from './fixtures.js';

export interface TestPoint {
  lat: number;
  lng: number;
}

const CELLS = 110 * 300;
let cell = Math.floor(Math.random() * CELLS);
/**
 * Centro isolado por teste: cada chamada devolve uma célula de 0,5 grau (~55 km) diferente, acima do raio máximo (50 km
 * de parâmetro; 15 km padrão). Os arquivos de teste compartilham o banco e começam em células aleatórias distintas.
 */
export function isolatedPoint(): TestPoint {
  cell = (cell + 7919) % CELLS;
  return { lat: -5 - (cell % 110) * 0.5, lng: -20 - Math.floor(cell / 110) * 0.5 };
}

/** Ponto a `meters` ao norte de `origin`, calculado pelo PostGIS (geography), como o servidor mede. */
export async function northOf(ctx: TestContext, origin: TestPoint, meters: number): Promise<TestPoint> {
  const { rows } = await ctx.pool.query<TestPoint>('select ST_Y(p::geometry) as lat, ST_X(p::geometry) as lng from (select ST_Project(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, $3::float8, 0::float8) as p) t', [origin.lng, origin.lat, meters]);
  return rows[0]!;
}

/** Distância (m) inteira entre dois pontos, como o servidor calcula (`round(ST_Distance)`). */
export async function distanceM(ctx: TestContext, a: TestPoint, b: TestPoint): Promise<number> {
  const { rows } = await ctx.pool.query<{ d: number }>('select round(ST_Distance(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography))::int as d', [a.lng, a.lat, b.lng, b.lat]);
  return rows[0]!.d;
}

export interface TestProduct {
  name: string;
  priceCents?: number;
  promoPriceCents?: number;
  categoryId?: string;
  /** Estoque por variação; vazio = uma variação sem atributo com `stock`. */
  stock?: number;
  reserved?: number;
  status?: 'active' | 'paused' | 'draft';
  moderationStatus?: 'ok' | 'paused' | 'removed';
  section?: string;
}

export interface TestStoreOptions {
  name: string;
  at: TestPoint;
  cityName?: string;
  radiusM?: number;
  feeMode?: 'fixed' | 'by_distance';
  feeFixedCents?: number;
  tiers?: { fromM: number; toM: number; feeCents: number }[];
  minOrderCents?: number;
  freeAboveCents?: number;
  voluntaryExchangeDays?: number;
  status?: 'approved' | 'in_review' | 'suspended';
  payment?: boolean;
  open?: boolean;
  pausedIndefinitely?: boolean;
  pickupEnabled?: boolean;
  acceptsDelivery?: boolean;
  categoryId?: string;
  approvedDaysAgo?: number;
  products?: TestProduct[];
  /** Notas (1 a 5) de avaliações publicadas da loja. */
  ratings?: number[];
}

export interface TestStore {
  id: string;
  ownerUserId: string;
  productIds: string[];
}

/** Loja visível (RN-03) inserida direto no banco: aprovada, conta de recebimento ativa, produto ativo com estoque. */
export async function makeStore(ctx: TestContext, options: TestStoreOptions): Promise<TestStore> {
  const owner = await registerUser(ctx);
  const city = await ensureCity(ctx, options.cityName ?? 'Francisco Morato');
  const row = await insertStoreRow(ctx, owner.userId, {
    status: options.status ?? 'approved',
    name: options.name,
    mainCategoryId: options.categoryId ?? null,
    addressCityId: city.id,
    addressCityName: city.name,
    addressState: 'SP',
    lat: options.at.lat,
    lng: options.at.lng,
    approvedAt: new Date(Date.now() - (options.approvedDaysAgo ?? 90) * 86_400_000),
  });
  await ctx.db
    .update(storeSettings)
    .set({
      radiusM: options.radiusM ?? 5000,
      feeMode: options.feeMode ?? 'fixed',
      feeFixedCents: options.feeFixedCents ?? 500,
      minOrderCents: options.minOrderCents ?? 0,
      freeAboveCents: options.freeAboveCents ?? 0,
      voluntaryExchangeDays: options.voluntaryExchangeDays ?? 0,
      pickupEnabled: options.pickupEnabled ?? false,
      acceptsDelivery: options.acceptsDelivery ?? true,
      pausedIndefinitely: options.pausedIndefinitely ?? false,
    })
    .where(eq(storeSettings.storeId, row.id));
  if (options.tiers) await ctx.db.insert(storeDeliveryTiers).values(options.tiers.map((t, position) => ({ storeId: row.id, position, ...t })));
  if (options.open !== false) {
    await ctx.db.insert(storeHours).values([0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ storeId: row.id, weekday, startMin: 0, endMin: 1439 })));
  }
  if (options.payment !== false) {
    await ctx.db.insert(paymentAccounts).values({ storeId: row.id, provider: 'fake', providerAccountId: `t-${row.id}`, status: 'active', holderDocumentMasked: '***', holderMatchesStore: true, tokensEnc: 'x', connectedBy: owner.userId });
  }
  const productIds: string[] = [];
  const sections = new Map<string, string>();
  for (const [index, item] of (options.products ?? [{ name: `Produto de ${options.name}` }]).entries()) {
    let sectionId: string | null = null;
    if (item.section) {
      if (!sections.has(item.section)) {
        const [section] = await ctx.db.insert(storeSections).values({ storeId: row.id, name: item.section, position: sections.size }).returning();
        sections.set(item.section, section!.id);
      }
      sectionId = sections.get(item.section)!;
    }
    const base = item.priceCents ?? 1000;
    const [product] = await ctx.db
      .insert(products)
      .values({
        storeId: row.id,
        name: item.name,
        categoryId: item.categoryId ?? null,
        sectionId,
        position: index,
        status: item.status ?? 'active',
        moderationStatus: item.moderationStatus ?? 'ok',
        basePriceCents: base,
        ...(item.promoPriceCents
          ? { promoPriceCents: item.promoPriceCents, promoStartsAt: new Date(Date.now() - 3_600_000), promoEndsAt: new Date(Date.now() + 86_400_000) }
          : {}),
        publishedAt: new Date(),
      })
      .returning();
    productIds.push(product!.id);
    await ctx.db.insert(productVariants).values({ productId: product!.id, storeId: row.id, attributes: {}, attributesKey: '', stock: item.stock ?? 10, reserved: item.reserved ?? 0 });
  }
  for (const rating of options.ratings ?? []) {
    const reviewer = await registerUser(ctx);
    await ctx.db.insert(reviews).values({ storeId: row.id, userId: reviewer.userId, rating, comment: `Nota ${rating}` });
  }
  return { id: row.id, ownerUserId: owner.userId, productIds };
}

export const clearFeedCache = async (ctx: TestContext): Promise<void> => {
  await ctx.redis.flushdb();
};


/** Variação única da loja de teste (a que `makeStore` cria junto do produto). */
export async function variantOf(ctx: TestContext, productId: string): Promise<string> {
  const [variant] = await ctx.db.select({ id: productVariants.id }).from(productVariants).where(eq(productVariants.productId, productId));
  if (!variant) throw new Error('produto sem variação');
  return variant.id;
}
