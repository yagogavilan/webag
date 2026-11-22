import { and, eq, like } from 'drizzle-orm';
import { vi } from 'vitest';
import { IdempotencyService } from '../src/modules/idempotency/index.js';
import { auditLog, categories, idempotencyKeys, productImages, productModerationEvents, productVariants, products } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, jpegBuffer, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/**
 * Lote R1.2 do threat model §17 (DEC-127): SEC-213 (importação CSV), SEC-218 (estoque por delta), SEC-214 (`quickPublish` em produto publicado),
 * SEC-215 (cópia de produto moderado) e `limitPct` na prévia do reajuste. Cada caso foi escrito vermelho antes da correção.
 */
describe('R1.2 lote de segurança: SEC-213, SEC-214, SEC-215, SEC-218 e limitPct', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let categoryId: string;
  let categoryName: string;
  let ops: TestAdmin;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const tag = () => uniqueTag(8);
  const path = (suffix = '', id = storeId) => `/v1/stores/${id}/products${suffix}`;
  const header = 'nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo';
  const sheet = (...lines: string[]) => [header, ...lines].join('\r\n');
  const importCsv = (body: string, query: Record<string, string>, key: string | null = null, user: { accessToken: string } = owner, id = storeId) => {
    const req = ctx.http.post(path('/import', id)).query(query).set(as(user)).set('Content-Type', 'text/csv');
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!;
  const trail = (action: string, id = storeId) => ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, action)));
  const freshStore = async () => {
    const merchant = await createMerchant(ctx);
    const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Loja ${uniqueTag(5)}` })).id;
    return { merchant, id };
  };
  const uploadReady = async (user: TestMerchant = owner, id = storeId) => {
    const up = await uploadFile(ctx, user, { storeId: id, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    return (up.completed!.body as { id: string }).id;
  };
  /** Rascunho completo e publicável: nome, preço, categoria, 1 variação sem grade com estoque, 1 foto. */
  const draftReady = async (extra: Record<string, unknown> = {}) => {
    const created = await ctx.http.post(path()).set(as(owner)).send({ name: `Produto ${tag()}`, categoryId, basePriceCents: 5000, ...extra }).expect(201);
    const id = created.body.id as string;
    const withVariant = await ctx.http.put(path(`/${id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    return { id, variantId: withVariant.body.variants[0].id as string };
  };
  const quickPublish = (productId: string, body: Record<string, unknown>, key = `qp-${tag()}`) => ctx.http.post(path(`/${productId}/quick-publish`)).set(as(owner)).set('Idempotency-Key', key).send(body);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Lote Segurança' })).id;
    categoryId = await ensureCategory(ctx);
    categoryName = (await ctx.db.select().from(categories).where(eq(categories.id, categoryId)))[0]!.name;
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('SEC-213: importação CSV é edição de catálogo', () => {
    it('onExisting=update com preço novo: version +1 por produto e 1 linha product.price com store_id e antes/depois; estoque novo grava product.stock_adjust; sem mudança nada sobe', async () => {
      const t = tag();
      const a = `IMP-A-${t}`;
      const b = `IMP-B-${t}`;
      const c = `IMP-C-${t}`;
      await importCsv(sheet(`Imp A ${t};${categoryName};;10,00;;;;;;5;${a}`, `Imp B ${t};${categoryName};;20,00;;;;;;5;${b}`, `Imp C ${t};${categoryName};;30,00;;;;;;5;${c}`), { mode: 'commit' }).expect(200);
      const find = async (name: string) => (await ctx.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.name, name))))[0]!;
      const [pa, pb, pc] = [await find(`Imp A ${t}`), await find(`Imp B ${t}`), await find(`Imp C ${t}`)];
      const priceTrail = (await trail('product.price')).length;
      const stockTrail = (await trail('product.stock_adjust')).length;

      // A: só preço; B: preço e estoque; C: idêntico (nada a fazer)
      const res = await importCsv(sheet(`Imp A ${t};${categoryName};;11,00;;;;;;5;${a}`, `Imp B ${t};${categoryName};;22,00;;;;;;9;${b}`, `Imp C ${t};${categoryName};;30,00;;;;;;5;${c}`), { mode: 'commit', onExisting: 'update' }).expect(200);
      expect(res.body).toMatchObject({ committed: true, updated: 3, created: 0 });

      expect(await row(pa.id)).toMatchObject({ basePriceCents: 1100, version: pa.version + 1 });
      expect(await row(pb.id)).toMatchObject({ basePriceCents: 2200, version: pb.version + 1 });
      expect((await row(pc.id)).version).toBe(pc.version);

      const prices = (await trail('product.price')).slice(priceTrail);
      expect(prices).toHaveLength(2);
      const forA = prices.find((r) => r.targetId === pa.id)!;
      expect(forA.storeId).toBe(storeId);
      expect(forA.before).toMatchObject({ basePriceCents: 1000, version: pa.version });
      expect(forA.after).toMatchObject({ basePriceCents: 1100, version: pa.version + 1 });
      const stocks = (await trail('product.stock_adjust')).slice(stockTrail);
      expect(stocks).toHaveLength(1);
      expect(stocks[0]).toMatchObject({ storeId });
      expect(stocks[0]!.before).toMatchObject({ productId: pb.id, stock: 5 });
      expect(stocks[0]!.after).toMatchObject({ productId: pb.id, stock: 9 });
    });

    it('uma prévia de reajuste aberta antes da planilha vira 409 BULK_VERSION_CONFLICT (a versão subiu)', async () => {
      const t = tag();
      await importCsv(sheet(`Imp P ${t};${categoryName};;10,00;;;;;;5;IMP-P-${t}`), { mode: 'commit' }).expect(200);
      const p = (await ctx.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.name, `Imp P ${t}`))))[0]!;
      const preview = await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [p.id], dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(200);
      const versions = (preview.body.preview as { productId: string; version: number }[]).map((i) => ({ productId: i.productId, version: i.version }));
      await importCsv(sheet(`Imp P ${t};${categoryName};;12,00;;;;;;5;IMP-P-${t}`), { mode: 'commit', onExisting: 'update' }).expect(200);
      const stale = await ctx.http.post(path('/bulk')).set(as(owner)).set('Idempotency-Key', `imp-stale-${tag()}`).send({ productIds: [p.id], expectedVersions: versions, action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(409);
      expect(stale.body.code).toBe('BULK_VERSION_CONFLICT');
    });

    it('respeita o teto de rascunhos: loja com 100 rascunhos + 1 produto novo = 422 DRAFT_LIMIT_REACHED e nada é criado; atualizar existente continua passando', async () => {
      const { merchant, id } = await freshStore();
      const t = tag();
      await importCsv(sheet(`Existente ${t};${categoryName};;10,00;;;;;;5;EX-${t}`), { mode: 'commit' }, null, merchant, id).expect(200);
      const have = (await ctx.db.select().from(products).where(eq(products.storeId, id))).length;
      await ctx.db.insert(products).values(Array.from({ length: 100 - have }, (_, i) => ({ storeId: id, name: `Rascunho ${i}`, status: 'draft' as const })));
      const before = (await ctx.db.select().from(products).where(eq(products.storeId, id))).length;
      expect(before).toBe(100);

      const full = await importCsv(sheet(`Novo ${t};${categoryName};;10,00;;;;;;5;NV-${t}`, `Existente ${t};${categoryName};;15,00;;;;;;5;EX-${t}`), { mode: 'commit', onExisting: 'update' }, null, merchant, id).expect(422);
      expect(full.body.code).toBe('DRAFT_LIMIT_REACHED');
      expect((await ctx.db.select().from(products).where(eq(products.storeId, id))).length).toBe(100);
      expect((await ctx.db.select().from(products).where(and(eq(products.storeId, id), eq(products.name, `Existente ${t}`))))[0]!.basePriceCents).toBe(1000); // tudo ou nada

      await importCsv(sheet(`Existente ${t};${categoryName};;15,00;;;;;;5;EX-${t}`), { mode: 'commit', onExisting: 'update' }, null, merchant, id).expect(200);
      expect((await ctx.db.select().from(products).where(and(eq(products.storeId, id), eq(products.name, `Existente ${t}`))))[0]!.basePriceCents).toBe(1500);
    });

    it('idempotência transacional: o 422 do teto NÃO fica guardado (liberando vaga, a mesma chave cria); repetir com a mesma chave devolve a mesma resposta sem duplicar; corpo diferente = 422 IDEMPOTENCY_KEY_REUSED', async () => {
      const { merchant, id } = await freshStore();
      await ctx.db.insert(products).values(Array.from({ length: 100 }, (_, i) => ({ storeId: id, name: `Rascunho ${i}`, status: 'draft' as const })));
      const t = tag();
      const body = sheet(`Chave ${t};${categoryName};;10,00;;;;;;5;CH-${t}`);
      const key = `imp-${t}`;
      expect((await importCsv(body, { mode: 'commit' }, key, merchant, id).expect(422)).body.code).toBe('DRAFT_LIMIT_REACHED');
      await ctx.db.delete(products).where(and(eq(products.storeId, id), eq(products.name, 'Rascunho 0')));
      const first = await importCsv(body, { mode: 'commit' }, key, merchant, id).expect(200);
      expect(first.body).toMatchObject({ committed: true, created: 1 });
      const again = await importCsv(body, { mode: 'commit' }, key, merchant, id).expect(200);
      expect(again.body).toEqual(first.body);
      expect((await ctx.db.select().from(products).where(and(eq(products.storeId, id), eq(products.name, `Chave ${t}`))))).toHaveLength(1);
      const reused = await importCsv(sheet(`Outro ${t};${categoryName};;10,00;;;;;;5;OU-${t}`), { mode: 'commit' }, key, merchant, id).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      // o escopo leva o ator: a chave está gravada com loja E usuário
      const saved = await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      expect(saved.map((r) => r.scope)).toEqual([`import:${id}:${merchant.userId}`]);
    });
  });

  describe('SEC-218: ajuste de estoque por delta na idempotência transacional', () => {
    const stockCall = (productId: string, variantId: string, body: Record<string, unknown>, key: string | null) => {
      const req = ctx.http.post(path(`/${productId}/variants/${variantId}/stock`)).set(as(owner));
      return (key ? req.set('Idempotency-Key', key) : req).send(body);
    };
    const stockOf = async (variantId: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId)))[0]!.stock;

    it('falha entre o efeito e a resposta guardada = rollback total (estoque, versão, auditoria) e a chave fica livre; depois a mesma chave soma +5 UMA vez', async () => {
      const { id, variantId } = await draftReady();
      const version = (await row(id)).version;
      const audits = (await trail('product.stock_adjust')).length;
      const key = `sec218-${tag()}`;
      const original = ctx.app.get(IdempotencyService);
      const spy = vi.spyOn(original, 'runInTransaction').mockImplementationOnce(async (scope, k, payload, fn) => {
        return IdempotencyService.prototype.runInTransaction.call(original, scope, k, payload, async (tx) => ({ ...((await fn(tx)) as object), boom: 1n }) as never);
      });
      await stockCall(id, variantId, { delta: 5 }, key).expect(500);
      spy.mockRestore();
      expect(await stockOf(variantId)).toBe(10);
      expect((await row(id)).version).toBe(version);
      expect((await trail('product.stock_adjust')).length).toBe(audits);
      expect((await ctx.db.select().from(idempotencyKeys).where(like(idempotencyKeys.scope, `stock:${storeId}:%`))).filter((r) => r.key === key)).toHaveLength(0);

      const first = await stockCall(id, variantId, { delta: 5 }, key).expect(200);
      expect(await stockOf(variantId)).toBe(15);
      const again = await stockCall(id, variantId, { delta: 5 }, key).expect(200);
      expect(again.body).toEqual(first.body);
      expect(await stockOf(variantId)).toBe(15);
      expect((await row(id)).version).toBe(version + 1);
    });

    it('2 requisições simultâneas com a mesma chave = 1 aplicação; erro de negócio (abaixo do reservado) não fica guardado; corpo diferente com a mesma chave = 422', async () => {
      const { id, variantId } = await draftReady();
      const key = `sec218-${tag()}`;
      const [a, b] = await Promise.all([stockCall(id, variantId, { delta: 3 }, key), stockCall(id, variantId, { delta: 3 }, key)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(await stockOf(variantId)).toBe(13);
      expect((await stockCall(id, variantId, { delta: 4 }, key).expect(422)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');

      await ctx.db.update(productVariants).set({ reserved: 10 }).where(eq(productVariants.id, variantId));
      const k2 = `sec218-${tag()}`;
      expect((await stockCall(id, variantId, { delta: -5 }, k2).expect(409)).body.code).toBe('STOCK_BELOW_RESERVED');
      await ctx.db.update(productVariants).set({ reserved: 0 }).where(eq(productVariants.id, variantId));
      await stockCall(id, variantId, { delta: -5 }, k2).expect(200); // o 409 dependia do estado do mundo: a mesma chave reavalia
      expect(await stockOf(variantId)).toBe(8);
    });

    it('sem a chave continua funcionando (app 1.0); a chave de outro funcionário da mesma loja tem escopo próprio', async () => {
      const { id, variantId } = await draftReady();
      await stockCall(id, variantId, { set: 20 }, null).expect(200);
      expect(await stockOf(variantId)).toBe(20);
      const key = `sec218-${tag()}`;
      await stockCall(id, variantId, { delta: 1 }, key).expect(200);
      const saved = await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key));
      expect(saved.map((r) => r.scope)).toEqual([`stock:${storeId}:${owner.userId}`]);
    });
  });

  describe('SEC-214: quickPublish só serve rascunho', () => {
    const ok = async () => ({ name: 'Nome pelo cadastro rápido', basePriceCents: 4000, categoryId, stock: 3, imageIds: [await uploadReady()] });

    it('produto ativo ou pausado = 409 QUICK_PUBLISH_NOT_APPLICABLE e nada muda (nome, preço, fotos, versão)', async () => {
      const { id } = await draftReady();
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [await uploadReady()] }).expect(200);
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      const before = await row(id);
      const images = await ctx.db.select().from(productImages).where(eq(productImages.productId, id));
      const active = await quickPublish(id, await ok()).expect(409);
      expect(active.body.code).toBe('QUICK_PUBLISH_NOT_APPLICABLE');
      expect(await row(id)).toMatchObject({ name: before.name, basePriceCents: before.basePriceCents, version: before.version, status: 'active' });
      expect(await ctx.db.select().from(productImages).where(eq(productImages.productId, id))).toEqual(images);

      await ctx.http.post(path(`/${id}/pause`)).set(as(owner)).send({}).expect(200);
      expect((await quickPublish(id, await ok()).expect(409)).body.code).toBe('QUICK_PUBLISH_NOT_APPLICABLE');
      expect((await row(id)).status).toBe('paused');
    });

    it('rascunho com promoção: preço normal menor ou igual ao promocional = 422 PROMOTION_INVALID e nada grava', async () => {
      const { id } = await draftReady({ basePriceCents: 5000 });
      await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ promoPriceCents: 4000, promoStartsAt: '2026-01-01T03:00:00.000Z', promoEndsAt: '2099-12-31T23:59:00.000Z' }).expect(200);
      const before = await row(id);
      const res = await quickPublish(id, { ...(await ok()), basePriceCents: 3000 }).expect(422);
      expect(res.body.code).toBe('PROMOTION_INVALID');
      expect(await row(id)).toMatchObject({ status: 'draft', basePriceCents: 5000, version: before.version });
      await quickPublish(id, { ...(await ok()), basePriceCents: 4500 }).expect(200); // promoção válida: passa
    });

    it('estoque menor que o reservado = 409 STOCK_BELOW_RESERVED (antes era 500 do CHECK do banco)', async () => {
      const { id, variantId } = await draftReady();
      await ctx.db.update(productVariants).set({ stock: 10, reserved: 6 }).where(eq(productVariants.id, variantId));
      const res = await quickPublish(id, { ...(await ok()), stock: 2 }).expect(409);
      expect(res.body.code).toBe('STOCK_BELOW_RESERVED');
      expect(await row(id)).toMatchObject({ status: 'draft' });
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId)))[0]).toMatchObject({ stock: 10, reserved: 6 });
    });
  });

  describe('SEC-215: cópia de produto moderado não volta à vitrine', () => {
    const moderate = (id: string, body: Record<string, unknown>) => ctx.http.post(`/v1/admin/products/${id}/moderation`).set(as(ops)).send(body);
    const duplicate = (productId: string) => ctx.http.post(path(`/${productId}/duplicate`)).set(as(owner)).set('Idempotency-Key', `dup-${tag()}`).send({});
    const publishedProduct = async () => {
      const { id } = await draftReady();
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [await uploadReady()] }).expect(200);
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      return id;
    };

    it('duplicar produto REMOVIDO: a cópia nasce pausada pela moderação (com o vínculo), aparece na fila do admin e não publica por nenhuma das duas vias; o admin libera e então publica', async () => {
      const source = await publishedProduct();
      await moderate(source, { action: 'remove', reason: 'Item proibido' }).expect(200);
      const copy = (await duplicate(source).expect(201)).body as { id: string };
      expect(await row(copy.id)).toMatchObject({ status: 'draft', moderationStatus: 'paused', duplicatedFrom: source });
      const events = await ctx.db.select().from(productModerationEvents).where(eq(productModerationEvents.productId, copy.id));
      expect(events).toHaveLength(1);
      expect(events[0]!.reason).toContain(source);

      const queue = await ctx.http.get('/v1/admin/products').set(as(ops)).query({ storeId, moderationStatus: 'paused' }).expect(200);
      expect((queue.body.data as { id: string }[]).map((p) => p.id)).toContain(copy.id);

      await ctx.http.put(path(`/${copy.id}/images`)).set(as(owner)).send({ imageIds: [await uploadReady()] }).expect(200);
      expect((await ctx.http.post(path(`/${copy.id}/publish`)).set(as(owner)).send({}).expect(403)).body.code).toBe('PRODUCT_MODERATED');
      expect((await quickPublish(copy.id, { name: 'Copia', basePriceCents: 4000, categoryId, stock: 1, imageIds: [await uploadReady()] }).expect(403)).body.code).toBe('PRODUCT_MODERATED');
      expect((await row(copy.id)).status).toBe('draft');

      await moderate(copy.id, { action: 'restore' }).expect(200);
      await ctx.http.post(path(`/${copy.id}/publish`)).set(as(owner)).send({}).expect(200);
      expect(await row(copy.id)).toMatchObject({ status: 'active', moderationStatus: 'ok' });
    });

    it('duplicar produto PAUSADO pela moderação também nasce pausado; produto em revisão gera cópia em revisão (a fila do admin não é contornada); produto normal continua nascendo sem estado', async () => {
      const paused = await publishedProduct();
      await moderate(paused, { action: 'pause', reason: 'Foto com marca registrada' }).expect(200);
      const fromPaused = (await duplicate(paused).expect(201)).body as { id: string };
      expect(await row(fromPaused.id)).toMatchObject({ moderationStatus: 'paused', duplicatedFrom: paused });

      const reviewing = await publishedProduct();
      await ctx.db.update(products).set({ moderationStatus: 'review', moderationReason: 'Palavra suspeita: x' }).where(eq(products.id, reviewing));
      const fromReview = (await duplicate(reviewing).expect(201)).body as { id: string };
      expect(await row(fromReview.id)).toMatchObject({ moderationStatus: 'review', duplicatedFrom: reviewing });

      const normal = await publishedProduct();
      const fromNormal = (await duplicate(normal).expect(201)).body as { id: string };
      expect(await row(fromNormal.id)).toMatchObject({ moderationStatus: 'ok', moderationReason: null });
    });

    it('o motivo mostrado ao lojista da cópia não revela texto interno do admin', async () => {
      const source = await publishedProduct();
      await moderate(source, { action: 'remove', reason: 'Segredo interno da análise' }).expect(200);
      const copy = (await duplicate(source).expect(201)).body as { id: string; moderationReason: string | null };
      expect(JSON.stringify(copy)).not.toContain('Segredo interno da análise');
      expect(copy.moderationReason).toBeTruthy();
    });
  });

  describe('limitPct na prévia do reajuste (DEC-126 item 3)', () => {
    it('dryRun de price_adjust devolve limitPct = reajuste_max_pct; as outras ações e a aplicação não precisam dele', async () => {
      const created = await ctx.http.post(path()).set(as(owner)).send({ name: `Limite ${tag()}`, basePriceCents: 10_000 }).expect(201);
      const id = created.body.id as string;
      const dry = await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [id], dryRun: true, action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(200);
      expect(dry.body.limitPct).toBe(30);
      const pause = await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [id], dryRun: true, action: { type: 'pause' } }).expect(200);
      expect(pause.body).not.toHaveProperty('limitPct');
    });
  });
});
