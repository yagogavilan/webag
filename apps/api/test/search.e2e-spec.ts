import { createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees, useFeeTable } from './helpers/fees.js';
import { isolatedPoint, makeStore, northOf, type TestPoint } from './helpers/discovery.js';
import { ensureCategory, ensureLegalDocs } from './helpers/fixtures.js';

const q = (p: TestPoint, extra = '') => `lat=${p.lat}&lng=${p.lng}${extra}`;

describe('Busca de produtos e lojas com filtros (WB-013, WB-014)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  beforeEach(async () => {
    await ctx.redis.flushdb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  const products = async (p: TestPoint, extra = '') => (await ctx.http.get(`/v1/search/products?${q(p, extra)}`).expect(200)).body as { data: { name: string; price: { amount: number }; store: { name: string; open: boolean } }[]; nextCursor: string | null };
  const stores = async (p: TestPoint, extra = '') => (await ctx.http.get(`/v1/search/stores?${q(p, extra)}`).expect(200)).body as { data: { name: string }[]; nextCursor: string | null };
  const names = (list: { name: string }[]) => list.map((s) => s.name);

  it('sem acento e sem caixa: "tenis" e "Tênis" acham o mesmo; tolera 1 erro de digitação; termo curto só por trecho', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Calcados Morato', at: await northOf(ctx, origin, 500), products: [{ name: 'Tênis Corrida Azul' }, { name: 'Camisa Polo' }] });
    expect(names((await products(origin, '&q=tenis')).data)).toEqual(['Tênis Corrida Azul']);
    expect(names((await products(origin, '&q=TÊNIS')).data)).toEqual(['Tênis Corrida Azul']);
    expect(names((await products(origin, '&q=tenns')).data)).toEqual(['Tênis Corrida Azul']); // 1 letra errada
    expect((await products(origin, '&q=sapato')).data).toEqual([]);
    expect(names((await products(origin, '&q=po')).data)).toEqual(['Camisa Polo']); // 2 letras: sem tolerância
    expect(names((await stores(origin, '&q=calçados')).data)).toEqual(['Calcados Morato']);
  });

  it('termo com 1 letra é recusado (WB-013 C4); `%` e `_` são literais, não curinga', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja Curinga', at: await northOf(ctx, origin, 500), products: [{ name: 'Produto 100%' }, { name: 'Outro' }] });
    await ctx.http.get(`/v1/search/products?${q(origin, '&q=a')}`).expect(400);
    await ctx.http.get(`/v1/search/stores?${q(origin, '&q=a')}`).expect(400);
    expect(names((await products(origin, `&q=${encodeURIComponent('100%')}`)).data)).toEqual(['Produto 100%']);
    expect((await products(origin, `&q=${encodeURIComponent('%%')}`)).data).toEqual([]);
    expect((await products(origin, `&q=${encodeURIComponent("'; drop table products;--")}`)).data).toEqual([]);
  });

  it('filtros combinam em E: categoria (inclui filhas), preço, distância, entrega grátis, avaliação e aceita troca', async () => {
    // Taxa da tabela do admin por faixa (DEC-036): até 2 km grátis, depois R$ 7,00.
    await useFeeTable(ctx, [{ fromM: 0, toM: 2_000, feeCents: 0 }, { fromM: 2_000, toM: 15_000, feeCents: 700 }]);
    const origin = isolatedPoint();
    const root = await ensureCategory(ctx);
    const child = await ensureCategory(ctx);
    const other = await ensureCategory(ctx);
    const { categories } = await import('../src/platform/database/schema.js');
    const { eq } = await import('drizzle-orm');
    await ctx.db.update(categories).set({ parentId: root }).where(eq(categories.id, child));

    await makeStore(ctx, { name: 'Perto Gratis Troca', at: await northOf(ctx, origin, 800), voluntaryExchangeDays: 7, ratings: [5, 5, 4], categoryId: child, products: [{ name: 'Item Barato', priceCents: 1500, categoryId: child }, { name: 'Item Caro', priceCents: 9000, categoryId: child }, { name: 'Item Outro', priceCents: 1550, categoryId: other }] });
    await makeStore(ctx, { name: 'Longe Pago', at: await northOf(ctx, origin, 4000), ratings: [2, 2, 3], categoryId: other, products: [{ name: 'Item Longe', priceCents: 2000, categoryId: child }] });

    expect(names((await products(origin, '&q=item&sort=price_asc')).data)).toEqual(['Item Barato', 'Item Outro', 'Item Longe', 'Item Caro']);
    expect(names((await products(origin, `&q=item&categoryId=${root}&sort=price_asc`)).data)).toEqual(['Item Barato', 'Item Longe', 'Item Caro']); // raiz inclui a filha
    expect(names((await products(origin, `&q=item&categoryId=${child}&minPriceCents=1600&maxPriceCents=9000&sort=price_asc`)).data)).toEqual(['Item Longe', 'Item Caro']);
    expect(names((await products(origin, '&q=item&maxDistanceKm=1&sort=price_asc')).data)).toEqual(['Item Barato', 'Item Outro', 'Item Caro']);
    expect(names((await products(origin, '&q=item&freeShipping=true&sort=price_asc')).data)).toEqual(['Item Barato', 'Item Outro', 'Item Caro']);
    expect(names((await products(origin, '&q=item&minRating=4&sort=price_asc')).data)).toEqual(['Item Barato', 'Item Outro', 'Item Caro']);
    expect(names((await products(origin, '&q=item&acceptsExchange=true&minRating=4&maxDistanceKm=1&freeShipping=true&sort=price_asc')).data)).toEqual(['Item Barato', 'Item Outro', 'Item Caro']);
    expect((await products(origin, '&q=item&acceptsExchange=true&maxDistanceKm=0.5')).data).toEqual([]);
    // Lojas: os mesmos filtros.
    expect(names((await stores(origin, '&acceptsExchange=true')).data)).toEqual(['Perto Gratis Troca']);
    expect(names((await stores(origin, '&maxDistanceKm=10&minRating=3')).data)).toEqual(['Perto Gratis Troca']);
    expect(names((await stores(origin, `&categoryId=${root}`)).data)).toEqual(['Perto Gratis Troca']);
    expect(names((await stores(origin, '&sort=distance')).data)).toEqual(['Perto Gratis Troca', 'Longe Pago']);
    expect(names((await stores(origin, '&sort=rating')).data)).toEqual(['Perto Gratis Troca', 'Longe Pago']);
    expect(names((await stores(origin, '&sort=fee')).data)).toEqual(['Perto Gratis Troca', 'Longe Pago']);
    await restoreFees(ctx);
  });

  it('avaliação: média só aparece com 3+ avaliações; antes disso é "Novo" e o filtro de nota não a considera', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Poucas Notas', at: await northOf(ctx, origin, 500), ratings: [5, 5] });
    await makeStore(ctx, { name: 'Muitas Notas', at: await northOf(ctx, origin, 600), ratings: [4, 4, 5] });
    const list = (await stores(origin)).data as unknown as { name: string; rating: { average: number | null; count: number; isNew: boolean } }[];
    expect(list.find((s) => s.name === 'Poucas Notas')?.rating).toEqual({ average: null, count: 2, isNew: true });
    expect(list.find((s) => s.name === 'Muitas Notas')?.rating).toEqual({ average: 4.3, count: 3, isNew: false });
    expect(names((await stores(origin, '&minRating=4')).data)).toEqual(['Muitas Notas']);
  });

  it('produto de loja fechada aparece com o selo (open=false); sem filtro de preço invertido (400)', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja Fechada', at: await northOf(ctx, origin, 300), pausedIndefinitely: true, products: [{ name: 'Bolo de Fuba' }] });
    const [item] = (await products(origin, '&q=bolo')).data;
    expect(item).toMatchObject({ name: 'Bolo de Fuba', store: { name: 'Loja Fechada', open: false } });
    await ctx.http.get(`/v1/search/products?${q(origin, '&minPriceCents=500&maxPriceCents=100')}`).expect(400);
  });

  it('relevância: loja aberta antes da fechada, nome que começa com o termo antes do que só contém', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Fechada Perto', at: await northOf(ctx, origin, 100), pausedIndefinitely: true, products: [{ name: 'Arroz Integral' }] });
    await makeStore(ctx, { name: 'Aberta A', at: await northOf(ctx, origin, 900), products: [{ name: 'Pacote de Arroz' }] });
    await makeStore(ctx, { name: 'Aberta B', at: await northOf(ctx, origin, 1500), products: [{ name: 'Arroz Branco' }] });
    expect(names((await products(origin, '&q=arroz')).data)).toEqual(['Arroz Branco', 'Pacote de Arroz', 'Arroz Integral']);
  });

  it('paginação por cursor: páginas sem repetir nem pular item, e `limit` acima de 50 vira 50', async () => {
    const origin = isolatedPoint();
    await makeStore(ctx, { name: 'Loja Paginada', at: await northOf(ctx, origin, 500), products: Array.from({ length: 7 }, (_, i) => ({ name: `Caneta ${i + 1}`, priceCents: 100 + i })) });
    const seen: string[] = [];
    let cursor: string | null = null;
    let pages = 0;
    do {
      const page = await products(origin, `&q=caneta&sort=price_asc&limit=3${cursor ? `&cursor=${cursor}` : ''}`);
      seen.push(...names(page.data));
      cursor = page.nextCursor;
      pages += 1;
    } while (cursor && pages < 5);
    expect(pages).toBe(3);
    expect(seen).toEqual(Array.from({ length: 7 }, (_, i) => `Caneta ${i + 1}`));
    await ctx.http.get(`/v1/search/products?${q(origin, '&cursor=@@@')}`).expect(400);
    await ctx.http.get(`/v1/search/products?${q(origin, '&limit=1000')}`).expect(400); // BUG-027: fora de 1 a 50 é recusado
    await products(origin, '&limit=50');
  });

  it('sugestões após 2 caracteres: produtos, lojas e categorias; com 1 caractere, vazio', async () => {
    const origin = isolatedPoint();
    await ensureCategory(ctx, 'Pao e Cia Cat');
    await makeStore(ctx, { name: 'Padaria Paozinho', at: await northOf(ctx, origin, 500), products: [{ name: 'Pão Francês' }] });
    const res = (await ctx.http.get(`/v1/search/suggestions?${q(origin, '&q=pao')}`).expect(200)).body as { products: { name: string }[]; stores: { name: string }[]; categories: { name: string }[] };
    expect(names(res.products)).toEqual(['Pão Francês']);
    expect(names(res.stores)).toEqual(['Padaria Paozinho']);
    expect(names(res.categories)).toContain('Pao e Cia Cat');
    expect(((await ctx.http.get(`/v1/search/suggestions?${q(origin, '&q=p')}`).expect(200)).body as { products: unknown[] }).products).toEqual([]);
  });

  it('rate limit na busca pública (429 com Retry-After)', async () => {
    const origin = isolatedPoint();
    const ip = '203.0.113.77';
    let last = 200;
    for (let i = 0; i < 100 && last === 200; i += 1) last = (await ctx.http.get(`/v1/search/stores?${q(origin)}`).set('X-Forwarded-For', ip)).status;
    expect(last).toBe(429);
  });
});
