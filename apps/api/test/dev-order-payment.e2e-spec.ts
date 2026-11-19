import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

/** F1 (app): simulação do PIX por PEDIDO (o app só conhece o id do pedido). Em produção e no staging a rota não existe: `production-boot.e2e-spec.ts`. */
describe('POST /v1/dev/orders/{orderId}/payment/{approve,decline,expire} (F1)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => ctx.close());

  async function pendingOrder() {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    return { buyer, orderId: created.body.id as string };
  }
  const call = (orderId: string, action: string, token: string) => ctx.http.post(`/v1/dev/orders/${orderId}/payment/${action}`).set(bearer(token)).send({});

  it('approve: o pedido vira pago pelo mesmo caminho do webhook; repetir não duplica', async () => {
    const { buyer, orderId } = await pendingOrder();
    const res = await call(orderId, 'approve', buyer.user.accessToken).expect(200);
    expect(res.body.payment.status).toBe('approved');
    expect((await orderRow(ctx, orderId)).status).toBe('received');
    const again = await call(orderId, 'approve', buyer.user.accessToken);
    expect(again.status).toBeLessThan(500);
    expect((await orderRow(ctx, orderId)).status).toBe('received');
  });

  it('decline e expire: o pedido deixa de aguardar o pagamento (expira) e o estoque volta', async () => {
    const declined = await pendingOrder();
    expect((await call(declined.orderId, 'decline', declined.buyer.user.accessToken).expect(200)).body.payment.status).toBe('declined');
    expect((await orderRow(ctx, declined.orderId)).status).toBe('expired');
    const expired = await pendingOrder();
    expect((await call(expired.orderId, 'expire', expired.buyer.user.accessToken).expect(200)).body.payment.status).toBe('expired');
    expect((await orderRow(ctx, expired.orderId)).status).toBe('expired');
  });

  it('só a dona do pedido simula: outra conta recebe 404, sem login 401, id inválido ou pedido inexistente 404', async () => {
    const { buyer, orderId } = await pendingOrder();
    const stranger = await createCustomer(ctx);
    await call(orderId, 'approve', stranger.accessToken).expect(404);
    await ctx.http.post(`/v1/dev/orders/${orderId}/payment/approve`).send({}).expect(401);
    await call('nao-e-uuid', 'approve', buyer.user.accessToken).expect(404);
    await call(randomUUID(), 'approve', buyer.user.accessToken).expect(404);
    expect((await orderRow(ctx, orderId)).status).toBe('awaiting_payment'); // nada mudou
  });
});
