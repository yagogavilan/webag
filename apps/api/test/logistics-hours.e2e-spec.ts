import { eq } from 'drizzle-orm';
import { auditLog, cities } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees } from './helpers/fees.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, cartView, customerAt, placeOrder, shopWith } from './helpers/orders.js';
import { ParametersService } from '../src/modules/admin/index.js';
import { DeliveryFeesService } from '../src/modules/logistics/index.js';

const system = { ip: null, userAgent: null, requestId: null, deviceId: null, principal: null };

/** BUG-016 (WB-230 C6, RN-18, DEC-039c): horário da logística e "pausar entregas" valem no carrinho, no pedido e na descoberta. */
describe('Horário e pausa da logística da Webag (BUG-016)', () => {
  let ctx: TestContext;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    ops = await createAdmin(ctx, 'operations');
  });
  beforeEach(async () => {
    await ctx.redis.flushdb();
  });
  afterEach(async () => {
    await ctx.app.get(ParametersService).update('logistica_horario', '00:00-23:59', 'teste', system);
    for (const pause of (await ctx.http.get('/v1/admin/logistics/availability').set(bearer(ops.accessToken))).body.pauses as { cityId: string | null }[]) {
      await ctx.http.post('/v1/admin/logistics/resume').set(bearer(ops.accessToken)).send({ cityId: pause.cityId });
    }
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });

  /** Janela de 1 h que NÃO contém o horário atual de Brasília (nunca vira o dia). */
  const windowWithoutNow = (): string => {
    const local = new Date(Date.now() - 3 * 3_600_000);
    const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
    const hhmm = (m: number) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    return minutes < 1000 ? `${hhmm(minutes + 120)}-${hhmm(minutes + 180)}` : '00:00-01:00';
  };
  const closeByHours = () => ctx.app.get(ParametersService).update('logistica_horario', windowWithoutNow(), 'teste do horário', system);

  it('fora do horário: sacola bloqueia a entrega com LOGISTICS_CLOSED, o pedido é recusado e a retirada segue; a descoberta mostra a volta', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }], { pickupEnabled: true });
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    await closeByHours();

    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(cart.checkout.blockers).toContain('LOGISTICS_CLOSED');
    expect(cart.checkout.blockers).not.toContain('OUT_OF_RANGE');
    expect(cart.delivery).toMatchObject({ available: false });
    expect(new Date(cart.delivery.logisticsOpensAt).getTime()).toBeGreaterThan(Date.now());

    const refused = await placeOrder(ctx, buyer.user, buyer.addressId, { paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } });
    expect(refused.status).toBe(422);
    expect(refused.body.code).toBe('LOGISTICS_CLOSED');

    const home = (await ctx.http.get(`/v1/home?lat=${shop.origin.lat}&lng=${shop.origin.lng}`).expect(200)).body as { nearbyStores: { id: string; delivery: { available: boolean; logisticsOpensAt: string | null } }[] };
    expect(home.nearbyStores.find((s) => s.id === shop.store.id)!.delivery).toMatchObject({ available: false, logisticsOpensAt: expect.any(String) });
    const page = (await ctx.http.get(`/v1/browse/stores/${shop.store.id}?lat=${shop.origin.lat}&lng=${shop.origin.lng}`).expect(200)).body;
    expect(page.delivery).toMatchObject({ available: false, logisticsClosed: true, logisticsOpensAt: expect.any(String) });

    // Retirada continua: o pedido de retirada não passa pela logística.
    const { revision, totalCents } = await cartView(ctx, buyer.user);
    const pickup = await ctx.http.post('/v1/orders').set(bearer(buyer.user.accessToken)).set('Idempotency-Key', crypto.randomUUID()).send({ mode: 'pickup', cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'card', card: { token: 'fake_tok_approved', installments: 1 } });
    expect(pickup.status, JSON.stringify(pickup.body)).toBe(201);
  });

  it('dentro do horário a entrega vale; o parâmetro `logistica_horario` existe e é editável no admin', async () => {
    const params = JSON.stringify((await ctx.http.get('/v1/admin/parameters').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body);
    expect(params).toContain('logistica_horario');
    expect(params).toContain('logistica_dias');
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(cart.checkout.blockers).not.toContain('LOGISTICS_CLOSED');
    expect(cart.delivery.available).toBe(true);
  });

  it('pausa do admin: geral ou por cidade, com motivo e auditoria; some a entrega até liberar; liberar sem pausa é 409', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const blockersOf = async () => ((await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body.checkout.blockers as string[]);

    await ctx.http.post('/v1/admin/logistics/pause').set(bearer(ops.accessToken)).send({ reason: 'x' }).expect(400); // motivo obrigatório (mín. 3)
    const [city] = await ctx.db.select().from(cities).where(eq(cities.name, 'Francisco Morato'));
    const other = await ctx.http.post('/v1/admin/logistics/pause').set(bearer(ops.accessToken)).send({ cityId: '00000000-0000-4000-8000-000000000000', reason: 'outra cidade' });
    expect(other.status).toBe(200);
    expect(await blockersOf()).not.toContain('LOGISTICS_CLOSED'); // pausa de outra cidade não afeta esta

    const paused = await ctx.http.post('/v1/admin/logistics/pause').set(bearer(ops.accessToken)).send({ cityId: city!.id, reason: 'sem motoboy hoje' }).expect(200);
    expect(paused.body).toMatchObject({ cityId: city!.id, reason: 'sem motoboy hoje' });
    expect(await blockersOf()).toContain('LOGISTICS_CLOSED');
    const state = (await ctx.http.get('/v1/admin/logistics/availability').set(bearer(ops.accessToken)).expect(200)).body;
    expect(state.pauses.some((p: { cityId: string }) => p.cityId === city!.id)).toBe(true);
    const cart = (await ctx.http.get(`/v1/cart?addressId=${buyer.addressId}`).set(bearer(buyer.user.accessToken)).expect(200)).body;
    expect(cart.delivery.logisticsOpensAt).toBeNull(); // pausa não tem previsão

    // repetir a pausa é idempotente
    expect((await ctx.http.post('/v1/admin/logistics/pause').set(bearer(ops.accessToken)).send({ cityId: city!.id, reason: 'sem motoboy hoje' }).expect(200)).body.id).toBe(paused.body.id);
    await ctx.http.post('/v1/admin/logistics/resume').set(bearer(ops.accessToken)).send({ cityId: city!.id }).expect(204);
    expect(await blockersOf()).not.toContain('LOGISTICS_CLOSED');
    expect((await ctx.http.post('/v1/admin/logistics/resume').set(bearer(ops.accessToken)).send({ cityId: city!.id }).expect(409)).body.code).toBe('NOT_PAUSED');
    await ctx.http.post('/v1/admin/logistics/resume').set(bearer(ops.accessToken)).send({ cityId: '00000000-0000-4000-8000-000000000000' }).expect(204);

    const trail = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'logistics.pause'));
    expect(trail.some((r) => r.reason === 'sem motoboy hoje')).toBe(true);
    // quem não despacha não pausa
    const finance = await createAdmin(ctx, 'finance');
    await ctx.http.post('/v1/admin/logistics/pause').set(bearer(finance.accessToken)).send({ reason: 'sem permissão' }).expect(403);
  });

  /** BUG-021 (RN-19 item 2): a entrega só é oferecida se o FIM da faixa cair antes do fechamento; relógio injetado (sem depender da hora do teste). */
  it('o fim da faixa precisa cair antes do fechamento: 19:40 com fechamento às 20:00 não oferece entrega ("volta às 09:00"); a borda é exclusiva', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 3_000, stock: 20 }]);
    const [city] = await ctx.db.select().from(cities).where(eq(cities.name, 'Francisco Morato'));
    const fees = ctx.app.get(DeliveryFeesService);
    const destination = { lat: shop.origin.lat, lng: shop.origin.lng, cityId: city!.id };
    await ctx.app.get(ParametersService).update('logistica_horario', '09:00-20:00', 'teste do fim da faixa', system);
    // Amanhã (as tabelas de taxa já vigoram) no horário de Brasília; seg_dom: o dia da semana não interfere.
    const tomorrow = new Date(Date.now() + 86_400_000 + (-3 * 3_600_000));
    const brt = (hh: number, mm: number) => new Date(Date.UTC(tomorrow.getUTCFullYear(), tomorrow.getUTCMonth(), tomorrow.getUTCDate(), hh + 3, mm));
    const probe = await fees.quote(shop.store.id, destination, 3_000, brt(12, 0));
    expect(probe.available, JSON.stringify(probe)).toBe(true);
    const toMin = probe.eta!.toMin;

    const closing = brt(20, 0).getTime();
    const at = (minutesBeforeClosing: number) => new Date(closing - minutesBeforeClosing * 60_000);
    const justFits = await fees.quote(shop.store.id, destination, 3_000, at(toMin + 1)); // fim da faixa = 19:59
    expect(justFits.available).toBe(true);
    const edge = await fees.quote(shop.store.id, destination, 3_000, at(toMin)); // fim da faixa = 20:00 (fechamento exclusivo)
    expect(edge).toMatchObject({ available: false, reason: 'LOGISTICS_CLOSED' });
    const late = await fees.quote(shop.store.id, destination, 3_000, brt(19, 40)); // o caso do QA: 19:40 prometendo ~20:50
    expect(late).toMatchObject({ available: false, reason: 'LOGISTICS_CLOSED' });
    expect(late.logisticsOpensAt!.getTime()).toBe(brt(9, 0).getTime() + 86_400_000); // próxima abertura: depois de amanhã 09:00 (Brasília não tem horário de verão)
  });
});
