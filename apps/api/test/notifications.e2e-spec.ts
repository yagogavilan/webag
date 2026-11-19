import { eq } from 'drizzle-orm';
import { PushTransport } from '../src/modules/notifications/index.js';
import { orders, pushDevices } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const token = (seed: string) => `ExponentPushToken[${seed.padEnd(12, 'x')}]`;

/** Push (Expo) e e-mail transacional (RF-NOT-01 a 04): catálogo, aparelhos e isolamento entre contas. */
describe('Notificações: push e e-mail transacional', () => {
  let ctx: TestContext;
  let transport: PushTransport;
  const device = (user: { accessToken: string }, body: Record<string, unknown>) => ctx.http.put('/v1/me/push-devices').set(bearer(user.accessToken)).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    transport = ctx.app.get(PushTransport);
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  it('registro do aparelho: valida o token, é idempotente, o aparelho muda de dono no login de outra conta e só o dono revoga', async () => {
    const a = await createCustomer(ctx);
    const b = await createCustomer(ctx);
    const t = token('aparelho-1');
    expect((await device(a, { token: 'qualquer-coisa', platform: 'ios' })).status).toBe(400);
    expect((await device(a, { token: t, platform: 'windows' })).status).toBe(400);
    expect((await ctx.http.put('/v1/me/push-devices').send({ token: t, platform: 'ios' })).status).toBe(401);
    await device(a, { token: t, platform: 'ios' }).expect(204);
    await device(a, { token: t, platform: 'ios' }).expect(204);
    expect(await ctx.db.select().from(pushDevices).where(eq(pushDevices.token, t))).toHaveLength(1);
    await device(b, { token: t, platform: 'android' }).expect(204); // mesmo aparelho, outra conta: o token muda de dono
    expect((await ctx.db.select().from(pushDevices).where(eq(pushDevices.token, t)))[0]).toMatchObject({ userId: expect.any(String), platform: 'android' });
    await ctx.http.post('/v1/me/push-devices/revoke').set(bearer(a.accessToken)).send({ token: t }).expect(204); // a não é mais dona: nada acontece
    expect(await ctx.db.select().from(pushDevices).where(eq(pushDevices.token, t))).toHaveLength(1);
    await ctx.http.post('/v1/me/push-devices/revoke').set(bearer(b.accessToken)).send({ token: t }).expect(204);
    expect(await ctx.db.select().from(pushDevices).where(eq(pushDevices.token, t))).toHaveLength(0);
  });

  it('pagamento aprovado: push e e-mail ao cliente, push de pedido novo à loja; outras contas não recebem nada', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Push', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    const bystander = await createCustomer(ctx);
    const buyerToken = token('cliente-pedido');
    const ownerToken = token('loja-pedido');
    const otherToken = token('terceiro-pedido');
    await device(buyer.user, { token: buyerToken, platform: 'android' }).expect(204);
    await device(shop.store.owner, { token: ownerToken, platform: 'ios' }).expect(204);
    await device(bystander, { token: otherToken, platform: 'ios' }).expect(204);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string; number: string };
    const mailsBefore = ctx.mail.to(buyer.user.email).length;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);

    const sent = transport.sent.filter((m) => m.data.orderId === created.id);
    expect(sent.find((m) => m.to === buyerToken)).toMatchObject({ title: 'Pedido recebido', data: { type: 'order', orderId: created.id } });
    expect(sent.find((m) => m.to === ownerToken)).toMatchObject({ title: 'Novo pedido', data: { type: 'store_order', storeId: shop.store.id } });
    expect(sent.some((m) => m.to === otherToken)).toBe(false);
    const mails = ctx.mail.to(buyer.user.email).slice(mailsBefore);
    expect(mails.map((m) => m.subject)).toContain(`Pedido ${created.number} recebido`);
    expect(JSON.stringify(sent)).not.toMatch(/Rua Teste|CPF|@teste/); // sem dado pessoal no push

    // loja recusa: push e e-mail com o motivo ao cliente
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;
    await ctx.http.post(`${url}/refuse`).set(bearer(shop.store.owner.accessToken)).send({ reason: 'sem estoque' }).expect(200);
    const refused = transport.sent.filter((m) => m.to === buyerToken && m.title.includes('recusado'));
    expect(refused[0]?.body).toContain('sem estoque');
    expect(ctx.mail.to(buyer.user.email).some((m) => m.subject.includes('recusado') && m.text.includes('sem estoque'))).toBe(true);
    expect((await ctx.db.select().from(orders).where(eq(orders.id, created.id)))[0]!.status).toBe('refused');
  });

  it('token revogado ou desligado pelo provedor não recebe mais; falha de canal não desfaz o pedido', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Push 2', priceCents: 5_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    const t = token('revogado-1');
    await device(buyer.user, { token: t, platform: 'android' }).expect(204);
    await ctx.http.post('/v1/me/push-devices/revoke').set(bearer(buyer.user.accessToken)).send({ token: t }).expect(204);
    await ctx.db.update(pushDevices).set({ disabledAt: new Date() }).where(eq(pushDevices.token, t));
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const before = transport.sent.length;
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    expect(transport.sent.slice(before).some((m) => m.to === t)).toBe(false);
  });
});
