import { and, eq, like, sql } from 'drizzle-orm';
import { seedDemoOrders } from '../seed/orders-demo.js';
import { seedOnda1 } from '../seed/onda1.js';
import { seedOnda2 } from '../seed/onda2.js';
import { seedOnda3 } from '../seed/onda3.js';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { exchangeRequests, orders, storeMembers, users } from '../src/platform/database/schema.js';
import { MemoryObjectStorage } from '../src/platform/storage/memory.storage.js';
import { OBJECT_STORAGE } from '../src/platform/storage/object-storage.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';

const PASSWORD = 'senha-de-teste-do-seed-1';

describe('Seed de pedidos de demonstração (só dev e staging)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    const options = { merchantPassword: PASSWORD, storage: ctx.app.get<MemoryObjectStorage>(OBJECT_STORAGE) };
    await seedOnda1(ctx.db, {});
    await seedOnda2(ctx.db, options);
    await seedOnda3(ctx.db, options);
    await seedDemoOrders(ctx.db);
    await seedDemoOrders(ctx.db); // idempotente
    await ctx.redis.flushdb();
  });
  afterAll(() => ctx.close());

  it('cria pedidos em vários estados sem duplicar, com a conta da RN-10 e o ledger fechado', async () => {
    const rows = await ctx.db.select().from(orders).where(sql`${orders.number} ~ '^WB-DM[0-9]{3}$'`);
    expect(rows.length).toBeGreaterThanOrEqual(10);
    expect(new Set(rows.map((r) => r.number)).size).toBe(rows.length);
    expect(new Set(rows.map((r) => r.status))).toEqual(new Set(['awaiting_payment', 'received', 'accepted', 'in_preparation', 'ready_for_collection', 'out_for_delivery', 'delivered', 'cancelled', 'refused']));
    const ledger = ctx.app.get(LedgerService);
    for (const row of rows.filter((r) => r.paidAt)) {
      expect((await ledger.verifyOrder(row.id)).ok, row.number).toBe(true);
      expect(row.commissionCents, row.number).toBe(Math.round(row.subtotalCents * 0.15)); // 15% padrão
    }
    expect(await ctx.db.select().from(exchangeRequests).where(like(exchangeRequests.number, 'TR-DM%'))).not.toHaveLength(0);
  });

  it('o painel da loja e o financeiro leem os pedidos de demonstração; em produção o seed se recusa', async () => {
    const [sample] = await ctx.db.select().from(orders).where(and(eq(orders.status, 'received'), sql`${orders.number} ~ '^WB-DM[0-9]{3}$'`));
    expect(sample).toBeDefined();
    const [owner] = await ctx.db.select({ email: users.email }).from(storeMembers).innerJoin(users, eq(users.id, storeMembers.userId)).where(eq(storeMembers.storeId, sample!.storeId));
    const login = await ctx.http.post('/v1/auth/login').send({ email: owner!.email, password: PASSWORD });
    expect(login.status, JSON.stringify(login.body)).toBe(200);
    const token = (login.body as { tokens: { accessToken: string } }).tokens.accessToken;
    const list = await ctx.http.get(`/v1/stores/${sample!.storeId}/orders?scope=history`).set(bearer(token)).expect(200);
    expect((list.body.data as { number: string }[]).some((o) => o.number.startsWith('WB-DM'))).toBe(true);
    const day = new Date(Date.now() - 3 * 3_600_000).toISOString().slice(0, 10);
    const summary = await ctx.http.get(`/v1/stores/${sample!.storeId}/finance/summary?from=${new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10)}&to=${day}`).set(bearer(token)).expect(200);
    expect(summary.body.sales.orders).toBeGreaterThan(0);
    const previous = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await expect(seedDemoOrders(ctx.db)).rejects.toThrow(/produção/);
    } finally {
      process.env.NODE_ENV = previous;
    }
  });
});
