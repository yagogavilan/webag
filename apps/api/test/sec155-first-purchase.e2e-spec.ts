import { eq } from 'drizzle-orm';
import { sessions, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, makeCoupon, placeOrder, shopWith, type Shop } from './helpers/orders.js';

/** S6.1 / SEC-155 (ALTA, bloqueia o G4): cupom "só na primeira compra" conferido no SERVIDOR (ataque A3 + SEC-060 mínimo). */
describe('Cupom de primeira compra (SEC-155)', () => {
  let ctx: TestContext;
  let seq = 0;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const unique = () => ({ cep: `0790${String(1000 + (seq += 1)).padStart(4, '0')}`, number: String(100 + seq) });
  const applyCoupon = (token: string, code: string) => ctx.http.put('/v1/cart/coupon').set(bearer(token)).send({ code });

  async function expectRefused(token: string, code: string) {
    const res = await applyCoupon(token, code);
    expect(res.status, JSON.stringify(res.body)).toBe(422);
    expect(res.body.code).toBe('COUPON_FIRST_PURCHASE_ONLY');
  }

  /** Os cadastros de teste dividem o mesmo telefone; cada conta ganha o seu, senão todas pareceriam a mesma pessoa. */
  async function newCustomer(shop: Shop, over: { cep?: string; number?: string } = unique()) {
    const c = await customerAt(ctx, shop.origin, over);
    await ctx.db.update(users).set({ phone: `5511${String(800000000 + (seq += 1))}` }).where(eq(users.id, c.user.userId));
    return c;
  }

  async function boughtOnce(shop: Shop, over: { cep?: string; number?: string } = unique()) {
    const buyer = await newCustomer(shop, over);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.body.id as string)).id);
    return buyer;
  }

  it('A3: quem já tem pedido pago não usa o cupom; quem nunca comprou usa e o 2º pedido nasce sem desconto', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: 1_000, firstPurchaseOnly: true, perCustomerLimit: 5 });
    const veteran = await boughtOnce(shop);
    await addToCart(ctx, veteran.user, shop.variants[0]!, 1).expect(200);
    await expectRefused(veteran.user.accessToken, coupon.code);
    const order = await placeOrder(ctx, veteran.user, veteran.addressId);
    expect(order.status).toBe(201);
    expect(order.body.summary.discount.amount).toBe(0);

    const newcomer = await newCustomer(shop);
    await addToCart(ctx, newcomer.user, shop.variants[0]!, 1).expect(200);
    const ok = await applyCoupon(newcomer.user.accessToken, coupon.code).expect(200);
    expect(ok.body.coupon).toMatchObject({ applied: true, rejection: null });
    const first = await placeOrder(ctx, newcomer.user, newcomer.addressId);
    expect(first.status).toBe(201);
    expect(first.body.summary.discount.amount).toBe(1_000);
  });

  it('multiconta: outra conta com o MESMO endereço (CEP + número) de um pedido pago é recusada; endereço diferente passa', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: 1_000, firstPurchaseOnly: true, perCustomerLimit: 5 });
    const address = unique();
    await boughtOnce(shop, address);
    const clone = await newCustomer(shop, address);
    await addToCart(ctx, clone.user, shop.variants[0]!, 1).expect(200);
    await expectRefused(clone.user.accessToken, coupon.code);
    const other = await newCustomer(shop);
    await addToCart(ctx, other.user, shop.variants[0]!, 1).expect(200);
    expect((await applyCoupon(other.user.accessToken, coupon.code).expect(200)).body.coupon).toMatchObject({ applied: true });
  });

  it('multiconta: mesmo telefone ou mesmo aparelho de uma conta que já comprou também é recusado', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: 1_000, firstPurchaseOnly: true, perCustomerLimit: 5 });
    const buyer = await boughtOnce(shop);
    const phone = `5511${String(900000000 + seq)}`;
    await ctx.db.update(users).set({ phone }).where(eq(users.id, buyer.user.userId));
    await ctx.db.update(sessions).set({ deviceId: `dev-${phone}` }).where(eq(sessions.userId, buyer.user.userId));

    const samePhone = await newCustomer(shop);
    await ctx.db.update(users).set({ phone: `+${phone.slice(0, 2)} (${phone.slice(2, 4)}) ${phone.slice(4, 9)}-${phone.slice(9)}` }).where(eq(users.id, samePhone.user.userId)); // formatado: a comparação ignora máscara
    await addToCart(ctx, samePhone.user, shop.variants[0]!, 1).expect(200);
    await expectRefused(samePhone.user.accessToken, coupon.code);

    const sameDevice = await newCustomer(shop);
    await ctx.db.update(sessions).set({ deviceId: `dev-${phone}` }).where(eq(sessions.userId, sameDevice.user.userId));
    await addToCart(ctx, sameDevice.user, shop.variants[0]!, 1).expect(200);
    await expectRefused(sameDevice.user.accessToken, coupon.code);
  });

  it('o pedido criado re-confere no servidor: cupom aplicado antes da 1ª compra deixa de valer quando a conta já comprou por outro pedido', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 5_000, stock: 50 }]);
    const coupon = await makeCoupon(ctx, { kind: 'fixed', scope: 'platform', value: 1_000, firstPurchaseOnly: true, perCustomerLimit: 5 });
    const buyer = await newCustomer(shop);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    await applyCoupon(buyer.user.accessToken, coupon.code).expect(200);
    // o 1º pedido (com o cupom, da 1ª compra) é pago; o 2º já não tem direito
    const order = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(order.status).toBe(201);
    await approve(ctx, buyer.user, (await attemptOf(ctx, order.body.id as string)).id);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    await expectRefused(buyer.user.accessToken, coupon.code);
    const second = await placeOrder(ctx, buyer.user, buyer.addressId);
    expect(second.status).toBe(201);
    expect(second.body.summary.discount.amount).toBe(0);
  });
});
