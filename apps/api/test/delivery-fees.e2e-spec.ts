import { randomUUID } from 'node:crypto';
import { eq, ne } from 'drizzle-orm';
import { deliveryFeeTables, neighborhoods, orders, userAddresses } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { restoreFees } from './helpers/fees.js';
import { addToCart, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const tiers = (fee1: number, fee2: number) => [
  { fromM: 0, toM: 2_000, feeCents: fee1, expectedCostCents: 900, etaMinutes: 8 },
  { fromM: 2_000, toM: 15_000, feeCents: fee2, expectedCostCents: 1_400, etaMinutes: 20 },
];

/** L.1 e L.2 (DEC-036): tabela de taxa de entrega do admin por região e faixa; a taxa é da Webag e entra na application_fee. */
describe('Tabela de taxa de entrega do admin (WB-236, WB-237, WB-238)', () => {
  let ctx: TestContext;
  let finance: Awaited<ReturnType<typeof createAdmin>>;
  let ops: Awaited<ReturnType<typeof createAdmin>>;
  let support: Awaited<ReturnType<typeof createAdmin>>;
  let cityId: string;
  const put = (token: string, body: Record<string, unknown>) => ctx.http.put('/v1/admin/delivery-fees').set(bearer(token)).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    cityId = (await ensureCity(ctx, 'Francisco Morato')).id;
    [finance, ops, support] = [await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'support')];
  });
  afterAll(async () => {
    await restoreFees(ctx);
    // Os arquivos de teste dividem o banco (e a ordem varia): não deixa tabela de cidade/bairro para os outros.
    await ctx.db.delete(deliveryFeeTables).where(ne(deliveryFeeTables.scopeKey, 'default'));
    await ctx.close();
  });

  const currentVersion = async (scopeType: string, scopeId?: string) => {
    const res = await ctx.http.get('/v1/admin/delivery-fees/history').query({ scopeType, ...(scopeId ? { scopeId } : {}) }).set(bearer(finance.accessToken)).expect(200);
    return (res.body.data as { version: number }[])[0]?.version ?? 0;
  };

  it('permissões: financeiro e super admin gravam; operação e suporte só leem; sem login é 401', async () => {
    const body = { scopeType: 'default', tiers: tiers(600, 900), reason: 'cotação dos motoboys', expectedVersion: await currentVersion('default') };
    await ctx.http.put('/v1/admin/delivery-fees').send(body).expect(401);
    await put(ops.accessToken, body).expect(403);
    await put(support.accessToken, body).expect(403);
    await ctx.http.get('/v1/admin/delivery-fees').set(bearer(ops.accessToken)).expect(200);
    await ctx.http.get('/v1/admin/delivery-fees').set(bearer(support.accessToken)).expect(200);
    const ok = await put(finance.accessToken, body);
    expect(ok.status, JSON.stringify(ok.body)).toBe(200);
    expect(ok.body).toMatchObject({ scopeType: 'default', scopeId: null, tiers: [{ feeCents: 600, exchangeFeeCents: 300 }, { feeCents: 900, exchangeFeeCents: 450 }] }); // troca = 50% da entrega
    await restoreFees(ctx);
  });

  it('valida as faixas, exige motivo, bloqueia retroativo e edição concorrente (409)', async () => {
    const v = await currentVersion('default');
    const send = (over: Record<string, unknown>) => put(finance.accessToken, { scopeType: 'default', tiers: tiers(600, 900), reason: 'ajuste de teste', expectedVersion: v, ...over });
    expect((await send({ reason: '' })).status).toBe(400);
    expect((await send({ tiers: [{ fromM: 0, toM: 2_000, feeCents: 600 }, { fromM: 2_500, toM: 15_000, feeCents: 900 }] })).body.code).toBe('FEE_TABLE_INVALID'); // lacuna
    expect((await send({ tiers: [{ fromM: 0, toM: 10_000, feeCents: 600 }] })).body.detail).toMatch(/raio máximo/); // não chega ao raio de 15 km
    expect((await send({ tiers: [{ fromM: 0, toM: 15_000, feeCents: 5_001 }] })).status).toBe(400); // acima de R$ 50,00
    expect((await send({ tiers: [{ fromM: 0, toM: 15_000, feeCents: 600, exchangeFeeCents: 3_500 }] })).body.code).toBe('FEE_TABLE_INVALID'); // acima do teto da troca
    expect((await send({ effectiveFrom: new Date(Date.now() - 3_600_000).toISOString() })).body.code).toBe('FEE_TABLE_RETROACTIVE');
    expect((await send({ scopeType: 'city' })).status).toBe(400); // cidade sem `scopeId`
    expect((await send({ scopeType: 'city', scopeId: randomUUID() })).status).toBe(404);
    // outro admin gravou antes: a versão esperada está velha
    await send({}).expect(200);
    const stale = await send({});
    expect(stale.status).toBe(409);
    expect(stale.body.code).toBe('FEE_TABLE_CONFLICT');
    await restoreFees(ctx);
  });

  it('precedência bairro > cidade > padrão, pelo ENDEREÇO DE DESTINO; a prévia do admin é igual ao carrinho (WB-236 C6)', async () => {
    await put(finance.accessToken, { scopeType: 'default', tiers: tiers(600, 900), reason: 'padrão geral', expectedVersion: await currentVersion('default') }).expect(200);
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 20 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const cart = async () => (await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200)).body;
    expect((await cart()).summary.delivery.amount).toBe(600); // faixa 0-2 km do padrão (a loja está a ~800 m)

    await put(finance.accessToken, { scopeType: 'city', scopeId: cityId, tiers: tiers(700, 1_100), reason: 'cidade', expectedVersion: await currentVersion('city', cityId) }).expect(200);
    expect((await cart()).summary.delivery.amount).toBe(700);

    const [hood] = await ctx.db.insert(neighborhoods).values({ cityId, name: `Centro ${randomUUID().slice(0, 4)}` }).returning();
    await ctx.db.update(userAddresses).set({ neighborhoodId: hood!.id }).where(eq(userAddresses.id, addressId));
    await put(finance.accessToken, { scopeType: 'neighborhood', scopeId: hood!.id, tiers: tiers(0, 500), reason: 'bairro com entrega grátis na faixa curta', expectedVersion: 0 }).expect(200);
    const view = await cart();
    expect(view.summary.delivery.amount).toBe(0); // bairro vence a cidade e o padrão
    expect(view.delivery.distanceM).toBeGreaterThan(700);

    // prévia do admin = mesma conta do carrinho
    const [store] = [shop.store];
    const [address] = await ctx.db.select().from(userAddresses).where(eq(userAddresses.id, addressId));
    const preview = await ctx.http.get('/v1/admin/delivery-fees/preview').query({ storeId: store.id, lat: address!.lat, lng: address!.lng, cityId, neighborhoodId: hood!.id, subtotalCents: 5_000 }).set(bearer(ops.accessToken)).expect(200);
    expect(preview.body).toMatchObject({ available: true, fee: { amount: 0 }, expectedCost: { amount: 900 }, expectedMargin: { amount: -900 } }); // faixa que dá prejuízo aparece como margem negativa
    // sem o bairro: cidade
    const previewCity = await ctx.http.get('/v1/admin/delivery-fees/preview').query({ storeId: store.id, lat: address!.lat, lng: address!.lng, cityId, subtotalCents: 5_000 }).set(bearer(ops.accessToken)).expect(200);
    expect(previewCity.body.fee.amount).toBe(700);
    await ctx.db.update(userAddresses).set({ neighborhoodId: null }).where(eq(userAddresses.id, addressId));
    await ctx.db.delete(neighborhoods).where(eq(neighborhoods.id, hood!.id));
    await restoreFees(ctx);
    await put(finance.accessToken, { scopeType: 'city', scopeId: cityId, tiers: [{ fromM: 0, toM: 15_000, feeCents: 500 }], reason: 'volta ao básico', expectedVersion: await currentVersion('city', cityId) }).expect(200);
  });

  it('versão futura só vale na data; o pedido guarda o snapshot e mudar a tabela depois não o altera; application_fee = comissão + entrega + serviço (L.2)', async () => {
    const base = await currentVersion('city', cityId); // o endereço dos testes é de Francisco Morato: vale a tabela da cidade
    const future = new Date(Date.now() + 3_600_000).toISOString();
    await put(finance.accessToken, { scopeType: 'city', scopeId: cityId, tiers: [{ fromM: 0, toM: 15_000, feeCents: 1_500 }], reason: 'tabela do próximo mês', effectiveFrom: future, expectedVersion: base }).expect(200);
    const list = (await ctx.http.get('/v1/admin/delivery-fees').set(bearer(finance.accessToken)).expect(200)).body.data as { scopeType: string; version: number; tiers: { feeCents: number }[] }[];
    expect(list.find((t) => t.scopeType === 'city')!.tiers[0]!.feeCents).toBe(500); // a futura ainda não vale
    expect(await currentVersion('city', cityId)).toBe(base + 1); // mas está no histórico

    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 20 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const created = await placeOrder(ctx, user, addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const row = (await ctx.db.select().from(orders).where(eq(orders.id, created.body.id)))[0]!;
    // R$ 100,00 + frete R$ 5,00; comissão padrão 10% = R$ 10,00; split: 10,00 + 5,00
    expect(row).toMatchObject({ deliveryFeeCents: 500, commissionCents: 1_000, applicationFeeCents: 1_500, totalCents: 10_500 });
    expect(row.deliverySnapshot).toMatchObject({ scopeType: 'city', baseFeeCents: 500, exchangeFeeCents: 250, tierPosition: 0 });
    expect(await attemptOf(ctx, row.id)).toMatchObject({ amountCents: 10_500, applicationFeeCents: 1_500 });
    // o admin muda a tabela agora: o pedido já feito não muda
    await put(finance.accessToken, { scopeType: 'city', scopeId: cityId, tiers: [{ fromM: 0, toM: 15_000, feeCents: 900 }], reason: 'reajuste imediato', expectedVersion: await currentVersion('city', cityId) }).expect(200);
    expect((await ctx.db.select().from(orders).where(eq(orders.id, row.id)))[0]).toMatchObject({ deliveryFeeCents: 500, applicationFeeCents: 1_500 });
    await put(finance.accessToken, { scopeType: 'city', scopeId: cityId, tiers: [{ fromM: 0, toM: 15_000, feeCents: 500 }], reason: 'volta ao básico', expectedVersion: await currentVersion('city', cityId) }).expect(200);
    await restoreFees(ctx);
  });

  it('pedido mínimo e entrega grátis globais: grátis precisa ser maior que o mínimo (422) e vale o subtotal', async () => {
    const superAdmin = await createAdmin(ctx, 'super_admin');
    const set = (key: string, value: number) => ctx.http.put(`/v1/admin/parameters/${key}`).set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste da regra de frete grátis' });
    expect((await set('pedido_minimo_cents', 3_000)).status).toBe(200);
    const bad = await set('frete_gratis_acima_cents', 3_000);
    expect(bad.status).toBe(422);
    expect(bad.body.code).toBe('PARAMETER_OUT_OF_RANGE');
    expect((await set('frete_gratis_acima_cents', 10_000)).status).toBe(200);
    expect((await set('pedido_minimo_cents', 10_000)).status).toBe(422); // subir o mínimo até o grátis também é recusado
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 10_000, stock: 5 }, { name: 'Barato', priceCents: 1_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[1]!, 1).expect(200);
    expect((await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200)).body.checkout.blockers).toContain('BELOW_MINIMUM');
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const view = (await ctx.http.get(`/v1/cart?addressId=${addressId}`).set(bearer(user.accessToken)).expect(200)).body;
    expect(view.summary.delivery.amount).toBe(0); // subtotal 11.000 >= 10.000: grátis
    expect(view.checkout.blockers).toEqual([]);
    await restoreFees(ctx);
  });
});
