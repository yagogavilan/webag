import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { BrowseService } from '../src/modules/discovery/browse.service.js';
import { encodeCursor } from '../src/platform/http/pagination.js';
import { products, productVariants, storeSettings, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf, variantOf, type TestPoint } from './helpers/discovery.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, customerAt, placeOrder } from './helpers/orders.js';

// I1 do review de desempenho (2026-11-22): TODOS os outros e2e rodam com os caches em memória DESLIGADOS (TTL 0). Aqui eles ficam ligados
// com os TTLs reais de produção (diretório 15 s, ofertas/mais vendidos 60 s, loja/produto/vitrine 10 s) para provar o que a home e as páginas
// mostram com o cache quente: isolamento entre áreas, defasagem esperada e que o CHECKOUT recalcula tudo na hora.
// A configuração é lida quando o AppModule é importado: o valor tem de existir ANTES dos imports.
const saved = vi.hoisted(() => {
  const keys = ['FEED_DIRECTORY_TTL_SECONDS', 'HOME_SECTIONS_TTL_SECONDS', 'BROWSE_CACHE_TTL_SECONDS'] as const;
  const old = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  process.env.FEED_DIRECTORY_TTL_SECONDS = '15';
  process.env.HOME_SECTIONS_TTL_SECONDS = '60';
  process.env.BROWSE_CACHE_TTL_SECONDS = '10';
  return old;
});

type Card = { id: string; name: string; distanceM?: number };
const q = (p: TestPoint) => `lat=${p.lat}&lng=${p.lng}`;

describe('Descoberta com cache em memória LIGADO (TTL real): isolamento, defasagem e checkout na hora (I1)', () => {
  let ctx: TestContext;
  let browse: BrowseService;

  beforeAll(async () => {
    // Só a data é falsa e segue andando; `advance` empurra o relógio para frente para vencer os TTLs sem esperar (o cache usa Date.now()).
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    browse = ctx.app.get(BrowseService);
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    vi.useRealTimers();
    await ctx.close();
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  // O relógio só anda para frente no arquivo todo (entradas do cache têm carimbo da data falsa).
  const advance = (seconds: number) => vi.setSystemTime(new Date(Date.now() + seconds * 1000));
  // Cache de 30 s da posição (Redis) fora do caminho: o que se mede aqui é a camada em memória.
  const home = async (point: TestPoint) => {
    await ctx.redis.flushdb();
    return (await ctx.http.get(`/v1/home?${q(point)}`).expect(200)).body as { nearbyStores: Card[]; offers: Card[]; bestSellers: Card[] };
  };
  const page = async (productId: string, point?: TestPoint) => (await ctx.http.get(`/v1/browse/products/${productId}${point ? `?${q(point)}` : ''}`).expect(200)).body;
  const names = (cards: Card[]) => cards.map((c) => c.name);

  describe('isolamento entre áreas e clientes', () => {
    it('duas áreas com o cache quente: cada home vê só as lojas e ofertas da sua área; a defasagem de loja nova é o TTL do diretório (15 s) e a de oferta nova, 60 s', async () => {
      const areaA = isolatedPoint();
      const areaB = isolatedPoint();
      await makeStore(ctx, { name: 'Loja Area A', at: await northOf(ctx, areaA, 800), products: [{ name: 'Oferta Area A', priceCents: 2000, promoPriceCents: 1000 }] });
      await makeStore(ctx, { name: 'Loja Area B', at: await northOf(ctx, areaB, 800), products: [{ name: 'Oferta Area B', priceCents: 2000, promoPriceCents: 1500 }] });

      for (let round = 0; round < 3; round += 1) {
        // alterna as áreas com tudo quente: nenhuma vaza para a outra
        const a = await home(areaA);
        const b = await home(areaB);
        expect(names(a.nearbyStores)).toEqual(['Loja Area A']);
        expect(names(a.offers)).toEqual(['Oferta Area A']);
        expect(names(b.nearbyStores)).toEqual(['Loja Area B']);
        expect(names(b.offers)).toEqual(['Oferta Area B']);
      }

      // Loja nova na área A com cache quente: não aparece até o diretório vencer (15 s); a oferta dela, só depois dos 60 s das ofertas.
      await makeStore(ctx, { name: 'Loja Nova A', at: await northOf(ctx, areaA, 1200), products: [{ name: 'Oferta Nova A', priceCents: 2000, promoPriceCents: 400 }] });
      expect(names((await home(areaA)).nearbyStores)).toEqual(['Loja Area A']); // defasagem esperada
      advance(16);
      const afterDirectory = await home(areaA);
      expect(names(afterDirectory.nearbyStores).sort()).toEqual(['Loja Area A', 'Loja Nova A']);
      expect(names(afterDirectory.offers)).toEqual(['Oferta Area A']); // ofertas ainda no cache de 60 s
      advance(50);
      const afterOffers = await home(areaA);
      expect(names(afterOffers.offers)).toEqual(['Oferta Nova A', 'Oferta Area A']); // maior desconto primeiro
      expect(names((await home(areaB)).offers)).toEqual(['Oferta Area B']); // a outra área continua intacta
    });

    it('dois clientes na mesma área com o diretório compartilhado recebem a distância de CADA posição (a posição nunca entra no cache)', async () => {
      const origin = isolatedPoint();
      await makeStore(ctx, { name: 'Loja Distancia', at: await northOf(ctx, origin, 3000) });
      advance(16); // o diretório de testes anteriores ainda está quente: a loja nova só entra depois do TTL (testado acima)
      const near = await northOf(ctx, origin, 2000); // 1 km da loja
      const far = origin; // 3 km da loja
      const first = (await home(near)).nearbyStores[0]!;
      const second = (await home(far)).nearbyStores[0]!;
      const third = (await home(near)).nearbyStores[0]!;
      expect(first.distanceM).toBeLessThan(second.distanceM!);
      expect(third.distanceM).toBe(first.distanceM);
    });
  });

  describe('o checkout recalcula preço e estoque na hora, mesmo com a página em cache', () => {
    it('produto alterado depois de cacheado: a página mostra o preço antigo até vencer, e a sacola e o pedido usam o preço novo', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Preco', at: await northOf(ctx, origin, 800), feeFixedCents: 500, products: [{ name: 'Camiseta', priceCents: 1000, stock: 10 }] });
      const productId = store.productIds[0]!;
      const variantId = await variantOf(ctx, productId);

      expect((await page(productId)).price.amount).toBe(1000); // esquenta o cache
      await ctx.db.update(products).set({ basePriceCents: 1500 }).where(eq(products.id, productId));
      expect((await page(productId)).price.amount).toBe(1000); // defasagem esperada (<= 10 s)

      const { user, addressId } = await customerAt(ctx, origin);
      const cart = (await addToCart(ctx, user, variantId, 2).expect(200)).body as { summary: { subtotal: { amount: number } }; items: { unitPrice: { amount: number } }[] };
      expect(cart.items[0]!.unitPrice.amount).toBe(1500); // sacola: preço do banco
      const order = await placeOrder(ctx, user, addressId);
      expect(order.status).toBe(201);
      expect(order.body.summary.subtotal.amount).toBe(3000); // pedido: 2 x 1500, nunca 2 x 1000
      expect(order.body.summary.total.amount).toBe(3500);

      advance(11);
      expect((await page(productId)).price.amount).toBe(1500); // passado o TTL a página alcança
    });

    it('produto esgotado depois de cacheado: a página ainda mostra "disponível", mas a sacola recusa e o pedido de quem já tinha o item não sai', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Estoque', at: await northOf(ctx, origin, 800), feeFixedCents: 500, products: [{ name: 'Ultima Peca', priceCents: 1000, stock: 5 }, { name: 'Outra Peca', priceCents: 1000, stock: 5 }] });
      const [soldOut, other] = store.productIds as [string, string];
      const soldOutVariant = await variantOf(ctx, soldOut);
      const otherVariant = await variantOf(ctx, other);
      const { user, addressId } = await customerAt(ctx, origin);
      await addToCart(ctx, user, soldOutVariant, 1).expect(200); // item já na sacola antes de esgotar
      await addToCart(ctx, user, otherVariant, 1).expect(200);

      expect((await page(soldOut)).available).toBe(true); // esquenta (vitrine e página)
      const shelf = async () => ((await ctx.http.get(`/v1/browse/stores/${store.id}/products`).expect(200)).body.data as { id: string; available: boolean }[]).find((p) => p.id === soldOut)!;
      expect((await shelf()).available).toBe(true);

      await ctx.db.update(productVariants).set({ stock: 0 }).where(eq(productVariants.id, soldOutVariant));
      expect((await page(soldOut)).available).toBe(true); // página e vitrine defasadas (<= 10 s)
      expect((await shelf()).available).toBe(true);

      const other2 = await customerAt(ctx, origin);
      const refused = await addToCart(ctx, other2.user, soldOutVariant, 1);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('OUT_OF_STOCK'); // adicionar: estoque do banco
      const order = await placeOrder(ctx, user, addressId);
      expect(order.status).toBeGreaterThanOrEqual(400); // pedido: não vende o que não existe
      expect(order.status).toBeLessThan(500);

      advance(11);
      expect((await page(soldOut)).available).toBe(false); // alcançou
      expect((await shelf()).available).toBe(false);
    });

    it('loja suspensa ou pausada depois de cacheada: a página dura até 10 s, mas sacola e pedido bloqueiam na hora; some da home depois do cache de 30 s da posição', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Suspensa', at: await northOf(ctx, origin, 800), feeFixedCents: 500, products: [{ name: 'Item Suspensa', priceCents: 1000 }] });
      const paused = await makeStore(ctx, { name: 'Loja Pausada', at: await northOf(ctx, origin, 900), feeFixedCents: 500, products: [{ name: 'Item Pausada', priceCents: 1000 }] });
      const { user, addressId } = await customerAt(ctx, origin);
      const { user: user2, addressId: addressId2 } = await customerAt(ctx, origin);
      await addToCart(ctx, user, await variantOf(ctx, store.productIds[0]!), 1).expect(200);
      await addToCart(ctx, user2, await variantOf(ctx, paused.productIds[0]!), 1).expect(200);
      advance(16); // o diretório de testes anteriores ainda está quente
      expect(names((await home(origin)).nearbyStores).sort()).toEqual(['Loja Pausada', 'Loja Suspensa']);
      await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200);
      await ctx.http.get(`/v1/browse/stores/${paused.id}`).expect(200);

      await ctx.db.update(stores).set({ status: 'suspended' }).where(eq(stores.id, store.id));
      await ctx.db.update(storeSettings).set({ pausedIndefinitely: true }).where(eq(storeSettings.storeId, paused.id));

      // página: defasagem esperada
      await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200);
      expect((await ctx.http.get(`/v1/browse/stores/${paused.id}`).expect(200)).body.open).toBe(true);
      // posição: a consulta por raio confere `status = 'approved'` ao vivo (o diretório em cache não decide); o Redis foi limpo na leitura
      expect(names((await home(origin)).nearbyStores)).toEqual(['Loja Pausada']);

      // checkout: nada disso é lido do cache
      const cart = (await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200)).body as { checkout: { canCheckout: boolean; blockers: string[] } };
      expect(cart.checkout.canCheckout).toBe(false);
      expect(cart.checkout.blockers).toContain('STORE_UNAVAILABLE');
      expect((await placeOrder(ctx, user, addressId)).status).toBeGreaterThanOrEqual(400);
      const cart2 = (await ctx.http.get(`/v1/cart?addressId=${addressId2}`).set(bearer(user2.accessToken)).expect(200)).body as { checkout: { blockers: string[] } };
      expect(cart2.checkout.blockers).toContain('STORE_CLOSED');
      const refused = await placeOrder(ctx, user2, addressId2);
      expect(refused.status).toBe(409);
      expect(refused.body.code).toBe('STORE_CLOSED');

      advance(11);
      await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(404); // alcançou
      expect((await ctx.http.get(`/v1/browse/stores/${paused.id}`).expect(200)).body.open).toBe(false);
    });
  });

  describe('o que não pode ficar guardado', () => {
    it('erro no cálculo não é guardado: o 404 de um produto em rascunho some assim que ele é publicado, e uma falha do banco não vira resposta velha', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Erro', at: await northOf(ctx, origin, 800), products: [{ name: 'Rascunho', priceCents: 1000, status: 'draft' }, { name: 'Visivel', priceCents: 1000 }] });
      const [draft, visible] = store.productIds as [string, string];
      await ctx.http.get(`/v1/browse/products/${draft}`).expect(404);
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, draft));
      expect((await page(draft)).name).toBe('Rascunho'); // sem 404 guardado

      const spy = vi.spyOn(browse as unknown as { loadProductBase: (id: string) => Promise<unknown> }, 'loadProductBase').mockRejectedValueOnce(new Error('banco fora'));
      expect((await ctx.http.get(`/v1/browse/products/${visible}`)).status).toBe(500);
      expect((await page(visible)).name).toBe('Visivel'); // a próxima tentativa calcula de novo
      spy.mockRestore();
    });

    it('A1: cursores com texto diferente e o mesmo deslocamento usam UMA entrada (sem consulta nova nem expulsar as lojas quentes)', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Cursor', at: await northOf(ctx, origin, 800), products: Array.from({ length: 5 }, (_, n) => ({ name: `Item ${n}`, priceCents: 1000 })) });
      const spy = vi.spyOn(browse as unknown as { loadStoreProducts: (...args: unknown[]) => Promise<unknown> }, 'loadStoreProducts');
      const withCursor = (cursor: string) => ctx.http.get(`/v1/browse/stores/${store.id}/products?limit=2&cursor=${encodeURIComponent(cursor)}`).expect(200);
      const plain = encodeCursor({ o: 2 });
      const noisy = Buffer.from(JSON.stringify({ x: 'ruido', o: 2 })).toString('base64url');
      const negative = Buffer.from(JSON.stringify({ o: -7 })).toString('base64url');
      const a = await withCursor(plain);
      const b = await withCursor(noisy);
      expect(b.body).toEqual(a.body);
      expect(spy).toHaveBeenCalledTimes(1);
      await withCursor(negative); // deslocamento inválido vira 0 (primeira página), sem 500
      expect(spy).toHaveBeenCalledTimes(2);
      spy.mockRestore();
    });

    it('A4 (LGPD): o cache guarda só a máscara do documento da loja, nunca o CPF/CNPJ completo', async () => {
      const origin = isolatedPoint();
      const store = await makeStore(ctx, { name: 'Loja Documento', at: await northOf(ctx, origin, 800) });
      const [row] = await ctx.db.select({ documentNumber: stores.documentNumber }).from(stores).where(eq(stores.id, store.id));
      expect(row!.documentNumber.length).toBeGreaterThanOrEqual(11);
      const body = (await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200)).body;
      expect(JSON.stringify(body)).not.toContain(row!.documentNumber);
      await page(store.productIds[0]!);
      const cached = JSON.stringify([...Object.values(browse as unknown as Record<string, { entries?: Map<string, unknown> }>)].flatMap((c) => (c?.entries ? [...c.entries.values()] : [])), (_k, v) => (v instanceof Promise ? undefined : v));
      expect(cached).toContain(store.id); // as entradas desta loja estão no cache
      expect(cached).not.toContain(row!.documentNumber);
    });
  });

  it('usuário sem posição não quebra o cache: cliente anônimo e logado leem a mesma página pública', async () => {
    const origin = isolatedPoint();
    const store = await makeStore(ctx, { name: 'Loja Publica', at: await northOf(ctx, origin, 800) });
    const user = await createCustomer(ctx);
    const anon = (await ctx.http.get(`/v1/browse/stores/${store.id}`).expect(200)).body;
    const logged = (await ctx.http.get(`/v1/browse/stores/${store.id}`).set(bearer(user.accessToken)).expect(200)).body;
    expect(logged).toEqual(anon);
  });
});
