import { randomUUID } from 'node:crypto';
import { ParametersService } from '../src/modules/admin/index.js';
import { bearer, createTestApp, uniqueTag, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, registerUser, verifyEmailOf } from './helpers/fixtures.js';
import { addToCart, shopWith } from './helpers/orders.js';

/**
 * DT-100 / R5 (review R2.1): medição do `createOrder` COM campanha (30 clientes na MESMA campanha, ao mesmo tempo) contra a linha de base SEM campanha, na mesma API e no mesmo banco.
 * Não é o k6 (ele não está instalado neste ambiente: ver `docs/qa/carga/s10-cupom-criar-pedido.k6.js`), mas mede a mesma coisa: o POST /v1/orders. O gate daqui é largo de
 * propósito (a máquina de teste é pequena e compartilhada): nenhum 5xx, nenhum 503 SERVICE_BUSY e p95 com campanha abaixo de 3 s; os números ficam impressos para o registro.
 */
const N = 30;
const percentile = (values: number[], p: number): number => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)]!;

describe('R2.2 (DT-100): createOrder com 30 clientes na mesma campanha', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    await ctx.app.get(ParametersService).update('cupom_orcamento_mensal_webag_cents', 0, 'teste', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
    await ctx.close();
  });

  it('p95 do createOrder com campanha e sem campanha (mesma loja, mesmo banco), sem 5xx e sem SERVICE_BUSY', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 500 }]);
    const params = ctx.app.get(ParametersService);
    await params.update('cupom_orcamento_mensal_webag_cents', 10_000_000, 'teste', { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null });
    const ops = await createAdmin(ctx, 'operations');
    const finance = await createAdmin(ctx, 'finance');
    const code = `LOAD${uniqueTag(5).toUpperCase()}`;
    const created = await ctx.http.post('/v1/admin/campaigns').set(bearer(ops.accessToken)).set('Idempotency-Key', randomUUID()).send({ name: 'Carga', fundingSource: 'webag', kind: 'fixed', value: 800, audience: 'all', target: { kind: 'all' }, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: new Date(Date.now() + 30 * 86_400_000).toISOString(), budgetTotalCents: 1_000_000, budgetDailyCents: 1_000_000, maxUses: 1_000, code, reason: 'carga' }).expect(201);
    await ctx.http.post(`/v1/admin/campaigns/${created.body.id}/activate`).set(bearer(finance.accessToken)).send({ reason: 'carga', expectedVersion: 1 }).expect(200);

    const people = async (withCoupon: boolean) => {
      const out = [];
      for (let i = 0; i < N; i++) {
        const user = await registerUser(ctx, { phone: `(11) 9${Math.floor(1_000_0000 + Math.random() * 8_999_9999)}` });
        await verifyEmailOf(ctx, user);
        const addr = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Teste', number: String(10 + i), neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201);
        await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
        if (withCoupon) await ctx.http.put(`/v1/cart/coupon?addressId=${addr.body.id}`).set(bearer(user.accessToken)).send({ code }).expect(200);
        const view = await ctx.http.get(`/v1/cart?addressId=${addr.body.id}`).set(bearer(user.accessToken)).expect(200);
        out.push({ user, addressId: addr.body.id as string, revision: view.body.revision as number, total: view.body.summary.total.amount as number });
      }
      return out;
    };
    const run = async (group: Awaited<ReturnType<typeof people>>) => {
      const timed = await Promise.all(
        group.map(async (p) => {
          const t0 = performance.now();
          const res = await ctx.http.post('/v1/orders').set(bearer(p.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: p.addressId, cartRevision: p.revision, expectedTotalCents: p.total, paymentMethod: 'pix' });
          return { status: res.status, ms: performance.now() - t0 };
        }),
      );
      return { statuses: timed.map((t) => t.status), p50: percentile(timed.map((t) => t.ms), 50), p95: percentile(timed.map((t) => t.ms), 95) };
    };
    const base = await run(await people(false));
    const withCampaign = await run(await people(true));
    console.log(`[R2.2 DT-100] createOrder x${N} simultâneos: SEM campanha p50 ${base.p50.toFixed(0)} ms, p95 ${base.p95.toFixed(0)} ms | COM campanha p50 ${withCampaign.p50.toFixed(0)} ms, p95 ${withCampaign.p95.toFixed(0)} ms`);
    for (const r of [base, withCampaign]) {
      expect(r.statuses.filter((s) => s >= 500)).toEqual([]);
      expect(r.statuses.filter((s) => s === 201)).toHaveLength(N);
    }
    expect(withCampaign.p95).toBeLessThan(3_000);
  }, 180_000);
});
