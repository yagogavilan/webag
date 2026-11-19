import { vi } from 'vitest';
import type pg from 'pg';
import { PG_POOL } from '../src/platform/database/database.module.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** R.6 / I9: as listas de pedidos fazem um número FIXO de consultas, não 2 ou 3 por pedido. */
describe('Listas de pedidos sem N+1 (I9)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  /** Conta as consultas ao banco feitas pelo pool da API durante `fn`. */
  async function countQueries<T>(fn: () => Promise<T>): Promise<{ result: T; queries: number }> {
    const pool = ctx.app.get<pg.Pool>(PG_POOL);
    const spy = vi.spyOn(pool, 'query');
    try {
      const result = await fn();
      return { result, queries: spy.mock.calls.length };
    } finally {
      spy.mockRestore();
    }
  }

  async function seedOrders(count: number) {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 50 }]);
    const buyer = await customerAt(ctx, shop.origin);
    for (let i = 0; i < count; i += 1) {
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const res = await placeOrder(ctx, buyer.user, buyer.addressId, { paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } }); // cartão aprova na hora (o teto de PIX por hora não atrapalha)
      expect(res.status, JSON.stringify(res.body)).toBe(201);
    }
    return { shop, buyer };
  }

  it('lista do cliente: o mesmo número de consultas com 2 ou com 12 pedidos na página; conteúdo preservado', async () => {
    const { buyer } = await seedOrders(12);
    const small = await countQueries(() => ctx.http.get('/v1/orders?limit=2').set(bearer(buyer.user.accessToken)));
    const large = await countQueries(() => ctx.http.get('/v1/orders?limit=12').set(bearer(buyer.user.accessToken)));
    expect(small.result.status).toBe(200);
    expect(large.result.body.data).toHaveLength(12);
    expect(large.result.body.data[0]).toMatchObject({ status: 'received', itemCount: 1, firstItemName: 'Item', total: { amount: expect.any(Number) as number } });
    expect(small.queries).toBeGreaterThan(0);
    expect(large.queries).toBe(small.queries);
  });

  it('lista da loja: o mesmo número de consultas com 2 ou com 12 pedidos na página', async () => {
    const { shop } = await seedOrders(12);
    const owner = bearer(shop.store.owner.accessToken);
    const small = await countQueries(() => ctx.http.get(`/v1/stores/${shop.store.id}/orders?limit=2`).set(owner));
    const large = await countQueries(() => ctx.http.get(`/v1/stores/${shop.store.id}/orders?limit=12`).set(owner));
    expect(small.result.status).toBe(200);
    expect(large.result.body.data).toHaveLength(12);
    expect(large.result.body.data[0]).toMatchObject({ customerFirstName: expect.any(String) as string, itemCount: 1, firstItemName: 'Item' });
    expect(small.queries).toBeGreaterThan(0);
    expect(large.queries).toBe(small.queries);
  });
});
