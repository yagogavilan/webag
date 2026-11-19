import { randomUUID } from 'node:crypto';
import { couponRedemptions } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureLegalDocs } from './helpers/fixtures.js';
import { makeCoupon } from './helpers/orders.js';

/** GET /v1/me/coupons: cupons pessoais do cliente (compensação por atraso, WB-254). */
describe('Meus cupons (GET /v1/me/coupons)', () => {
  let ctx: TestContext;
  const day = 86_400_000;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => ctx.close());

  const list = (token: string, query: Record<string, string> = {}) => ctx.http.get('/v1/me/coupons').query(query).set(bearer(token));

  it('exige login; lista só os cupons do dono (nunca os de outro cliente nem os públicos), com o mínimo de dados', async () => {
    expect((await ctx.http.get('/v1/me/coupons')).status).toBe(401);
    const ana = await createCustomer(ctx);
    const bia = await createCustomer(ctx);
    const mine = await makeCoupon(ctx, { kind: 'free_shipping', value: 0, ownerUserId: ana.userId, sourceOrderId: randomUUID(), maxUses: 1 });
    await makeCoupon(ctx, { ownerUserId: bia.userId, sourceOrderId: randomUUID() }); // de outra conta
    await makeCoupon(ctx); // público, sem dono
    const res = await list(ana.accessToken);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.nextCursor).toBeNull();
    expect(res.body.data).toHaveLength(1);
    expect(res.body.data[0]).toEqual({
      id: mine.id,
      code: mine.code,
      kind: 'free_shipping',
      valueCents: null,
      percent: null,
      minOrderCents: 0,
      startsAt: mine.startsAt.toISOString(),
      expiresAt: mine.endsAt.toISOString(),
      status: 'available',
      origin: 'late_delivery',
    });
    expect(JSON.stringify(res.body)).not.toMatch(/ownerUserId|sourceOrderId|orderId|userId/); // sem pedido de origem nem ids de conta
    expect((await list(bia.accessToken)).body.data).toHaveLength(1);
  });

  it('estados: disponível (padrão), usado e vencido; `status=all` traz os três; filtros inválidos são 400', async () => {
    const ana = await createCustomer(ctx);
    const own = { ownerUserId: ana.userId, sourceOrderId: null as string | null };
    const free = await makeCoupon(ctx, { ...own, kind: 'free_shipping', value: 0 });
    const fixed = await makeCoupon(ctx, { ...own, kind: 'fixed', value: 1500, minOrderCents: 3000 });
    const expired = await makeCoupon(ctx, { ...own, startsAt: new Date(Date.now() - 3 * day), endsAt: new Date(Date.now() - day) });
    await ctx.db.insert(couponRedemptions).values({ couponId: fixed.id, userId: ana.userId, orderId: randomUUID(), discountCents: 1500 });
    const byStatus = async (status: string) => ((await list(ana.accessToken, { status })).body.data as { id: string; status: string; valueCents: number | null; origin: string }[]);
    expect((await byStatus('available')).map((c) => c.id)).toEqual([free.id]);
    expect((await list(ana.accessToken)).body.data.map((c: { id: string }) => c.id)).toEqual([free.id]); // padrão = disponíveis
    const used = await byStatus('used');
    expect(used.map((c) => c.id)).toEqual([fixed.id]);
    expect(used[0]).toMatchObject({ status: 'used', valueCents: 1500, origin: 'other' });
    expect((await byStatus('expired')).map((c) => c.id)).toEqual([expired.id]);
    expect((await byStatus('all')).map((c) => c.status).sort()).toEqual(['available', 'expired', 'used']);
    expect((await list(ana.accessToken, { status: 'xyz' })).status).toBe(400);
    expect((await list(ana.accessToken, { limit: '500' })).status).toBe(400);
    expect((await list(ana.accessToken, { cursor: '!!!' })).status).toBe(400);
  });

  it('cupom devolvido (pedido cancelado) volta a "disponível"', async () => {
    const ana = await createCustomer(ctx);
    const c = await makeCoupon(ctx, { ownerUserId: ana.userId, kind: 'free_shipping', value: 0 });
    await ctx.db.insert(couponRedemptions).values({ couponId: c.id, userId: ana.userId, orderId: randomUUID(), discountCents: 0, releasedAt: new Date() });
    expect((await list(ana.accessToken)).body.data.map((x: { id: string }) => x.id)).toEqual([c.id]);
  });

  it('paginado por cursor, do mais novo ao mais antigo, sem repetir nem pular', async () => {
    const ana = await createCustomer(ctx);
    const made: string[] = [];
    for (let i = 0; i < 5; i += 1) made.push((await makeCoupon(ctx, { ownerUserId: ana.userId, kind: 'free_shipping', value: 0 })).id);
    const seen: string[] = [];
    let cursor: string | undefined;
    for (let page = 0; page < 5; page += 1) {
      const res = await list(ana.accessToken, { limit: '2', ...(cursor ? { cursor } : {}) });
      expect(res.status).toBe(200);
      seen.push(...res.body.data.map((c: { id: string }) => c.id));
      cursor = res.body.nextCursor ?? undefined;
      if (!cursor) break;
    }
    expect(seen).toHaveLength(5);
    expect(new Set(seen).size).toBe(5);
    expect(seen).toEqual([...made].reverse());
  });
});
