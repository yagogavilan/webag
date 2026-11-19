import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, cartView, customerAt, placeOrder, shopWith } from './helpers/orders.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** B5 / WB-108 e WB-109 (DEC-073): pedidos no admin. Lista com filtros, detalhe mascarado com linha do tempo e as ações cancelar e estornar com motivo e auditoria. */
describe('B5: pedidos no admin', () => {
  let ctx: TestContext;
  const admins = {} as Record<'super_admin' | 'finance' | 'operations' | 'support', Admin>;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    for (const profile of ['super_admin', 'finance', 'operations', 'support'] as const) admins[profile] = await createAdmin(ctx, profile);
  });
  afterAll(() => ctx.close());

  const list = (who: Admin, query = '') => ctx.http.get(`/v1/admin/orders?${query}`).set(bearer(who.accessToken));
  const detail = (who: Admin, id: string) => ctx.http.get(`/v1/admin/orders/${id}`).set(bearer(who.accessToken));
  const ids = (body: { data: { id: string }[] }) => body.data.map((o) => o.id);

  /** 1 loja, 3 pedidos: entrega paga, retirada paga e entrega aguardando pagamento. */
  async function scenario() {
    const shop = await shopWith(ctx, [{ name: 'Item Admin', priceCents: 6_000, stock: 30 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    const place = async (mode: 'delivery' | 'pickup', pay: boolean) => {
      await addToCart(ctx, buyer.user, shop.variants[0]!, 2).expect(200);
      let res;
      if (mode === 'pickup') {
        const { revision, totalCents } = await cartView(ctx, buyer.user, undefined);
        res = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'pickup', cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix' });
      } else {
        res = await placeOrder(ctx, buyer.user, buyer.addressId);
      }
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const id = res.body.id as string;
      if (pay) await approve(ctx, buyer.user, (await attemptOf(ctx, id)).id);
      return { id, number: res.body.number as string };
    };
    const delivery = await place('delivery', true);
    const pickup = await place('pickup', true);
    const pending = await place('delivery', false);
    return { shop, buyer, delivery, pickup, pending };
  }

  it('lista com filtros por loja, estado (um ou vários), tipo, forma de pagamento, número, e-mail exato do cliente, período e cidade', async () => {
    const s = await scenario();
    const all = (await list(admins.support, `storeId=${s.shop.store.id}`).expect(200)).body;
    expect(ids(all).sort()).toEqual([s.delivery.id, s.pickup.id, s.pending.id].sort());
    expect(all.nextCursor).toBeNull();
    expect(all.data[0]).toMatchObject({ store: { id: s.shop.store.id, name: 'Loja Pedidos' }, paymentMethod: 'pix', total: { currency: 'BRL', amount: expect.any(Number) } });

    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&status=received`).expect(200)).body).sort()).toEqual([s.delivery.id, s.pickup.id].sort());
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&status=awaiting_payment,expired`).expect(200)).body)).toEqual([s.pending.id]);
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&mode=pickup`).expect(200)).body)).toEqual([s.pickup.id]);
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&paymentMethod=card`).expect(200)).body)).toEqual([]);
    expect(ids((await list(admins.support, `q=${encodeURIComponent(s.delivery.number)}`).expect(200)).body)).toEqual([s.delivery.id]); // número
    expect(ids((await list(admins.support, `q=${encodeURIComponent(s.delivery.number.slice(3).toLowerCase())}`).expect(200)).body)).toContain(s.delivery.id); // trecho, sem diferenciar caixa
    expect(ids((await list(admins.support, `q=${encodeURIComponent(s.buyer.user.email)}`).expect(200)).body).sort()).toEqual([s.delivery.id, s.pickup.id, s.pending.id].sort()); // e-mail exato do cliente
    expect(ids((await list(admins.support, `q=${encodeURIComponent(s.buyer.user.email.slice(0, 8))}`).expect(200)).body)).toEqual([]); // e-mail por trecho não vale (não vira consulta de pessoas)
    expect(ids((await list(admins.support, `userId=${s.buyer.user.userId}`).expect(200)).body)).toContain(s.pickup.id);
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&city=francisco%20morato`).expect(200)).body)).toHaveLength(3);
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&city=Caieiras`).expect(200)).body)).toEqual([]);
    const now = Date.now();
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&from=${new Date(now - 3_600_000).toISOString()}&to=${new Date(now + 60_000).toISOString()}`).expect(200)).body)).toHaveLength(3);
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&to=${new Date(now - 3_600_000).toISOString()}`).expect(200)).body)).toEqual([]);

    await list(admins.support, 'status=inventado').expect(400);
    await list(admins.support, 'mode=voando').expect(400);
    await list(admins.support, 'storeId=nao-uuid').expect(400);
    await list(admins.support, 'cursor=lixo').expect(400);
    await ctx.http.get('/v1/admin/orders').expect(401);
  });

  it('paginação por cursor: páginas de 1 percorrem os pedidos da loja, mais novos primeiro, sem repetir', async () => {
    const s = await scenario();
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let i = 0; i < 10; i += 1) {
      const res: { body: { data: { id: string }[]; nextCursor: string | null } } = await list(admins.operations, `storeId=${s.shop.store.id}&limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`).expect(200);
      seen.push(...ids(res.body));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(seen).toEqual([s.pending.id, s.pickup.id, s.delivery.id]);
  });

  it('todo perfil de admin lê; o cliente é mascarado em toda parte (nome abreviado, e-mail e celular parciais, endereço só bairro e cidade)', async () => {
    const s = await scenario();
    const row = (await list(admins.finance, `storeId=${s.shop.store.id}&limit=1`).expect(200)).body.data[0];
    expect(row.customer.name).toBe('Maria T.');
    for (const who of Object.values(admins)) expect((await detail(who, s.delivery.id)).status, who.profile).toBe(200);

    const d = (await detail(admins.support, s.delivery.id).expect(200)).body;
    expect(d).toMatchObject({
      id: s.delivery.id,
      number: s.delivery.number,
      status: 'received',
      mode: 'delivery',
      paymentMethod: 'pix',
      customer: { id: s.buyer.user.userId, name: 'Maria T.', phoneMasked: '(11) 9****-7777' },
      delivery: { neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', logistics: null },
      store: { id: s.shop.store.id, name: 'Loja Pedidos' },
    });
    const text = JSON.stringify(d);
    expect(d.customer.emailMasked).toBe(`${s.buyer.user.email[0]}***@${s.buyer.user.email.split('@')[1]}`);
    expect(text).not.toContain(s.buyer.user.email);
    expect(text).not.toContain('Rua Teste'); // rua e número ficam de fora
    expect(text).not.toContain('07900'); // CEP também
    expect(text).not.toContain('98888');
    expect(text).not.toContain('Maria Teste');
    expect(await ctx.http.get(`/v1/admin/orders/${randomUUID()}`).set(bearer(admins.support.accessToken))).toMatchObject({ status: 404 });
    await detail(admins.support, 'nao-uuid').expect(404);
  });

  it('detalhe: itens, valores da RN-10, pagamento, estornos e linha do tempo', async () => {
    const s = await scenario();
    const d = (await detail(admins.finance, s.delivery.id).expect(200)).body;
    expect(d.items).toEqual([expect.objectContaining({ name: 'Item Admin', quantity: 2, unitPrice: { amount: 6_000, currency: 'BRL' }, lineTotal: { amount: 12_000, currency: 'BRL' } })]);
    expect(d.values).toMatchObject({ subtotal: { amount: 12_000 }, commission: { amount: 1_200 }, total: { amount: d.total.amount } }); // 10% fixado pelo createTestApp
    expect(d.values.total.amount).toBe(d.values.subtotal.amount + d.values.delivery.amount + d.values.serviceFee.amount - d.values.storeDiscount.amount - d.values.platformDiscount.amount);
    expect(d.payment).toMatchObject({ method: 'pix', status: 'approved', installments: 1, attempts: [expect.objectContaining({ status: 'approved', amount: d.total })] });
    expect(d.refunds).toMatchObject({ paid: d.total, refunded: { amount: 0 }, remaining: d.total, items: [] });
    expect(d.timeline.map((t: { status: string }) => t.status)).toEqual(['awaiting_payment', 'received']);
    expect(d.timeline.at(-1)).toMatchObject({ status: 'received', from: 'awaiting_payment', actor: 'system', actorName: null, reason: 'Pagamento aprovado' });
    expect(d.refundLimit).toEqual({ superAdminOnlyAboveCents: 50_000, profileCapCents: 50_000 });

    const pending = (await detail(admins.finance, s.pending.id).expect(200)).body;
    expect(pending).toMatchObject({ status: 'awaiting_payment', paidAt: null, refunds: { paid: { amount: 0 }, remaining: { amount: 0 } } });
    expect(pending.allowedActions).toEqual(['cancel']); // sem pagamento não há o que estornar
    expect((await detail(admins.super_admin, s.pending.id).expect(200)).body.refundLimit.profileCapCents).toBeNull();
  });

  it('ações por perfil: financeiro e super admin cancelam e estornam (já era assim); operação e suporte veem sem poder agir', async () => {
    const s = await scenario();
    expect((await detail(admins.finance, s.delivery.id).expect(200)).body.allowedActions).toEqual(['cancel', 'refund']);
    expect((await detail(admins.super_admin, s.delivery.id).expect(200)).body.allowedActions).toEqual(['cancel', 'refund']);
    expect((await detail(admins.operations, s.delivery.id).expect(200)).body.allowedActions).toEqual([]);
    expect((await detail(admins.support, s.delivery.id).expect(200)).body.allowedActions).toEqual([]);
    // e o servidor confere de novo
    await ctx.http.post(`/v1/admin/orders/${s.delivery.id}/cancel`).set(bearer(admins.operations.accessToken)).send({ reason: 'tentativa sem permissão' }).expect(403);
    await ctx.http.post(`/v1/admin/orders/${s.delivery.id}/refunds`).set(bearer(admins.support.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: 100, reason: 'tentativa sem permissão' }).expect(403);
  });

  it('estorno parcial e cancelamento com motivo: o detalhe mostra o estorno, o saldo e a linha do tempo com o ator; o pedido sai da lista de ativos', async () => {
    const s = await scenario();
    const before = (await detail(admins.finance, s.delivery.id).expect(200)).body;
    const refund = await ctx.http.post(`/v1/admin/orders/${s.delivery.id}/refunds`).set(bearer(admins.finance.accessToken)).set('Idempotency-Key', randomUUID()).send({ amountCents: 1_500, reason: 'cliente recebeu um item avariado' }).expect(200);
    expect(refund.body.refunded.amount).toBe(1_500);
    const mid = (await detail(admins.finance, s.delivery.id).expect(200)).body;
    expect(mid.refunds).toMatchObject({ refunded: { amount: 1_500 }, remaining: { amount: before.total.amount - 1_500 } });
    expect(mid.refunds.items).toEqual([expect.objectContaining({ amount: { amount: 1_500, currency: 'BRL' }, reason: 'cliente recebeu um item avariado', status: expect.stringMatching(/done|pending/) })]);
    expect(mid.status).toBe('received');
    expect(mid.allowedActions).toEqual(['cancel', 'refund']);

    await ctx.http.post(`/v1/admin/orders/${s.delivery.id}/cancel`).set(bearer(admins.finance.accessToken)).send({ reason: 'loja sem estoque, cancelado pelo admin' }).expect(200);
    const after = (await detail(admins.finance, s.delivery.id).expect(200)).body;
    expect(after).toMatchObject({ status: 'cancelled', cancelledBy: 'admin', cancelReason: 'loja sem estoque, cancelado pelo admin', refunds: { remaining: { amount: 0 }, refunded: { amount: before.total.amount } } });
    expect(after.timeline.at(-1)).toMatchObject({ status: 'cancelled', actor: 'admin', actorName: 'Admin finance', reason: 'loja sem estoque, cancelado pelo admin' });
    expect(after.allowedActions).toEqual([]); // nada mais a cancelar nem a estornar
    expect(ids((await list(admins.support, `storeId=${s.shop.store.id}&status=cancelled`).expect(200)).body)).toEqual([s.delivery.id]);
    const customer = await registerUser(ctx);
    expect((await ctx.http.get('/v1/admin/orders').set(bearer(customer.accessToken))).status).toBe(403); // cliente nem chega
  });
});
