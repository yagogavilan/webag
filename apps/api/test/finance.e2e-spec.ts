import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { parameters } from '../src/platform/database/schema.js';
import { CommissionService } from '../src/modules/finance/commission.service.js';
import { LedgerService } from '../src/modules/finance/ledger.service.js';
import { computeOrderFinance } from '../src/modules/finance/domain/commission.js';
import { ledgerEntries, ledgerTransactions } from '../src/modules/finance/db/schema.js';
import { createTestApp, type TestContext } from './helpers/app.js';
import { ensureCategory, insertStoreRow, registerUser, ensureLegalDocs } from './helpers/fixtures.js';

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

  const finance = () => computeOrderFinance({ items: [{ subtotalCents: 10_000, pctBp: 1000 }], storeCouponCents: 1000, platformDiscountCents: 0, deliveryFeeCents: 800, serviceFeeCents: 0 });

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
      expect((sale!.meta as { finance: { commissionCents: number } }).finance.commissionCents).toBe(900);
      await ctx.db.delete(parameters).where(eq(parameters.key, 'comissao_padrao_pct'));
    });
  });

  describe('ledger', () => {
    it('venda do exemplo da RN-10 lança 98,00 / 88,03 loja / 9,00 Webag; repetir a gravação não duplica', async () => {
      const orderId = randomUUID();
      const f = finance();
      expect(await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }))).toBe(true);
      expect(await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }))).toBe(false);
      await ctx.db.transaction((tx) => ledger.recordProviderFee(tx, { orderId, storeId, attemptId: null, feeCents: 97 }));
      const b = await ledger.balances(orderId);
      expect(b).toMatchObject({ paidCents: 9800, merchantPayable: 8803, commissionRevenue: 900, providerClearing: 9800 - 97, providerFeeCents: 97 });
      expect(await ledger.verifyOrder(orderId)).toEqual({ ok: true, problems: [] });
    });

    it('estorno parcial e depois total: devolve comissão proporcional, fecha a conta e é idempotente por chave', async () => {
      const orderId = randomUUID();
      const f = finance();
      await ctx.db.transaction((tx) => ledger.recordSale(tx, { orderId, storeId, attemptId: null, finance: f }));
      expect(await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 3000, refundKey: 'r1' }))).toBe(true);
      expect(await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 3000, refundKey: 'r1' }))).toBe(false);
      let b = await ledger.balances(orderId);
      expect(b).toMatchObject({ refundedCents: 3000, providerClearing: 6800, commissionRevenue: 900 - 276 });
      await ctx.db.transaction((tx) => ledger.recordRefund(tx, { orderId, refundCents: 6800, refundKey: 'r2' }));
      b = await ledger.balances(orderId);
      expect(b).toMatchObject({ refundedCents: 9800, providerClearing: 0, commissionRevenue: 0, merchantPayable: 0 });
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
});
