import { randomUUID } from 'node:crypto';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { couponRedemptions, orders } from '../src/platform/database/schema.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { makeCoupon, shopWith } from './helpers/orders.js';

/** WB-116 C5 (DEC-060, DT-059): o detalhe do cupom da plataforma traz os usos por loja, com a participação de cada uma (autoconsumo). */
describe('Cupom da plataforma: usos por loja (DT-059)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  it('agrupa os usos NÃO devolvidos por loja e calcula a participação; só quem lê cupom vê', async () => {
    const ops = await createAdmin(ctx, 'operations');
    const support = await createAdmin(ctx, 'support');
    const buyer = await createCustomer(ctx);
    const [storeA, storeB] = [await shopWith(ctx, [{ name: 'Item A', priceCents: 3_000, stock: 5 }]), await shopWith(ctx, [{ name: 'Item B', priceCents: 3_000, stock: 5 }])];
    const coupon = await makeCoupon(ctx, { kind: 'fixed', value: 500, maxUses: 100 });
    const orderOf = async (storeId: string) =>
      (await ctx.db.insert(orders).values({ userId: buyer.userId, storeId, number: `WB-${randomUUID().slice(0, 6).toUpperCase()}`, status: 'delivered', mode: 'pickup', pickup: { address: 'Rua A, 1', instructions: null, prepMinMinutes: 10, prepMaxMinutes: 20 }, cartRevision: 1, etaMinMinutes: 30, etaMaxMinutes: 60, commissionCents: 0, applicationFeeCents: 0, finance: {}, subtotalCents: 3_000, deliveryFeeCents: 0, serviceFeeCents: 0, discountCents: 500, totalCents: 2_500, paymentMethod: 'pix' }).returning())[0]!;
    const redeem = async (storeId: string, released = false) => ctx.db.insert(couponRedemptions).values({ couponId: coupon.id, userId: buyer.userId, orderId: (await orderOf(storeId)).id, discountCents: 500, ...(released ? { releasedAt: new Date() } : {}) });
    await redeem(storeA.store.id);
    await redeem(storeA.store.id);
    await redeem(storeA.store.id);
    await redeem(storeB.store.id);
    await redeem(storeB.store.id, true); // devolvido: não conta

    const detail = (await ctx.http.get(`/v1/admin/coupons/${coupon.id}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(detail).toMatchObject({ uses: 4, orders: 4 });
    expect(detail.usesByStore).toHaveLength(2);
    expect(detail.usesByStore[0]).toMatchObject({ storeId: storeA.store.id, uses: 3, discount: { amount: 1_500, currency: 'BRL' }, sharePct: 75 });
    expect(detail.usesByStore[1]).toMatchObject({ storeId: storeB.store.id, uses: 1, sharePct: 25 });
    expect(detail.maxCost).toEqual({ amount: 50_000, currency: 'BRL' });
    // a lista não carrega o detalhe por loja
    const listed = (await ctx.http.get(`/v1/admin/coupons?q=${coupon.code}`).set(bearer(ops.accessToken)).expect(200)).body.data[0];
    expect(listed.usesByStore).toBeUndefined();
    await ctx.http.get(`/v1/admin/coupons/${coupon.id}`).set(bearer(support.accessToken)).expect(403);
  });
});
