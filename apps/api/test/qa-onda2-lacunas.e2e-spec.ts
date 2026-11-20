import { eq } from 'drizzle-orm';
import { paymentAccounts, products, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, type TestMerchant } from './helpers/fixtures.js';
import { makeStore, isolatedPoint, northOf } from './helpers/discovery.js';

/**
 * Lacunas do plano da Onda 2 (`docs/qa/planos/onda-2.md`) que nenhum outro arquivo cobria, escritas pelo QA contra
 * Postgres e Redis reais: O2-SEG-03 (DTO de produto), O2-ENT-05 (distância PostGIS x haversine independente) e
 * O2-APR-11 (cada critério de RN-03 desligado isoladamente tira a loja da API pública).
 */
describe('QA Onda 2: lacunas do plano', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let categoryId: string;
  const as = (u: { accessToken: string }) => bearer(u.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Lacunas QA' })).id;
    categoryId = await ensureCategory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('O2-SEG-03: DTO de produto recusa campos de moderação e de propriedade (criação e edição) com 400, sem gravar nada', async () => {
    const forbidden: Record<string, unknown>[] = [
      { status: 'active' },
      { storeId: '00000000-0000-4000-8000-000000000001' },
      { moderationStatus: 'approved' },
      { ownerId: '00000000-0000-4000-8000-000000000001' },
      { approvedAt: '2026-01-01T00:00:00Z' },
      { commission: 0 },
      { removedByAdmin: false },
    ];
    for (const extra of forbidden) {
      await ctx.http.post(`/v1/stores/${storeId}/products`).set(as(owner)).send({ name: 'Produto DTO', categoryId, ...extra }).expect(400);
    }
    const created = await ctx.http.post(`/v1/stores/${storeId}/products`).set(as(owner)).send({ name: 'Produto DTO ok', categoryId }).expect(201);
    for (const extra of forbidden) {
      await ctx.http.patch(`/v1/stores/${storeId}/products/${created.body.id}`).set(as(owner)).send(extra).expect(400);
    }
    const [row] = await ctx.db.select().from(products).where(eq(products.id, created.body.id));
    expect(row?.status).toBe('draft');
    expect(row?.storeId).toBe(storeId);
  });

  it('O2-ENT-05: distância do banco (PostGIS) confere com haversine independente em 10 pares reais da região (tolerância 0,5%)', async () => {
    const places = [
      { n: 'Francisco Morato centro', lat: -23.2808, lng: -46.7442 },
      { n: 'Estação Francisco Morato', lat: -23.2787, lng: -46.7399 },
      { n: 'Franco da Rocha centro', lat: -23.3219, lng: -46.7261 },
      { n: 'Caieiras centro', lat: -23.3607, lng: -46.7403 },
      { n: 'Cajamar centro', lat: -23.3555, lng: -46.8782 },
      { n: 'Campo Limpo Paulista', lat: -23.2078, lng: -46.7881 },
      { n: 'Jd. Mirante (Fr. Morato)', lat: -23.2655, lng: -46.7515 },
      { n: 'Jd. Ana (Fr. Morato)', lat: -23.2901, lng: -46.7498 },
      { n: 'Vila Rosa (Franco da Rocha)', lat: -23.3135, lng: -46.7189 },
      { n: 'Jordanésia (Cajamar)', lat: -23.3258, lng: -46.8504 },
    ];
    const haversineM = (a: { lat: number; lng: number }, b: { lat: number; lng: number }): number => {
      const R = 6_371_008.8;
      const rad = (d: number): number => (d * Math.PI) / 180;
      const dLat = rad(b.lat - a.lat);
      const dLng = rad(b.lng - a.lng);
      const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLng / 2) ** 2;
      return 2 * R * Math.asin(Math.sqrt(h));
    };
    for (let i = 0; i < places.length; i++) {
      const a = places[i]!;
      const b = places[(i + 3) % places.length]!;
      const { rows } = await ctx.pool.query<{ d: number }>(
        'select ST_Distance(ST_SetSRID(ST_MakePoint($1::float8, $2::float8), 4326)::geography, ST_SetSRID(ST_MakePoint($3::float8, $4::float8), 4326)::geography) as d',
        [a.lng, a.lat, b.lng, b.lat],
      );
      const db = Number(rows[0]!.d);
      const reference = haversineM(a, b);
      expect(Math.abs(db - reference) / reference, `${a.n} -> ${b.n}: banco ${db.toFixed(0)} m, haversine ${reference.toFixed(0)} m`).toBeLessThan(0.005);
    }
  });

  it('O2-APR-11: cada critério de RN-03 desligado isoladamente tira a loja da API pública; todos ligados, ela aparece', async () => {
    const origin = isolatedPoint();
    const at = await northOf(ctx, origin, 800);
    const store = await makeStore(ctx, { name: 'Loja Visibilidade QA', at, products: [{ name: 'Item visível' }] });
    const publicStatus = async (): Promise<number> => (await ctx.http.get(`/v1/browse/stores/${store.id}?lat=${origin.lat}&lng=${origin.lng}`)).status;
    const clear = async (): Promise<void> => {
      const { clearFeedCache } = await import('./helpers/discovery.js');
      await clearFeedCache(ctx);
    };
    await clear();
    expect(await publicStatus()).toBe(200);

    // 1. suspensa
    await ctx.db.update(stores).set({ status: 'suspended' }).where(eq(stores.id, store.id));
    await clear();
    expect(await publicStatus(), 'loja suspensa').toBe(404);
    await ctx.db.update(stores).set({ status: 'in_review' }).where(eq(stores.id, store.id));
    await clear();
    expect(await publicStatus(), 'loja em análise').toBe(404);
    await ctx.db.update(stores).set({ status: 'approved' }).where(eq(stores.id, store.id));

    // 2. conta de recebimento inativa
    await ctx.db.update(paymentAccounts).set({ status: 'under_review' }).where(eq(paymentAccounts.storeId, store.id));
    await clear();
    expect(await publicStatus(), 'conta de recebimento em análise').toBe(404);
    await ctx.db.update(paymentAccounts).set({ status: 'active' }).where(eq(paymentAccounts.storeId, store.id));

    // 3. zero produto ativo
    await ctx.db.update(products).set({ status: 'paused' }).where(eq(products.storeId, store.id));
    await clear();
    expect(await publicStatus(), 'sem produto ativo').toBe(404);
    await ctx.db.update(products).set({ status: 'active' }).where(eq(products.storeId, store.id));

    // todos ligados de novo
    await clear();
    expect(await publicStatus()).toBe(200);
  });
});
