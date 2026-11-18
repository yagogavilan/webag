import { eq } from 'drizzle-orm';
import { InventoryService } from '../src/modules/catalog/inventory.service.js';
import { productVariants } from '../src/platform/database/schema.js';
import { createTestApp, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, variantOf } from './helpers/discovery.js';
import { ensureLegalDocs } from './helpers/fixtures.js';

describe('Estoque: reserva atômica, baixa e devolução (RN-06, review Onda 2)', () => {
  let ctx: TestContext;
  let inventory: InventoryService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    inventory = ctx.app.get(InventoryService);
  });
  afterAll(() => ctx.close());

  const variantWith = async (stock: number) => {
    const store = await makeStore(ctx, { name: 'Loja Estoque', at: isolatedPoint(), products: [{ name: 'Item', priceCents: 1000, stock }] });
    return variantOf(ctx, store.productIds[0]!);
  };
  const row = async (id: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, id)))[0]!;

  it('30 pedidos simultâneos de 1 unidade para estoque 7: exatamente 7 reservas, 23 conflitos, nunca negativo', async () => {
    const id = await variantWith(7);
    const results = await Promise.allSettled(Array.from({ length: 30 }, () => ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: id, quantity: 1 }]))));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(7);
    const failed = results.filter((r): r is PromiseRejectedResult => r.status === 'rejected');
    expect(failed).toHaveLength(23);
    expect(failed.every((f) => (f.reason as { code?: string }).code === 'STOCK_CONFLICT')).toBe(true);
    expect(await row(id)).toMatchObject({ stock: 7, reserved: 7 });
  });

  it('pedido com dois itens e o segundo sem estoque: a transação desfaz a reserva do primeiro (nada pela metade)', async () => {
    const a = await variantWith(5);
    const b = await variantWith(1);
    await expect(ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: a, quantity: 2 }, { variantId: b, quantity: 2 }]))).rejects.toMatchObject({ code: 'STOCK_CONFLICT' });
    expect(await row(a)).toMatchObject({ reserved: 0 });
    expect(await row(b)).toMatchObject({ reserved: 0 });
  });

  it('quantidade acima do disponível é recusada; linhas repetidas da mesma variação somam', async () => {
    const id = await variantWith(3);
    await expect(ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: id, quantity: 2 }, { variantId: id, quantity: 2 }]))).rejects.toMatchObject({ code: 'STOCK_CONFLICT' });
    await ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: id, quantity: 2 }, { variantId: id, quantity: 1 }]));
    expect(await row(id)).toMatchObject({ reserved: 3 });
  });

  it('baixa no pagamento, liberação na expiração e devolução no cancelamento pós-pagamento', async () => {
    const id = await variantWith(10);
    await ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: id, quantity: 4 }]));
    await ctx.db.transaction((tx) => inventory.release(tx, [{ variantId: id, quantity: 1 }]));
    expect(await row(id)).toMatchObject({ stock: 10, reserved: 3 });
    await ctx.db.transaction((tx) => inventory.commitSale(tx, [{ variantId: id, quantity: 3 }]));
    expect(await row(id)).toMatchObject({ stock: 7, reserved: 0 });
    await ctx.db.transaction((tx) => inventory.restock(tx, [{ variantId: id, quantity: 3 }]));
    expect(await row(id)).toMatchObject({ stock: 10, reserved: 0 });
    // liberar mais do que está reservado é bug: falha em vez de corromper
    await expect(ctx.db.transaction((tx) => inventory.release(tx, [{ variantId: id, quantity: 1 }]))).rejects.toThrow(/inconsistente/);
  });

  it('variação desativada ou produto fora do ar não reserva', async () => {
    const id = await variantWith(5);
    await ctx.db.update(productVariants).set({ active: false }).where(eq(productVariants.id, id));
    await expect(ctx.db.transaction((tx) => inventory.reserve(tx, [{ variantId: id, quantity: 1 }]))).rejects.toMatchObject({ code: 'STOCK_CONFLICT' });
  });
});
