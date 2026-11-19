import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { coupons, orders, paymentAttempts } from '../../src/platform/database/schema.js';
import { bearer, type TestContext } from './app.js';
import { isolatedPoint, makeStore, northOf, variantOf, type TestPoint } from './discovery.js';
import { createCustomer, type RegisteredUser } from './fixtures.js';

/** Loja visível com produtos e cliente com endereço perto: o mínimo para fazer um pedido pela API real. */
export interface Shop {
  store: Awaited<ReturnType<typeof makeStore>>;
  variants: string[];
  origin: TestPoint;
}

export async function shopWith(ctx: TestContext, specs: { name: string; priceCents: number; stock?: number; categoryId?: string }[], options: Record<string, unknown> = {}): Promise<Shop> {
  const origin = isolatedPoint();
  const store = await makeStore(ctx, { name: 'Loja Pedidos', at: await northOf(ctx, origin, 800), feeFixedCents: 500, ...options, products: specs });
  const variants = await Promise.all(store.productIds.map((id) => variantOf(ctx, id)));
  return { store, variants, origin };
}

export async function customerAt(ctx: TestContext, origin: TestPoint, over: { cep?: string; number?: string } = {}): Promise<{ user: RegisteredUser; addressId: string }> {
  const user = await createCustomer(ctx);
  const res = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: over.cep ?? '07900-100', street: 'Rua Teste', number: over.number ?? '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: origin.lat, lng: origin.lng }).expect(201);
  return { user, addressId: res.body.id as string };
}

export const addToCart = (ctx: TestContext, user: RegisteredUser, variantId: string, quantity = 1) =>
  ctx.http.put(`/v1/cart/items/${variantId}`).set(bearer(user.accessToken)).send({ quantity });

export async function cartRevision(ctx: TestContext, user: RegisteredUser, addressId: string): Promise<number> {
  return (await cartView(ctx, user, addressId)).revision;
}

/** A sacola como o cliente a vê: a revisão e o total (centavos) que o app manda de volta ao criar o pedido (SEC-147). */
export async function cartView(ctx: TestContext, user: RegisteredUser, addressId?: string): Promise<{ revision: number; totalCents: number }> {
  const body = (await ctx.http.get(addressId ? `/v1/cart?addressId=${addressId}` : '/v1/cart?mode=pickup').set(bearer(user.accessToken)).expect(200)).body as { revision: number; total?: { amount: number }; summary?: { total: { amount: number } } };
  return { revision: body.revision, totalCents: (body.total ?? body.summary?.total)?.amount ?? 0 };
}

/** POST /v1/orders com a revisão atual da sacola (o que o app faz). */
export async function placeOrder(ctx: TestContext, user: RegisteredUser, addressId: string, over: Record<string, unknown> = {}, key: string = randomUUID()) {
  const { revision, totalCents } = await cartView(ctx, user, addressId);
  return ctx.http.post('/v1/orders').set(bearer(user.accessToken)).set('Idempotency-Key', key).send({ mode: 'delivery', addressId, cartRevision: revision, expectedTotalCents: totalCents, paymentMethod: 'pix', ...over });
}

export async function attemptOf(ctx: TestContext, orderId: string) {
  const [attempt] = await ctx.db.select().from(paymentAttempts).where(eq(paymentAttempts.externalReference, orderId)).orderBy(paymentAttempts.createdAt); // a do pedido é a PRIMEIRA (ordem estável)
  if (!attempt) throw new Error('pedido sem tentativa de pagamento');
  return attempt;
}

export const approve = (ctx: TestContext, user: RegisteredUser, attemptId: string) => ctx.http.post(`/v1/dev/payments/${attemptId}/approve`).set(bearer(user.accessToken)).send({}).expect(200);
export const orderRow = async (ctx: TestContext, id: string) => (await ctx.db.select().from(orders).where(eq(orders.id, id)))[0]!;

export async function makeCoupon(ctx: TestContext, over: Partial<typeof coupons.$inferInsert> = {}) {
  const day = 86_400_000;
  const [row] = await ctx.db
    .insert(coupons)
    .values({ code: `T${randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`, kind: 'fixed', scope: 'platform', value: 1_000, startsAt: new Date(Date.now() - day), endsAt: new Date(Date.now() + day), ...over })
    .returning();
  return row!;
}
