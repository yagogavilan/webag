import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DsrService } from '../src/modules/privacy/dsr.service.js';
import { paymentRefundIntents, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** W.7 (WB-125): contagens de pendências do Início do admin, por área e só para quem tem a permissão da área. */
describe('Admin: pendências do Início (W.7)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const get = async (token: string) => (await ctx.http.get('/v1/admin/overview/pending').set(bearer(token)).expect(200)).body;

  it('cada perfil vê só as áreas que pode abrir; as outras vêm nulas; sem login 401 e cliente 403', async () => {
    const [sup, ops, fin, support] = [await createAdmin(ctx, 'super_admin'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
    const all = await get(sup.accessToken);
    expect(all).toMatchObject({ stores: { inReview: expect.any(Number) }, disputes: { inMediation: expect.any(Number) }, refunds: { needingAction: expect.any(Number) }, dataRequests: { open: expect.any(Number), dueSoon: expect.any(Number) } });
    expect(await get(ops.accessToken)).toMatchObject({ stores: expect.any(Object), disputes: expect.any(Object), refunds: null, dataRequests: null });
    expect(await get(fin.accessToken)).toMatchObject({ stores: expect.any(Object), disputes: null, refunds: expect.any(Object), dataRequests: null });
    expect(await get(support.accessToken)).toMatchObject({ stores: expect.any(Object), disputes: null, refunds: null, dataRequests: null });
    await ctx.http.get('/v1/admin/overview/pending').expect(401);
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 1_000, stock: 1 }]);
    await ctx.http.get('/v1/admin/overview/pending').set(bearer(shop.store.owner.accessToken)).expect(403);
  });

  it('as contagens sobem com o que fica pendente: loja em análise, estorno esgotado e pedido de titular (que vence em até 5 dias)', async () => {
    const sup = await createAdmin(ctx, 'super_admin');
    const before = await get(sup.accessToken);

    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 5 }]);
    await ctx.db.update(stores).set({ status: 'in_review' }).where(eq(stores.id, shop.store.id));

    const other = await shopWith(ctx, [{ name: 'Item 2', priceCents: 4_000, stock: 5 }]);
    const buyer = await customerAt(ctx, other.origin);
    await addToCart(ctx, buyer.user, other.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    const attempt = await attemptOf(ctx, created.id);
    await approve(ctx, buyer.user, attempt.id);
    await ctx.db.insert(paymentRefundIntents).values({ attemptId: attempt.id, idempotencyKey: `w7-${randomUUID()}`, amountCents: 100, reason: 'teste', status: 'exhausted' });
    await ctx.db.insert(paymentRefundIntents).values({ attemptId: attempt.id, idempotencyKey: `w7-${randomUUID()}`, amountCents: 100, reason: 'teste', status: 'covered' }); // coberto: não é pendência

    await ctx.app.get(DsrService).submit({ type: 'access', email: `titular-${randomUUID().slice(0, 6)}@teste.webag.local` }, { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });

    const after = await get(sup.accessToken);
    expect(after.stores.inReview).toBe(before.stores.inReview + 1);
    expect(after.refunds.needingAction).toBe(before.refunds.needingAction + 1);
    expect(after.dataRequests.open).toBe(before.dataRequests.open + 1);
    expect(after.dataRequests.dueSoon).toBe(before.dataRequests.dueSoon); // recém-aberto: prazo de 15 dias
  });
});
