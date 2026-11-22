import { eq } from 'drizzle-orm';
import { createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees, useFeeTable, useParam } from './helpers/fees.js';
import { distanceM, isolatedPoint, makeStore, northOf, type TestPoint } from './helpers/discovery.js';
import { ensureCategory, ensureLegalDocs } from './helpers/fixtures.js';
import { paymentAccounts, products, productVariants } from '../src/platform/database/schema.js';

const q = (p: TestPoint, extra = '') => `lat=${p.lat}&lng=${p.lng}${extra}`;

describe('Descoberta por raio de entrega (PostGIS, RN-03/RN-04, WB-012)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  beforeEach(async () => {
    await ctx.redis.flushdb(); // cache de 30 s: cada teste começa limpo
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const home = async (p: TestPoint, extra = '') => (await ctx.http.get(`/v1/home?${q(p, extra)}`).expect(200)).body;
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it('raio global (DEC-036b): a loja dentro de `raio_max_km` aparece; um pouco além, some', async () => {
    await useParam(ctx, 'raio_max_km', 3);
    await useFeeTable(ctx, [{ fromM: 0, toM: 3_000, feeCents: 500 }]);
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja Dentro', at: await northOf(ctx, origin, 2950) });
    await makeStore(ctx, { name: 'Loja Fora', at: await northOf(ctx, origin, 3050) });
    const body = await home(origin);
    expect(names(body.nearbyStores)).toEqual(['Loja Dentro']);
    await restoreFees(ctx);
    await ctx.redis.flushdb();
    expect(names((await home(origin)).nearbyStores)).toEqual(['Loja Dentro', 'Loja Fora']);
  });

  it('loja fora do raio some da home e da busca, mesmo estando perto de outra loja que entrega', async () => {
    await useParam(ctx, 'raio_max_km', 5);
    await useFeeTable(ctx, [{ fromM: 0, toM: 5_000, feeCents: 500 }]);
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Perto', at: await northOf(ctx, origin, 1000), products: [{ name: 'Pao Perto' }] });
    await makeStore(ctx, { name: 'Longe', at: await northOf(ctx, origin, 6000), products: [{ name: 'Pao Longe' }] });
    await makeStore(ctx, { name: 'Meio', at: await northOf(ctx, origin, 2500), products: [{ name: 'Pao Meio' }] });
    expect(names((await home(origin)).nearbyStores)).toEqual(['Perto', 'Meio']);
    expect(names((await ctx.http.get(`/v1/search/stores?${q(origin)}`).expect(200)).body.data)).toEqual(['Perto', 'Meio']);
    expect(names((await ctx.http.get(`/v1/search/products?${q(origin, '&q=pao')}`).expect(200)).body.data).sort()).toEqual(['Pao Meio', 'Pao Perto']);
    await restoreFees(ctx);
  });

  it('ordena por abertas primeiro, depois distância, depois avaliação', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Fechada Colada', at: await northOf(ctx, origin, 200), pausedIndefinitely: true });
    await makeStore(ctx, { name: 'Aberta Longe', at: await northOf(ctx, origin, 3000) });
    await makeStore(ctx, { name: 'Aberta Perto Nota 3', at: await northOf(ctx, origin, 1000), ratings: [3, 3, 3] });
    await makeStore(ctx, { name: 'Aberta Mesmo Lugar Nota 5', at: await northOf(ctx, origin, 1000), ratings: [5, 5, 5] });
    const list = (await home(origin)).nearbyStores as { name: string; open: boolean; distanceM: number }[];
    expect(names(list)).toEqual(['Aberta Mesmo Lugar Nota 5', 'Aberta Perto Nota 3', 'Aberta Longe', 'Fechada Colada']);
    expect(list.map((s) => s.open)).toEqual([true, true, true, false]);
    const distances = list.slice(0, 3).map((s) => s.distanceM);
    expect(distances[0]).toBe(distances[1]); // empate de distância desempata por avaliação
    expect(distances[2]!).toBeGreaterThan(distances[1]!);
  });

  it('faixas da tabela do admin [de, até): na fronteira exata vale a faixa seguinte', async () => {
    const origin = isolatedPoint();
    const at = await northOf(ctx, origin, 2000);
    const d = await distanceM(ctx, origin, at);
    await useFeeTable(ctx, [{ fromM: 0, toM: d, feeCents: 300 }, { fromM: d, toM: 15_000, feeCents: 900 }]);
    await makeStore(ctx, { name: 'Faixas', at });
    const [card] = (await home(origin)).nearbyStores;
    expect(card.delivery).toMatchObject({ available: true, feeCents: 900, freeShipping: false });
    await restoreFees(ctx);
  });

  it('visibilidade RN-03: loja não aprovada, sem conta de recebimento ou sem produto ativo não aparece', async () => {
    const origin = isolatedPoint();
    const near = await northOf(ctx, origin, 500);
    await makeStore(ctx, { name: 'Em Analise', at: near, status: 'in_review' });
    await makeStore(ctx, { name: 'Suspensa', at: near, status: 'suspended' });
    await makeStore(ctx, { name: 'Sem Conta', at: near, payment: false });
    await makeStore(ctx, { name: 'So Rascunho', at: near, products: [{ name: 'Rascunho', status: 'draft' }] });
    await makeStore(ctx, { name: 'Produto Removido', at: near, products: [{ name: 'Removido', moderationStatus: 'removed' }] });
    await makeStore(ctx, { name: 'So Retirada', at: near, acceptsDelivery: false, pickupEnabled: true });
    const ok = await makeStore(ctx, { name: 'Visivel', at: near });
    expect(names((await home(origin)).nearbyStores)).toEqual(['Visivel']);
    // Conta de recebimento desconectada tira a loja da lista.
    await ctx.db.update(paymentAccounts).set({ status: 'disconnected' }).where(eq(paymentAccounts.storeId, ok.id));
    await ctx.redis.flushdb();
    expect((await home(origin)).nearbyStores).toEqual([]);
  });

  it('modo Retirada (WB-036): só lojas com retirada ativa dentro de `retirada_distancia_max_km`', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Retira Perto', at: await northOf(ctx, origin, 4000), pickupEnabled: true, acceptsDelivery: false });
    await makeStore(ctx, { name: 'Retira Longe', at: await northOf(ctx, origin, 12_000), pickupEnabled: true });
    await makeStore(ctx, { name: 'So Entrega', at: await northOf(ctx, origin, 1000) });
    const pickup = await home(origin, '&mode=pickup');
    expect(names(pickup.nearbyStores)).toEqual(['Retira Perto']); // entrega não é exigida (só retirada)
    expect(pickup.offers).toEqual([]);
    // O raio de entrega é global (15 km); com o teto do ETA (DEC-053) em 120 min a loja a 12 km sairia, então o teto sobe só neste teste.
    await useParam(ctx, 'entrega_max_min', 240);
    await ctx.redis.flushdb();
    expect(names((await home(origin)).nearbyStores)).toEqual(['So Entrega', 'Retira Longe']);
    await restoreFees(ctx);
  });

  it('ofertas: só promoção vigente de produto com estoque, maior desconto primeiro; novas: aprovadas há <= 30 dias', async () => {
    const origin = isolatedPoint();
    const near = await northOf(ctx, origin, 800);
    const store = await makeStore(ctx, {
      name: 'Loja Ofertas',
      at: near,
      approvedDaysAgo: 5,
      products: [
        { name: 'Desconto 20', priceCents: 10_000, promoPriceCents: 8000 },
        { name: 'Desconto 50', priceCents: 10_000, promoPriceCents: 5000 },
        { name: 'Sem Promo', priceCents: 10_000 },
        { name: 'Promo Sem Estoque', priceCents: 10_000, promoPriceCents: 1000, stock: 0 },
        { name: 'Promo Reservada', priceCents: 10_000, promoPriceCents: 1000, stock: 3, reserved: 3 },
        { name: 'Promo Pausada', priceCents: 10_000, promoPriceCents: 1000, moderationStatus: 'paused' },
      ],
    });
    await makeStore(ctx, { name: 'Loja Velha', at: near, approvedDaysAgo: 40 });
    const body = await home(origin);
    expect(names(body.offers)).toEqual(['Desconto 50', 'Desconto 20']);
    expect(body.offers[0]).toMatchObject({ discountPercent: 50, price: { amount: 5000, currency: 'BRL' }, originalPrice: { amount: 10_000, currency: 'BRL' }, store: { id: store.id, name: 'Loja Ofertas', open: true } });
    expect(names(body.newStores)).toEqual(['Loja Ofertas']);
    expect(body.bestSellers).toEqual([]);
    // Promoção vencida sai das ofertas.
    await ctx.db.update(products).set({ promoEndsAt: new Date(Date.now() - 1000) }).where(eq(products.id, store.productIds[1]!));
    await ctx.redis.flushdb();
    expect(names((await home(origin)).offers)).toEqual(['Desconto 20']);
  });

  it('estoque: produto com disponível = estoque - reservado <= 0 some da busca; volta ao repor', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Estoque', at: await northOf(ctx, origin, 500), products: [{ name: 'Camiseta Azul', stock: 1, reserved: 1 }, { name: 'Camiseta Verde', stock: 2, reserved: 1 }] });
    expect(names((await ctx.http.get(`/v1/search/products?${q(origin, '&q=camiseta')}`).expect(200)).body.data)).toEqual(['Camiseta Verde']);
    await ctx.db.update(productVariants).set({ stock: 5 }).where(eq(productVariants.productId, store.productIds[0]!));
    await ctx.redis.flushdb();
    expect(names((await ctx.http.get(`/v1/search/products?${q(origin, '&q=camiseta')}`).expect(200)).body.data).sort()).toEqual(['Camiseta Azul', 'Camiseta Verde']);
  });

  it('categorias disponíveis só com loja visível no ponto (WB-011 C4)', async () => {
    const origin = isolatedPoint();
    const withStore = await ensureCategory(ctx);
    const withoutStore = await ensureCategory(ctx);
    await makeStore(ctx, { name: 'Loja Categoria', at: await northOf(ctx, origin, 500), categoryId: withStore });
    const body = await home(origin);
    expect(body.availableCategoryIds).toContain(withStore);
    expect(body.availableCategoryIds).not.toContain(withoutStore);
  });

  it('validação e acesso público: coordenada obrigatória e dentro da faixa; sem login funciona; sem item é lista vazia', async () => {
    await ctx.http.get('/v1/home').expect(400);
    await ctx.http.get('/v1/home?lat=95&lng=0').expect(400);
    await ctx.http.get('/v1/home?lat=-10&lng=-40&mode=voando').expect(400);
    await ctx.http.get('/v1/home?lat=-10&lng=-40&extra=1').expect(400);
    const empty = await ctx.http.get('/v1/home?lat=-1&lng=-1').expect(200);
    expect(empty.body).toMatchObject({ empty: true, nearbyStores: [], newStores: [], offers: [], bestSellers: [], availableCategoryIds: [] });
    expect(empty.headers['cache-control']).toBe('private, max-age=5');
  });

  it('a mesma posição repetida usa o cache (resposta idêntica) e ele expira por TTL curto', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja Cache', at: await northOf(ctx, origin, 500) });
    const first = await home(origin);
    const keys = await ctx.redis.keys('cache:home:*');
    expect(keys.length).toBe(1);
    expect(await ctx.redis.ttl(keys[0]!)).toBeLessThanOrEqual(30);
    expect(await home(origin)).toEqual(first);
  });
});
