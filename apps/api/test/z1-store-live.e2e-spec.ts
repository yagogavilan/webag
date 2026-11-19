import { eq } from 'drizzle-orm';
import { paymentAccounts, products, userRoles } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { isolatedPoint, makeStore, northOf } from './helpers/discovery.js';
import { ensureLegalDocs } from './helpers/fixtures.js';

/** Z.1 / DEC-072f: `Store.live` = aprovada + produto ativo + conta de recebimento conectada. O painel do dia do lojista deixa de deduzir. */
describe('Z.1: loja "no ar"', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(() => ctx.close());

  const live = async (store: { id: string; owner: { accessToken: string } }) => (await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(store.owner.accessToken)).expect(200)).body.live as boolean;
  const make = async (over: Record<string, unknown> = {}) => makeStore(ctx, { name: 'Loja No Ar', at: await northOf(ctx, isolatedPoint(), 500), products: [{ name: 'Item', priceCents: 3_000, stock: 5 }], ...over });

  it('aprovada com produto ativo e conta conectada: no ar; sem um dos três, não', async () => {
    const ok = await make();
    expect(await live(ok)).toBe(true);

    const suspended = await make({ status: 'suspended' });
    expect(await live(suspended)).toBe(false);
    const inReview = await make({ status: 'in_review' });
    expect(await live(inReview)).toBe(false);

    const noAccount = await make();
    await ctx.db.update(paymentAccounts).set({ status: 'disconnected' }).where(eq(paymentAccounts.storeId, noAccount.id));
    expect(await live(noAccount)).toBe(false);
    const noPayment = await make({ payment: false });
    expect(await live(noPayment)).toBe(false);

    const paused = await make();
    await ctx.db.update(products).set({ status: 'paused' }).where(eq(products.storeId, paused.id));
    expect(await live(paused)).toBe(false);
    const removed = await make();
    await ctx.db.update(products).set({ moderationStatus: 'removed' }).where(eq(products.storeId, removed.id));
    expect(await live(removed)).toBe(false);
    const noProducts = await make({ products: [] });
    expect(await live(noProducts)).toBe(false);
  });

  it('a lista "minhas lojas" traz o mesmo campo', async () => {
    const ok = await make();
    await ctx.db.insert(userRoles).values({ userId: ok.ownerUserId, role: 'merchant' }).onConflictDoNothing();
    const mine = (await ctx.http.get('/v1/stores/mine').set(bearer(ok.owner.accessToken)).expect(200)).body.data as { id: string; live: boolean }[];
    expect(mine.find((s) => s.id === ok.id)?.live).toBe(true);
  });
});
