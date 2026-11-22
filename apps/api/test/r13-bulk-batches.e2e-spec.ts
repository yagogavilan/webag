import { and, eq, like } from 'drizzle-orm';
import { vi } from 'vitest';
import { CatalogService } from '../src/modules/catalog/index.js';
import { auditLog, productBulkBatchItems, productBulkBatches, productVariants, products, storeMembers } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, registerUser, type TestMerchant } from './helpers/fixtures.js';

/**
 * v1.1 R1.3 (WB-377 C4, C7; ADR-018 D17/D18): o reajuste em massa grava um LOTE (`batchId`, `undoUntil`), o histórico (`listBulkBatches`) e o desfazer de 10 minutos
 * (`undoBulkBatch`, BK-08). BK-01 (mesma chave = mesmo `batchId`), BK-08 (desfazer parcial `CHANGED_AFTER`, repetição `alreadyUndone`, janela, concorrência).
 */
describe('Lotes de ação em massa do lojista: batchId, histórico e desfazer (WB-377, BK-01, BK-08)', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  let otherStoreId: string;
  let categoryId: string;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const path = (suffix = '', id = storeId) => `/v1/stores/${id}/products${suffix}`;
  const create = (body: Record<string, unknown> = {}, user: { accessToken: string } = owner, id = storeId) => ctx.http.post(path('', id)).set(as(user)).send({ name: `Produto ${uniqueTag(6)}`, categoryId, ...body });
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!;
  const batchRows = (id = storeId) => ctx.db.select().from(productBulkBatches).where(eq(productBulkBatches.storeId, id));
  const priced = async (cents: number, user: { accessToken: string } = owner, id = storeId) => (await create({ basePriceCents: cents }, user, id).expect(201)).body as { id: string; version: number };
  const body = (ps: { id: string; version: number }[], over: Record<string, unknown> = {}) => ({ productIds: ps.map((p) => p.id), expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })), action: { type: 'price_adjust', mode: 'percent', value: 10 }, ...over });
  const apply = (payload: unknown, key: string | null = `k-${uniqueTag(10)}`, user: { accessToken: string } = owner, id = storeId) => {
    const req = ctx.http.post(path('/bulk', id)).set(as(user));
    return (key ? req.set('Idempotency-Key', key) : req).send(payload as object);
  };
  const undo = (batchId: string, user: { accessToken: string } = owner, id = storeId) => ctx.http.post(path(`/bulk/${batchId}/undo`, id)).set(as(user)).send();
  const list = (query = '', user: { accessToken: string } = owner, id = storeId) => ctx.http.get(path(`/bulk-batches${query}`, id)).set(as(user));

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Lotes' })).id;
    other = await createMerchant(ctx);
    otherStoreId = (await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra Loja Lotes' })).id;
    categoryId = await ensureCategory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('batchId e undoUntil no reajuste (BK-01)', () => {
    it('BK-01: aplicar grava 1 lote com os itens e devolve batchId e undoUntil (+10 min); a MESMA chave devolve o MESMO batchId e não cria outro lote; a prévia não grava lote', async () => {
      const ps = [await priced(10_000), await priced(20_000)];
      const lotsBefore = (await batchRows()).length;
      const preview = await apply(body(ps, { dryRun: true }), null).expect(200);
      expect(preview.body).toMatchObject({ dryRun: true, batchId: null, undoUntil: null });
      expect((await batchRows()).length).toBe(lotsBefore);

      const key = `bk01-${uniqueTag(8)}`;
      const first = await apply(body(ps), key).expect(200);
      expect(first.body.batchId).toEqual(expect.any(String));
      const undoUntil = new Date(first.body.undoUntil as string).getTime();
      expect(undoUntil - Date.now()).toBeGreaterThan(9 * 60_000);
      expect(undoUntil - Date.now()).toBeLessThanOrEqual(10 * 60_000);
      const again = await apply(body(ps), key).expect(200);
      expect(again.body).toEqual(first.body);
      const lots = await batchRows();
      expect(lots.length).toBe(lotsBefore + 1);
      const lot = lots.find((l) => l.id === first.body.batchId)!;
      expect(lot).toMatchObject({ kind: 'price_adjust', source: 'merchant', actorUserId: owner.userId, itemsCount: 2, undoneAt: null });
      const items = await ctx.db.select().from(productBulkBatchItems).where(eq(productBulkBatchItems.batchId, lot.id));
      expect(items.map((i) => [i.previousPriceCents, i.appliedPriceCents, i.previousVersion, i.appliedVersion]).sort()).toEqual([
        [10_000, 11_000, ps[0]!.version, ps[0]!.version + 1],
        [20_000, 22_000, ps[1]!.version, ps[1]!.version + 1],
      ]);
    });

    it('pausar, reativar e mover de seção também viram lote (histórico), sem undoUntil e sem itens; ação que não muda nada devolve batchId nulo e não grava lote', async () => {
      const ps = [await priced(5_000), await priced(6_000)];
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, ps[0]!.id));
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, ps[1]!.id));
      const before = (await batchRows()).length;
      const paused = await apply({ productIds: ps.map((p) => p.id), action: { type: 'pause' } }, null).expect(200);
      expect(paused.body).toMatchObject({ changed: 2, undoUntil: null });
      expect(paused.body.batchId).toEqual(expect.any(String));
      const lot = (await batchRows()).find((l) => l.id === paused.body.batchId)!;
      expect(lot).toMatchObject({ kind: 'pause', itemsCount: 2, undoUntil: null });
      expect(await ctx.db.select().from(productBulkBatchItems).where(eq(productBulkBatchItems.batchId, lot.id))).toHaveLength(0);
      const noop = await apply({ productIds: ps.map((p) => p.id), action: { type: 'pause' } }, null).expect(200);
      expect(noop.body).toMatchObject({ changed: 0, batchId: null });
      expect((await batchRows()).length).toBe(before + 1);
    });

    it('SEC-208 continua valendo: falha ao gravar o lote desfaz o reajuste inteiro (preço, versão, auditoria e chave) e a mesma chave aplica depois', async () => {
      const ps = [await priced(10_000)];
      const key = `bk-lote-${uniqueTag(8)}`;
      const lots = (await batchRows()).length;
      const trail = () => ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), like(auditLog.action, 'product.%')));
      const trailBefore = (await trail()).length;
      const catalog = ctx.app.get(CatalogService);
      const spy = vi.spyOn(catalog, 'recordBulkBatch').mockRejectedValueOnce(new Error('falha ao gravar o lote'));
      await apply(body(ps), key).expect(500);
      spy.mockRestore();
      expect((await row(ps[0]!.id)).basePriceCents).toBe(10_000);
      expect((await row(ps[0]!.id)).version).toBe(ps[0]!.version);
      expect((await batchRows()).length).toBe(lots);
      expect((await trail()).length).toBe(trailBefore);
      await apply(body(ps), key).expect(200);
      expect((await row(ps[0]!.id)).basePriceCents).toBe(11_000);
    });
  });

  describe('listBulkBatches (WB-377 C7)', () => {
    it('lista do mais recente ao mais antigo, com quem, quando, quantos itens e undone; só da própria loja; cursor percorre sem repetir; rota estática não cai em {productId}', async () => {
      const lojista = await createMerchant(ctx);
      const id = (await insertStoreRow(ctx, lojista.userId, { status: 'approved', name: `Lotes lista ${uniqueTag(4)}` })).id;
      const ps = [await priced(10_000, lojista, id), await priced(10_000, lojista, id)];
      const ids: string[] = [];
      ids.push((await apply(body(ps), `ls-${uniqueTag(8)}`, lojista, id).expect(200)).body.batchId as string);
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.storeId, id));
      for (const type of ['pause', 'resume']) ids.push((await apply({ productIds: ps.map((p) => p.id), action: { type } }, null, lojista, id).expect(200)).body.batchId as string);
      const empty = await list('', other, otherStoreId).expect(200);
      expect(empty.body.data.every((b: { id: string }) => !ids.includes(b.id))).toBe(true);

      const page1 = await list('?limit=2', lojista, id).expect(200);
      expect(page1.body.data).toHaveLength(2);
      expect(page1.body.nextCursor).toEqual(expect.any(String));
      const page2 = await list(`?limit=2&cursor=${encodeURIComponent(page1.body.nextCursor as string)}`, lojista, id).expect(200);
      const all = [...page1.body.data, ...page2.body.data] as { id: string; kind: string; itemsCount: number; source: string; actorName: string; at: string; undoUntil: string | null; undone: boolean }[];
      expect(all.map((b) => b.id)).toEqual([...ids].reverse()); // mais recente primeiro
      expect(page2.body.nextCursor).toBeNull();
      expect(all.at(-1)).toMatchObject({ kind: 'price_adjust', itemsCount: 2, source: 'merchant', undone: false });
      expect(all.at(-1)!.actorName).toBe('Maria Teste');
      expect(all[0]).toMatchObject({ kind: 'resume', undoUntil: null });
      await undo(ids[0]!, lojista, id).expect(200);
      expect(((await list('', lojista, id).expect(200)).body.data as { id: string; undone: boolean }[]).find((b) => b.id === ids[0])!.undone).toBe(true);
    });

    it('não-membro = 404, sem token = 401, funcionário sem `catalog` = 403, limite inválido = 400', async () => {
      await list('', other).expect(404);
      await ctx.http.get(path('/bulk-batches')).expect(401);
      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      await list('', staff).expect(403);
      await list('?limit=0').expect(400);
    });
  });

  describe('undoBulkBatch (BK-08)', () => {
    it('BK-08: devolve o preço anterior (produto e variação com preço próprio), sobe a versão +1, grava antes/depois no histórico e marca o lote como desfeito', async () => {
      const p = await priced(10_000);
      const variants = await ctx.http.put(path(`/${p.id}/variants`)).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 3, priceCents: 9_000 }, { attributes: { Tamanho: 'M' }, stock: 3 }] }).expect(200);
      const fresh = (await ctx.http.get(path(`/${p.id}`)).set(as(owner)).expect(200)).body as { version: number };
      const applied = await apply(body([{ id: p.id, version: fresh.version }], { action: { type: 'price_adjust', mode: 'percent', value: 10 } })).expect(200);
      expect((await row(p.id)).basePriceCents).toBe(11_000);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.productId, p.id))).map((v) => v.priceCents).sort()).toEqual([9_900, null]);
      const versionAfterApply = (await row(p.id)).version;
      const trailBefore = (await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), like(auditLog.action, 'product.price')))).length;

      const result = await undo(applied.body.batchId as string).expect(200);
      expect(result.body).toEqual({ batchId: applied.body.batchId, alreadyUndone: false, reverted: 1, skipped: [] });
      expect((await row(p.id)).basePriceCents).toBe(10_000);
      expect((await row(p.id)).version).toBe(versionAfterApply + 1);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.productId, p.id))).map((v) => v.priceCents).sort()).toEqual([9_000, null]);
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), like(auditLog.action, 'product.price')));
      expect(trail.length).toBe(trailBefore + 1);
      const mine = trail.filter((r) => r.targetId === p.id).sort((a, b) => a.id - b.id);
      expect(mine.at(-1)).toMatchObject({ actorId: owner.userId });
      expect(mine.at(-1)!.before).toMatchObject({ basePriceCents: 11_000 });
      expect(mine.at(-1)!.after).toMatchObject({ basePriceCents: 10_000 });
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'product.bulk_undo')))).length).toBeGreaterThanOrEqual(1);
      const lot = (await batchRows()).find((l) => l.id === applied.body.batchId)!;
      expect(lot.undoneAt).not.toBeNull();
      expect(lot.undoneBy).toBe(owner.userId);
      void variants;
    });

    it('BK-08: item editado DEPOIS do reajuste não é sobrescrito (`skipped` CHANGED_AFTER); os demais voltam; o desfazer é parcial e atômico', async () => {
      const ps = [await priced(10_000), await priced(20_000), await priced(30_000)];
      const applied = await apply(body(ps)).expect(200);
      await ctx.http.patch(path(`/${ps[1]!.id}`)).set(as(owner)).send({ basePriceCents: 25_000 }).expect(200); // o lojista corrige um preço à mão depois
      const result = await undo(applied.body.batchId as string).expect(200);
      expect(result.body.reverted).toBe(2);
      expect(result.body.skipped).toEqual([{ productId: ps[1]!.id, name: expect.any(String), reason: 'CHANGED_AFTER' }]);
      expect((await row(ps[0]!.id)).basePriceCents).toBe(10_000);
      expect((await row(ps[1]!.id)).basePriceCents).toBe(25_000); // intocado
      expect((await row(ps[2]!.id)).basePriceCents).toBe(30_000);
    });

    it('BK-08: repetir o desfazer devolve 200 com o MESMO resultado e alreadyUndone: true (nada reverte de novo, inclusive com a janela vencida); 2 simultâneos revertem uma vez', async () => {
      const ps = [await priced(10_000), await priced(20_000)];
      const applied = await apply(body(ps)).expect(200);
      const [a, b] = await Promise.all([undo(applied.body.batchId as string), undo(applied.body.batchId as string)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      const flags = [a.body.alreadyUndone, b.body.alreadyUndone].sort();
      expect(flags).toEqual([false, true]);
      expect(a.body.reverted).toBe(2);
      expect(b.body.reverted).toBe(2);
      const trailVersion = (await row(ps[0]!.id)).version;
      await ctx.db.update(productBulkBatches).set({ undoUntil: new Date(Date.now() - 60_000) }).where(eq(productBulkBatches.id, applied.body.batchId as string));
      const late = await undo(applied.body.batchId as string).expect(200);
      expect(late.body).toEqual({ batchId: applied.body.batchId, alreadyUndone: true, reverted: 2, skipped: [] });
      expect((await row(ps[0]!.id)).version).toBe(trailVersion);
      expect((await row(ps[0]!.id)).basePriceCents).toBe(10_000);
    });

    it('depois dos 10 minutos = 410 UNDO_WINDOW_EXPIRED (nada muda); lote de outra loja ou inexistente = 404; lote que não é reajuste = 409 BATCH_NOT_UNDOABLE; sem permissão = 403', async () => {
      const ps = [await priced(10_000)];
      const applied = await apply(body(ps)).expect(200);
      await ctx.db.update(productBulkBatches).set({ undoUntil: new Date(Date.now() - 1000) }).where(eq(productBulkBatches.id, applied.body.batchId as string));
      const expired = await undo(applied.body.batchId as string).expect(410);
      expect(expired.body.code).toBe('UNDO_WINDOW_EXPIRED');
      expect((await row(ps[0]!.id)).basePriceCents).toBe(11_000);

      await undo(applied.body.batchId as string, other, otherStoreId).expect(404);
      await undo('00000000-0000-4000-8000-000000000000').expect(404);
      await undo('nao-e-uuid').expect(404);

      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, ps[0]!.id));
      const pause = await apply({ productIds: [ps[0]!.id], action: { type: 'pause' } }, null).expect(200);
      const notUndoable = await undo(pause.body.batchId as string).expect(409);
      expect(notUndoable.body.code).toBe('BATCH_NOT_UNDOABLE');

      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      await undo(applied.body.batchId as string, staff).expect(403);
      await ctx.http.post(path(`/bulk/${applied.body.batchId as string}/undo`)).expect(401);
    });
  });

  describe('adjustVariantStock devolve a versão do produto (DEC-132)', () => {
    const readyVariant = async () => {
      const p = await priced(5_000);
      const withVariant = await ctx.http.put(path(`/${p.id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
      return { id: p.id, variantId: withVariant.body.variants[0].id as string, version: (await row(p.id)).version };
    };
    const stock = (p: { id: string; variantId: string }, payload: object, headers: Record<string, string> = {}) => {
      const req = ctx.http.post(path(`/${p.id}/variants/${p.variantId}/stock`)).set(as(owner));
      for (const [k, v] of Object.entries(headers)) req.set(k, v);
      return req.send(payload);
    };

    it('o corpo traz `productVersion` (a versão NOVA) e o ETag igual; serve de If-Match da próxima edição sem GET extra; o ajuste sobe a versão em 1', async () => {
      const p = await readyVariant();
      const first = await stock(p, { delta: 2 }, { 'If-Match': `"${p.version}"` }).expect(200);
      expect(first.body).toMatchObject({ id: p.variantId, stock: 12, productVersion: p.version + 1 });
      expect(first.headers.etag).toBe(`"${p.version + 1}"`);
      expect((await row(p.id)).version).toBe(first.body.productVersion);
      const second = await stock(p, { set: 7 }, { 'If-Match': first.headers.etag as string }).expect(200); // a versão devolvida basta, sem reconsultar
      expect(second.body).toMatchObject({ stock: 7, productVersion: p.version + 2 });
      const stale = await stock(p, { delta: 1 }, { 'If-Match': `"${p.version}"` }).expect(409);
      expect(stale.body.code).toBe('PRODUCT_VERSION_CONFLICT');
    });

    it('com Idempotency-Key a repetição devolve o MESMO corpo (inclusive `productVersion`), soma uma vez e o ETag também vem na repetição', async () => {
      const p = await readyVariant();
      const key = `st-${uniqueTag(10)}`;
      const first = await stock(p, { delta: 3 }, { 'Idempotency-Key': key }).expect(200);
      expect(first.body).toMatchObject({ stock: 13, productVersion: p.version + 1 });
      const again = await stock(p, { delta: 3 }, { 'Idempotency-Key': key }).expect(200);
      expect(again.body).toEqual(first.body);
      expect(again.headers.etag).toBe(first.headers.etag);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock).toBe(13);
      expect((await row(p.id)).version).toBe(p.version + 1);
    });
  });
});
