import { and, eq, inArray, isNotNull, sql } from 'drizzle-orm';
import { OBJECT_STORAGE } from '../src/platform/storage/object-storage.js';
import { MemoryObjectStorage } from '../src/platform/storage/memory.storage.js';
import { banners, coupons, favorites, mediaAssets, orders, reviews, stores, userAddresses, users } from '../src/platform/database/schema.js';
import { seedOnda1 } from '../seed/onda1.js';
import { seedOnda2 } from '../seed/onda2.js';
import { SEED_STORES_ONDA3, seedOnda3 } from '../seed/onda3.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';

const PASSWORD = 'senha-de-teste-do-seed-1';

describe('Seed da Onda 3: mais lojas, clientes, avaliações, cupons, favoritos e banners', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    const storage = ctx.app.get<MemoryObjectStorage>(OBJECT_STORAGE);
    const options = { merchantPassword: PASSWORD, storage };
    // BUG-019 residual: o seed só cria os banners de demonstração quando a home não tem NENHUM (não pisa em banner curado no admin) e o banco é
    // compartilhado com `banners.e2e`, que deixa banners. Sem isto o resultado dependia da ordem dos arquivos (o vitest põe o que falhou
    // por último no início da fila; em clone novo, com cache frio, a ordem alfabética rodava `banners` antes e o teste lia 2). Parte de home vazia.
    await ctx.db.delete(banners);
    await ctx.db.delete(mediaAssets).where(eq(mediaAssets.purpose, 'banner'));
    await seedOnda1(ctx.db, {});
    await seedOnda2(ctx.db, options);
    await seedOnda3(ctx.db, options);
    await seedOnda3(ctx.db, options); // idempotente
    await ctx.redis.flushdb();
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('cria as lojas novas sem duplicar, com troca, pausa e aprovação recente conforme o roteiro', async () => {
    const names = SEED_STORES_ONDA3.map((s) => s.name);
    const rows = await ctx.db.select().from(stores).where(sql`${stores.name} in (${sql.join(names.map((n) => sql`${n}`), sql`, `)})`);
    expect(rows).toHaveLength(names.length);
    expect(new Set(rows.map((r) => r.addressCityName))).toEqual(new Set(['Francisco Morato', 'Franco da Rocha', 'Caieiras']));
    expect(rows.some((r) => Date.now() - (r.approvedAt?.getTime() ?? 0) < 30 * 86_400_000)).toBe(true);
  });

  it('banners: 3 com imagem 2:1 em variantes WebP, lidos pela API pública', async () => {
    const rows = await ctx.db.select().from(banners);
    expect(rows).toHaveLength(3); // a home começou vazia (beforeAll) e a segunda execução do seed não duplica
    const assets = await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.purpose, 'banner'));
    expect(assets).toHaveLength(3);
    for (const asset of assets) expect(asset.width! / asset.height!).toBe(2);
    const res = await ctx.http.get('/v1/banners').expect(200);
    expect(res.body.data.map((b: { destination: { type: string } }) => b.destination.type)).toEqual(expect.arrayContaining(['category', 'store'])); // sem destino de cupom desde 3a81ef1 (HIP-L12, DEC-078)
    expect(Object.keys(res.body.data[0].image.urls)).toEqual(expect.arrayContaining(['400', '800', '1200']));
  });

  it('avaliações em volume e variedade: há loja "Novo" (< 3) e loja com média; comentários só publicados', async () => {
    const all = await ctx.db.select().from(reviews);
    expect(all.length).toBeGreaterThanOrEqual(25);
    expect(new Set(all.map((r) => r.rating)).size).toBeGreaterThanOrEqual(4);
    const perStore = new Map<string, number>();
    for (const r of all.filter((x) => x.productId === null)) perStore.set(r.storeId, (perStore.get(r.storeId) ?? 0) + 1);
    const counts = [...perStore.values()];
    expect(counts.some((c) => c >= 3)).toBe(true);
    expect(counts.some((c) => c < 3)).toBe(true);
  });

  it('cupons e favoritos de teste existem; cliente seed tem endereço padrão e entra com a senha do seed', async () => {
    const codes = (await ctx.db.select({ code: coupons.code }).from(coupons)).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(['BEMVINDO10', 'FRETEGRATIS', 'LOJA5']));
    // BUG-023: o cupom de primeira compra do seed tem teto de usos (a mesma regra que o admin impõe, SEC-170d).
    const [welcome] = await ctx.db.select().from(coupons).where(eq(coupons.code, 'BEMVINDO10'));
    expect(welcome).toMatchObject({ firstPurchaseOnly: true, maxUses: 100 });
    const [ana] = await ctx.db.select().from(users).where(eq(users.email, 'cliente.ana@seed.webag.local'));
    expect(await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, ana!.id))).toHaveLength(1);
    expect((await ctx.db.select().from(favorites).where(eq(favorites.userId, ana!.id))).length).toBeGreaterThanOrEqual(3);
    const login = await ctx.http.post('/v1/auth/login').send({ email: 'cliente.ana@seed.webag.local', password: PASSWORD }).expect(200);
    expect(login.body.tokens.accessToken).toBeTruthy();
  });

  it('roteiro ponta a ponta: a cliente vê a home no endereço dela, abre uma loja, põe na sacola e aplica o cupom da plataforma', async () => {
    // SEC-155: o cupom de primeira compra confere o telefone contra outras contas com pedido pago; os cadastros dos outros testes dividem o mesmo telefone.
    await ctx.db.update(users).set({ phone: `5511${String(700000000 + Math.floor(Math.random() * 1e8))}` }).where(eq(users.email, 'cliente.ana@seed.webag.local'));
    // SEC-155 (de novo, a própria conta): `seed-orders` dá pedidos PAGOS de demonstração a esta mesma cliente. Se aquele arquivo rodou antes deste (a ordem dos
    // arquivos varia com o cache de duração e de falhas do vitest), ela deixa de ser "primeira compra" e o cupom dá 422. Aqui ela precisa ser primeira compra:
    // os pedidos pagos dela ficam "não pagos" só durante o teste e voltam ao que eram no final.
    const [anaRow] = await ctx.db.select({ id: users.id }).from(users).where(eq(users.email, 'cliente.ana@seed.webag.local'));
    const paid = await ctx.db.select({ id: orders.id, paidAt: orders.paidAt }).from(orders).where(and(eq(orders.userId, anaRow!.id), isNotNull(orders.paidAt)));
    if (paid.length > 0) await ctx.db.update(orders).set({ paidAt: null }).where(inArray(orders.id, paid.map((o) => o.id)));
    try {
      const login = await ctx.http.post('/v1/auth/login').send({ email: 'cliente.ana@seed.webag.local', password: PASSWORD }).expect(200);
      const auth = bearer(login.body.tokens.accessToken as string);
      const addresses = (await ctx.http.get('/v1/me/addresses').set(auth).expect(200)).body.data as { lat: number; lng: number }[];
      const home = (await ctx.http.get(`/v1/home?lat=${addresses[0]!.lat}&lng=${addresses[0]!.lng}`).expect(200)).body;
      expect(home.nearbyStores.length).toBeGreaterThanOrEqual(3);
      expect(home.offers.length).toBeGreaterThanOrEqual(1);
      expect(home.empty).toBe(false);
      const open = home.nearbyStores.find((s: { open: boolean }) => s.open) ?? home.nearbyStores[0];
      const products = (await ctx.http.get(`/v1/browse/stores/${open.id}/products`).expect(200)).body.data as { id: string; available: boolean; price: { amount: number } }[];
      const item = products.find((p) => p.available)!;
      const detail = (await ctx.http.get(`/v1/browse/products/${item.id}`).expect(200)).body;
      const variant = detail.variants.find((v: { available: boolean }) => v.available);
      await ctx.http.put(`/v1/cart/items/${variant.id}`).set(auth).send({ quantity: 6 }).expect(200);
      const cart = (await ctx.http.put('/v1/cart/coupon').set(auth).send({ code: 'bemvindo10' }).expect(200)).body;
      expect(cart.coupon).toMatchObject({ code: 'BEMVINDO10', applied: true });
      expect(cart.summary.discount.amount).toBeGreaterThan(0);
    } finally {
      for (const order of paid) await ctx.db.update(orders).set({ paidAt: order.paidAt }).where(eq(orders.id, order.id));
    }
  });
});
