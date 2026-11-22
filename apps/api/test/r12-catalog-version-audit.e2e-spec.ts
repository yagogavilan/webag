import { randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import { vi } from 'vitest';
import { AuditService } from '../src/modules/admin/index.js';
import { IdempotencyService } from '../src/modules/idempotency/index.js';
import { auditLog, idempotencyKeys, productVariants, products, storeSections } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';
import { createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, jpegBuffer, uploadFile, type TestMerchant } from './helpers/fixtures.js';

/**
 * v1.1 R1.2, marco 1 e 2 (ADR-018 D2, D18, D20 b; threat model §15.6): `products.version` só sobe em edição de catálogo; as escritas do lojista gravam
 * antes/depois no `audit_log` com `store_id` (I4); `IdempotencyService.runInTransaction` e o reajuste em massa SEC-208 (BK-01 a BK-07, DB-05).
 * BK-01: o contrato fala em `batchId`, que depende das tabelas de lote da R1.3 (WB-377): aqui a prova é "mesma resposta, preço sobe uma vez".
 */
describe('Catálogo do lojista: versão do produto, auditoria (I4) e reajuste em massa idempotente (SEC-208)', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  let otherStoreId: string;
  let categoryId: string;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const path = (suffix = '', id = storeId) => `/v1/stores/${id}/products${suffix}`;
  const create = (body: Record<string, unknown> = {}, user: { accessToken: string } = owner, id = storeId) => ctx.http.post(path('', id)).set(as(user)).send({ name: `Produto ${uniqueTag(6)}`, ...body });
  const versionOf = async (id: string) => (await ctx.db.select({ version: products.version }).from(products).where(eq(products.id, id)))[0]!.version;
  const trail = (action: string, id = storeId) => ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, action)));
  const productTrail = async (productId: string) => (await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), like(auditLog.action, 'product.%')))).filter((r) => r.targetId === productId || (r.before as { productId?: string } | null)?.productId === productId);

  async function readyProduct(extra: Record<string, unknown> = {}): Promise<{ id: string; variantId: string }> {
    const created = await create({ categoryId, basePriceCents: 5000, ...extra }).expect(201);
    const id = created.body.id as string;
    const withVariant = await ctx.http.put(path(`/${id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    const upload = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [(upload.completed!.body as { id: string }).id] }).expect(200);
    return { id, variantId: withVariant.body.variants[0].id as string };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Versão' })).id;
    other = await createMerchant(ctx);
    otherStoreId = (await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra Loja Versão' })).id;
    categoryId = await ensureCategory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('products.version (D2, I2)', () => {
    it('nasce em 1 e sobe 1 a cada edição de catálogo (editar, variações, estoque manual, fotos, publicar, pausar, reativar); o ETag acompanha', async () => {
      const created = await create({ categoryId, basePriceCents: 5000 }).expect(201);
      const id = created.body.id as string;
      expect(created.body.version).toBe(1);
      let expected = 1;
      const step = async (label: string, call: () => Promise<unknown>) => {
        await call();
        expected += 1;
        expect(await versionOf(id), label).toBe(expected);
      };
      await step('updateProduct', () => ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ name: 'Nome novo' }).expect(200));
      let variantId = '';
      await step('setProductVariants', async () => {
        variantId = ((await ctx.http.put(path(`/${id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200)).body.variants[0] as { id: string }).id;
      });
      await step('adjustVariantStock (manual)', () => ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: 2 }).expect(200));
      const upload = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
      await step('setProductImages', () => ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [(upload.completed!.body as { id: string }).id] }).expect(200));
      await step('publishProduct', () => ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200));
      await step('pauseProduct', () => ctx.http.post(path(`/${id}/pause`)).set(as(owner)).send({}).expect(200));
      await step('resumeProduct', () => ctx.http.post(path(`/${id}/resume`)).set(as(owner)).send({}).expect(200));
      const read = await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200);
      expect(read.body.version).toBe(expected);
      expect(read.headers.etag).toBe(`"${expected}"`);
    });

    it('reservar, vender e cancelar (devolver o estoque) NÃO mudam a versão nem gravam no audit_log; venda concorrente a uma edição com If-Match não gera 409 falso', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item versão', priceCents: 4_000, stock: 10 }]);
      const productId = shop.store.productIds[0]!;
      const before = await versionOf(productId);
      const auditBefore = (await ctx.db.select().from(auditLog).where(eq(auditLog.storeId, shop.store.id))).length;

      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 2).expect(200);
      const order = (await placeOrder(ctx, user, addressId)).body as { id: string };
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]).toMatchObject({ reserved: 2 }); // reserva
      expect(await versionOf(productId)).toBe(before);
      await approve(ctx, user, (await attemptOf(ctx, order.id)).id); // venda (baixa definitiva)
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, shop.variants[0]!)))[0]).toMatchObject({ stock: 8, reserved: 0 });
      expect(await versionOf(productId)).toBe(before);

      await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
      const second = (await placeOrder(ctx, user, addressId)).body as { id: string };
      await ctx.http.post(`/v1/orders/${second.id}/cancel`).set(bearer(user.accessToken)).send({ reason: 'desisti' }).expect(200); // libera a reserva
      expect(await versionOf(productId)).toBe(before);
      expect((await ctx.db.select().from(auditLog).where(eq(auditLog.storeId, shop.store.id))).filter((r) => r.action.startsWith('product.'))).toHaveLength(0);
      expect((await ctx.db.select().from(auditLog).where(eq(auditLog.storeId, shop.store.id))).length).toBe(auditBefore);
    });

    it('If-Match: versão velha = 409 PRODUCT_VERSION_CONFLICT com a versão atual e NADA gravado; a certa grava; sem o header grava mesmo assim (app 1.0); formato inválido = 400', async () => {
      const { id } = await readyProduct();
      const v = await versionOf(id);
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).set('If-Match', `"${v}"`).send({ name: 'Primeira' }).expect(200);
      const stale = await ctx.http.patch(path(`/${id}`)).set(as(owner)).set('If-Match', `"${v}"`).send({ name: 'Segunda, de outro aparelho' }).expect(409);
      expect(stale.body.code).toBe('PRODUCT_VERSION_CONFLICT');
      expect(stale.body.current).toMatchObject({ version: v + 1, basePriceCents: 5000 });
      expect((await ctx.db.select().from(products).where(eq(products.id, id)))[0]).toMatchObject({ name: 'Primeira', version: v + 1 });
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ name: 'Sem header' }).expect(200);
      expect(await versionOf(id)).toBe(v + 2);
      for (const bad of ['5', 'W/"5"', '"0"', '"abc"']) await ctx.http.patch(path(`/${id}`)).set(as(owner)).set('If-Match', bad).send({ name: 'x1' }).expect(400);
      // as demais escritas do lojista também conferem
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).set('If-Match', `"${v}"`).send({ imageIds: [] }).expect(409);
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).set('If-Match', `"${v}"`).send({}).expect(409);
    });
  });

  describe('I4: antes/depois no audit_log com store_id (ADR-018 D20 b)', () => {
    it('updateProduct, setProductVariants, adjustVariantStock, setProductImages e publishProduct gravam 1 linha cada, com store_id, antes e depois, na ação do histórico', async () => {
      const created = await create({ categoryId, basePriceCents: 5000, name: 'Camiseta auditada' }).expect(201);
      const id = created.body.id as string;
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ name: 'Camiseta auditada 2' }).expect(200);
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ basePriceCents: 6000 }).expect(200);
      const variants = await ctx.http.put(path(`/${id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 4 }] }).expect(200);
      const variantId = (variants.body.variants[0] as { id: string }).id;
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ set: 9 }).expect(200);
      const upload = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
      const assetId = (upload.completed!.body as { id: string }).id;
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [assetId] }).expect(200);
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);

      const rows = await productTrail(id);
      const byAction = (a: string) => rows.filter((r) => r.action === a);
      expect(rows.every((r) => r.storeId === storeId && r.actorId === owner.userId)).toBe(true);
      expect(byAction('product.update')).toHaveLength(1);
      expect(byAction('product.update')[0]).toMatchObject({ before: { name: 'Camiseta auditada' }, after: { name: 'Camiseta auditada 2' } });
      expect(byAction('product.price')).toHaveLength(1);
      expect(byAction('product.price')[0]).toMatchObject({ before: { basePriceCents: 5000 }, after: { basePriceCents: 6000 } });
      expect(byAction('product.variants_set')).toHaveLength(1);
      expect(byAction('product.variants_set')[0]!.after).toMatchObject({ variants: [{ id: variantId, stock: 4 }] });
      expect(byAction('product.stock_adjust')).toHaveLength(1);
      expect(byAction('product.stock_adjust')[0]).toMatchObject({ before: { stock: 4 }, after: { stock: 9 } });
      expect(byAction('product.images_set')).toHaveLength(1);
      expect(byAction('product.images_set')[0]).toMatchObject({ before: { imageIds: [] }, after: { imageIds: [assetId] } });
      expect(byAction('product.publish')).toHaveLength(1);
      expect(byAction('product.publish')[0]).toMatchObject({ before: { status: 'draft' }, after: { status: 'active' } });
    });

    it('bulkProducts: 1 linha por lote e 1 por item SÓ em price_adjust; dryRun e pausar não gravam por item', async () => {
      const a = (await create({ basePriceCents: 1000 }).expect(201)).body as { id: string; version: number };
      const b = (await create({ basePriceCents: 2000 }).expect(201)).body as { id: string; version: number };
      const lots = (await trail('product.bulk')).length;
      const prices = (await trail('product.price')).length;
      const versions = [a, b].map((p) => ({ productId: p.id, version: p.version }));
      await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [a.id, b.id], dryRun: true, expectedVersions: versions, action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(200);
      expect((await trail('product.bulk')).length).toBe(lots);
      await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [a.id, b.id], action: { type: 'pause' } }).expect(200);
      expect((await trail('product.bulk')).length).toBe(lots + 1);
      expect((await trail('product.price')).length).toBe(prices);
      const fresh = await Promise.all([a, b].map(async (p) => ({ productId: p.id, version: await versionOf(p.id) })));
      await ctx.http.post(path('/bulk')).set(as(owner)).set('Idempotency-Key', `bulk-${uniqueTag(8)}`).send({ productIds: [a.id, b.id], expectedVersions: fresh, action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(200);
      expect((await trail('product.bulk')).length).toBe(lots + 2);
      expect((await trail('product.price')).length).toBe(prices + 2);
    });

    it('DB-05: falha na linha de auditoria desfaz a edição do catálogo (nada de preço mudado sem trilha)', async () => {
      const { id } = await readyProduct();
      const v = await versionOf(id);
      const spy = vi.spyOn(ctx.app.get(AuditService), 'record').mockRejectedValueOnce(new Error('falha injetada na auditoria'));
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ basePriceCents: 777 }).expect(500);
      spy.mockRestore();
      expect((await ctx.db.select().from(products).where(eq(products.id, id)))[0]).toMatchObject({ basePriceCents: 5000, version: v });
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ basePriceCents: 777 }).expect(200);
    });
  });

  describe('IdempotencyService.runInTransaction (D18) e reajuste em massa (D17, BK-01 a BK-07)', () => {
    const bulkBody = (ps: { id: string; version: number }[], over: Record<string, unknown> = {}) => ({ productIds: ps.map((p) => p.id), expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })), action: { type: 'price_adjust', mode: 'percent', value: 10 }, ...over });
    const apply = (body: unknown, key: string | null, user: { accessToken: string } = owner, id = storeId) => {
      const req = ctx.http.post(path('/bulk', id)).set(as(user));
      return (key ? req.set('Idempotency-Key', key) : req).send(body as object);
    };
    const priceOf = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!.basePriceCents;
    const two = async (user: { accessToken: string } = owner, id = storeId) => {
      const x = (await create({ basePriceCents: 10_000 }, user, id).expect(201)).body as { id: string; version: number };
      const y = (await create({ basePriceCents: 20_000 }, user, id).expect(201)).body as { id: string; version: number };
      return [x, y];
    };

    it('BK-01: o mesmo corpo repetido depois de aplicar devolve a mesma resposta e o preço sobe UMA vez (nunca +21%); a versão sobe uma vez', async () => {
      const ps = await two();
      const key = `bk01-${uniqueTag(8)}`;
      const first = await apply(bulkBody(ps), key).expect(200);
      expect(first.body).toMatchObject({ changed: 2, dryRun: false });
      const again = await apply(bulkBody(ps), key).expect(200);
      expect(again.body).toEqual(first.body);
      expect(await priceOf(ps[0]!.id)).toBe(11_000);
      expect(await priceOf(ps[1]!.id)).toBe(22_000);
      expect(await versionOf(ps[0]!.id)).toBe(ps[0]!.version + 1);
    });

    it('BK-02: falha injetada ENTRE o efeito e a resposta guardada = rollback total (preço, versão, auditoria) e a chave volta a ficar livre', async () => {
      const ps = await two();
      const key = `bk02-${uniqueTag(8)}`;
      const lots = (await trail('product.bulk')).length;
      const original = ctx.app.get(IdempotencyService);
      // o resultado do `fn` ganha um valor que o JSONB não serializa: o UPDATE da resposta falha DEPOIS de o efeito ter sido escrito.
      const spy = vi.spyOn(original, 'runInTransaction').mockImplementationOnce(async (scope, k, payload, fn) => {
        return IdempotencyService.prototype.runInTransaction.call(original, scope, k, payload, async (tx) => ({ ...((await fn(tx)) as object), boom: 1n }) as never);
      });
      await apply(bulkBody(ps), key).expect(500);
      spy.mockRestore();
      expect(await priceOf(ps[0]!.id)).toBe(10_000);
      expect(await versionOf(ps[0]!.id)).toBe(ps[0]!.version);
      expect((await trail('product.bulk')).length).toBe(lots);
      expect(await ctx.db.select().from(idempotencyKeys).where(like(idempotencyKeys.scope, `bulk:${storeId}:%`)).then((rows) => rows.filter((r) => r.key === key))).toHaveLength(0);
      await apply(bulkBody(ps), key).expect(200); // a mesma chave agora aplica
      expect(await priceOf(ps[0]!.id)).toBe(11_000);
    });

    it('BK-03: 2 requisições simultâneas com a mesma chave (Promise.all) = 1 aplicação; as duas respondem o mesmo corpo', async () => {
      const ps = await two();
      const key = `bk03-${uniqueTag(8)}`;
      const [a, b] = await Promise.all([apply(bulkBody(ps), key), apply(bulkBody(ps), key)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body).toEqual(b.body);
      expect(await priceOf(ps[0]!.id)).toBe(11_000);
      expect(await versionOf(ps[0]!.id)).toBe(ps[0]!.version + 1);
    });

    it('BK-04: versão alterada depois da prévia = 409 BULK_VERSION_CONFLICT com `conflicts`, NADA aplicado, chave livre e a prévia nova funciona', async () => {
      const ps = await two();
      const preview = await apply(bulkBody(ps, { dryRun: true }), null).expect(200);
      expect(preview.body.preview).toHaveLength(2);
      const first = (preview.body.preview as { productId: string; youReceiveCents: number }[]).find((p) => p.productId === ps[0]!.id);
      expect(first).toMatchObject({ version: ps[0]!.version, fromCents: 10_000, toCents: 11_000, changePct: 10, exceedsLimit: false });
      expect(typeof first!.youReceiveCents).toBe('number'); // dono: tem `catalog`
      await ctx.http.patch(path(`/${ps[1]!.id}`)).set(as(owner)).send({ name: 'Alterado no meio' }).expect(200); // outra pessoa edita depois da prévia
      const key = `bk04-${uniqueTag(8)}`;
      const conflict = await apply(bulkBody(ps), key).expect(409);
      expect(conflict.body.code).toBe('BULK_VERSION_CONFLICT');
      expect(conflict.body.conflicts).toEqual([{ productId: ps[1]!.id, name: 'Alterado no meio', currentVersion: ps[1]!.version + 1 }]);
      expect(await priceOf(ps[0]!.id)).toBe(10_000); // o item bom também não mudou: tudo ou nada
      const fresh = await apply(bulkBody(ps, { dryRun: true }), null).expect(200);
      const versions = (fresh.body.preview as { productId: string; version: number }[]).map((p) => ({ productId: p.productId, version: p.version }));
      await apply({ ...bulkBody(ps), expectedVersions: versions }, key).expect(200);
      expect(await priceOf(ps[0]!.id)).toBe(11_000);
    });

    it('BK-05: a mesma chave com corpo diferente = 422 IDEMPOTENCY_KEY_REUSED (nada aplicado de novo)', async () => {
      const ps = await two();
      const key = `bk05-${uniqueTag(8)}`;
      await apply(bulkBody(ps), key).expect(200);
      const reused = await apply(bulkBody(ps, { action: { type: 'price_adjust', mode: 'percent', value: 20 } }), key).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect(await priceOf(ps[0]!.id)).toBe(11_000);
    });

    it('BK-06: a mesma chave em outra loja (e, portanto, outro ator) não colide', async () => {
      const mine = await two();
      const theirs = await two(other, otherStoreId);
      const key = `bk06-${uniqueTag(8)}`;
      await apply(bulkBody(mine), key).expect(200);
      await apply(bulkBody(theirs), key, other, otherStoreId).expect(200);
      expect(await priceOf(mine[0]!.id)).toBe(11_000);
      expect(await priceOf(theirs[0]!.id)).toBe(11_000);
    });

    it('BK-07: sem Idempotency-Key = 400 IDEMPOTENCY_KEY_REQUIRED; sem expectedVersions (ou incompleto) = 400 EXPECTED_VERSIONS_REQUIRED; pausar continua sem exigir', async () => {
      const ps = await two();
      expect((await apply(bulkBody(ps), null).expect(400)).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      expect((await apply({ productIds: ps.map((p) => p.id), action: { type: 'price_adjust', mode: 'percent', value: 10 } }, `bk07-${uniqueTag(8)}`).expect(400)).body.code).toBe('EXPECTED_VERSIONS_REQUIRED');
      expect((await apply(bulkBody(ps, { expectedVersions: [{ productId: ps[0]!.id, version: ps[0]!.version }] }), `bk07-${uniqueTag(8)}`).expect(400)).body.code).toBe('EXPECTED_VERSIONS_REQUIRED');
      await apply({ productIds: ps.map((p) => p.id), action: { type: 'pause' } }, null).expect(200);
      expect(await priceOf(ps[0]!.id)).toBe(10_000);
    });

    it('reajuste acima de reajuste_max_pct pede confirmação (422 BULK_NEEDS_CONFIRMATION) e só aplica com confirmLargeChange; percentual com mais de 2 casas ou fora de -90..+500 = 400', async () => {
      const ps = await two();
      const needs = await apply(bulkBody(ps, { action: { type: 'price_adjust', mode: 'percent', value: 50 } }), `bk-conf-${uniqueTag(8)}`).expect(422);
      expect(needs.body.code).toBe('BULK_NEEDS_CONFIRMATION');
      const dry = await apply(bulkBody(ps, { dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 50 } }), null).expect(200);
      expect(dry.body.requiresConfirmation).toBe(true);
      expect(dry.body.preview.every((p: { exceedsLimit: boolean }) => p.exceedsLimit)).toBe(true);
      await apply(bulkBody(ps, { confirmLargeChange: true, action: { type: 'price_adjust', mode: 'percent', value: 50 } }), `bk-conf-${uniqueTag(8)}`).expect(200);
      expect(await priceOf(ps[0]!.id)).toBe(15_000);
      for (const value of [10.001, 501, -91]) await apply(bulkBody(ps, { dryRun: true, action: { type: 'price_adjust', mode: 'percent', value } }), null).expect(400);
    });

    it('duas ações em massa simultâneas sobre os mesmos produtos, em ordens opostas, não dão deadlock (itens travados e atualizados em ordem de id)', async () => {
      const group = await Promise.all(Array.from({ length: 12 }, () => create({ basePriceCents: 1000 }).expect(201).then((r) => r.body as { id: string })));
      const section = await ctx.db.insert(storeSections).values({ storeId, name: `S${uniqueTag(4)}`, position: 0 }).returning();
      const ids = group.map((g) => g.id);
      const call = (productIds: string[]) => ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds, action: { type: 'move_section', sectionId: section[0]!.id } });
      const [a, b] = await Promise.all([call(ids), call([...ids].reverse())]);
      expect([a.status, b.status]).toEqual([200, 200]);
    });

    it('runInTransaction direto: corpo igual repete a resposta, corpo diferente é 422, erro desfaz o efeito e libera a chave, escopo diferente não colide, chave vencida vale como nova', async () => {
      const idem = ctx.app.get(IdempotencyService);
      const scope = `t12:${randomUUID()}`;
      const key = `rit-${uniqueTag(8)}`;
      const name = () => `Seção ${uniqueTag(6)}`;
      const effect = async (tx: Parameters<Parameters<IdempotencyService['runInTransaction']>[3]>[0], label: string) => {
        const [row] = await tx.insert(storeSections).values({ storeId, name: label.slice(0, 40), position: 0 }).returning();
        return { id: row!.id };
      };
      const label = name();
      const first = await idem.runInTransaction(scope, key, { a: 1 }, (tx) => effect(tx, label));
      expect(await idem.runInTransaction(scope, key, { a: 1 }, (tx) => effect(tx, label))).toEqual(first);
      expect(await ctx.db.select().from(storeSections).where(eq(storeSections.name, label))).toHaveLength(1);
      await expect(idem.runInTransaction(scope, key, { a: 2 }, (tx) => effect(tx, label))).rejects.toMatchObject({ code: 'IDEMPOTENCY_KEY_REUSED', status: 422 });

      const failing = `rit-fail-${uniqueTag(6)}`;
      const lost = name();
      await expect(
        idem.runInTransaction(scope, failing, {}, async (tx) => {
          await effect(tx, lost);
          throw new Error('falha depois do efeito');
        }),
      ).rejects.toThrow('falha depois do efeito');
      expect(await ctx.db.select().from(storeSections).where(eq(storeSections.name, lost))).toHaveLength(0);
      expect((await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, failing)))).toHaveLength(0);
      const retry = await idem.runInTransaction(scope, failing, {}, (tx) => effect(tx, lost));
      expect(retry.id).toBeTruthy();

      const otherScope = await idem.runInTransaction(`${scope}:b`, key, { a: 1 }, (tx) => effect(tx, name()));
      expect(otherScope.id).not.toBe(first.id);

      await ctx.db.update(idempotencyKeys).set({ expiresAt: new Date(Date.now() - 1000) }).where(and(eq(idempotencyKeys.scope, scope), eq(idempotencyKeys.key, key)));
      const renewed = await idem.runInTransaction(scope, key, { a: 2 }, (tx) => effect(tx, name()));
      expect(renewed.id).not.toBe(first.id);
    });
  });
});
