import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { restoreFees, useFeeTable, useParam } from './helpers/fees.js';
import { createTestApp, bearer, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf, variantOf, type TestPoint } from './helpers/discovery.js';
import { createCustomer, ensureCity, ensureLegalDocs, registerUser, type RegisteredUser } from './helpers/fixtures.js';
import { cartItems, carts, couponRedemptions, coupons, products, productVariants, storeMembers, storeSettings, stores } from '../src/platform/database/schema.js';

interface CartBody {
  id: string | null;
  revision: number;
  store: { id: string; name: string; open: boolean } | null;
  items: { variantId: string; quantity: number; unitPrice: { amount: number }; lineTotal: { amount: number }; available: boolean; maxQuantity: number; warnings: { code: string; fromCents?: number; toCents?: number }[] }[];
  coupon: { code: string; applied: boolean; rejection: string | null } | null;
  delivery: { addressId: string | null; available: boolean | null; estimated: boolean; feeFromCents: number | null };
  summary: { subtotal: { amount: number }; delivery: { amount: number }; discount: { amount: number }; total: { amount: number }; serviceFee: { amount: number }; missingForMinimum: { amount: number } | null; minimumTotalApplied: boolean; deliveryEstimated: boolean };
  checkout: { canCheckout: boolean; blockers: string[] };
  notices: { code: string }[];
}

describe('Sacola no servidor (ADR-010, WB-020, WB-021, WB-022, DEC-006, DEC-022)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    await ctx.close();
  });

  const as = (user: RegisteredUser) => bearer(user.accessToken);
  const get = async (user: RegisteredUser, query = '') => (await ctx.http.get(`/v1/cart${query}`).set(as(user)).expect(200)).body as CartBody;
  const put = (user: RegisteredUser, variantId: string, body: Record<string, unknown>, query = '') => ctx.http.put(`/v1/cart/items/${variantId}${query}`).set(as(user)).send(body);
  const addressAt = async (user: RegisteredUser, at: TestPoint, number = '10') => {
    const res = await ctx.http.post('/v1/me/addresses').set(as(user)).send({ cep: '07900-100', street: 'Rua Teste', number, neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: at.lat, lng: at.lng }).expect(201);
    return res.body.id as string;
  };
  /** Loja com N produtos (1 variação cada); devolve as variações na ordem. */
  const shop = async (origin: TestPoint, options: Parameters<typeof makeStore>[1] extends infer T ? Partial<T> : never, specs: { name: string; priceCents: number; stock?: number; promoPriceCents?: number }[]) => {
    const store = await makeStore(ctx, { name: 'Loja Sacola', at: await northOf(ctx, origin, 1000), ...options, products: specs });
    const variants = await Promise.all(store.productIds.map((id) => variantOf(ctx, id)));
    return { store, variants };
  };

  it('exige login; sacola nova é vazia; não existe id de sacola na URL (sem IDOR)', async () => {
    await ctx.http.get('/v1/cart').expect(401);
    await ctx.http.put(`/v1/cart/items/${randomUUID()}`).send({ quantity: 1 }).expect(401);
    const user = await createCustomer(ctx);
    const empty = await get(user);
    expect(empty).toMatchObject({ store: null, items: [], coupon: null, checkout: { canCheckout: false, blockers: ['EMPTY'] }, summary: { total: { amount: 0 } } });
  });

  it('adiciona item: resumo em centavos, "a partir de" sem endereço, frete do endereço e idempotência do PUT', async () => {
    const origin = isolatedPoint();
    const { store, variants } = await shop(origin, { feeFixedCents: 500 }, [{ name: 'Camiseta', priceCents: 8_990 }, { name: 'Meia', priceCents: 1_500 }]);
    const user = await createCustomer(ctx);
    const first = await put(user, variants[0]!, { quantity: 2 }).expect(200);
    const cart = first.body as CartBody;
    expect(cart.store).toMatchObject({ id: store.id, name: 'Loja Sacola', open: true });
    expect(cart.items[0]).toMatchObject({ quantity: 2, unitPrice: { amount: 8_990 }, lineTotal: { amount: 17_980 }, available: true });
    expect(cart.summary).toMatchObject({ subtotal: { amount: 17_980 }, delivery: { amount: 500 }, deliveryEstimated: true, total: { amount: 18_480 } });
    expect(cart.checkout.blockers).toContain('NEEDS_ADDRESS');
    const again = (await put(user, variants[0]!, { quantity: 2 }).expect(200)).body as CartBody;
    expect(again.items).toHaveLength(1); // repetir não duplica nem soma
    expect(again.items[0]!.quantity).toBe(2);
    await put(user, variants[1]!, { quantity: 1 }).expect(200);

    const addressId = await addressAt(user, origin);
    const withAddress = await get(user, `?addressId=${addressId}`);
    expect(withAddress.delivery).toMatchObject({ addressId, available: true, estimated: false });
    expect(withAddress.summary.subtotal.amount).toBe(19_480);
    expect(withAddress.checkout).toMatchObject({ canCheckout: true, blockers: [] });
    // Sem `addressId`, usa o endereço padrão da conta.
    expect((await get(user)).delivery.addressId).toBe(addressId);
  });

  it('uma loja por pedido: item de outra loja dá 409 com a loja atual; "esvaziar e continuar" troca (WB-021)', async () => {
    const origin = isolatedPoint();
    const a = await shop(origin, { name: 'Loja A' }, [{ name: 'A1', priceCents: 1_000 }, { name: 'A2', priceCents: 2_000 }]);
    const b = await shop(origin, { name: 'Loja B' }, [{ name: 'B1', priceCents: 3_000 }]);
    const user = await createCustomer(ctx);
    await put(user, a.variants[0]!, { quantity: 1 }).expect(200);
    await put(user, a.variants[1]!, { quantity: 1 }).expect(200);
    const conflict = await put(user, b.variants[0]!, { quantity: 1 }).expect(409);
    expect(conflict.body).toMatchObject({ code: 'CART_STORE_CONFLICT', status: 409, currentStore: { id: a.store.id, name: 'Loja A' }, newStore: { id: b.store.id, name: 'Loja B' }, itemCount: 2 });
    const kept = await get(user);
    expect(kept.items.map((i) => i.variantId).sort()).toEqual([...a.variants].sort()); // "Manter minha sacola": nada mudou
    const swapped = (await put(user, b.variants[0]!, { quantity: 1, replaceStore: true }).expect(200)).body as CartBody;
    expect(swapped.store?.id).toBe(b.store.id);
    expect(swapped.items.map((i) => i.variantId)).toEqual([b.variants[0]]);
    expect(swapped.notices.map((n) => n.code)).toEqual(['STORE_REPLACED']);
    // Garantia no banco: nunca há itens de duas lojas na mesma sacola.
    const rows = await ctx.db.select({ storeId: products.storeId }).from(cartItems).innerJoin(carts, eq(carts.id, cartItems.cartId)).innerJoin(products, eq(products.id, cartItems.productId)).where(eq(carts.userId, user.userId));
    expect(new Set(rows.map((r) => r.storeId)).size).toBe(1);
  });

  it('quantidade acima do estoque ajusta ao máximo e avisa; acima de item_qtd_max também; zero e negativo são 400', async () => {
    const origin = isolatedPoint();
    const { variants } = await shop(origin, {}, [{ name: 'Raro', priceCents: 1_000, stock: 3 }, { name: 'Comum', priceCents: 100, stock: 500 }]);
    const user = await createCustomer(ctx);
    const res = (await put(user, variants[0]!, { quantity: 5 }).expect(200)).body as CartBody;
    expect(res.items[0]).toMatchObject({ quantity: 3, maxQuantity: 3 });
    expect(res.notices).toEqual([expect.objectContaining({ code: 'QUANTITY_ADJUSTED', requestedQuantity: 5, appliedQuantity: 3, maxQuantity: 3 })]);
    const many = (await put(user, variants[1]!, { quantity: 999 }).expect(200)).body as CartBody;
    expect(many.items.find((i) => i.variantId === variants[1])?.quantity).toBe(50); // item_qtd_max padrão
    await put(user, variants[0]!, { quantity: 0 }).expect(400);
    await put(user, variants[0]!, { quantity: -1 }).expect(400);
    await put(user, variants[0]!, { quantity: 1.5 }).expect(400);
    await put(user, variants[0]!, { quantity: 1, extra: true }).expect(400);
  });

  it('item sem estoque, produto pausado ou loja invisível não entra; id inválido é 404', async () => {
    const origin = isolatedPoint();
    const { variants, store } = await shop(origin, {}, [{ name: 'Esgotado', priceCents: 1_000, stock: 0 }, { name: 'Pausado', priceCents: 1_000 }, { name: 'Normal', priceCents: 1_000 }]);
    await ctx.db.update(products).set({ moderationStatus: 'paused' }).where(eq(products.id, store.productIds[1]!));
    const hidden = await shop(origin, { status: 'in_review' }, [{ name: 'Escondido', priceCents: 1_000 }]);
    const user = await createCustomer(ctx);
    expect((await put(user, variants[0]!, { quantity: 1 }).expect(422)).body.code).toBe('OUT_OF_STOCK');
    expect((await put(user, variants[1]!, { quantity: 1 }).expect(422)).body.code).toBe('ITEM_UNAVAILABLE');
    await put(user, hidden.variants[0]!, { quantity: 1 }).expect(404);
    await put(user, randomUUID(), { quantity: 1 }).expect(404);
    await put(user, 'nao-uuid', { quantity: 1 }).expect(404);
    expect((await get(user)).items).toEqual([]);
  });

  it('revalidação (RN-05): preço mudou, estoque caiu, esgotou e saiu do ar viram avisos; o total já usa o valor vigente', async () => {
    const origin = isolatedPoint();
    const { variants, store } = await shop(origin, { feeFixedCents: 0 }, [{ name: 'Tênis', priceCents: 8_990 }, { name: 'Boné', priceCents: 2_000, stock: 10 }, { name: 'Cinto', priceCents: 3_000 }, { name: 'Luva', priceCents: 1_000 }]);
    const user = await createCustomer(ctx);
    for (const [i, quantity] of [2, 5, 1, 1].entries()) await put(user, variants[i]!, { quantity }).expect(200);
    await ctx.db.update(products).set({ basePriceCents: 9_490 }).where(eq(products.id, store.productIds[0]!));
    await ctx.db.update(productVariants).set({ stock: 3 }).where(eq(productVariants.id, variants[1]!));
    await ctx.db.update(productVariants).set({ stock: 0 }).where(eq(productVariants.id, variants[2]!));
    await ctx.db.update(products).set({ status: 'paused' }).where(eq(products.id, store.productIds[3]!));
    const cart = await get(user);
    const by = (i: number) => cart.items.find((item) => item.variantId === variants[i])!;
    expect(by(0).warnings).toEqual([expect.objectContaining({ code: 'PRICE_CHANGED', fromCents: 8_990, toCents: 9_490 })]);
    expect(by(0).lineTotal.amount).toBe(18_980);
    expect(by(1)).toMatchObject({ quantity: 3, maxQuantity: 3, warnings: [expect.objectContaining({ code: 'QUANTITY_EXCEEDS_STOCK', requestedQuantity: 5 })] });
    expect(by(2)).toMatchObject({ available: false, quantity: 0, warnings: [expect.objectContaining({ code: 'OUT_OF_STOCK' })] });
    expect(by(3).warnings[0]!.code).toBe('UNAVAILABLE');
    expect(cart.summary.subtotal.amount).toBe(18_980 + 6_000); // só o que pode ser comprado
    expect(cart.checkout.blockers).toContain('ITEM_UNAVAILABLE');
    expect(cart.checkout.canCheckout).toBe(false);

    const stored = (await ctx.db.select().from(cartItems).innerJoin(carts, eq(carts.id, cartItems.cartId)).where(eq(carts.userId, user.userId))).find((r) => r.cart_items.variantId === variants[1]);
    expect(stored?.cart_items.quantity).toBe(5); // a leitura não muda o que o cliente colocou

    // "Aceitar e continuar": grava quantidade ajustada e o preço novo; o aviso de preço some e o esgotado fica para o cliente remover.
    const accepted = (await ctx.http.post('/v1/cart/acknowledge').set(as(user)).expect(200)).body as CartBody;
    expect(accepted.items.find((i) => i.variantId === variants[0])!.warnings).toEqual([]);
    expect(accepted.items.find((i) => i.variantId === variants[1])!.warnings).toEqual([]);
    expect(accepted.items.find((i) => i.variantId === variants[2])!.warnings.map((w) => w.code)).toEqual(['OUT_OF_STOCK']);
    expect(accepted.revision).toBeGreaterThan(cart.revision);
    for (const variant of [variants[2]!, variants[3]!]) await ctx.http.delete(`/v1/cart/items/${variant}`).set(as(user)).expect(200);
    expect((await get(user)).checkout.blockers).not.toContain('ITEM_UNAVAILABLE');
  });

  it('pedido mínimo, frete grátis acima de X e fora do raio mudam os bloqueios e o frete (RN-04)', async () => {
    // DEC-036: taxa, mínimo, entrega grátis e raio são globais do admin.
    await useParam(ctx, 'raio_max_km', 5);
    await useParam(ctx, 'pedido_minimo_cents', 5_000);
    await useParam(ctx, 'frete_gratis_acima_cents', 8_000);
    await useFeeTable(ctx, [{ fromM: 0, toM: 5_000, feeCents: 700 }]);
    const origin = isolatedPoint();
    const near = await shop(origin, {}, [{ name: 'Barato', priceCents: 2_000 }]);
    const far = await shop(origin, { name: 'Longe' }, [{ name: 'Item Longe', priceCents: 2_000 }]);
    await ctx.db.update(stores).set({ lat: (await northOf(ctx, origin, 6_000)).lat }).where(eq(stores.id, far.store.id));
    const user = await createCustomer(ctx);
    const addressId = await addressAt(user, origin);

    await put(user, near.variants[0]!, { quantity: 1 }).expect(200);
    let cart = await get(user, `?addressId=${addressId}`);
    expect(cart.summary.missingForMinimum?.amount).toBe(3_000);
    expect(cart.checkout.blockers).toEqual(['BELOW_MINIMUM']);
    expect(cart.summary.delivery.amount).toBe(700);
    await put(user, near.variants[0]!, { quantity: 4 }).expect(200); // 8.000: atinge o frete grátis (>=) e o mínimo
    cart = await get(user, `?addressId=${addressId}`);
    expect(cart.summary).toMatchObject({ delivery: { amount: 0 }, missingForMinimum: null, total: { amount: 8_000 } });
    expect(cart.checkout.canCheckout).toBe(true);

    await put(user, far.variants[0]!, { quantity: 1, replaceStore: true }).expect(200);
    cart = await get(user, `?addressId=${addressId}`);
    expect(cart.delivery.available).toBe(false);
    expect(cart.checkout.blockers).toContain('OUT_OF_RANGE');
    await restoreFees(ctx);
  });

  it('retirada: sem frete; sem retirada ativa, bloqueia', async () => {
    const origin = isolatedPoint();
    const { variants, store } = await shop(origin, { feeFixedCents: 900, pickupEnabled: false }, [{ name: 'Item', priceCents: 1_000 }]);
    const user = await createCustomer(ctx);
    await put(user, variants[0]!, { quantity: 1 }).expect(200);
    expect((await get(user, '?mode=pickup')).checkout.blockers).toContain('PICKUP_UNAVAILABLE');
    await ctx.db.update(storeSettings).set({ pickupEnabled: true }).where(eq(storeSettings.storeId, store.id));
    const pickup = await get(user, '?mode=pickup');
    expect(pickup.summary.delivery.amount).toBe(0);
    expect(pickup.checkout.canCheckout).toBe(true);
    await ctx.http.get('/v1/cart?mode=drone').set(as(user)).expect(400);
  });

  it('loja fechada: monta a sacola normalmente e só o pagamento é bloqueado, com a hora da abertura (DEC-022)', async () => {
    const origin = isolatedPoint();
    const { variants } = await shop(origin, { pausedIndefinitely: true }, [{ name: 'Item', priceCents: 1_000 }]);
    const user = await createCustomer(ctx);
    const res = (await put(user, variants[0]!, { quantity: 1 }).expect(200)).body as CartBody;
    expect(res.store?.open).toBe(false);
    expect(res.checkout.blockers).toContain('STORE_CLOSED');
    expect(res.checkout.canCheckout).toBe(false);
  });

  describe('cupom (WB-022, RN-09)', () => {
    const day = 86_400_000;
    const makeCoupon = async (over: Partial<typeof coupons.$inferInsert>) => {
      const code = `T${randomUUID().replaceAll('-', '').slice(0, 8).toUpperCase()}`;
      const [row] = await ctx.db.insert(coupons).values({ code, kind: 'fixed', scope: 'platform', value: 1_000, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day), ...over }).returning();
      return row!;
    };

    it('aplica, troca e remove; o desconto aparece e o total recalcula', async () => {
      const origin = isolatedPoint();
      const { variants, store } = await shop(origin, { feeFixedCents: 500 }, [{ name: 'Item', priceCents: 10_000 }]);
      const user = await createCustomer(ctx);
      await put(user, variants[0]!, { quantity: 1 }).expect(200);
      const ten = await makeCoupon({ scope: 'store', storeId: store.id, kind: 'percent', value: 10 });
      const five = await makeCoupon({ scope: 'store', storeId: store.id, value: 500 });
      let cart = (await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: ten.code.toLowerCase() }).expect(200)).body as CartBody;
      expect(cart.coupon).toMatchObject({ code: ten.code, applied: true });
      expect(cart.summary).toMatchObject({ discount: { amount: 1_000 }, total: { amount: 9_500 } });
      cart = (await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: five.code }).expect(200)).body as CartBody; // substitui, não soma
      expect(cart.summary).toMatchObject({ discount: { amount: 500 }, total: { amount: 10_000 } });
      cart = (await ctx.http.delete('/v1/cart/coupon').set(as(user)).expect(200)).body as CartBody;
      expect(cart).toMatchObject({ coupon: null, summary: { discount: { amount: 0 }, total: { amount: 10_500 } } });
    });

    it('recusas com `code` específico e a sacola intacta: inexistente, vencido, mínimo, esgotado, já usado, outra loja, e-mail', async () => {
      const origin = isolatedPoint();
      const { variants, store } = await shop(origin, {}, [{ name: 'Item', priceCents: 5_000 }]);
      const other = await shop(origin, { name: 'Outra' }, [{ name: 'Item X', priceCents: 1_000 }]);
      const user = await createCustomer(ctx);
      const unverified = await registerUser(ctx);
      await put(user, variants[0]!, { quantity: 1 }).expect(200);
      await put(unverified, variants[0]!, { quantity: 1 }).expect(200);
      const apply = (who: RegisteredUser, code: string) => ctx.http.put('/v1/cart/coupon').set(as(who)).send({ code });
      const code = async (who: RegisteredUser, c: string) => (await apply(who, c).expect(422)).body.code as string;

      expect(await code(user, 'NAOEXISTE')).toBe('COUPON_NOT_FOUND');
      expect(await code(user, (await makeCoupon({ endsAt: new Date(Date.now() - 1000), startsAt: new Date(Date.now() - day) })).code)).toBe('COUPON_EXPIRED');
      expect(await code(user, (await makeCoupon({ startsAt: new Date(Date.now() + day), endsAt: new Date(Date.now() + 2 * day) })).code)).toBe('COUPON_NOT_STARTED');
      expect(await code(user, (await makeCoupon({ minOrderCents: 8_000 })).code)).toBe('COUPON_MIN_ORDER');
      expect(await code(user, (await makeCoupon({ active: false })).code)).toBe('COUPON_NOT_FOUND');
      expect(await code(user, (await makeCoupon({ scope: 'store', storeId: other.store.id })).code)).toBe('COUPON_OTHER_STORE');
      const full = await makeCoupon({ maxUses: 1 });
      await ctx.db.insert(couponRedemptions).values({ couponId: full.id, userId: (await createCustomer(ctx)).userId, orderId: randomUUID(), discountCents: 1_000 });
      expect(await code(user, full.code)).toBe('COUPON_EXHAUSTED');
      const used = await makeCoupon({});
      await ctx.db.insert(couponRedemptions).values({ couponId: used.id, userId: user.userId, orderId: randomUUID(), discountCents: 1_000 });
      expect(await code(user, used.code)).toBe('COUPON_ALREADY_USED');
      // Uso devolvido (pedido cancelado) volta ao saldo.
      await ctx.db.update(couponRedemptions).set({ releasedAt: new Date() }).where(eq(couponRedemptions.couponId, used.id));
      await apply(user, used.code).expect(200);
      await ctx.http.delete('/v1/cart/coupon').set(as(user)).expect(200);
      // E-mail não confirmado: cupom da plataforma recusado; cupom da loja segue valendo.
      expect(await code(unverified, (await makeCoupon({})).code)).toBe('COUPON_EMAIL_UNVERIFIED');
      await apply(unverified, (await makeCoupon({ scope: 'store', storeId: store.id })).code).expect(200);
      expect((await get(user)).coupon).toBeNull();
      await ctx.http.put('/v1/cart/coupon').set(as(user)).send({}).expect(400);
    });

    it('cupom que zera o total cobra R$ 1,00 (HIP-037); cupom da plataforma não passa da comissão; frete grátis desconta o frete', async () => {
      await useFeeTable(ctx, [{ fromM: 0, toM: 15_000, feeCents: 0 }]); // taxa global de R$ 0 (DEC-036)
      const origin = isolatedPoint();
      const { variants, store } = await shop(origin, {}, [{ name: 'Barato', priceCents: 1_000 }]);
      const user = await createCustomer(ctx);
      await put(user, variants[0]!, { quantity: 1 }).expect(200);
      const free = await makeCoupon({ scope: 'store', storeId: store.id, value: 1_000 });
      let cart = (await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: free.code }).expect(200)).body as CartBody;
      expect(cart.summary).toMatchObject({ total: { amount: 100 }, discount: { amount: 900 }, minimumTotalApplied: true });
      const platform = await makeCoupon({ value: 5_000 }); // comissão padrão 10% de R$ 10,00 = R$ 1,00
      cart = (await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: platform.code }).expect(200)).body as CartBody;
      expect(cart.summary).toMatchObject({ discount: { amount: 100 }, total: { amount: 900 } });
      await restoreFees(ctx);
    });

    it('tirar itens abaixo do mínimo do cupom o deixa "não aplicado" na leitura, sem perder o código', async () => {
      const origin = isolatedPoint();
      const { variants, store } = await shop(origin, {}, [{ name: 'Item A', priceCents: 6_000 }, { name: 'Item B', priceCents: 6_000 }]);
      const user = await createCustomer(ctx);
      await put(user, variants[0]!, { quantity: 1 }).expect(200);
      await put(user, variants[1]!, { quantity: 1 }).expect(200);
      const coupon = await makeCoupon({ scope: 'store', storeId: store.id, minOrderCents: 10_000 });
      await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: coupon.code }).expect(200);
      const lowered = (await ctx.http.delete(`/v1/cart/items/${variants[1]}`).set(as(user)).expect(200)).body as CartBody;
      expect(lowered.coupon).toMatchObject({ code: coupon.code, applied: false, rejection: 'COUPON_MIN_ORDER' });
      expect(lowered.summary.discount.amount).toBe(0);
      await put(user, variants[1]!, { quantity: 1 }).expect(200);
      expect((await get(user)).coupon).toMatchObject({ applied: true });
    });

    it('autoconsumo: membro da loja não usa cupom na própria loja (SEC-061)', async () => {
      const origin = isolatedPoint();
      const { variants, store } = await shop(origin, {}, [{ name: 'Item', priceCents: 5_000 }]);
      const staff = await createCustomer(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: store.id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      await put(staff, variants[0]!, { quantity: 1 }).expect(200);
      const coupon = await makeCoupon({ scope: 'store', storeId: store.id });
      expect((await ctx.http.put('/v1/cart/coupon').set(as(staff)).send({ code: coupon.code }).expect(422)).body.code).toBe('COUPON_NOT_ALLOWED');
    });

    it('cupom em sacola vazia: 422 CART_EMPTY; limite de tentativas protege contra adivinhação de código', async () => {
      const user = await createCustomer(ctx);
      expect((await ctx.http.put('/v1/cart/coupon').set(as(user)).send({ code: 'QUALQUER' }).expect(422)).body.code).toBe('CART_EMPTY');
      const ip = '198.51.100.9';
      let last = 422;
      for (let i = 0; i < 40 && last === 422; i += 1) last = (await ctx.http.put('/v1/cart/coupon').set(as(user)).set('X-Forwarded-For', ip).send({ code: `CHUTE${i}` })).status;
      expect(last).toBe(429);
    });
  });

  it('IDOR: cada conta só vê e mexe na própria sacola', async () => {
    const origin = isolatedPoint();
    const { variants } = await shop(origin, {}, [{ name: 'Item', priceCents: 1_000 }]);
    const a = await createCustomer(ctx);
    const b = await createCustomer(ctx);
    await put(a, variants[0]!, { quantity: 3 }).expect(200);
    expect((await get(b)).items).toEqual([]);
    await ctx.http.delete(`/v1/cart/items/${variants[0]}`).set(as(b)).expect(200); // a sacola de B não tem; a de A segue intacta
    expect((await get(a)).items).toHaveLength(1);
    // Endereço de outra conta no resumo: 404 (não revela existência).
    const addressOfA = await addressAt(a, origin);
    await ctx.http.get(`/v1/cart?addressId=${addressOfA}`).set(as(b)).expect(404);
    await ctx.http.delete('/v1/cart').set(as(b)).expect(200);
    expect((await get(a)).items).toHaveLength(1);
  });

  it('juntar a sacola do visitante no login (RN-05): adota se a conta está vazia, soma na mesma loja e mantém a da conta se for outra', async () => {
    const origin = isolatedPoint();
    const a = await shop(origin, { name: 'Loja A' }, [{ name: 'A1', priceCents: 1_000, stock: 4 }, { name: 'A2', priceCents: 2_000 }]);
    const b = await shop(origin, { name: 'Loja B' }, [{ name: 'B1', priceCents: 3_000 }]);
    const user = await createCustomer(ctx);
    const merge = (who: RegisteredUser, items: { variantId: string; quantity: number }[]) => ctx.http.post('/v1/cart/merge').set(as(who)).send({ items });

    let cart = (await merge(user, [{ variantId: a.variants[0]!, quantity: 2 }, { variantId: randomUUID(), quantity: 1 }]).expect(200)).body as CartBody;
    expect(cart.items.map((i) => [i.variantId, i.quantity])).toEqual([[a.variants[0], 2]]);
    expect(cart.notices.map((n) => n.code)).toEqual(['MERGE_ITEM_SKIPPED']);
    cart = (await merge(user, [{ variantId: a.variants[0]!, quantity: 5 }, { variantId: a.variants[1]!, quantity: 1 }]).expect(200)).body as CartBody;
    expect(cart.items.find((i) => i.variantId === a.variants[0])!.quantity).toBe(4); // soma limitada ao estoque
    expect(cart.items).toHaveLength(2);
    cart = (await merge(user, [{ variantId: b.variants[0]!, quantity: 1 }]).expect(200)).body as CartBody;
    expect(cart.store?.name).toBe('Loja A');
    expect(cart.notices.map((n) => n.code)).toEqual(['MERGE_KEPT_ACCOUNT_CART']);
    await merge(user, [{ variantId: a.variants[0]!, quantity: 1 }, { variantId: a.variants[0]!, quantity: 1 }]).expect(400); // item repetido no corpo
    await merge(user, Array.from({ length: 51 }, () => ({ variantId: randomUUID(), quantity: 1 }))).expect(400);
  });

  it('sacola parada além de `carrinho_validade_dias` é esvaziada na leitura, com aviso único (WB-020 C6)', async () => {
    const origin = isolatedPoint();
    const { variants } = await shop(origin, {}, [{ name: 'Item', priceCents: 1_000 }]);
    const user = await createCustomer(ctx);
    await put(user, variants[0]!, { quantity: 1 }).expect(200);
    await ctx.db.update(carts).set({ updatedAt: new Date(Date.now() - 8 * 86_400_000) }).where(eq(carts.userId, user.userId));
    const expired = await get(user);
    expect(expired.items).toEqual([]);
    expect(expired.notices.map((n) => n.code)).toEqual(['CART_EXPIRED']);
    expect((await get(user)).notices).toEqual([]);
  });

  it('requisições simultâneas na mesma sacola não quebram nem duplicam item (trava por conta)', async () => {
    const origin = isolatedPoint();
    const { variants } = await shop(origin, {}, [{ name: 'Item', priceCents: 1_000, stock: 50 }]);
    const user = await createCustomer(ctx);
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => put(user, variants[0]!, { quantity: i + 1 })));
    expect(results.map((r) => r.status)).toEqual(Array(8).fill(200));
    const cart = await get(user);
    expect(cart.items).toHaveLength(1);
    expect(cart.items[0]!.quantity).toBeGreaterThanOrEqual(1);
  });
});
