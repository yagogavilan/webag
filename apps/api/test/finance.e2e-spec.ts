import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { parameters } from '../src/platform/database/schema.js';
import { CommissionService } from '../src/modules/finance/commission.service.js';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { computeOrderFinance } from '../src/modules/finance/domain/commission.js';
import { ledgerEntries, ledgerTransactions } from '../src/modules/finance/db/schema.js';
import { auditLog } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCategory, ensureLegalDocs, insertStoreRow, registerUser, type TestAdmin } from './helpers/fixtures.js';

/** O Drizzle embrulha o erro do Postgres em `Failed query`; a mensagem do banco está em `cause`. */
async function dbRejects(promise: PromiseLike<unknown>, pattern: RegExp): Promise<void> {
  const error = (await promise.then(() => null, (e: unknown) => e)) as { message?: string; cause?: { message?: string } } | null;
  expect(error, 'esperava erro do banco').not.toBeNull();
  expect(`${error?.cause?.message ?? ''} ${error?.message ?? ''}`).toMatch(pattern);
}

describe('Finanças: comissão por loja/categoria e ledger de dupla entrada (WB-105, WB-111, WB-156, SEC-041)', () => {
  let ctx: TestContext;
  let commissions: CommissionService;
  let ledger: LedgerService;
  let storeId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    commissions = ctx.app.get(CommissionService);
    ledger = ctx.app.get(LedgerService);
    const owner = await registerUser(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId)).id;
  });
  afterAll(() => ctx.close());

  const finance = () => computeOrderFinance({ items: [{ subtotalCents: 10_000, pctBp: 1500 }], storeCouponCents: 1000, platformDiscountCents: 0, deliveryFeeCents: 800, serviceFeeCents: 0 });

  describe('comissão efetiva (precedência com o banco)', () => {
    it('padrão do parâmetro > categoria > loja, e a vigência futura só vale depois', async () => {
      const categoryId = await ensureCategory(ctx);
      const noCategory = await commissions.resolveForItems(storeId, [categoryId, null]);
      expect(noCategory.map((r) => r.source)).toEqual(['default', 'default']);

      await commissions.setCategoryRate(categoryId, { pctBp: 800, reason: 'incentivo' }, null);
      expect((await commissions.resolveForItems(storeId, [categoryId, null])).map((r) => [r.pctBp, r.source])).toEqual([[800, 'category'], [1000, 'default']]);

      await commissions.setStoreRate(storeId, { pctBp: 500, reason: 'negociação' }, null);
      expect((await commissions.resolveForItems(storeId, [categoryId, null])).map((r) => [r.pctBp, r.source])).toEqual([[500, 'store'], [500, 'store']]);

      // rate futura não vale hoje; remover (null) devolve à categoria
      await commissions.setStoreRate(storeId, { pctBp: 100, startsAt: new Date(Date.now() + 3_600_000), reason: 'campanha' }, null);
      expect((await commissions.effectiveForStore(storeId)).pctBp).toBe(500);
      await commissions.setStoreRate(storeId, { pctBp: null, startsAt: new Date(Date.now() + 1), reason: 'fim da negociação' }, null);
      await new Promise((r) => setTimeout(r, 5));
      expect((await commissions.resolveForItems(storeId, [categoryId]))[0]).toEqual({ pctBp: 800, source: 'category' });
    });

    it('subcategoria sem taxa herda a da categoria mãe', async () => {
      const parent = await ensureCategory(ctx);
      const { categories } = await import('../src/platform/database/schema.js');
      const [child] = await ctx.db.insert(categories).values({ name: `Sub ${randomUUID().slice(0, 6)}`, icon: 'storefront', parentId: parent }).returning();
      await commissions.setCategoryRate(parent, { pctBp: 650, reason: 'mãe' }, null);
      const other = await insertStoreRow(ctx, (await registerUser(ctx)).userId);
      expect((await commissions.resolveForItems(other.id, [child!.id]))[0]).toEqual({ pctBp: 650, source: 'category' });
    });

    it('percentual fora de 0 a 30%, vigência invertida e motivo vazio são recusados (WB-105 C4), inclusive pelo banco', async () => {
      await expect(commissions.setStoreRate(storeId, { pctBp: 3001, reason: 'x y z' }, null)).rejects.toMatchObject({ status: 400 });
      await expect(commissions.setStoreRate(storeId, { pctBp: 100, reason: '' }, null)).rejects.toBeDefined();
      await expect(commissions.setStoreRate(storeId, { pctBp: 100, startsAt: new Date(), endsAt: new Date(Date.now() - 1000), reason: 'x y z' }, null)).rejects.toBeDefined();
      await expect(ctx.db.execute(sql`insert into store_commission_rates (store_id, pct_bp, reason) values (${storeId}, 3500, 'direto')`)).rejects.toThrow();
    });

    it('mudança do parâmetro padrão não altera o snapshot já gravado no lançamento', async () => {
      const f = finance();
      const orderId = randomUUID();
      await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }));
      await ctx.db.insert(parameters).values({ key: 'comissao_padrao_pct', value: 25 }).onConflictDoUpdate({ target: parameters.key, set: { value: 25 } });
      const [sale] = await ctx.db.select().from(ledgerTransactions).where(eq(ledgerTransactions.orderId, orderId));
      expect((sale!.meta as { finance: { commissionCents: number } }).finance.commissionCents).toBe(1350);
      // Volta ao 10% fixado por `createTestApp` (apagar a linha devolveria o padrão de produção, 15%, e mudaria as contas dos testes seguintes).
      await ctx.db.insert(parameters).values({ key: 'comissao_padrao_pct', value: 10 }).onConflictDoUpdate({ target: parameters.key, set: { value: 10 } });
    });
  });

  describe('ledger', () => {
    it('venda do exemplo da RN-10 lança 98,00 / 75,53 loja / 13,50 comissão + 8,00 entrega da Webag; repetir a gravação não duplica', async () => {
      const orderId = randomUUID();
      const f = finance();
      expect(await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }))).toBe(true);
      expect(await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }))).toBe(false);
      await ctx.db.transaction((tx) => ledger.recordProviderFee(tx, { orderId, storeId, attemptId: null, feeCents: 97 }));
      const b = await ledger.balances(orderId);
      expect(b).toMatchObject({ paidCents: 9800, merchantPayable: 7553, commissionRevenue: 1350, deliveryFeeRevenue: 800, providerClearing: 9800 - 97, providerFeeCents: 97 });
      expect(await ledger.verifyOrder(orderId)).toEqual({ ok: true, problems: [] });
    });

    it('estorno parcial e depois total: devolve comissão proporcional, fecha a conta e é idempotente por chave', async () => {
      const orderId = randomUUID();
      const f = finance();
      await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }));
      expect(await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 3000, refundKey: 'r1' }))).toBe(true);
      expect(await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 3000, refundKey: 'r1' }))).toBe(false);
      let b = await ledger.balances(orderId);
      expect(b).toMatchObject({ refundedCents: 3000, providerClearing: 6800, commissionRevenue: 1350 - 413, deliveryFeeRevenue: 800 - 245 });
      await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 6800, refundKey: 'r2' }));
      b = await ledger.balances(orderId);
      expect(b).toMatchObject({ refundedCents: 9800, providerClearing: 0, commissionRevenue: 0, deliveryFeeRevenue: 0, merchantPayable: 0 });
      expect((await ledger.verifyOrder(orderId)).ok).toBe(true);
      await expect(ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 1, refundKey: 'r3' }))).rejects.toThrow();
    });

    it('dois estornos simultâneos do mesmo pedido: nenhum perde centavo (venda travada)', async () => {
      const orderId = randomUUID();
      await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: finance() }));
      const results = await Promise.allSettled([1, 2, 3, 4].map((n) => ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 2000, refundKey: `c${n}` }))));
      expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(4);
      const b = await ledger.balances(orderId);
      expect(b.refundedCents).toBe(8000);
      expect((await ledger.verifyOrder(orderId)).ok).toBe(true);
    });

    it('SEC-041: a aplicação não atualiza, apaga nem trunca lançamentos', async () => {
      const orderId = randomUUID();
      await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: finance() }));
      await dbRejects(ctx.db.execute(sql`update ledger_entries set amount_cents = 1 where transaction_id in (select id from ledger_transactions where order_id = ${orderId})`), /append-only/);
      await dbRejects(ctx.db.execute(sql`delete from ledger_entries where transaction_id in (select id from ledger_transactions where order_id = ${orderId})`), /append-only/);
      await dbRejects(ctx.db.execute(sql`update ledger_transactions set kind = 'adjustment' where order_id = ${orderId}`), /append-only/);
      await dbRejects(ctx.db.execute(sql`truncate ledger_entries`), /append-only/);
      expect((await ledger.verifyOrder(orderId)).ok).toBe(true);
    });

    it('o banco recusa lançamento que não fecha (dupla entrada), mesmo escrito por fora do serviço', async () => {
      await dbRejects(
        ctx.db.transaction(async (tx) => {
          const [t] = await tx.insert(ledgerTransactions).values({ orderId: randomUUID(), storeId, kind: 'adjustment', dedupeKey: `bad:${randomUUID()}` }).returning();
          await tx.insert(ledgerEntries).values([
            { transactionId: t!.id, account: 'provider_clearing', direction: 'debit', amountCents: 100 },
            { transactionId: t!.id, account: 'merchant_payable', direction: 'credit', amountCents: 99 },
          ]);
        }),
        /não fecha/,
      );
      await expect(ctx.db.execute(sql`insert into ledger_entries (transaction_id, account, direction, amount_cents) values (gen_random_uuid(), 'provider_clearing', 'debit', 0)`)).rejects.toThrow();
    });
  });

  describe('API admin de comissões (WB-105)', () => {
    let finance: TestAdmin;
    let support: TestAdmin;
    let operations: TestAdmin;
    beforeAll(async () => {
      finance = await createAdmin(ctx, 'finance');
      support = await createAdmin(ctx, 'support');
      operations = await createAdmin(ctx, 'operations');
    });

    it('financeiro define a comissão da loja; a efetiva e o histórico mudam e a ação é auditada com motivo', async () => {
      const store = await insertStoreRow(ctx, (await registerUser(ctx)).userId);
      const base = await ctx.http.get(`/v1/admin/stores/${store.id}/commission`).set(bearer(finance.accessToken)).expect(200);
      expect(base.body.effective).toEqual({ pct: 10, source: 'default' });
      const res = await ctx.http.put(`/v1/admin/stores/${store.id}/commission`).set(bearer(finance.accessToken)).send({ pct: 7.5, reason: 'loja âncora do bairro' }).expect(200);
      expect(res.body.effective).toEqual({ pct: 7.5, source: 'store' });
      expect(res.body.history[0]).toMatchObject({ pct: 7.5, reason: 'loja âncora do bairro' });
      const [entry] = await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, store.id));
      expect(entry).toMatchObject({ action: 'commission.store.set', reason: 'loja âncora do bairro' });
      // remover o override devolve ao padrão
      const removed = await ctx.http.put(`/v1/admin/stores/${store.id}/commission`).set(bearer(finance.accessToken)).send({ pct: null, reason: 'fim da negociação' }).expect(200);
      expect(removed.body.effective.source).toBe('default');
    });

    it('suporte e operação não acessam (403); sem token 401; validação 400; loja inexistente 404', async () => {
      const storeId = (await insertStoreRow(ctx, (await registerUser(ctx)).userId)).id;
      for (const admin of [support, operations]) {
        await ctx.http.get(`/v1/admin/stores/${storeId}/commission`).set(bearer(admin.accessToken)).expect(403);
        await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(admin.accessToken)).send({ pct: 5, reason: 'tentativa' }).expect(403);
      }
      await ctx.http.get(`/v1/admin/stores/${storeId}/commission`).expect(401);
      await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(finance.accessToken)).send({ pct: 31, reason: 'acima do teto' }).expect(400);
      await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(finance.accessToken)).send({ pct: 5, reason: '' }).expect(400);
      await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(finance.accessToken)).send({ pct: 5.123, reason: 'três casas' }).expect(400);
      await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(finance.accessToken)).send({ pct: 5, reason: 'campo extra', extra: 1 }).expect(400);
      await ctx.http.get(`/v1/admin/stores/${randomUUID()}/commission`).set(bearer(finance.accessToken)).expect(404);
      await ctx.http.put(`/v1/admin/stores/${randomUUID()}/commission`).set(bearer(finance.accessToken)).send({ pct: 5, reason: 'loja fantasma' }).expect(404);
    });

    it('comissão por categoria: define e lista o histórico', async () => {
      const categoryId = await ensureCategory(ctx);
      const res = await ctx.http.put(`/v1/admin/categories/${categoryId}/commission`).set(bearer(finance.accessToken)).send({ pct: 6, reason: 'incentivo hortifruti' }).expect(200);
      expect(res.body.history[0]).toMatchObject({ pct: 6 });
      await ctx.http.get(`/v1/admin/categories/${categoryId}/commission`).set(bearer(support.accessToken)).expect(403);
      await ctx.http.get(`/v1/admin/categories/${randomUUID()}/commission`).set(bearer(finance.accessToken)).expect(404);
    });
  });
});
