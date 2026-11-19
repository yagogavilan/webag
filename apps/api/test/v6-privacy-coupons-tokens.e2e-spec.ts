import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { RetentionService } from '../src/modules/privacy/retention.service.js';
import { accountDeletions, couponRedemptions, coupons, orders, paymentAccounts, pushCampaignRecipients, pushCampaigns } from '../src/platform/database/schema.js';
import { bearer, createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { makeCoupon, shopWith } from './helpers/orders.js';

/** V.6 (DEC-063): a anonimização apaga o cupom pessoal NÃO usado e as linhas de `push_campaign_recipients`; tokens do MP do dono excluído por 120 dias. */
describe('Privacidade V.6: cupom pessoal, destinatários de push e tokens do Mercado Pago (DEC-063, SEC-162)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const del = (token: string) => ctx.http.post('/v1/me/deletion').set(bearer(token)).send({ password: STRONG_PASSWORD });

  it('cupom pessoal não usado (e o resgate já liberado dele) é apagado; o usado e o cupom comum ficam; as linhas de destinatário saem e o total da campanha fica', async () => {
    const user = await createCustomer(ctx);
    const other = await createCustomer(ctx);
    const personalUnused = await makeCoupon(ctx, { ownerUserId: user.userId, kind: 'free_shipping', value: 0, maxUses: 1, perCustomerLimit: 1 });
    const personalReleased = await makeCoupon(ctx, { ownerUserId: user.userId, kind: 'free_shipping', value: 0, maxUses: 1, perCustomerLimit: 1 });
    const personalUsed = await makeCoupon(ctx, { ownerUserId: user.userId, kind: 'free_shipping', value: 0, maxUses: 1, perCustomerLimit: 1 });
    const common = await makeCoupon(ctx, { kind: 'fixed', value: 500 });
    const otherPersonal = await makeCoupon(ctx, { ownerUserId: other.userId, kind: 'free_shipping', value: 0, maxUses: 1, perCustomerLimit: 1 });
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 5 }]);
    const orderRow = async () => (await ctx.db.insert(orders).values({ userId: user.userId, storeId: shop.store.id, number: `WB-${randomUUID().slice(0, 6).toUpperCase()}`, status: 'delivered', mode: 'pickup', pickup: { address: 'Rua A, 1', instructions: null, prepMinMinutes: 10, prepMaxMinutes: 20 }, cartRevision: 1, etaMinMinutes: 30, etaMaxMinutes: 60, commissionCents: 0, applicationFeeCents: 0, finance: {}, subtotalCents: 3_000, deliveryFeeCents: 0, serviceFeeCents: 0, discountCents: 0, totalCents: 3_000, paymentMethod: 'pix' }).returning())[0]!;
    const usedOrder = await orderRow();
    const releasedOrder = await orderRow();
    await ctx.db.insert(couponRedemptions).values({ couponId: personalUsed.id, userId: user.userId, orderId: usedOrder.id, discountCents: 800 });
    await ctx.db.insert(couponRedemptions).values({ couponId: personalReleased.id, userId: user.userId, orderId: releasedOrder.id, discountCents: 800, releasedAt: new Date() });

    const admin = await createAdmin(ctx, 'operations');
    const [campaign] = await ctx.db.insert(pushCampaigns).values({ title: 'Oferta', body: 'Corpo', status: 'sent', segment: { kind: 'all' }, destination: { type: 'home' }, estimatedCount: 2, recipientsCount: 2, deliveredCount: 2, sendAt: new Date(), createdBy: admin.userId }).returning();
    await ctx.db.insert(pushCampaignRecipients).values([{ campaignId: campaign!.id, userId: user.userId }, { campaignId: campaign!.id, userId: other.userId }]);

    const res = await del(user.accessToken);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const [deletion] = await ctx.db.select().from(accountDeletions).where(eq(accountDeletions.userId, user.userId));
    expect(deletion!.status).toBe('completed');
    expect(deletion!.summary).toMatchObject({ personalCouponsDeleted: 2, pushCampaignRecipients: 1 });

    const exists = async (id: string) => (await ctx.db.select({ id: coupons.id }).from(coupons).where(eq(coupons.id, id))).length === 1;
    expect(await exists(personalUnused.id)).toBe(false);
    expect(await exists(personalReleased.id)).toBe(false);
    expect(await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, personalReleased.id))).toHaveLength(0);
    expect(await exists(personalUsed.id)).toBe(true); // o usado fica como registro de resgate do pedido
    expect(await ctx.db.select().from(couponRedemptions).where(eq(couponRedemptions.couponId, personalUsed.id))).toHaveLength(1);
    expect(await exists(common.id)).toBe(true);
    expect(await exists(otherPersonal.id)).toBe(true); // o cupom de outra conta não é tocado

    expect(await ctx.db.select().from(pushCampaignRecipients).where(eq(pushCampaignRecipients.userId, user.userId))).toHaveLength(0);
    expect(await ctx.db.select().from(pushCampaignRecipients).where(eq(pushCampaignRecipients.userId, other.userId))).toHaveLength(1);
    const [after] = await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, campaign!.id));
    expect(after).toMatchObject({ recipientsCount: 2, deliveredCount: 2 }); // agregados ficam
  });

  it('tokens do Mercado Pago do dono excluído: seguem por 120 dias (90 + 30) e depois a conta vira `disconnected` com o segredo apagado', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 5 }]);
    const stranger = await shopWith(ctx, [{ name: 'Item', priceCents: 2_000, stock: 5 }]); // loja de outro dono: nunca é tocada
    const accountOf = async (storeId: string) => (await ctx.db.select().from(paymentAccounts).where(eq(paymentAccounts.storeId, storeId)))[0]!;
    expect(await accountOf(shop.store.id)).toMatchObject({ status: 'active', tokensEnc: 'x' });
    const outcome = await del(shop.store.owner.accessToken);
    expect(outcome.status, JSON.stringify(outcome.body)).toBe(200);
    expect((await ctx.db.select().from(accountDeletions).where(and(eq(accountDeletions.userId, shop.store.owner.userId), eq(accountDeletions.status, 'completed')))).length).toBe(1);

    const retention = ctx.app.get(RetentionService);
    const day = 86_400_000;
    const at100 = await retention.run(new Date(Date.now() + 100 * day));
    expect(at100.errors).toEqual([]);
    expect(await accountOf(shop.store.id)).toMatchObject({ tokensEnc: 'x' }); // 100 < 120: os tokens ainda servem para estorno de defeito
    const at121 = await retention.run(new Date(Date.now() + 121 * day));
    expect(at121.errors).toEqual([]);
    expect(at121.counts.deletedOwnerPaymentTokens).toBeGreaterThanOrEqual(1);
    expect(await accountOf(shop.store.id)).toMatchObject({ status: 'disconnected', tokensEnc: '', tokensExpireAt: null });
    expect((await accountOf(shop.store.id)).disconnectedAt).not.toBeNull();
    expect(await accountOf(stranger.store.id)).toMatchObject({ status: 'active', tokensEnc: 'x' });
    // idempotente
    expect((await retention.run(new Date(Date.now() + 122 * day))).counts.deletedOwnerPaymentTokens).toBe(0);
  });
});
