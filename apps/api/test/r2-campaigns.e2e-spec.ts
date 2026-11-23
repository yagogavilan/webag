import { randomUUID } from 'node:crypto';
import { eq, inArray, sql } from 'drizzle-orm';
import { CampaignsService } from '../src/modules/campaigns/index.js';
import { FeatureFlagsService, ParametersService } from '../src/modules/admin/index.js';
import { OrdersService } from '../src/modules/orders/orders.service.js';
import { PaymentsService } from '../src/modules/payments/payments.service.js';
import { campaignBudgetEntries, campaigns, sessions, couponFraudClaims, couponFraudSignals, couponIdentifierSightings, couponReservations, coupons } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, expireReauth, registerUser, verifyEmailOf, type TestAdmin } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';
import { uniqueTag } from './helpers/app.js';

/**
 * v1.1 R2.2 (ADR-019): motor de campanhas. Admin (permissões, 2º fator, imutabilidade, SEC-224), reserva atômica sob a trava na criação do pedido, confirmação no pagamento, devolução ao
 * expirar ou cancelar, estorno proporcional, antifraude por HMAC e o invariante do diário depois de cada cenário. DEC-088: o cliente nunca envia desconto, fonte ou campanha.
 */
const ctxless = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };
const FUTURE = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString();

describe('R2.2: campanhas e cupons (motor)', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;
  let params: ParametersService;
  let flags: FeatureFlagsService;
  let orderService: OrdersService;
  let payments: PaymentsService;
  let campaignService: CampaignsService;

  /** A reautenticação recente (SEC-016) é gravada na sessão; o fluxo por TOTP tem teste próprio (admin-mfa). */
  const freshReauth = (admin: TestAdmin) => ctx.db.update(sessions).set({ reauthAt: new Date() }).where(eq(sessions.userId, admin.userId));
  const setBudget = (cents: number) => params.update('cupom_orcamento_mensal_webag_cents', cents, 'teste R2.2', ctxless);
  const adminPost = (admin: TestAdmin, path: string, body: unknown, key: string | null = randomUUID()) => {
    const req = ctx.http.post(path).set(bearer(admin.accessToken));
    return (key ? req.set('Idempotency-Key', key) : req).send(body as object);
  };
  const violations = async (campaignId: string) => (await ctx.db.execute<{ counter: string }>(sql`select counter from campaign_budget_violations() where campaign_id = ${campaignId}::uuid`)).rows.map((r) => r.counter);

  /** Campanha "Webag paga" de R$ 8,00 ativa (orçamento total e diário em centavos) com código público. */
  async function activeCampaign(over: Record<string, unknown> = {}, code = `PROMO${uniqueTag(6).toUpperCase()}`) {
    await setBudget(1_000_000);
    const created = await adminPost(ops, '/v1/admin/campaigns', { name: 'Oito reais', fundingSource: 'webag', kind: 'fixed', value: 800, audience: 'all', target: { kind: 'all' }, startsAt: new Date(Date.now() - 60_000).toISOString(), endsAt: FUTURE(30), budgetTotalCents: 4_000, budgetDailyCents: 100_000, maxUses: 100, perCustomerLimit: 1, code, reason: 'teste do motor', ...over });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const id = created.body.id as string;
    const activated = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'teste', expectedVersion: created.body.version });
    expect(activated.status, JSON.stringify(activated.body)).toBe(200);
    return { id, code, version: activated.body.version as number };
  }

  async function buyer(shop: Shop, over: Record<string, unknown> = {}) {
    const user = await registerUser(ctx, { phone: `(11) 9${Math.floor(1_000_0000 + Math.random() * 8_999_9999)}`, ...over });
    await verifyEmailOf(ctx, user);
    const res = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Teste', number: String(10 + Math.floor(Math.random() * 900)), neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201);
    return { user, addressId: res.body.id as string };
  }
  const applyCoupon = (user: { accessToken: string }, code: string, addressId: string, body: Record<string, unknown> = {}) => ctx.http.put(`/v1/cart/coupon?addressId=${addressId}`).set(bearer(user.accessToken)).send({ code, ...body });

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    params = ctx.app.get(ParametersService);
    flags = ctx.app.get(FeatureFlagsService);
    orderService = ctx.app.get(OrdersService);
    payments = ctx.app.get(PaymentsService);
    campaignService = ctx.app.get(CampaignsService);
    ops = await createAdmin(ctx, 'operations');
    finance = await createAdmin(ctx, 'finance');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(async () => {
    await setBudget(0);
    await ctx.close();
  });

  describe('admin: permissões, validação e 2º fator', () => {
    it('suporte não lê; operação cria e lê; financeiro não cria; ativar é do financeiro e do super admin', async () => {
      await ctx.http.get('/v1/admin/campaigns').set(bearer(support.accessToken)).expect(403);
      await ctx.http.get('/v1/admin/campaigns').set(bearer(ops.accessToken)).expect(200);
      const body = { name: 'Rascunho', fundingSource: 'webag', kind: 'fixed', value: 500, audience: 'all', target: { kind: 'all' }, budgetTotalCents: 5_000, budgetDailyCents: 5_000, maxUses: 10, reason: 'rascunho' };
      expect((await adminPost(finance, '/v1/admin/campaigns', body)).status).toBe(403);
      const created = await adminPost(ops, '/v1/admin/campaigns', body);
      expect(created.status, JSON.stringify(created.body)).toBe(201);
      expect(created.body).toMatchObject({ state: 'draft', fundingSource: 'webag', fundingLabel: 'Webag paga', owner: 'webag', version: 1 });
      expect((await adminPost(ops, `/v1/admin/campaigns/${created.body.id}/activate`, { reason: 'motivo x', expectedVersion: 1 })).status).toBe(403); // operação não ativa (C8)
    });

    it('DEC-088: não existe campo para majorar preço, frete ou taxa (corpo estrito) e as regras do banco viram erro de negócio', async () => {
      const base = { name: 'Campanha', fundingSource: 'webag', kind: 'fixed', value: 500, audience: 'all', target: { kind: 'all' }, reason: 'teste' };
      for (const extra of [{ deliveryFeeCents: 9_900 }, { serviceFeeCents: 100 }, { priceMarkupPct: 20 }, { campaignId: randomUUID() }]) expect((await adminPost(ops, '/v1/admin/campaigns', { ...base, ...extra })).status).toBe(400);
      expect((await adminPost(ops, '/v1/admin/campaigns', { ...base, fundingSource: 'quinta' })).status).toBe(400);
      expect((await adminPost(ops, '/v1/admin/campaigns', { ...base, kind: 'free_shipping', value: 0, fundingSource: 'store' })).status).toBe(422); // o frete é da Webag
      const noCap = await adminPost(ops, '/v1/admin/campaigns', { ...base, kind: 'percent', value: 10 });
      expect(noCap.status).toBe(422);
      expect(noCap.body.code).toBe('PERCENT_CAP_REQUIRED');
      const priv = await adminPost(ops, '/v1/admin/campaigns', { ...base, code: 'MEUCODIGO', codeVisibility: 'private' });
      expect(priv.body.code).toBe('PRIVATE_CODE_IS_GENERATED');
    });

    it('código privado é gerado (8+ caracteres, alfabeto sem ambiguidade) e código público repetido é 409', async () => {
      const privateCampaign = await adminPost(ops, '/v1/admin/campaigns', { name: 'Privada', fundingSource: 'webag', kind: 'fixed', value: 500, audience: 'all', target: { kind: 'all' }, budgetTotalCents: 5_000, budgetDailyCents: 5_000, maxUses: 5, codeVisibility: 'private', reason: 'teste' });
      expect(privateCampaign.status).toBe(201);
      expect(privateCampaign.body.codes).toHaveLength(1);
      expect(privateCampaign.body.codes[0]).toMatchObject({ visibility: 'private', active: false });
      expect(privateCampaign.body.codes[0].code).toMatch(/^[ABCDEFGHJKMNPQRSTUVWXYZ2-9]{8,}$/);
      const code = `DUP${uniqueTag(5).toUpperCase()}`;
      const body = { name: 'Pública', fundingSource: 'webag', kind: 'fixed', value: 500, audience: 'all', target: { kind: 'all' }, maxUses: 5, code, reason: 'teste' };
      expect((await adminPost(ops, '/v1/admin/campaigns', body)).status).toBe(201);
      const taken = await adminPost(ops, '/v1/admin/campaigns', body);
      expect(taken.status).toBe(409);
      expect(taken.body.code).toBe('COUPON_CODE_TAKEN');
    });

    it('F2: com o orçamento mensal global em R$ 0 nada da Webag ativa (422 ACTIVATION_BLOCKED, GLOBAL_BUDGET_ZERO); com orçamento ativa; 2º fator vem da fonte gravada (Q8)', async () => {
      await setBudget(0);
      const created = await adminPost(ops, '/v1/admin/campaigns', { name: 'Webag paga', fundingSource: 'webag', kind: 'fixed', value: 300, audience: 'all', target: { kind: 'all' }, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: FUTURE(10), budgetTotalCents: 3_000, budgetDailyCents: 3_000, maxUses: 10, reason: 'teste' });
      const id = created.body.id as string;
      const blocked = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'motivo x', expectedVersion: 1 });
      expect(blocked.status).toBe(422);
      expect(blocked.body.code).toBe('ACTIVATION_BLOCKED');
      expect(blocked.body.blockers.map((b: { code: string }) => b.code)).toContain('GLOBAL_BUDGET_ZERO');
      await setBudget(500_000);
      await expireReauth(ctx, finance.userId);
      const stale = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'motivo x', expectedVersion: 1 });
      expect(stale.status).toBe(403);
      expect(stale.body.code).toBe('REAUTH_REQUIRED');
      await freshReauth(finance);
      const stale2 = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'motivo x', expectedVersion: 99 });
      expect(stale2.status).toBe(409);
      expect(stale2.body.code).toBe('CAMPAIGN_VERSION_CONFLICT');
      const ok = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'ativar', expectedVersion: 1 });
      expect(ok.status, JSON.stringify(ok.body)).toBe(200);
      expect(ok.body.state).toBe('active');
      const [mirror] = await ctx.db.select().from(coupons).where(eq(coupons.campaignId, id));
      expect(mirror).toBeUndefined(); // sem código: a campanha não aparece sozinha
      // ativa é imutável (D3): editar é 409 e a saída é encerrar e duplicar
      const edit = await ctx.http.patch(`/v1/admin/campaigns/${id}`).set(bearer(ops.accessToken)).send({ value: 900, reason: 'tentativa', expectedVersion: ok.body.version });
      expect(edit.status).toBe(409);
      expect(edit.body.code).toBe('CAMPAIGN_IMMUTABLE');
    });

    it('SEC-224 (Alta): editar campanha AGENDADA a devolve a rascunho e a varredura não a liga; a varredura que liga repete as conferências (orçamento global)', async () => {
      await setBudget(500_000);
      const created = await adminPost(ops, '/v1/admin/campaigns', { name: 'Agendada', fundingSource: 'webag', kind: 'fixed', value: 300, audience: 'all', target: { kind: 'all' }, startsAt: FUTURE(1), endsAt: FUTURE(10), budgetTotalCents: 3_000, budgetDailyCents: 3_000, maxUses: 10, reason: 'teste' });
      const id = created.body.id as string;
      await freshReauth(finance);
      const scheduled = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'agendar', expectedVersion: 1 });
      expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(200);
      expect(scheduled.body.state).toBe('scheduled');
      // operação (sem 2º fator) edita o valor: volta a rascunho, zera quem ativou, soma versão
      const key = randomUUID();
      const edited = await ctx.http.patch(`/v1/admin/campaigns/${id}`).set(bearer(ops.accessToken)).set('Idempotency-Key', key).send({ value: 5_000, reason: 'atacante', expectedVersion: scheduled.body.version });
      expect(edited.status, JSON.stringify(edited.body)).toBe(200);
      expect(edited.body.state).toBe('draft');
      expect(edited.body.activatedAt).toBeNull();
      expect(edited.body.version).toBe(scheduled.body.version + 1);
      // R9: a MESMA chave devolve o resultado guardado, não 409 por uma edição que já deu certo
      const replay = await ctx.http.patch(`/v1/admin/campaigns/${id}`).set(bearer(ops.accessToken)).set('Idempotency-Key', key).send({ value: 5_000, reason: 'atacante', expectedVersion: scheduled.body.version });
      expect(replay.status).toBe(200);
      expect(replay.body.version).toBe(edited.body.version);
      // a hora chega e a campanha (rascunho) NÃO liga
      await ctx.db.update(campaigns).set({ startsAt: new Date(Date.now() - 1000) }).where(eq(campaigns.id, id));
      expect((await campaignService.sweep()).activated).toBe(0);
      expect((await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!.state).toBe('draft');
    });

    it('Q1: agendada e ativada de verdade, mas o orçamento global acabou antes da hora: a varredura NÃO liga, continua agendada e abre o alerta', async () => {
      await setBudget(500_000);
      const startsAt = new Date(Date.now() + 3_600_000);
      const created = await adminPost(ops, '/v1/admin/campaigns', { name: 'Agendada 2', fundingSource: 'webag', kind: 'fixed', value: 300, audience: 'all', target: { kind: 'all' }, startsAt: startsAt.toISOString(), endsAt: FUTURE(10), budgetTotalCents: 3_000, budgetDailyCents: 3_000, maxUses: 10, reason: 'teste' });
      const id = created.body.id as string;
      const scheduled = await adminPost(finance, `/v1/admin/campaigns/${id}/activate`, { reason: 'agendar', expectedVersion: 1 });
      expect(scheduled.status, JSON.stringify(scheduled.body)).toBe(200);
      expect(scheduled.body.state).toBe('scheduled');
      await setBudget(0); // o fundador zerou o orçamento depois
      await ctx.db.update(campaigns).set({ startsAt: new Date(Date.now() - 1000) }).where(eq(campaigns.id, id));
      expect((await campaignService.sweep()).activated).toBe(0);
      expect((await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!.state).toBe('scheduled');
      const alerts = (await ctx.http.get('/v1/admin/campaign-alerts').set(bearer(ops.accessToken)).expect(200)).body.data as { kind: string; campaignId: string }[];
      expect(alerts.some((a) => a.kind === 'activation_blocked' && a.campaignId === id)).toBe(true);
      await setBudget(500_000);
      expect((await campaignService.sweep()).activated).toBeGreaterThanOrEqual(1); // com orçamento volta a ligar
    });

    it('pausar é idempotente; encerrar é terminal; duplicar copia só as regras (sem orçamento, validade nem código)', async () => {
      const { id, code } = await activeCampaign();
      const paused = await adminPost(ops, `/v1/admin/campaigns/${id}/pause`, { reason: 'investigar' }, null);
      expect(paused.status).toBe(200);
      expect(paused.body).toMatchObject({ state: 'paused', pausedBy: 'admin' });
      expect((await adminPost(ops, `/v1/admin/campaigns/${id}/pause`, { reason: 'investigar' }, null)).status).toBe(200);
      const copy = await adminPost(ops, `/v1/admin/campaigns/${id}/duplicate`, { reason: 'nova rodada' });
      expect(copy.status, JSON.stringify(copy.body)).toBe(201);
      expect(copy.body).toMatchObject({ state: 'draft', fundingSource: 'webag', value: 800, codes: [] });
      expect(copy.body.budget.totalCents).toBeNull();
      expect(copy.body.startsAt).toBeNull();
      const ended = await adminPost(finance, `/v1/admin/campaigns/${id}/end`, { reason: 'fim' }, null);
      expect(ended.status, JSON.stringify(ended.body)).toBe(200);
      expect(ended.body).toMatchObject({ state: 'ended', endReason: 'admin' });
      const [row] = await ctx.db.select().from(coupons).where(eq(coupons.code, code));
      expect(row!.active).toBe(false);
      expect((await adminPost(finance, `/v1/admin/campaigns/${id}/end`, { reason: 'fim' }, null)).status).toBe(200); // idempotente
      const resume = await adminPost(finance, `/v1/admin/campaigns/${id}/resume`, { reason: 'voltar', expectedVersion: ended.body.version }, null);
      expect(resume.status).toBe(409); // ended não reabre
    });

    it('simulação por faixa: o desconto é composto no servidor (centavos), com a margem e o pior caso do percentual com teto', async () => {
      const sim = await adminPost(ops, '/v1/admin/campaigns/simulate', { fundingSource: 'webag', kind: 'percent', value: 20, percentCapCents: 1_500, budgetTotalCents: 15_000, budgetDailyCents: 3_000 }, null);
      expect(sim.status, JSON.stringify(sim.body)).toBe(200);
      expect(sim.body.rows[0].band.pickup).toBe(true);
      expect(sim.body.worstCase.discountWebagCents).toBe(1_500);
      expect(sim.body.worstCase.maxOrdersTotal).toBe(10);
      expect(sim.body.globalBudget).toMatchObject({ webagFundingEnabled: expect.any(Boolean) });
    });
  });

  describe('motor: reserva atômica, confirmação, devolução e estorno', () => {
    it('cria o pedido com cupom da Webag: reserva na MESMA transação (orçamento, dia, usos e diário); pagar confirma; o invariante fecha', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      expect((await applyCoupon(user, code.toLowerCase(), addressId)).status).toBe(200);
      const res = await placeOrder(ctx, user, addressId);
      expect(res.status, JSON.stringify(res.body)).toBe(201);
      const orderId = res.body.id as string;
      const order = await orderRow(ctx, orderId);
      expect(order).toMatchObject({ discountCents: 800, platformDiscountCents: 800, storeCouponCents: 0, campaignId: id });
      expect(order.couponSnapshot).toMatchObject({ funding: 'webag', webagCents: 800, storeCents: 0 });
      const [reservation] = await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId));
      expect(reservation).toMatchObject({ state: 'reserved', webagCents: 800, storeCents: 0 });
      let c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c).toMatchObject({ budgetReservedCents: 800, budgetSpentCents: 0, usesReserved: 1 });
      expect(await violations(id)).toEqual([]);

      await approve(ctx, user, (await attemptOf(ctx, orderId)).id);
      c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c).toMatchObject({ budgetReservedCents: 0, budgetSpentCents: 800, usesReserved: 0, usesConfirmed: 1 });
      expect((await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId)))[0]!.state).toBe('confirmed');
      expect(await violations(id)).toEqual([]);
      const budget = (await ctx.http.get(`/v1/admin/campaigns/${id}`).set(bearer(ops.accessToken)).expect(200)).body.budget;
      expect(budget).toMatchObject({ totalCents: 4_000, spentCents: 800, reservedCents: 0, remainingCents: 3_200, usesConfirmed: 1 });
    });

    it('expirar e cancelar devolvem UMA vez, mesmo em paralelo; o uso e o orçamento voltam; o diário fecha', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(user, code, addressId).expect(200);
      const orderId = (await placeOrder(ctx, user, addressId)).body.id as string;
      const results = await Promise.all([
        ctx.http.post(`/v1/orders/${orderId}/cancel`).set(bearer(user.accessToken)).send({}),
        ctx.http.post(`/v1/orders/${orderId}/cancel`).set(bearer(user.accessToken)).send({}),
        orderService.sweep(new Date(Date.now() + 20 * 60_000)),
      ]);
      expect(results.slice(0, 2).every((r) => (r as { status: number }).status < 500)).toBe(true);
      const c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c).toMatchObject({ budgetReservedCents: 0, budgetSpentCents: 0, usesReserved: 0 });
      const entries = await ctx.db.select().from(campaignBudgetEntries).where(eq(campaignBudgetEntries.campaignId, id));
      expect(entries.filter((e) => e.kind === 'release')).toHaveLength(1);
      expect(await violations(id)).toEqual([]);
    });

    it('Q12: PIX pago DEPOIS de expirado não paga o pedido, a reserva fica devolvida e o invariante continua vazio', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(user, code, addressId).expect(200);
      const orderId = (await placeOrder(ctx, user, addressId)).body.id as string;
      await orderService.sweep(new Date(Date.now() + 20 * 60_000));
      expect((await orderRow(ctx, orderId)).status).toBe('expired');
      await approve(ctx, user, (await attemptOf(ctx, orderId)).id);
      expect((await orderRow(ctx, orderId)).status).toBe('expired');
      expect((await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId)))[0]).toMatchObject({ state: 'returned', returnedReason: 'expired' });
      expect(await violations(id)).toEqual([]);
    });

    it('R10: 3 estornos parciais somam o total; o diário bate com a soma dos estornos e o invariante fecha; devolver tudo vira `returned`', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(user, code, addressId).expect(200);
      const orderId = (await placeOrder(ctx, user, addressId)).body.id as string;
      const attempt = await attemptOf(ctx, orderId);
      await approve(ctx, user, attempt.id);
      const total = (await orderRow(ctx, orderId)).totalCents; // 6.000 - 800 + 500
      expect(total).toBe(5_700);
      await payments.refund(attempt.id, 1_900, 'parcial 1', 'k-1', ctxless);
      await payments.refund(attempt.id, 1_900, 'parcial 2', 'k-2', ctxless);
      let r = (await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId)))[0]!;
      expect(r).toMatchObject({ state: 'confirmed', refundedWebagCents: 533 }); // round_half_up(800 x 3.800 / 5.700)
      expect(await violations(id)).toEqual([]);
      await payments.refund(attempt.id, 1_900, 'parcial 3', 'k-3', ctxless);
      r = (await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId)))[0]!;
      expect(r).toMatchObject({ state: 'returned', returnedReason: 'refunded', refundedWebagCents: 800 });
      const c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c).toMatchObject({ budgetSpentCents: 0, usesConfirmed: 0 });
      const refundSum = (await ctx.db.select().from(campaignBudgetEntries).where(eq(campaignBudgetEntries.campaignId, id))).filter((e) => e.kind === 'refund').reduce((n, e) => n + e.amountCents, 0);
      expect(refundSum).toBe(800);
      expect(await violations(id)).toEqual([]);
    });

    it('pausa entre a cotação e o pedido: o pedido NUNCA sai com o cupom (409 CART_CHANGED / DISCOUNT_CHANGED), nada reservado', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(user, code, addressId).expect(200);
      const seen = await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200);
      expect(seen.body.summary.total.amount).toBe(5_700);
      await adminPost(ops, `/v1/admin/campaigns/${id}/pause`, { reason: 'corrida' }, null).then((r) => expect(r.status).toBe(200));
      const res = await ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId, cartRevision: seen.body.revision, expectedTotalCents: 5_700, paymentMethod: 'pix' });
      expect(res.status).toBe(409);
      expect(res.body.code).toBe('CART_CHANGED');
      expect(JSON.stringify(res.body)).toContain('DISCOUNT_CHANGED');
      expect((await ctx.db.select().from(couponReservations).where(eq(couponReservations.campaignId, id)))).toHaveLength(0);
    });

    it('replay da Idempotency-Key (sequencial e em paralelo): 1 pedido, 1 reserva, 1 conjunto de entradas', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign();
      const { user, addressId } = await buyer(shop);
      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(user, code, addressId).expect(200);
      const key = randomUUID();
      const seen = await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200);
      const send = () => ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId, cartRevision: seen.body.revision, expectedTotalCents: 5_700, paymentMethod: 'pix' });
      const [a, b, c] = await Promise.all([send(), send(), send()]);
      const ok = [a, b, c].filter((r) => r.status === 201 || r.status === 200);
      expect(ok.length).toBeGreaterThanOrEqual(1);
      expect([a, b, c].every((r) => r.status < 500)).toBe(true);
      const ids = new Set(ok.map((r) => r.body.id));
      expect(ids.size).toBe(1);
      expect((await ctx.db.select().from(couponReservations).where(eq(couponReservations.campaignId, id)))).toHaveLength(1);
      const again = await send();
      expect(again.status).toBe(200);
      expect(again.body.id).toBe([...ids][0]);
      expect((await ctx.db.select().from(campaignBudgetEntries).where(eq(campaignBudgetEntries.campaignId, id)))).toHaveLength(1);
      expect(await violations(id)).toEqual([]);
    });

    it('C-CUP-02: 20 pedidos simultâneos de R$ 8,00 contra os últimos R$ 40,00: exatamente 5 vencem, os outros 15 recebem 409, e o invariante fecha', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 100 }]);
      const { id, code } = await activeCampaign({ budgetTotalCents: 4_000, budgetDailyCents: 4_000, maxUses: 100 });
      const people = [];
      for (let i = 0; i < 20; i++) {
        const p = await buyer(shop);
        await addToCart(ctx, p.user, shop.variants[0]!, 1).expect(200);
        await applyCoupon(p.user, code, p.addressId).expect(200);
        const view = await ctx.http.get(`/v1/cart?addressId=${p.addressId}`).set(bearer(p.user.accessToken)).expect(200);
        people.push({ ...p, revision: view.body.revision as number });
      }
      const responses = await Promise.all(people.map((p) => ctx.http.post('/v1/orders').set(bearer(p.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ mode: 'delivery', addressId: p.addressId, cartRevision: p.revision, expectedTotalCents: 5_700, paymentMethod: 'pix' })));
      const created = responses.filter((r) => r.status === 201);
      const refused = responses.filter((r) => r.status === 409);
      expect(created.length, JSON.stringify(responses.map((r) => r.status))).toBe(5);
      expect(refused.length).toBe(15);
      expect(responses.some((r) => r.status >= 500)).toBe(false);
      const c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c).toMatchObject({ budgetReservedCents: 4_000, usesReserved: 5 });
      expect(await violations(id)).toEqual([]);
    });

    it('B1: criação x pagamento x cancelamento x pausa do MESMO item e campanha, em paralelo, sem deadlock e com o invariante fechado', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item único', priceCents: 6_000, stock: 40 }]);
      const { id, code } = await activeCampaign({ budgetTotalCents: 20_000, budgetDailyCents: 20_000, maxUses: 100 });
      const make = async () => {
        const p = await buyer(shop);
        await addToCart(ctx, p.user, shop.variants[0]!, 1).expect(200);
        await applyCoupon(p.user, code, p.addressId).expect(200);
        return p;
      };
      const early = [];
      for (let i = 0; i < 6; i++) {
        const p = await make();
        early.push({ ...p, orderId: (await placeOrder(ctx, p.user, p.addressId)).body.id as string });
      }
      const fresh = [];
      for (let i = 0; i < 6; i++) fresh.push(await make());
      const results = await Promise.all([
        ...fresh.map((p) => placeOrder(ctx, p.user, p.addressId)),
        ...early.slice(0, 2).map(async (p) => approve(ctx, p.user, (await attemptOf(ctx, p.orderId)).id)),
        ...early.slice(2, 4).map((p) => ctx.http.post(`/v1/orders/${p.orderId}/cancel`).set(bearer(p.user.accessToken)).send({})),
        orderService.sweep(new Date(Date.now() + 20 * 60_000)),
        adminPost(ops, `/v1/admin/campaigns/${id}/pause`, { reason: 'corrida' }, null),
      ]);
      const statuses = results.map((r) => (r as { status?: number }).status ?? 200);
      expect(statuses.some((s) => s >= 500), JSON.stringify(statuses)).toBe(false);
      expect(await violations(id)).toEqual([]);
      const live = (await ctx.db.select().from(couponReservations).where(eq(couponReservations.campaignId, id))).filter((r) => r.state !== 'returned').length;
      const c = (await ctx.db.select().from(campaigns).where(eq(campaigns.id, id)))[0]!;
      expect(c.usesReserved + c.usesConfirmed).toBe(live);
    });
  });

  describe('antifraude por HMAC (WB-344)', () => {
    it('SEC-226: alias de e-mail (+tag, pontos do Gmail) cai no mesmo identificador de conta e não repete a primeira compra; só HMAC é gravado, nada em claro (Q15)', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign({ audience: 'first_purchase', budgetTotalCents: 40_000, budgetDailyCents: 40_000, perCustomerLimit: 1 });
      const tag = uniqueTag(6);
      const first = await buyer(shop, { email: `a.b.${tag}@gmail.com` });
      await addToCart(ctx, first.user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(first.user, code, first.addressId).expect(200);
      const orderId = (await placeOrder(ctx, first.user, first.addressId, { payerDocument: '52998224725' })).body.id as string;
      expect((await ctx.db.select().from(couponReservations).where(eq(couponReservations.orderId, orderId)))).toHaveLength(1);
      // claims: só HMAC hexadecimal de 64 caracteres; nenhum e-mail, CPF, CEP ou aparelho em claro em NENHUMA coluna das 3 tabelas
      const claims = await ctx.db.select().from(couponFraudClaims).where(eq(couponFraudClaims.orderId, orderId));
      expect(claims.map((c) => c.kind).sort()).toEqual(expect.arrayContaining(['account', 'address', 'document']));
      const dump = JSON.stringify([claims, await ctx.db.select().from(couponIdentifierSightings), await ctx.db.select().from(couponFraudSignals)]);
      for (const secret of [first.user.email, `ab${tag}`, '52998224725', '07900100', '07900-100', first.user.userId]) expect(dump, secret).not.toContain(secret);
      for (const c of claims) expect(c.hmac).toMatch(/^[a-f0-9]{64}$/);
      // a mesma pessoa por outro alias: `ab<tag>+promo@gmail.com` normaliza para o mesmo identificador
      const alias = await buyer(shop, { email: `ab${tag}+promo@gmail.com` });
      await addToCart(ctx, alias.user, shop.variants[0]!, 1).expect(200);
      const refused = await applyCoupon(alias.user, code, alias.addressId);
      expect(refused.status).toBe(422);
      expect(refused.body.code).toBe('COUPON_FIRST_PURCHASE_ONLY');
      expect(await violations(id)).toEqual([]);
    });

    it('SEC-225: o endereço sem o complemento (mesmo CEP e número) bloqueia a 2ª primeira compra; devolver o pedido NÃO pago libera o identificador', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { code } = await activeCampaign({ audience: 'first_purchase', budgetTotalCents: 40_000, budgetDailyCents: 40_000 });
      const a = await buyer(shop);
      const b = await buyer(shop);
      for (const [p, complement] of [[a, 'casa 1'], [b, 'fundos']] as const) {
        const rows = await ctx.db.execute<{ id: string }>(sql`select id from user_addresses where user_id = ${p.user.userId}::uuid`);
        await ctx.db.execute(sql`update user_addresses set cep = '07900100', number = '77', complement = ${complement} where id = ${rows.rows[0]!.id}::uuid`);
      }
      await addToCart(ctx, a.user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(a.user, code, a.addressId).expect(200);
      const orderId = (await placeOrder(ctx, a.user, a.addressId)).body.id as string;
      await addToCart(ctx, b.user, shop.variants[0]!, 1).expect(200);
      const refused = await applyCoupon(b.user, code, b.addressId);
      expect(refused.status).toBe(422);
      expect(['COUPON_FIRST_PURCHASE_ONLY', 'COUPON_NOT_APPLICABLE']).toContain(refused.body.code);
      // o pedido de A expira sem pagamento: a primeira compra volta (Q17: não pago libera)
      await orderService.sweep(new Date(Date.now() + 20 * 60_000));
      expect((await orderRow(ctx, orderId)).status).toBe('expired');
      expect((await applyCoupon(b.user, code, b.addressId)).status).toBe(200);
    });

    it('C-CUP-06: a 11ª tentativa de aplicar cupom em 1 hora, na mesma conta, é 429 COUPON_RATE_LIMITED; o código com mais de 20 caracteres responde "inválido" sem ir ao banco', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const p = await buyer(shop);
      await addToCart(ctx, p.user, shop.variants[0]!, 1).expect(200);
      const long = await applyCoupon(p.user, 'A'.repeat(25), p.addressId);
      expect(long.status).toBe(422);
      expect(long.body.code).toBe('COUPON_NOT_FOUND');
      const extra = await applyCoupon(p.user, 'QUALQUER', p.addressId, { discountCents: 9_999 });
      expect(extra.status).toBe(422);
      expect(extra.body.code).toBe('FIELD_NOT_EDITABLE');
      let last = 0;
      for (let i = 0; i < 12; i++) last = (await applyCoupon(p.user, `NAOEXISTE${i}`, p.addressId)).status;
      expect(last).toBe(429);
      const limited = await applyCoupon(p.user, 'OUTRO', p.addressId);
      expect(limited.body.code).toBe('COUPON_RATE_LIMITED');
      expect(limited.headers['retry-after']).toBeDefined();
    });

    it('SEC-228: 3 pedidos com cupom que expiraram sem pagamento abrem o sinal e o 4º sai sem cupom (COUPON_NOT_APPLICABLE); "Suspeitos" só traz o número do pedido e libera com motivo', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 6_000, stock: 50 }]);
      const { id, code } = await activeCampaign({ budgetTotalCents: 40_000, budgetDailyCents: 40_000, perCustomerLimit: 10 });
      const p = await buyer(shop);
      for (let i = 0; i < 3; i++) {
        await addToCart(ctx, p.user, shop.variants[0]!, 1).expect(200);
        await applyCoupon(p.user, code, p.addressId).expect(200);
        const res = await placeOrder(ctx, p.user, p.addressId);
        expect(res.status, JSON.stringify(res.body)).toBe(201);
        await orderService.sweep(new Date(Date.now() + 20 * 60_000));
        expect((await orderRow(ctx, res.body.id as string)).status).toBe('expired');
      }
      await addToCart(ctx, p.user, shop.variants[0]!, 1).expect(200);
      const blocked = await applyCoupon(p.user, code, p.addressId);
      expect(blocked.status).toBe(422);
      expect(blocked.body.code).toBe('COUPON_NOT_APPLICABLE');
      const list = await ctx.http.get(`/v1/admin/coupon-suspects?campaignId=${id}`).set(bearer(ops.accessToken)).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ signal: 'cancellations', state: 'open' });
      expect(Object.keys(list.body.data[0]).sort()).toEqual(['campaignId', 'campaignName', 'detectedAt', 'id', 'orderNumber', 'releasedAt', 'signal', 'state']); // nenhum identificador, nem HMAC
      await ctx.http.get('/v1/admin/coupon-suspects').set(bearer(support.accessToken)).expect(403);
      const suspectId = list.body.data[0].id as string;
      expect((await adminPost(finance, `/v1/admin/coupon-suspects/${suspectId}/release`, { reason: 'ok' }, null)).status).toBe(403); // financeiro não libera (coupons:write)
      const released = await adminPost(ops, `/v1/admin/coupon-suspects/${suspectId}/release`, { reason: 'conferido com o suporte' }, null);
      expect(released.status, JSON.stringify(released.body)).toBe(200);
      expect(released.body.state).toBe('released');
      expect((await adminPost(ops, `/v1/admin/coupon-suspects/${suspectId}/release`, { reason: 'conferido com o suporte' }, null)).status).toBe(200); // idempotente
      expect(await violations(id)).toEqual([]);
    });

    it('expurgo: antifraude acima da retenção de 12 meses (e 1 dia) é apagado pela varredura; o recente fica', async () => {
      const [campaign] = await ctx.db.select().from(campaigns).limit(1);
      const old = new Date(Date.now() - 366 * 86_400_000);
      const fresh = new Date();
      const hex = (c: string) => c.repeat(64);
      await ctx.db.insert(couponIdentifierSightings).values([
        { kind: 'device', hmac: hex('a'), accountHmac: hex('b'), lastSeenAt: old },
        { kind: 'device', hmac: hex('c'), accountHmac: hex('d'), lastSeenAt: fresh },
      ]);
      await ctx.db.insert(couponFraudClaims).values({ kind: 'device', hmac: hex('e'), orderId: randomUUID(), campaignId: campaign!.id, createdAt: old, scope: 'campaign_use' });
      const result = await campaignService.sweep();
      expect(result.purged).toBeGreaterThanOrEqual(2);
      const left = await ctx.db.select().from(couponIdentifierSightings).where(inArray(couponIdentifierSightings.hmac, [hex('a'), hex('c')]));
      expect(left.map((r) => r.hmac)).toEqual([hex('c')]);
    });
  });

  describe('flags e parâmetros desligados por padrão (DEC-137, F2)', () => {
    it('as 4 flags da R2 nascem desligadas e o orçamento mensal da Webag nasce em R$ 0', async () => {
      for (const key of ['campanha_frete_gratis', 'campanha_parte_da_loja', 'selo_de_por', 'custo_motoboy_confirmado']) expect(await flags.isEnabled(key), key).toBe(false);
      await setBudget(0);
      expect((await ctx.http.get('/v1/admin/campaign-budget').set(bearer(ops.accessToken)).expect(200)).body).toMatchObject({ monthlyBudgetCents: 0, webagFundingEnabled: false, autofinTetoPct: 50 });
      const store = await adminPost(ops, '/v1/admin/campaigns', { name: 'Loja paga', fundingSource: 'store', kind: 'fixed', value: 500, audience: 'all', target: { kind: 'all' }, maxUses: 10, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: FUTURE(5), reason: 'teste' });
      expect(store.status, JSON.stringify(store.body)).toBe(201);
      const blocked = await adminPost(finance, `/v1/admin/campaigns/${store.body.id}/activate`, { reason: 'motivo x', expectedVersion: 1 });
      expect(blocked.body.blockers.map((b: { code: string }) => b.code)).toEqual(expect.arrayContaining(['STORE_SHARE_DISABLED', 'NO_ACCEPTED_STORE']));
      const freeShip = await adminPost(ops, '/v1/admin/campaigns', { name: 'Frete', fundingSource: 'webag', kind: 'free_shipping', value: 0, audience: 'all', target: { kind: 'all' }, maxUses: 10, reason: 'teste' });
      const ship = await adminPost(finance, `/v1/admin/campaigns/${freeShip.body.id}/activate`, { reason: 'motivo x', expectedVersion: 1 });
      expect(ship.body.blockers.map((b: { code: string }) => b.code)).toContain('FREE_SHIPPING_DISABLED');
    });
  });
});
