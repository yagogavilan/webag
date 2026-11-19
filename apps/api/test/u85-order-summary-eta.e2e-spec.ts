import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** U8.5: a lista de pedidos do cliente traz a faixa de chegada (`OrderSummary.eta`) para a linha "Chega entre 18:46 e 19:46". */
describe('U8.5: OrderSummary.eta', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(() => ctx.close());

  it('pedido de entrega: a mesma faixa do detalhe (reancorada no pagamento); retirada: nula', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Faixa', priceCents: 4_000, stock: 20 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    const auth = bearer(buyer.user.accessToken);

    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const delivery = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, delivery.id)).id);

    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const { revision, totalCents } = await cartView(ctx, buyer.user, undefined);
    const pickup = (await ctx.http.post('/v1/orders').set(auth).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' }).expect(201)).body as { id: string };

    const list = (await ctx.http.get('/v1/orders?scope=active').set(auth).expect(200)).body.data as { id: string; mode: string; eta: { fromAt: string; toAt: string; minMinutes: number; maxMinutes: number } | null }[];
    const row = list.find((o) => o.id === delivery.id)!;
    const detail = (await ctx.http.get(`/v1/orders/${delivery.id}`).set(auth).expect(200)).body;
    expect(row.eta).toEqual(detail.delivery.eta);
    expect(row.eta).toMatchObject({ fromAt: expect.any(String), toAt: expect.any(String) });
    expect(Date.parse(row.eta!.toAt)).toBeGreaterThan(Date.parse(row.eta!.fromAt));
    expect(list.find((o) => o.id === pickup.id)!.eta).toBeNull();
  });
});
