import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, bearer, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf } from './helpers/discovery.js';
import { createCustomer, ensureLegalDocs } from './helpers/fixtures.js';
import { favorites, paymentAccounts, products, searchHistory } from '../src/platform/database/schema.js';
import { termKey } from '../src/modules/discovery/search-history.service.js';

describe('Favoritos (WB-019) e histórico de buscas (WB-015)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const setup = async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Fav', at: await northOf(ctx, origin, 500), products: [{ name: 'Produto Fav', priceCents: 1000, promoPriceCents: 900 }] });
    return { store, productId: store.productIds[0]! };
  };

  it('exige login; favoritar loja e produto é idempotente e lista do mais recente ao mais antigo', async () => {
    const { store, productId } = await setup();
    await ctx.http.get('/v1/me/favorites').expect(401);
    await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).expect(401);
    const user = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204);
    await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204); // repetir não duplica
    await ctx.http.put(`/v1/me/favorites/products/${productId}`).set(auth).expect(204);
    const list = (await ctx.http.get('/v1/me/favorites').set(auth).expect(200)).body;
    expect(list.nextCursor).toBeNull();
    expect(list.data.map((f: { kind: string }) => f.kind)).toEqual(['product', 'store']);
    expect(list.data[0]).toMatchObject({ unavailable: false, product: { id: productId, name: 'Produto Fav', price: { amount: 900, currency: 'BRL' }, storeName: 'Loja Fav' }, store: null });
    expect(list.data[1]).toMatchObject({ unavailable: false, store: { id: store.id, name: 'Loja Fav' }, product: null });
    expect((await ctx.http.get('/v1/me/favorites?kind=store').set(auth).expect(200)).body.data).toHaveLength(1);
    await ctx.http.delete(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204);
    await ctx.http.delete(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204); // remover de novo também é ok
    expect((await ctx.http.get('/v1/me/favorites').set(auth).expect(200)).body.data).toHaveLength(1);
  });

  it('favorito que saiu do ar vem como indisponível e pode ser removido (WB-019 C3)', async () => {
    const { store, productId } = await setup();
    const user = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204);
    await ctx.http.put(`/v1/me/favorites/products/${productId}`).set(auth).expect(204);
    await ctx.db.update(paymentAccounts).set({ status: 'disconnected' }).where(eq(paymentAccounts.storeId, store.id));
    await ctx.db.update(products).set({ moderationStatus: 'paused' }).where(eq(products.id, productId));
    const list = (await ctx.http.get('/v1/me/favorites').set(auth).expect(200)).body;
    expect(list.data.map((f: { unavailable: boolean }) => f.unavailable)).toEqual([true, true]);
    await ctx.http.delete(`/v1/me/favorites/products/${productId}`).set(auth).expect(204);
  });

  it('alvo inexistente, invisível ou id inválido: 404; favorito de uma conta não aparece em outra (IDOR)', async () => {
    const origin = isolatedPoint();
    const hidden = await makeStore(ctx, { name: 'Em Analise', at: await northOf(ctx, origin, 500), status: 'in_review' });
    const user = await createCustomer(ctx);
    const other = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    for (const path of [`stores/${hidden.id}`, `stores/${randomUUID()}`, 'stores/x', `products/${hidden.productIds[0]}`, `products/${randomUUID()}`]) {
      await ctx.http.put(`/v1/me/favorites/${path}`).set(auth).expect(404);
    }
    const { store } = await setup();
    await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).set(auth).expect(204);
    expect((await ctx.http.get('/v1/me/favorites').set(bearer(other.accessToken)).expect(200)).body.data).toEqual([]);
    // Apagar o favorito alheio não toca no meu.
    await ctx.http.delete(`/v1/me/favorites/stores/${store.id}`).set(bearer(other.accessToken)).expect(204);
    expect((await ctx.http.get('/v1/me/favorites').set(auth).expect(200)).body.data).toHaveLength(1);
  });

  it('paginação por cursor dos favoritos', async () => {
    const user = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    const created = await Promise.all(Array.from({ length: 5 }, () => setup()));
    for (const [i, f] of created.entries()) await ctx.db.insert(favorites).values({ userId: user.userId, productId: f.productId, createdAt: new Date(Date.now() - i * 1000) });
    const first = (await ctx.http.get('/v1/me/favorites?limit=2').set(auth).expect(200)).body;
    expect(first.data).toHaveLength(2);
    const second = (await ctx.http.get(`/v1/me/favorites?limit=2&cursor=${first.nextCursor}`).set(auth).expect(200)).body;
    const third = (await ctx.http.get(`/v1/me/favorites?limit=2&cursor=${second.nextCursor}`).set(auth).expect(200)).body;
    const ids = [...first.data, ...second.data, ...third.data].map((f: { product: { id: string } }) => f.product.id);
    expect(ids).toEqual(created.map((f) => f.productId)); // do mais recente ao mais antigo, sem repetir nem pular
    expect(third.nextCursor).toBeNull();
    await ctx.http.get('/v1/me/favorites?cursor=@@@').set(auth).expect(400);
  });

  it('teto de 200 favoritos por conta: o 201º responde 422', async () => {
    const { store } = await setup();
    const user = await createCustomer(ctx);
    const bulk = await ctx.db.insert(products).values(Array.from({ length: 200 }, (_, i) => ({ storeId: store.id, name: `Bulk ${i}`, status: 'active' as const, basePriceCents: 100 }))).returning({ id: products.id });
    await ctx.db.insert(favorites).values(bulk.map((b) => ({ userId: user.userId, productId: b.id })));
    const over = await ctx.http.put(`/v1/me/favorites/stores/${store.id}`).set(bearer(user.accessToken)).expect(422);
    expect(over.body.code).toBe('FAVORITES_LIMIT_REACHED');
  });

  it('histórico: últimos 10 termos distintos, repetir sobe ao topo, ignora acento/caixa, limpar apaga tudo', async () => {
    const user = await createCustomer(ctx);
    const other = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    await ctx.http.get('/v1/me/search-history').expect(401);
    for (let i = 1; i <= 12; i += 1) {
      await ctx.http.post('/v1/me/search-history').set(auth).send({ term: `termo ${i}` }).expect(204);
      await new Promise((resolve) => setTimeout(resolve, 5));
    }
    await ctx.http.post('/v1/me/search-history').set(auth).send({ term: 'Termo  5' }).expect(204); // mesmo termo com outra caixa/espaço
    const list = (await ctx.http.get('/v1/me/search-history').set(auth).expect(200)).body;
    expect(list.data).toHaveLength(10);
    expect(list.data[0].term).toBe('Termo 5');
    expect(list.data.map((h: { term: string }) => h.term).filter((t: string) => termKey(t) === 'termo 5')).toHaveLength(1);
    expect(list.data.map((h: { term: string }) => h.term)).not.toContain('termo 1'); // o mais antigo saiu
    await ctx.http.post('/v1/me/search-history').set(bearer(other.accessToken)).send({ term: 'da outra conta' }).expect(204);
    await ctx.http.delete('/v1/me/search-history').set(auth).expect(204);
    expect((await ctx.http.get('/v1/me/search-history').set(auth).expect(200)).body.data).toEqual([]);
    expect(await ctx.db.select().from(searchHistory).where(eq(searchHistory.userId, user.userId))).toEqual([]);
    expect((await ctx.http.get('/v1/me/search-history').set(bearer(other.accessToken)).expect(200)).body.data).toHaveLength(1);
  });

  it('histórico recusa termo curto, comprido e campo extra', async () => {
    const user = await createCustomer(ctx);
    const auth = bearer(user.accessToken);
    await ctx.http.post('/v1/me/search-history').set(auth).send({ term: 'a' }).expect(400);
    await ctx.http.post('/v1/me/search-history').set(auth).send({ term: 'x'.repeat(81) }).expect(400);
    await ctx.http.post('/v1/me/search-history').set(auth).send({ term: 'ok ok', extra: 1 }).expect(400);
  });
});
