import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { restoreFees, useFeeTable, useParam } from './helpers/fees.js';
import { createTestApp, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf } from './helpers/discovery.js';
import { ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { products, productVariants, reviews, storeSettings, stores } from '../src/platform/database/schema.js';
import { shortName } from '../src/modules/discovery/browse.service.js';

describe('Loja e produto públicos (WB-016, WB-017, WB-018, DEC-022)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  const pos = (p: { lat: number; lng: number }) => `lat=${p.lat}&lng=${p.lng}`;

  it('página da loja com posição: nota "Novo", horário de hoje, taxa e distância, seções e identificação mascarada', async () => {
    await useFeeTable(ctx, [{ fromM: 0, toM: 15_000, feeCents: 600 }]); // taxa, mínimo e entrega grátis são globais (DEC-036)
    await useParam(ctx, 'pedido_minimo_cents', 2000);
    await useParam(ctx, 'frete_gratis_acima_cents', 8000);
    const origin = isolatedPoint();
    const store = await makeStore(ctx, {
      name: 'Loja Pagina',
      at: await northOf(ctx, origin, 1000),
      voluntaryExchangeDays: 7,
      ratings: [5, 4],
      products: [{ name: 'Item A', section: 'Destaques' }, { name: 'Item B', section: 'Outros' }],
    });
    const res = await ctx.http.get(`/v1/browse/stores/${store.id}?${pos(origin)}`).expect(200);
    expect(res.body).toMatchObject({
      id: store.id,
      name: 'Loja Pagina',
      open: true,
      opensAt: null,
      rating: { average: null, count: 2, isNew: true },
      delivery: { available: true, feeCents: 600, freeShipping: false, freeAboveCents: 8000, minOrderCents: 2000, acceptsDelivery: true },
      exchangePolicy: { voluntaryDays: 7 },
    });
    expect(res.body.delivery.distanceM).toBeGreaterThan(900);
    expect(res.body.hoursToday).toEqual([{ start: '00:00', end: '24:00' }]);
    expect(res.body.sections.map((s: { name: string }) => s.name)).toEqual(['Destaques', 'Outros']);
    expect(res.body.supplier.documentMasked).toMatch(/^\*+\d{2}$/);
    expect(JSON.stringify(res.body)).not.toMatch(/documentNumber|passwordHash|ownerUserId/);
    expect(res.headers['cache-control']).toBe('private, max-age=30');
    // Sem posição: só os dados da loja.
    const bare = await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200);
    expect(bare.body.delivery).toMatchObject({ available: null, feeCents: null, distanceM: null });
  });

  it('loja fora do raio por link: "não entrega" e retirada oferecida só se estiver a até 10 km (WB-016 C4)', async () => {
    await useParam(ctx, 'pedido_minimo_cents', 0);
    await useParam(ctx, 'frete_gratis_acima_cents', 0);
    await useParam(ctx, 'raio_max_km', 5); // raio global (DEC-036b)
    await useFeeTable(ctx, [{ fromM: 0, toM: 5_000, feeCents: 500 }]);
    const origin = isolatedPoint();
    const near = await makeStore(ctx, { name: 'Longe Mas Retira', at: await northOf(ctx, origin, 8000), pickupEnabled: true });
    const far = await makeStore(ctx, { name: 'Longe Demais', at: await northOf(ctx, origin, 12_000), pickupEnabled: true });
    const a = (await ctx.http.get(`/v1/browse/stores/${near.id}?${pos(origin)}`).expect(200)).body;
    expect(a.delivery).toMatchObject({ available: false, feeCents: null });
    expect(a.pickup).toMatchObject({ enabled: true, offered: true });
    const b = (await ctx.http.get(`/v1/browse/stores/${far.id}?${pos(origin)}`).expect(200)).body;
    expect(b.delivery.available).toBe(false);
    expect(b.pickup.offered).toBe(false);
  });

  it('loja fechada é visível e navegável: opensAt e horário de hoje vazio; pausada sem prazo não tem previsão', async () => {
    const origin = isolatedPoint();
    const closed = await makeStore(ctx, { name: 'Fechada Hoje', at: await northOf(ctx, origin, 500), open: false });
    const res = (await ctx.http.get(`/v1/browse/stores/${closed.id}`).expect(200)).body;
    expect(res).toMatchObject({ open: false, opensAt: null, hoursToday: [] }); // sem nenhum horário cadastrado: sem previsão
    const paused = await makeStore(ctx, { name: 'Pausada', at: await northOf(ctx, origin, 500), pausedIndefinitely: true });
    expect((await ctx.http.get(`/v1/browse/stores/${paused.id}`).expect(200)).body).toMatchObject({ open: false, opensAt: null });
    const items = (await ctx.http.get(`/v1/browse/stores/${closed.id}/products`).expect(200)).body;
    expect(items.data).toHaveLength(1); // navegável
  });

  it('loja invisível (em análise, suspensa, sem conta ou inexistente) responde 404, e id inválido também', async () => {
    const origin = isolatedPoint();
    const at = await northOf(ctx, origin, 500);
    const review = await makeStore(ctx, { name: 'Em Analise', at, status: 'in_review' });
    const suspended = await makeStore(ctx, { name: 'Suspensa', at, status: 'suspended' });
    const noPay = await makeStore(ctx, { name: 'Sem Conta', at, payment: false });
    for (const id of [review.id, suspended.id, noPay.id, randomUUID(), 'nao-uuid']) {
      await ctx.http.get(`/v1/browse/stores/${id}`).expect(404);
      await ctx.http.get(`/v1/browse/stores/${id}/products`).expect(404);
      await ctx.http.get(`/v1/browse/stores/${id}/reviews`).expect(404);
    }
    await ctx.http.get(`/v1/browse/stores/${review.id}?lat=1`).expect(400);
  });

  it('vitrine: ordem das seções, indisponível ao final, filtro por seção e paginação', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, {
      name: 'Vitrine',
      at: await northOf(ctx, origin, 500),
      products: [
        { name: 'Sem Estoque', section: 'Primeira', stock: 0 },
        { name: 'P1', section: 'Primeira', priceCents: 1000, promoPriceCents: 800 },
        { name: 'P2', section: 'Segunda' },
        { name: 'Avulso' },
        { name: 'Pausado', status: 'paused' },
        { name: 'Rascunho', status: 'draft' },
        { name: 'Removido', moderationStatus: 'removed' },
      ],
    });
    const all = (await ctx.http.get(`/v1/browse/stores/${store.id}/products`).expect(200)).body;
    expect(all.data.map((p: { name: string; available: boolean }) => [p.name, p.available])).toEqual([['P1', true], ['P2', true], ['Avulso', true], ['Sem Estoque', false]]);
    expect(all.data[0]).toMatchObject({ price: { amount: 800, currency: 'BRL' }, originalPrice: { amount: 1000, currency: 'BRL' }, discountPercent: 20 });
    const sectionId = all.data[1].sectionId as string;
    expect((await ctx.http.get(`/v1/browse/stores/${store.id}/products?sectionId=${sectionId}`).expect(200)).body.data.map((p: { name: string }) => p.name)).toEqual(['P2']);
    const first = (await ctx.http.get(`/v1/browse/stores/${store.id}/products?limit=3`).expect(200)).body;
    expect(first.data).toHaveLength(3);
    const second = (await ctx.http.get(`/v1/browse/stores/${store.id}/products?limit=3&cursor=${first.nextCursor}`).expect(200)).body;
    expect(second.data.map((p: { name: string }) => p.name)).toEqual(['Sem Estoque']);
    expect(second.nextCursor).toBeNull();
  });

  it('produto: variações com estoque por variação, "últimas unidades", promoção e sem vazar estoque exato', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Produto', at: await northOf(ctx, origin, 500), products: [{ name: 'Camiseta', priceCents: 5000, promoPriceCents: 4000, stock: 20 }] });
    const productId = store.productIds[0]!;
    await ctx.db.update(products).set({ variantAttributes: ['Tamanho'] }).where(eq(products.id, productId));
    await ctx.db.delete(productVariants).where(eq(productVariants.productId, productId));
    await ctx.db.insert(productVariants).values([
      { productId, storeId: store.id, attributes: { Tamanho: 'P' }, attributesKey: 'tamanho=p', stock: 100, reserved: 10 },
      { productId, storeId: store.id, attributes: { Tamanho: 'M' }, attributesKey: 'tamanho=m', stock: 5, reserved: 3 },
      { productId, storeId: store.id, attributes: { Tamanho: 'G' }, attributesKey: 'tamanho=g', stock: 2, reserved: 2 },
      { productId, storeId: store.id, attributes: { Tamanho: 'GG' }, attributesKey: 'tamanho=gg', stock: 9, reserved: 0, priceCents: 6000, active: false },
    ]);
    const res = (await ctx.http.get(`/v1/browse/products/${productId}`).expect(200)).body;
    const bySize = Object.fromEntries(res.variants.map((v: { attributes: { Tamanho: string } }) => [v.attributes.Tamanho, v]));
    expect(Object.keys(bySize).sort()).toEqual(['G', 'M', 'P']); // inativa não aparece
    expect(bySize.P).toMatchObject({ available: true, maxQuantity: 50, lastUnits: null });
    expect(bySize.M).toMatchObject({ available: true, maxQuantity: 2, lastUnits: 2 });
    expect(bySize.G).toMatchObject({ available: false, maxQuantity: 0, lastUnits: null });
    expect(bySize.P.price).toEqual({ amount: 4000, currency: 'BRL' });
    expect(res).toMatchObject({ available: true, discountPercent: 20, variantAttributes: ['Tamanho'], store: { id: store.id, open: true } });
    expect(JSON.stringify(res)).not.toMatch(/"stock"|"reserved"/);
    // Todas sem estoque: indisponível, mas a página abre.
    await ctx.db.update(productVariants).set({ stock: 0, reserved: 0 }).where(eq(productVariants.productId, productId));
    const soldOut = (await ctx.http.get(`/v1/browse/products/${productId}`).expect(200)).body;
    expect(soldOut).toMatchObject({ available: false, unavailableReason: 'SOLD_OUT' });
  });

  it('produto pausado ou moderado: 200 "indisponível" com atalho da loja (WB-017 C6); rascunho e id estranho: 404', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Indisp', at: await northOf(ctx, origin, 500), products: [{ name: 'Ok' }, { name: 'Pausado', status: 'paused' }, { name: 'Moderado', moderationStatus: 'removed' }, { name: 'Rascunho', status: 'draft' }] });
    const [, paused, moderated, draft] = store.productIds;
    expect((await ctx.http.get(`/v1/browse/products/${paused}`).expect(200)).body).toMatchObject({ available: false, unavailableReason: 'PAUSED', store: { id: store.id } });
    expect((await ctx.http.get(`/v1/browse/products/${moderated}`).expect(200)).body).toMatchObject({ available: false, unavailableReason: 'MODERATED' });
    await ctx.http.get(`/v1/browse/products/${draft}`).expect(404);
    await ctx.http.get(`/v1/browse/products/${randomUUID()}`).expect(404);
    await ctx.http.get('/v1/browse/products/x').expect(404);
    // Produto de loja suspensa some junto com a loja.
    await ctx.db.update(stores).set({ status: 'suspended' }).where(eq(stores.id, store.id));
    await ctx.http.get(`/v1/browse/products/${store.productIds[0]}`).expect(404);
  });

  it('avaliações: vazio, média só com 3+, mais recentes primeiro, 10 por página, resposta da loja e nome reduzido', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Notas', at: await northOf(ctx, origin, 500) });
    expect((await ctx.http.get(`/v1/browse/stores/${store.id}/reviews`).expect(200)).body).toEqual({ summary: { average: null, count: 0, isNew: true }, data: [], nextCursor: null });
    const author = await registerUser(ctx, { name: 'Maria Aparecida Souza' });
    const base = Date.now();
    for (let i = 0; i < 12; i += 1) {
      await ctx.db.insert(reviews).values({ storeId: store.id, userId: author.userId, rating: i % 5 + 1, comment: `Comentário ${i}`, createdAt: new Date(base - i * 60_000), orderId: i === 0 ? randomUUID() : null, storeReply: i === 1 ? 'Obrigado!' : null, storeRepliedAt: i === 1 ? new Date() : null });
    }
    await ctx.db.insert(reviews).values({ storeId: store.id, userId: author.userId, rating: 1, comment: 'Removida pelo admin', status: 'removed' });
    const page1 = (await ctx.http.get(`/v1/browse/stores/${store.id}/reviews`).expect(200)).body;
    expect(page1.summary).toMatchObject({ count: 12, isNew: false });
    expect(page1.data).toHaveLength(10);
    expect(page1.data[0]).toMatchObject({ comment: 'Comentário 0', reviewer: 'Maria S.', verifiedPurchase: true });
    expect(page1.data[1]).toMatchObject({ comment: 'Comentário 1', storeReply: 'Obrigado!', verifiedPurchase: false });
    expect(JSON.stringify(page1)).not.toMatch(/Aparecida|Removida pelo admin|userId|@/);
    const page2 = (await ctx.http.get(`/v1/browse/stores/${store.id}/reviews?cursor=${page1.nextCursor}`).expect(200)).body;
    expect(page2.data.map((r: { comment: string }) => r.comment)).toEqual(['Comentário 10', 'Comentário 11']);
    expect(page2.nextCursor).toBeNull();
    // Avaliação de produto não entra na da loja e vice-versa.
    const withProduct = await makeStore(ctx, { name: 'Loja Notas 2', at: await northOf(ctx, origin, 700) });
    await ctx.db.insert(reviews).values({ storeId: withProduct.id, productId: withProduct.productIds[0]!, userId: author.userId, rating: 5, comment: 'Do produto' });
    expect((await ctx.http.get(`/v1/browse/stores/${withProduct.id}/reviews`).expect(200)).body.data).toEqual([]);
    expect((await ctx.http.get(`/v1/browse/products/${withProduct.productIds[0]}/reviews`).expect(200)).body.data.map((r: { comment: string }) => r.comment)).toEqual(['Do produto']);
  });

  it('shortName reduz o nome (LGPD)', () => {
    expect(shortName('Maria Aparecida Souza')).toBe('Maria S.');
    expect(shortName('  joão ')).toBe('joão');
  });

  it('pausa por prazo e configuração: mudança do lojista vale em seguida (sem cache no servidor nessas páginas)', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Pausa', at: await northOf(ctx, origin, 500) });
    expect((await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200)).body.open).toBe(true);
    await ctx.db.update(storeSettings).set({ pausedUntil: new Date(Date.now() + 3_600_000) }).where(eq(storeSettings.storeId, store.id));
    const paused = (await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200)).body;
    expect(paused.open).toBe(false);
    expect(new Date(paused.opensAt as string).getTime()).toBeGreaterThan(Date.now());
  });
});
