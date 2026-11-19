import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { orders, users } from '../src/platform/database/schema.js';
import { sha256Hex } from '../src/platform/crypto/crypto.js';
import { RateLimitService } from '../src/platform/ratelimit/rate-limit.service.js';
import { bearer, createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, orderRow, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** F.1 SEC-168: arrependimento da exclusão com limite por CONTA e reautenticação completa ao reabrir (ataque B2 da revisão). */
describe('SEC-168: arrependimento da exclusão sob força bruta distribuída', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await useParam(ctx, 'exclusao_arrependimento_horas', 72);
  });
  afterAll(async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    await ctx.close();
  });

  const ipOf = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const cancel = (body: Record<string, unknown>, ip = ipOf()) => ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', ip).send(body);
  const pendingUser = async () => {
    const user = await createCustomer(ctx);
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    return user;
  };

  /** Simula o resto do ataque pelo login (mesmo contador `lfa`) e zera o limite por e-mail para o dono tentar de novo. */
  const underAttack = async (user: { userId: string; email: string }) => {
    const limiter = ctx.app.get(RateLimitService);
    for (let i = 0; i < 20; i += 1) await limiter.hit(`lfa:${user.userId}`, 3600);
    await limiter.reset(`deletion-cancel:email:${sha256Hex(user.email)}`);
  };

  it('senhas erradas de IPs diferentes somam no contador da conta; a senha certa então exige o código do e-mail e só com ele a conta reabre', async () => {
    const user = await pendingUser();
    for (let i = 0; i < 5; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' }).expect(401);
    const lfa = await ctx.app.get(RateLimitService).peek(`lfa:${user.userId}`);
    expect(lfa.count).toBe(5); // antes da correção ficava em 0: força bruta distribuída sem o freio do login
    await underAttack(user);
    ctx.mail.outbox.length = 0;

    const stepUp = await cancel({ email: user.email, password: user.password });
    expect(stepUp.status).toBe(403);
    expect(stepUp.body.code).toBe('LOGIN_CODE_REQUIRED');
    const code = ctx.mail.lastCode(user.email); // código enviado ao e-mail
    expect((await cancel({ email: user.email, password: user.password, code: code === '000000' ? '111111' : '000000' })).status).toBe(400);
    expect((await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password })).status).toBe(403); // ainda fechada
    await cancel({ email: user.email, password: user.password, code }).expect(204);
    // o código é de uso único
    expect((await cancel({ email: user.email, password: user.password, code })).status).toBe(401);
  });

  it('há limite por e-mail sem o IP: 11 tentativas de IPs diferentes e a seguinte é 429', async () => {
    const user = await pendingUser();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await cancel({ email: user.email, password: 'errada-errada-1' })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('conta sem e-mail confirmado sob ataque recebe a resposta genérica, nunca o código', async () => {
    const { registerUser } = await import('./helpers/fixtures.js');
    const user = await registerUser(ctx); // e-mail não confirmado
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    for (let i = 0; i < 3; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' }).expect(401);
    await underAttack(user);
    const res = await cancel({ email: user.email, password: user.password });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('sem ataque, a senha certa reabre direto (sem código)', async () => {
    const user = await pendingUser();
    await cancel({ email: user.email, password: user.password }).expect(204);
    await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
    void eq;
  });
});

/** F.2 SEC-169: o ponto lat/lng do app é conferido com o CEP e o município (ataque B6 da revisão). */
describe('SEC-169: pino do endereço coerente com o CEP', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await useParam(ctx, 'endereco_pino_max_m', 2000);
  });
  afterAll(async () => {
    await useParam(ctx, 'endereco_pino_max_m', 0);
    await ctx.close();
  });

  // O provedor fake põe o CEP 07900-100 perto de Francisco Morato (-23,28; -46,74).
  const address = (user: { accessToken: string }, over: Record<string, unknown>) =>
    ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Pino', number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', ...over });
  const centerOf = async () => {
    const { FakeGeocodingProvider } = await import('../src/modules/stores/geocoding.js');
    return (await new FakeGeocodingProvider().lookup('07900100'))!;
  };

  it('ponto a 25 km do CEP é recusado (422); a 300 m é aceito; sem ponto usa o do CEP', async () => {
    const user = await createCustomer(ctx);
    const center = await centerOf();
    const far = await address(user, { lat: center.lat + 0.25, lng: center.lng });
    expect(far.status, JSON.stringify(far.body)).toBe(422);
    expect(far.body.code).toBe('ADDRESS_PIN_FAR_FROM_CEP');
    const onTheStore = await address(user, { lat: -5, lng: -20 }); // "em cima da loja", longe do CEP
    expect(onTheStore.status).toBe(422);
    const near = await address(user, { lat: center.lat + 0.0027, lng: center.lng }); // ~300 m
    expect(near.status, JSON.stringify(near.body)).toBe(201);
    const user2 = await createCustomer(ctx);
    const noPin = await address(user2, {});
    expect(noPin.status).toBe(201);
    expect(noPin.body.lat).toBeCloseTo(center.lat, 4);
  });

  it('a edição também confere o ponto novo; CEP de outro município com cidade informada diferente é recusado', async () => {
    const user = await createCustomer(ctx);
    const center = await centerOf();
    const created = await address(user, { lat: center.lat, lng: center.lng });
    expect(created.status).toBe(201);
    const moved = await ctx.http.patch(`/v1/me/addresses/${created.body.id}`).set(bearer(user.accessToken)).send({ lat: center.lat + 0.3, lng: center.lng });
    expect(moved.status).toBe(422);
    expect(moved.body.code).toBe('ADDRESS_PIN_FAR_FROM_CEP');
    const otherCity = await address(user, { cep: '07800-100', number: '99', lat: center.lat, lng: center.lng }); // CEP de Franco da Rocha, cidade informada Francisco Morato
    expect(otherCity.status).toBe(422);
  });

  it('com o parâmetro em 0 a conferência fica desligada', async () => {
    await useParam(ctx, 'endereco_pino_max_m', 0);
    try {
      const user = await createCustomer(ctx);
      expect((await address(user, { lat: -5, lng: -20 })).status).toBe(201);
    } finally {
      await useParam(ctx, 'endereco_pino_max_m', 2000);
    }
  });
});

/** F.3 SEC-170: cupom de primeira compra sem burla por complemento, por pedidos simultâneos não pagos nem por documento (ataque B7). */
describe('SEC-170: cupom de primeira compra contra multiconta', () => {
  let ctx: TestContext;
  let seq = 0;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const unique = () => ({ cep: `0791${String(1000 + (seq += 1)).padStart(4, '0')}`, number: String(300 + seq) });
  const applyCoupon = (token: string, code: string) => ctx.http.put('/v1/cart/coupon').set(bearer(token)).send({ code });
  const firstCoupon = () => makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: 1_000, firstPurchaseOnly: true, perCustomerLimit: 5, maxUses: 50 });
  /** Cada conta de teste ganha telefone e aparelho próprios, senão todas pareceriam a mesma pessoa. */
  async function fresh(shop: Shop, over: { cep?: string; number?: string; complement?: string } = unique()) {
    const user = await createCustomer(ctx);
    await ctx.db.update(users).set({ phone: `5511${String(700000000 + (seq += 1))}` }).where(eq(users.id, user.userId));
    const res = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: over.cep ?? '07900-100', street: 'Rua B7', number: over.number ?? '10', ...(over.complement ? { complement: over.complement } : {}), neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng });
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    return { user, addressId: res.body.id as string };
  }
  async function paidOnce(shop: Shop, over: { cep: string; number: string; complement?: string }, extra: Record<string, unknown> = {}) {
    const buyer = await fresh(shop, over);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = await placeOrder(ctx, buyer.user, buyer.addressId, extra);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.body.id as string)).id);
    return buyer;
  }

  it('(a) trocar só o complemento do endereço não burla: CEP + número iguais ao de um pedido pago continuam recusados', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await firstCoupon();
    const address = unique();
    await paidOnce(shop, address);
    const clone = await fresh(shop, { ...address, complement: 'casa 2' });
    await addToCart(ctx, clone.user, shop.variants[0]!, 1).expect(200);
    const res = await applyCoupon(clone.user.accessToken, coupon.code);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('COUPON_FIRST_PURCHASE_ONLY');
    // "S/N", maiúsculas e pontuação no número também são o mesmo endereço
    const sn = unique();
    await paidOnce(shop, { ...sn, number: 'S/N' });
    const clone2 = await fresh(shop, { ...sn, number: 's n' });
    await addToCart(ctx, clone2.user, shop.variants[0]!, 1).expect(200);
    expect((await applyCoupon(clone2.user.accessToken, coupon.code)).status).toBe(422);
  });

  it('(b) pedido ainda não pago também conta: o 2º no mesmo endereço fica sem o cupom', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await firstCoupon();
    const address = unique();
    const c = await fresh(shop, address);
    const d = await fresh(shop, { ...address, complement: 'fundos' });
    for (const who of [c, d]) {
      await addToCart(ctx, who.user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(who.user.accessToken, coupon.code).expect(200); // as duas aplicaram ANTES de qualquer pedido
    }
    const first = await placeOrder(ctx, c.user, c.addressId);
    expect(first.status, JSON.stringify(first.body)).toBe(201);
    expect(first.body.summary.discount.amount).toBe(1_000);
    const second = await placeOrder(ctx, d.user, d.addressId); // C ainda não pagou
    expect(second.status === 201 ? second.body.summary.discount.amount : 0).toBe(0);
    expect([201, 409, 422]).toContain(second.status);
    expect(await ctx.db.select().from(orders).where(eq(orders.couponCode, coupon.code))).toHaveLength(1);
  });

  it('(b) pedidos SIMULTÂNEOS no mesmo endereço antes do pagamento: só um leva o desconto', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await firstCoupon();
    const address = unique();
    const who = [await fresh(shop, address), await fresh(shop, { ...address, complement: 'ap 2' }), await fresh(shop, { ...address, complement: 'ap 3' })];
    for (const w of who) {
      await addToCart(ctx, w.user, shop.variants[0]!, 1).expect(200);
      await applyCoupon(w.user.accessToken, coupon.code).expect(200);
    }
    const results = await Promise.all(who.map((w) => placeOrder(ctx, w.user, w.addressId)));
    const discounted = results.filter((r) => r.status === 201 && r.body.summary.discount.amount > 0);
    expect(discounted).toHaveLength(1);
    expect(await ctx.db.select().from(orders).where(eq(orders.couponCode, coupon.code))).toHaveLength(1);
  });

  it('(c) o documento do pagador entra como chave: outra conta, outro endereço, telefone e aparelho, mesmo CPF, é recusada no pedido', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await firstCoupon();
    const document = '52998224725';
    const buyer = await paidOnce(shop, unique(), { payerDocument: document });
    expect((await orderRow(ctx, (await ctx.db.select().from(orders).where(eq(orders.userId, buyer.user.userId)))[0]!.id)).payerDocumentHash).toMatch(/^[0-9a-f]{64}$/); // só o HMAC, nunca o CPF
    const other = await fresh(shop, unique());
    await addToCart(ctx, other.user, shop.variants[0]!, 1).expect(200);
    await applyCoupon(other.user.accessToken, coupon.code).expect(200); // o CPF ainda não é conhecido na sacola
    const res = await placeOrder(ctx, other.user, other.addressId, { payerDocument: document });
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('COUPON_FIRST_PURCHASE_ONLY');
    const honest = await fresh(shop, unique());
    await addToCart(ctx, honest.user, shop.variants[0]!, 1).expect(200);
    await applyCoupon(honest.user.accessToken, coupon.code).expect(200);
    expect((await placeOrder(ctx, honest.user, honest.addressId, { payerDocument: '11144477735' })).status).toBe(201);
  });

  it('(d) cupom de primeira compra só com teto de orçamento por campanha (`maxUses` obrigatório)', async () => {
    const ops = await createAdmin(ctx, 'operations');
    const base = { kind: 'fixed', value: 1_000, minOrderCents: 0, startsAt: new Date(Date.now() - 1000).toISOString(), endsAt: new Date(Date.now() + 86_400_000).toISOString(), perCustomerLimit: 1, firstPurchaseOnly: true };
    const create = (over: Record<string, unknown>) => ctx.http.post('/v1/admin/coupons').set(bearer(ops.accessToken)).send({ ...base, ...over });
    const code = () => `PB${randomUUID().replace(/-/g, '').slice(0, 8).toUpperCase()}`;
    const without = await create({ code: code() });
    expect(without.status).toBe(400);
    expect(JSON.stringify(without.body)).toContain('maxUses');
    const made = await create({ code: code(), maxUses: 200 });
    expect(made.status, JSON.stringify(made.body)).toBe(201);
    const removeCap = await ctx.http.patch(`/v1/admin/coupons/${made.body.id}`).set(bearer(ops.accessToken)).send({ maxUses: null });
    expect(removeCap.status).toBe(400);
    const turnOn = await create({ code: code(), firstPurchaseOnly: false });
    expect(turnOn.status).toBe(201);
    expect((await ctx.http.patch(`/v1/admin/coupons/${turnOn.body.id}`).set(bearer(ops.accessToken)).send({ firstPurchaseOnly: true })).status).toBe(400); // liga sem teto
    void customerAt;
  });
});

/** SEC-173: o aceite dos termos não guarda o user agent inteiro. */
describe('SEC-173: plataforma do aceite reduzida à família', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await useParam(ctx, 'exclusao_arrependimento_horas', 0);
  });
  afterAll(() => ctx.close());

  it('novos aceites gravam só a família (e a versão do app); a anonimização reduz o user agent antigo à família e o trigger só admite isso', async () => {
    const { termsAcceptances } = await import('../src/platform/database/schema.js');
    const user = await createCustomer(ctx);
    const rows = await ctx.db.select().from(termsAcceptances).where(eq(termsAcceptances.userId, user.userId));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(r.platform === null || /^(ios|android|web)(;[0-9][0-9A-Za-z.+-]*)?$/.test(r.platform), String(r.platform)).toBe(true);

    // Linha antiga (anterior à correção): user agent inteiro. O trigger bloqueia qualquer outra mudança.
    const client = await ctx.pool.connect();
    try {
      await client.query('set session_replication_role = replica');
      await client.query(`update terms_acceptances set platform = 'Mozilla/5.0 (Linux; Android 14; Pixel 8 Build/UP1A) AppleWebKit/537.36' where user_id = $1`, [user.userId]);
      await client.query('set session_replication_role = origin');
    } finally {
      client.release();
    }
    await expect(ctx.pool.query(`update terms_acceptances set platform = 'qualquer coisa' where user_id = $1`, [user.userId])).rejects.toThrow(/append-only/);
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    const after = await ctx.db.select().from(termsAcceptances).where(eq(termsAcceptances.userId, user.userId));
    expect(after.length).toBe(rows.length);
    for (const r of after) expect(r.platform).toBe('android');
  });
});
