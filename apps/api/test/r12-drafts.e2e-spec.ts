import { and, eq, inArray, sql } from 'drizzle-orm';
import { ProductDraftsService } from '../src/modules/catalog/drafts.service.js';
import { auditLog, categories, moderationTerms, productCreationMetrics, productImages, productVariants, products, mediaAssets } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, jpegBuffer, memoryStorage, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/**
 * v1.1 R1.2 (PRD `v1-1-cadastro-rapido.md`): WB-370 (foto primeiro, `quickPublishProduct`), WB-371 (rascunho), WB-372 (duplicar), WB-376 (lote, lado servidor)
 * e WB-379 (medição). Cada `it` cita o critério de aceite do PRD que prova. Abuso: BK (idempotência), teto sob concorrência (I3), posse (C-CAD-10).
 */
describe('Cadastro rápido: rascunho, publicar em 2 campos, duplicar, lote e medição', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  let otherStoreId: string;
  let categoryId: string;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const key = (label = 'k') => `${label}-${uniqueTag(10)}`;
  const base = (id = storeId) => `/v1/stores/${id}`;
  const draft = (body: Record<string, unknown> = { via: 'camera' }, k: string | null = key('draft'), user: { accessToken: string } = owner, id = storeId) => {
    const req = ctx.http.post(`${base(id)}/product-drafts`).set(as(user));
    return (k ? req.set('Idempotency-Key', k) : req).send(body);
  };
  const batch = (items: Record<string, unknown>[], via = 'paste', k: string | null = key('batch'), user: { accessToken: string } = owner, id = storeId) => {
    const req = ctx.http.post(`${base(id)}/product-drafts/batch`).set(as(user));
    return (k ? req.set('Idempotency-Key', k) : req).send({ via, items });
  };
  const duplicate = (productId: string, k: string | null = key('dup'), user: { accessToken: string } = owner, id = storeId) => {
    const req = ctx.http.post(`${base(id)}/products/${productId}/duplicate`).set(as(user));
    return (k ? req.set('Idempotency-Key', k) : req).send({});
  };
  const publish = (productId: string, body: Record<string, unknown>, opts: { k?: string | null; ifMatch?: string } = {}, user: { accessToken: string } = owner, id = storeId) => {
    let req = ctx.http.post(`${base(id)}/products/${productId}/quick-publish`).set(as(user));
    const k = opts.k === undefined ? key('qp') : opts.k;
    if (k) req = req.set('Idempotency-Key', k);
    if (opts.ifMatch) req = req.set('If-Match', opts.ifMatch);
    return req.send(body);
  };
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!;
  const draftCount = async (id = storeId) => (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.storeId, id), eq(products.status, 'draft'))))[0]!.n;
  const uploadReady = async (user: TestMerchant = owner, id = storeId, buffer?: Buffer) => {
    const up = await uploadFile(ctx, user, { storeId: id, purpose: 'product_image', contentType: 'image/jpeg', body: buffer ?? (await jpegBuffer(900, 700)) });
    return (up.completed!.body as { id: string }).id;
  };
  /** Upload criado e enviado ao storage, mas SEM `complete`: o estado "ainda em segundo plano" do app. */
  const uploadPending = async (user: TestMerchant = owner, id = storeId) => {
    const created = await ctx.http.post('/v1/uploads').set(as(user)).send({ storeId: id, purpose: 'product_image', contentType: 'image/jpeg', sizeBytes: 1000 }).expect(201);
    return { id: (created.body as { id: string }).id, fields: (created.body as { upload: { fields: { key: string } } }).upload.fields };
  };
  /** Cria uma loja nova só para o teste (teto de rascunhos e limites por hora não contaminam os demais). */
  const freshStore = async () => {
    const merchant = await createMerchant(ctx);
    const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Loja ${uniqueTag(5)}` })).id;
    return { merchant, id };
  };
  /** Enche a loja de rascunhos direto no banco (rápido) até `total`. */
  const fillDrafts = async (id: string, total: number) => {
    const have = await draftCount(id);
    if (total <= have) return;
    await ctx.db.insert(products).values(Array.from({ length: total - have }, (_, i) => ({ storeId: id, name: `Rascunho ${i}`, status: 'draft' as const })));
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Rápida' })).id;
    other = await createMerchant(ctx);
    otherStoreId = (await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra Loja Rápida' })).id;
    categoryId = await ensureCategory(ctx);
    [ops, finance, support] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('WB-370: foto primeiro, 2 campos e publicar numa chamada', () => {
    it('C1/C2: o rascunho nasce ANTES da câmera (sem nome, sem preço, só `via`), versão 1, vencimento em 30 dias; sem a Idempotency-Key = 400; mesma chave e corpo = o mesmo rascunho; corpo diferente = 422', async () => {
      const before = await draftCount();
      const k = key('c1');
      const created = await draft({ via: 'camera' }, k).expect(201);
      expect(created.body).toMatchObject({ status: 'draft', name: '', basePriceCents: null, version: 1, via: 'camera' });
      expect(new Date(created.body.draftExpiresAt).getTime() - new Date(created.body.updatedAt).getTime()).toBe(30 * 86_400_000);
      const again = await draft({ via: 'camera' }, k).expect(201);
      expect(again.body.id).toBe(created.body.id);
      expect(await draftCount()).toBe(before + 1);
      expect((await draft({ via: 'form' }, k).expect(422)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
      expect((await draft({ via: 'camera' }, null).expect(400)).body.code).toBe('VALIDATION_FAILED');
      await draft({ via: 'telepatia' }).expect(400);
      await draft({ via: 'camera', extra: 1 }).expect(400); // SEC-022: campo desconhecido
      expect((await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, created.body.id as string)))[0]).toMatchObject({ via: 'camera', storeId, publishedAt: null });
    });

    it('C9/C-CAD-04: categoria proibida recusa com a frase do PRD; preço fora da faixa = 422; controle some do nome; outro lojista = 404; loja não aprovada = 409', async () => {
      const forbidden = await ensureCategory(ctx);
      await ctx.db.insert(moderationTerms).values({ kind: 'forbidden_category', value: forbidden });
      const refused = await draft({ via: 'camera', categoryId: forbidden }).expect(422);
      expect(refused.body).toMatchObject({ code: 'CATEGORY_FORBIDDEN', detail: 'Esse tipo de produto não é permitido no Webag' });
      expect((await draft({ via: 'camera', basePriceCents: 0 }).expect(422)).body.code).toBe('PRICE_OUT_OF_RANGE');
      const clean = await draft({ via: 'form', name: '  Camiseta\u0007  básica\t‮  ' }).expect(201);
      expect(clean.body.name).toBe('Camiseta básica');
      await draft({ via: 'camera' }, key('x'), other, storeId).expect(404);
      const pending = await createMerchant(ctx);
      const pendingStore = (await insertStoreRow(ctx, pending.userId, { status: 'in_review', name: 'Loja em análise' })).id;
      expect((await draft({ via: 'camera' }, key('x'), pending, pendingStore).expect(409)).body.code).toBe('STORE_NOT_APPROVED');
    });

    it('C3 + D16: "publicar em 2 campos" = UMA chamada: produto ATIVO, estoque 1 por padrão, fotos na ordem, versão sobe UMA vez, ETag, auditoria, medição com duração; repetir com a mesma chave devolve o mesmo produto', async () => {
      const created = await draft({ via: 'camera' }).expect(201);
      const id = created.body.id as string;
      const photos = [await uploadReady(), await uploadReady()];
      const k = key('qp');
      const res = await publish(id, { name: 'Camiseta básica preta', basePriceCents: 4990, categoryId, imageIds: photos }, { k, ifMatch: '"1"' }).expect(200);
      expect(res.body).toMatchObject({ id, name: 'Camiseta básica preta', status: 'active', basePriceCents: 4990, categoryId, version: 2, via: 'camera', draftExpiresAt: null });
      expect(res.headers.etag).toBe('"2"');
      expect(res.body.images.map((i: { id: string }) => i.id)).toEqual(photos);
      expect(res.body.variants).toHaveLength(1);
      expect(res.body.variants[0]).toMatchObject({ stock: 1, attributes: {} });
      expect((await row(id)).publishedAt).not.toBeNull();
      const repeat = await publish(id, { name: 'Camiseta básica preta', basePriceCents: 4990, categoryId, imageIds: photos }, { k, ifMatch: '"1"' }).expect(200);
      expect(repeat.body).toEqual(res.body);
      expect((await row(id)).version).toBe(2);
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'product.quick_publish'), eq(auditLog.targetId, id)));
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({ before: { status: 'draft' }, after: { status: 'active', stock: 1 } });
      const metric = (await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, id)))[0]!;
      expect(metric.publishedAt).not.toBeNull();
      expect(metric.firstPhotoAt).not.toBeNull();
      expect(metric).toMatchObject({ photosCount: 2, variationsCount: 1 });
      // resposta perdida: sem a chave guardada, a repetição com o If-Match velho é 409 (o app reconsulta e trata `active` como sucesso)
      const lost = await publish(id, { name: 'Camiseta básica preta', basePriceCents: 4990, categoryId, imageIds: photos }, { ifMatch: '"1"' }).expect(409);
      expect(lost.body.code).toBe('PRODUCT_VERSION_CONFLICT');
      expect(lost.body.current.version).toBe(2);
    });

    it('C6/R6 b: foto ainda em segundo plano = 422 UPLOAD_NOT_READY, NADA gravado e a MESMA chave publica quando a foto termina', async () => {
      const created = await draft({ via: 'camera' }).expect(201);
      const id = created.body.id as string;
      const pending = await uploadPending();
      const k = key('qp');
      const body = { name: 'Bermuda jeans', basePriceCents: 7990, categoryId, imageIds: [pending.id] };
      const notReady = await publish(id, body, { k }).expect(422);
      expect(notReady.body).toMatchObject({ code: 'UPLOAD_NOT_READY', errors: [{ field: 'imageIds', message: pending.id }] });
      expect(await row(id)).toMatchObject({ status: 'draft', name: '', basePriceCents: null, version: 1 });
      expect(await ctx.db.select().from(productImages).where(eq(productImages.productId, id))).toHaveLength(0);
      // a foto termina de subir e o app repete com a mesma chave
      memoryStorage(ctx).upload('private', pending.fields.key, await jpegBuffer(900, 700), 'image/jpeg');
      await ctx.http.post(`/v1/uploads/${pending.id}/complete`).set(as(owner)).send({}).expect(200);
      const done = await publish(id, body, { k }).expect(200);
      expect(done.body.status).toBe('active');
    });

    it('tudo ou nada: preço fora da faixa, categoria proibida, descrição obrigatória (DEC-106) e produto com grade recusam sem mudar o rascunho', async () => {
      const created = await draft({ via: 'camera' }).expect(201);
      const id = created.body.id as string;
      const photo = await uploadReady();
      const ok = { name: 'Perfume amadeirado', basePriceCents: 9900, categoryId, imageIds: [photo] };
      expect((await publish(id, { ...ok, basePriceCents: 10_000_000 }).expect(422)).body.code).toBe('PRICE_OUT_OF_RANGE');
      const forbidden = await ensureCategory(ctx);
      await ctx.db.insert(moderationTerms).values({ kind: 'forbidden_category', value: forbidden });
      expect((await publish(id, { ...ok, categoryId: forbidden }).expect(422)).body.code).toBe('CATEGORY_FORBIDDEN');
      const cosmetics = await ensureCategory(ctx);
      await ctx.db.update(categories).set({ descriptionRequired: true, descriptionMinChars: 20 }).where(eq(categories.id, cosmetics));
      const short = await publish(id, { ...ok, categoryId: cosmetics, description: 'curta' }).expect(422);
      expect(short.body).toMatchObject({ code: 'DESCRIPTION_REQUIRED', errors: [{ field: 'description' }] });
      expect(await row(id)).toMatchObject({ status: 'draft', name: '', basePriceCents: null, version: 1 });
      expect(await ctx.db.select().from(productImages).where(eq(productImages.productId, id))).toHaveLength(0);
      const accepted = await publish(id, { ...ok, categoryId: cosmetics, description: 'Perfume amadeirado de 100 ml, longa duração.' }).expect(200);
      expect(accepted.body.status).toBe('active');
      // C13: a regra é do PRODUTO, vale também no formulário completo (publishProduct) e ao editar o produto ativo
      const form = (await ctx.http.post(`${base()}/products`).set(as(owner)).send({ name: 'Sabonete', categoryId: cosmetics, basePriceCents: 500 }).expect(201)).body as { id: string };
      await ctx.http.put(`${base()}/products/${form.id}/variants`).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 3 }] }).expect(200);
      await ctx.http.put(`${base()}/products/${form.id}/images`).set(as(owner)).send({ imageIds: [await uploadReady()] }).expect(200);
      expect((await ctx.http.post(`${base()}/products/${form.id}/publish`).set(as(owner)).send({}).expect(422)).body.code).toBe('DESCRIPTION_REQUIRED');
      await ctx.http.patch(`${base()}/products/${form.id}`).set(as(owner)).send({ description: 'Sabonete em barra de 90 g, aroma lavanda.' }).expect(200);
      await ctx.http.post(`${base()}/products/${form.id}/publish`).set(as(owner)).send({}).expect(200);
      expect((await ctx.http.patch(`${base()}/products/${form.id}`).set(as(owner)).send({ description: 'curta' }).expect(422)).body.code).toBe('DESCRIPTION_REQUIRED');

      const gridDraft = (await draft({ via: 'form' }).expect(201)).body.id as string;
      await ctx.http.put(`${base()}/products/${gridDraft}/variants`).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'M' }, stock: 1 }] }).expect(200);
      expect((await publish(gridDraft, { ...ok }).expect(422)).body.code).toBe('QUICK_PUBLISH_NOT_APPLICABLE');
    });

    it('posse e permissão: foto de OUTRA loja = 404; produto de outra loja = 404; If-Match velho = 409 sem gravar; produto pausado pela moderação = 403; sem a chave = 400', async () => {
      const created = await draft({ via: 'camera' }).expect(201);
      const id = created.body.id as string;
      const foreign = await uploadReady(other, otherStoreId);
      const body = { name: 'Produto qualquer', basePriceCents: 1000, categoryId, imageIds: [await uploadReady()] };
      await publish(id, { ...body, imageIds: [foreign] }).expect(404);
      await publish(id, body, {}, other, otherStoreId).expect(404);
      expect((await publish(id, body, { ifMatch: '"9"' }).expect(409)).body.code).toBe('PRODUCT_VERSION_CONFLICT');
      await publish(id, body, { k: null }).expect(400);
      await publish(id, { ...body, imageIds: [] }).expect(400);
      await publish(id, { ...body, extra: true }).expect(400);
      await ctx.db.update(products).set({ moderationStatus: 'paused' }).where(eq(products.id, id));
      expect((await publish(id, body).expect(403)).body.code).toBe('PRODUCT_MODERATED');
      expect(await row(id)).toMatchObject({ status: 'draft', version: 1 });
    });

    it('C11/C12 (SEC-195): SVG, HTML com extensão .jpg, PNG de 30 MP e foto acima de 5 MB são recusados com motivo; GPS do EXIF não sobra em NENHUM objeto do storage (variantes e original)', async () => {
      const png = async (w: number, h: number) => (await import('sharp')).default({ create: { width: w, height: h, channels: 3, background: '#fff' } }).png().toBuffer();
      const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>');
      expect((await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/svg+xml', body: svg })).created.status).toBe(422);
      const html = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: Buffer.from('<html><script>alert(1)</script></html>') });
      expect(html.completed!.status).toBe(422);
      expect(html.completed!.body.code).toBe('UPLOAD_REJECTED');
      const huge = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/png', body: await png(6000, 5000) }); // 30 MP
      expect(huge.completed!.status).toBe(422);
      const big = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: Buffer.alloc(5 * 1024 * 1024 + 1, 1), declaredSize: 5 * 1024 * 1024 + 1 });
      expect(big.created.status).toBe(422);

      const sharp = (await import('sharp')).default;
      const withGps = await sharp({ create: { width: 1200, height: 900, channels: 3, background: '#3366cc' } })
        .jpeg()
        .withExif({ IFD0: { Make: 'Marca' }, IFD3: { GPSLatitudeRef: 'S', GPSLatitude: '23/1 16/1 48/1', GPSLongitudeRef: 'W', GPSLongitude: '46/1 44/1 39/1' } })
        .toBuffer();
      expect((await sharp(withGps).metadata()).exif).toBeDefined(); // a isca tem EXIF de verdade
      const up = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: withGps });
      expect(up.completed!.status).toBe(200);
      const asset = (await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.id, (up.completed!.body as { id: string }).id)))[0]!;
      const storage = memoryStorage(ctx);
      const objects = [{ bucket: 'private' as const, key: asset.objectKey }, ...Object.values(asset.variants ?? {}).map((k) => ({ bucket: 'public' as const, key: k }))];
      expect(objects.length).toBeGreaterThanOrEqual(2);
      for (const { bucket, key: objectKey } of objects) {
        const body = await storage.getObject(bucket, objectKey, { maxBytes: 20 * 1024 * 1024 });
        const meta = await sharp(body!).metadata();
        expect(meta.exif, `${bucket}/${objectKey}`).toBeUndefined();
        expect(body!.includes(Buffer.from('Exif'))).toBe(false);
      }
      expect(asset.contentType).toBe('image/webp'); // o original passa a ser a versão recodificada
    });

    it('WB-370 getCatalogQuickStart: categoria sugerida (a última usada), contagem e limite de rascunhos, último rascunho com o que falta e o vencimento, produtos sem descrição, limites; 404 para não-membro', async () => {
      const store = await freshStore();
      const id = store.id;
      const empty = (await ctx.http.get(`${base(id)}/catalog/quick-start`).set(as(store.merchant)).expect(200)).body;
      expect(empty).toMatchObject({ suggestedCategoryId: null, draftCount: 0, draftLimit: 100, latestDraft: null, withoutDescriptionCount: 0, limits: { variantsMax: 100, reajusteMaxPct: 30 } });
      const cat = await ensureCategory(ctx);
      const a = (await draft({ via: 'form', name: 'Primeiro', categoryId: cat }, key('q'), store.merchant, id).expect(201)).body as { id: string };
      await ctx.db.update(products).set({ description: null }).where(eq(products.id, a.id));
      const latest = (await draft({ via: 'camera' }, key('q'), store.merchant, id).expect(201)).body as { id: string };
      const start = (await ctx.http.get(`${base(id)}/catalog/quick-start`).set(as(store.merchant)).expect(200)).body;
      expect(start).toMatchObject({ suggestedCategoryId: cat, draftCount: 2, latestDraft: { id: latest.id, name: '', missing: ['name', 'price', 'photo', 'category', 'stock'], expiresInDays: 30, version: 1, via: 'camera' } });
      await ctx.http.get(`${base(id)}/catalog/quick-start`).set(as(other)).expect(404);
    });
  });

  describe('WB-371: rascunho, teto de 100, vencimento e conflito de versão', () => {
    it('C1/C6: a lista de rascunhos traz o que falta e o vencimento, paginada por cursor, e só da loja; o produto ativo não entra', async () => {
      const store = await freshStore();
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) ids.push(((await draft({ via: 'form', name: `Rascunho ${i}`, basePriceCents: 1000 }, key('l'), store.merchant, store.id).expect(201)).body as { id: string }).id);
      const page1 = (await ctx.http.get(`${base(store.id)}/product-drafts?limit=2`).set(as(store.merchant)).expect(200)).body;
      expect(page1).toMatchObject({ count: 3, limit: 100 });
      expect(page1.data).toHaveLength(2);
      expect(page1.data[0].id).toBe(ids[2]); // o mais recente primeiro
      expect(page1.data[0]).toMatchObject({ name: 'Rascunho 2', basePriceCents: 1000, missing: ['photo', 'category', 'stock'], expiresInDays: 30 });
      const page2 = (await ctx.http.get(`${base(store.id)}/product-drafts?limit=2&cursor=${page1.nextCursor}`).set(as(store.merchant)).expect(200)).body;
      expect(page2.data.map((d: { id: string }) => d.id)).toEqual([ids[0]]);
      expect(page2.nextCursor).toBeNull();
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, ids[0]!));
      expect((await ctx.http.get(`${base(store.id)}/product-drafts`).set(as(store.merchant)).expect(200)).body.count).toBe(2);
      await ctx.http.get(`${base(store.id)}/product-drafts`).set(as(other)).expect(404);
      await ctx.http.get(`${base(store.id)}/product-drafts?limit=500`).set(as(store.merchant)).expect(400);
    });

    it('C2/DEC-118: com 100 rascunhos o 101º é 422 DRAFT_LIMIT_REACHED com limit, draftCount e slotsAvailable; vale para createProduct (v1.0), createProductDraft e duplicar', async () => {
      const store = await freshStore();
      await fillDrafts(store.id, 99);
      await draft({ via: 'camera' }, key('t'), store.merchant, store.id).expect(201); // o 100º cabe
      const full = await draft({ via: 'camera' }, key('t'), store.merchant, store.id).expect(422);
      expect(full.body).toMatchObject({ code: 'DRAFT_LIMIT_REACHED', limit: 100, draftCount: 100, slotsAvailable: 0 });
      expect(full.body.detail).toContain('Limite de 100 rascunhos');
      const viaForm = await ctx.http.post(`${base(store.id)}/products`).set(as(store.merchant)).send({ name: 'Mais um' }).expect(422);
      expect(viaForm.body.code).toBe('DRAFT_LIMIT_REACHED');
      const source = (await ctx.db.select().from(products).where(eq(products.storeId, store.id)).limit(1))[0]!;
      expect((await duplicate(source.id, key('d'), store.merchant, store.id).expect(422)).body.code).toBe('DRAFT_LIMIT_REACHED');
      expect(await draftCount(store.id)).toBe(100);
    });

    it('I3: 5 criações simultâneas com 98 rascunhos passam EXATAMENTE 2 (o teto vale sob concorrência, sob o lock da loja)', async () => {
      const store = await freshStore();
      await fillDrafts(store.id, 98);
      const results = await Promise.all(Array.from({ length: 5 }, () => draft({ via: 'camera' }, key('conc'), store.merchant, store.id)));
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 422)).toHaveLength(3);
      expect(await draftCount(store.id)).toBe(100);
    });

    it('C3: aos 27 dias avisa (expiresInDays = 3); aos 30 dias sem alteração o rascunho é apagado (com variações, fotos e medição); o alterado e o ativo ficam', async () => {
      const store = await freshStore();
      const old = ((await draft({ via: 'form', name: 'Velho' }, key('e'), store.merchant, store.id).expect(201)).body as { id: string }).id;
      const warn = ((await draft({ via: 'form', name: 'Quase' }, key('e'), store.merchant, store.id).expect(201)).body as { id: string }).id;
      const live = ((await draft({ via: 'form', name: 'Ativo antigo' }, key('e'), store.merchant, store.id).expect(201)).body as { id: string }).id;
      await ctx.db.insert(productVariants).values({ productId: old, storeId: store.id, attributes: {}, attributesKey: '', stock: 1 });
      const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000 - 60_000);
      await ctx.db.update(products).set({ updatedAt: daysAgo(31) }).where(eq(products.id, old));
      await ctx.db.update(products).set({ updatedAt: daysAgo(27) }).where(eq(products.id, warn));
      await ctx.db.update(products).set({ updatedAt: daysAgo(90), status: 'active' }).where(eq(products.id, live));
      const list = (await ctx.http.get(`${base(store.id)}/product-drafts`).set(as(store.merchant)).expect(200)).body;
      expect(list.data.find((d: { id: string }) => d.id === warn).expiresInDays).toBe(3); // 27 dias e 1 min parado: "será apagado em 3 dias"
      expect(list.data.find((d: { id: string }) => d.id === old).expiresInDays).toBe(0);
      const removed = await ctx.app.get(ProductDraftsService).sweepExpired();
      expect(removed).toBeGreaterThanOrEqual(1);
      expect(await ctx.db.select().from(products).where(eq(products.id, old))).toHaveLength(0);
      expect(await ctx.db.select().from(productVariants).where(eq(productVariants.productId, old))).toHaveLength(0);
      expect(await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, old))).toHaveLength(0);
      expect(await ctx.db.select().from(products).where(inArray(products.id, [warn, live]))).toHaveLength(2);
    });

    it('C4/C5: o mesmo rascunho em 2 aparelhos: o 2º salvar recebe 409 com a versão atual; publicar rascunho sem foto = "Falta a foto" e nada se perde', async () => {
      const created = (await draft({ via: 'camera' }).expect(201)).body as { id: string; version: number };
      await ctx.http.patch(`${base()}/products/${created.id}`).set(as(owner)).set('If-Match', '"1"').send({ name: 'Do aparelho A' }).expect(200);
      const stale = await ctx.http.patch(`${base()}/products/${created.id}`).set(as(owner)).set('If-Match', '"1"').send({ name: 'Do aparelho B' }).expect(409);
      expect(stale.body).toMatchObject({ code: 'PRODUCT_VERSION_CONFLICT', current: { version: 2 } });
      expect((await row(created.id)).name).toBe('Do aparelho A');

      await ctx.http.patch(`${base()}/products/${created.id}`).set(as(owner)).send({ categoryId, basePriceCents: 3000 }).expect(200);
      await ctx.http.put(`${base()}/products/${created.id}/variants`).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 2 }] }).expect(200);
      const incomplete = await ctx.http.post(`${base()}/products/${created.id}/publish`).set(as(owner)).send({}).expect(422);
      expect(incomplete.body).toMatchObject({ code: 'PRODUCT_INCOMPLETE', errors: [{ field: 'imageIds', message: 'Envie ao menos 1 foto.' }] });
      expect(await row(created.id)).toMatchObject({ name: 'Do aparelho A', basePriceCents: 3000, status: 'draft' });
    });
  });

  describe('WB-372: duplicar', () => {
    it('C1/C2/C3/C5: copia nome com " (cópia)", categoria, descrição, preço e variações; NÃO copia fotos, SKU nem promoção; estoque 1 por variação (0 em grade); nasce rascunho `via: duplicate` e o histórico registra "duplicado de <id>"', async () => {
      const src = (await ctx.http.post(`${base()}/products`).set(as(owner)).send({ name: 'Camiseta básica', description: 'Algodão', categoryId, basePriceCents: 4990 }).expect(201)).body as { id: string };
      await ctx.http.patch(`${base()}/products/${src.id}`).set(as(owner)).send({ promoPriceCents: 3990, promoStartsAt: new Date(Date.now() - 1000).toISOString(), promoEndsAt: new Date(Date.now() + 86_400_000).toISOString() }).expect(200);
      await ctx.http.put(`${base()}/products/${src.id}/variants`).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 7, sku: `SKU-${uniqueTag(5)}` }, { attributes: { Tamanho: 'G' }, stock: 5, priceCents: 5990 }] }).expect(200);
      await ctx.http.put(`${base()}/products/${src.id}/images`).set(as(owner)).send({ imageIds: [await uploadReady()] }).expect(200);

      const k = key('dup');
      const copy = (await duplicate(src.id, k).expect(201)).body;
      expect(copy).toMatchObject({ name: 'Camiseta básica (cópia)', description: 'Algodão', categoryId, basePriceCents: 4990, status: 'draft', via: 'duplicate', variantAttributes: ['Tamanho'], images: [], promotion: { priceCents: null, active: false } });
      const byTamanho = (a: { attributes: { Tamanho: string } }, b: { attributes: { Tamanho: string } }) => (a.attributes.Tamanho < b.attributes.Tamanho ? -1 : 1); // G antes de P: a ordem das variações criadas na mesma transação não é garantida
      expect([...copy.variants].sort(byTamanho).map((v: { attributes: unknown; sku: unknown; stock: number; priceCents: number | null }) => [v.attributes, v.sku, v.stock, v.priceCents])).toEqual([
        [{ Tamanho: 'G' }, null, 0, 5990],
        [{ Tamanho: 'P' }, null, 0, null],
      ]);
      expect((await duplicate(src.id, k).expect(201)).body.id).toBe(copy.id); // repetir com a mesma chave
      expect((await row(copy.id as string)).duplicatedFrom).toBe(src.id);
      const history = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'product.duplicate'), eq(auditLog.targetId, copy.id as string)));
      expect(history).toHaveLength(1);
      expect(history[0]!.after).toMatchObject({ duplicatedFrom: src.id });

      // sem grade: 1 por variação
      const plain = (await ctx.http.post(`${base()}/products`).set(as(owner)).send({ name: 'Caneca', categoryId, basePriceCents: 2000 }).expect(201)).body as { id: string };
      await ctx.http.put(`${base()}/products/${plain.id}/variants`).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 12 }] }).expect(200);
      expect((await duplicate(plain.id).expect(201)).body.variants[0]).toMatchObject({ stock: 1 });
    });

    it('C4: duplicar produto ARQUIVADO ou pausado pela moderação gera cópia nova, sem herdar o estado; C6 (C-CAD-10): produto de outra loja = 404 igual a inexistente; sem a chave = 400', async () => {
      const src = (await ctx.http.post(`${base()}/products`).set(as(owner)).send({ name: 'Moderado', categoryId, basePriceCents: 2000 }).expect(201)).body as { id: string };
      await ctx.db.update(products).set({ moderationStatus: 'paused', moderationReason: 'x', status: 'archived' }).where(eq(products.id, src.id));
      const copy = (await duplicate(src.id).expect(201)).body;
      expect(copy).toMatchObject({ status: 'draft', moderationStatus: 'ok' });
      const foreign = (await ctx.http.post(`${base(otherStoreId)}/products`).set(as(other)).send({ name: 'Do vizinho' }).expect(201)).body as { id: string };
      const refused = await duplicate(foreign.id).expect(404);
      const missing = await duplicate('3f2b8c1e-5d44-4a0b-9d7a-0a6f1f9b2c11').expect(404);
      expect(refused.body).toMatchObject({ status: 404, code: 'NOT_FOUND' });
      expect(refused.body.detail).toBe(missing.body.detail); // não revela que o produto existe
      await duplicate(src.id, null).expect(400);
      await duplicate(src.id, key('d'), other, storeId).expect(404);
    });
  });

  describe('WB-376 (lado servidor): lote de rascunhos do texto colado', () => {
    it('C1/C4/C5/C8: cria rascunhos com variações juntadas, linha ruim vai em `rejected` e as boas são criadas; fórmula e HTML entram como texto puro e literal; reenviar devolve o mesmo resultado', async () => {
      const store = await freshStore();
      const items = [
        { clientRef: '1', name: 'Bermuda jeans', basePriceCents: 7990, quantity: 4 },
        { clientRef: '2', name: 'Camiseta básica', variantAttributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 2, priceCents: 4990 }, { attributes: { Tamanho: 'G' }, stock: 3, priceCents: 5990 }], basePriceCents: 4990 },
        { clientRef: '3', name: 'Sem preço' },
        { clientRef: '4', name: '=HYPERLINK("http://x")', basePriceCents: 100 },
        { clientRef: '5', name: '<script>alert(1)</script>', basePriceCents: 100 },
        { clientRef: '6', name: '   \u0000\u0007  ' },
        { clientRef: '7', name: 'x'.repeat(81), basePriceCents: 100 },
        { clientRef: '8', name: 'Preço absurdo', basePriceCents: 10_000_000 },
        { clientRef: '9', name: 'Estoque absurdo', quantity: 100_000 },
        { clientRef: '10', name: 'Grade repetida', variantAttributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'M' }, stock: 1 }, { attributes: { Tamanho: 'M' }, stock: 1 }] },
      ];
      const k = key('b');
      const res = await batch(items, 'paste', k, store.merchant, store.id).expect(201);
      expect(res.body.created.map((c: { clientRef: string }) => c.clientRef)).toEqual(['1', '2', '3', '4', '5']);
      expect(res.body.rejected.map((r: { clientRef: string; code: string }) => [r.clientRef, r.code])).toEqual([
        ['6', 'NAME_REQUIRED'],
        ['7', 'NAME_TOO_LONG'],
        ['8', 'PRICE_OUT_OF_RANGE'],
        ['9', 'QUANTITY_OUT_OF_RANGE'],
        ['10', 'VARIANTS_INVALID'],
      ]);
      expect(res.body.created[0]).toMatchObject({ missing: ['photo', 'category'] });
      expect(res.body.created[2].missing).toEqual(['photo', 'price', 'category']);
      const stored = await ctx.db.select().from(products).where(eq(products.storeId, store.id));
      expect(stored).toHaveLength(5);
      expect(stored.every((p) => p.status === 'draft' && p.via === 'paste')).toBe(true);
      expect(stored.map((p) => p.name)).toContain('=HYPERLINK("http://x")'); // literal: nada o interpreta
      expect(stored.map((p) => p.name)).toContain('<script>alert(1)</script>');
      const bermuda = stored.find((p) => p.name === 'Bermuda jeans')!;
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.productId, bermuda.id)))[0]).toMatchObject({ stock: 4, attributes: {} });
      const camiseta = stored.find((p) => p.name === 'Camiseta básica')!;
      expect(camiseta.variantAttributes).toEqual(['Tamanho']);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.productId, camiseta.id))).map((v) => [v.attributes, v.priceCents, v.stock]).sort((a, b) => (a[2] as number) - (b[2] as number))).toEqual([[{ Tamanho: 'P' }, 4990, 2], [{ Tamanho: 'G' }, 5990, 3]]);
      expect((await batch(items, 'paste', k, store.merchant, store.id).expect(201)).body).toEqual(res.body);
      expect(await draftCount(store.id)).toBe(5);
      expect((await batch(items.slice(0, 2), 'paste', k, store.merchant, store.id).expect(422)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('C3: 101 linhas = 400; clientRef repetido = 400; sem a chave = 400; campo desconhecido = 400; outra loja = 404; via inválida = 400', async () => {
      const store = await freshStore();
      const many = Array.from({ length: 101 }, (_, i) => ({ clientRef: String(i), name: `Item ${i}` }));
      await batch(many, 'paste', key('b'), store.merchant, store.id).expect(400);
      await batch([{ clientRef: 'a', name: 'A' }, { clientRef: 'a', name: 'B' }], 'paste', key('b'), store.merchant, store.id).expect(400);
      await batch([{ clientRef: 'a', name: 'A' }], 'paste', null, store.merchant, store.id).expect(400);
      await batch([{ clientRef: 'a', name: 'A', preco: 1 }], 'paste', key('b'), store.merchant, store.id).expect(400);
      await batch([{ clientRef: 'a', name: 'A' }], 'camera', key('b'), store.merchant, store.id).expect(400);
      await batch([{ clientRef: 'a', name: 'A' }], 'paste', key('b'), other, store.id).expect(404);
      await batch([], 'paste', key('b'), store.merchant, store.id).expect(400);
      expect(await draftCount(store.id)).toBe(0);
    });

    it('DEC-118: o lote é ATÔMICO quanto ao teto: 99 rascunhos + 2 itens = 422 com slotsAvailable 1 e NADA criado; "criar os N que cabem" com outra chave funciona; 100 linhas numa loja vazia cabem', async () => {
      const store = await freshStore();
      await fillDrafts(store.id, 99);
      const items = [{ clientRef: 'a', name: 'A' }, { clientRef: 'b', name: 'B' }];
      const refused = await batch(items, 'paste', key('b'), store.merchant, store.id).expect(422);
      expect(refused.body).toMatchObject({ code: 'DRAFT_LIMIT_REACHED', limit: 100, draftCount: 99, slotsAvailable: 1 });
      expect(await draftCount(store.id)).toBe(99);
      expect((await batch(items.slice(0, 1), 'paste', key('b'), store.merchant, store.id).expect(201)).body.created).toHaveLength(1);

      const empty = await freshStore();
      const hundred = Array.from({ length: 100 }, (_, i) => ({ clientRef: String(i), name: `Linha ${i}`, basePriceCents: 100 + i }));
      expect((await batch(hundred, 'spreadsheet', key('b'), empty.merchant, empty.id).expect(201)).body.created).toHaveLength(100);
      expect(await draftCount(empty.id)).toBe(100);
    });

    it('I3: 2 lotes de 60 simultâneos numa loja vazia: só 1 cabe (60 + 60 > 100) e o teto nunca é furado', async () => {
      const store = await freshStore();
      const lot = (tag: string) => Array.from({ length: 60 }, (_, i) => ({ clientRef: `${tag}${i}`, name: `Item ${tag}${i}` }));
      const results = await Promise.all([batch(lot('a'), 'paste', key('b'), store.merchant, store.id), batch(lot('b'), 'paste', key('b'), store.merchant, store.id)]);
      expect(results.map((r) => r.status).sort()).toEqual([201, 422]);
      expect(await draftCount(store.id)).toBe(60);
    });

    it('limite de 10 lotes por hora por loja: o 11º é 429', async () => {
      const store = await freshStore();
      for (let i = 0; i < 10; i += 1) await batch([{ clientRef: 'a', name: `Lote ${i}` }], 'paste', key('b'), store.merchant, store.id).expect(201);
      const limited = await batch([{ clientRef: 'a', name: 'Lote 11' }], 'paste', key('b'), store.merchant, store.id).expect(429);
      expect(limited.body.code).toBe('RATE_LIMITED');
    });
  });

  describe('WB-379: medição do tempo de cadastro (C1, C2)', () => {
    /** Insere `n` produtos publicados na loja, com a duração em segundos de cada um, direto no banco. */
    const seedMetrics = async (id: string, via: 'camera' | 'paste', seconds: number[]) => {
      for (const duration of seconds) {
        const [product] = await ctx.db.insert(products).values({ storeId: id, name: `Medido ${duration}`, status: 'active' }).returning({ id: products.id });
        const startedAt = new Date(Date.now() - 3_600_000);
        await ctx.db.insert(productCreationMetrics).values({ storeId: id, productId: product!.id, via, startedAt, publishedAt: new Date(startedAt.getTime() + duration * 1000), photosCount: 1, variationsCount: 1 });
      }
    };

    it('C2: mediana e p90 por `via` só do cadastro contínuo (publicado até 15 min depois do início); o interrompido fica fora e é contado; grupo com menos de 5 cadastros não devolve percentil', async () => {
      const store = await freshStore();
      await seedMetrics(store.id, 'camera', [30, 40, 50, 60, 70, 80, 20 * 60]); // o de 20 min é "interrompido"
      await seedMetrics(store.id, 'paste', [100, 120, 140]);
      const res = await ctx.http.get(`/v1/admin/metrics/product-creation?days=30&storeId=${store.id}`).set(as(ops)).expect(200);
      expect(res.body).toMatchObject({ days: 30, groupBy: 'via', minSample: 5, nextCursor: null });
      const byKey = Object.fromEntries((res.body.rows as { key: string }[]).map((r) => [r.key, r]));
      expect(byKey.camera).toMatchObject({ n: 6, interrupted: 1, insufficient: false, medianSeconds: 55, p90Seconds: 75 });
      expect(byKey.paste).toMatchObject({ n: 3, interrupted: 0, insufficient: true, medianSeconds: null, p90Seconds: null });
      const perStore = await ctx.http.get(`/v1/admin/metrics/product-creation?groupBy=store&storeId=${store.id}`).set(as(finance)).expect(200);
      expect(perStore.body.rows).toHaveLength(1);
      expect(perStore.body.rows[0]).toMatchObject({ key: store.id, n: 9 });
      // sem texto de produto na resposta
      expect(JSON.stringify(res.body)).not.toContain('Medido');
    });

    it('permissão e validação: suporte e lojista = 403; `days` fora de 7/30/90 e campo desconhecido = 400; sem login = 401', async () => {
      await ctx.http.get('/v1/admin/metrics/product-creation').set(as(support)).expect(403);
      await ctx.http.get('/v1/admin/metrics/product-creation').set(as(owner)).expect(403);
      await ctx.http.get('/v1/admin/metrics/product-creation?days=15').set(as(ops)).expect(400);
      await ctx.http.get('/v1/admin/metrics/product-creation?foo=1').set(as(ops)).expect(400);
      await ctx.http.get('/v1/admin/metrics/product-creation').expect(401);
    });

    it('C1: o servidor grava início (rascunho), 1ª foto (`photo_captured`) e publicação com duração e contagens, por via, em `product_create_published`', async () => {
      const store = await freshStore();
      const created = (await draft({ via: 'camera' }, key('m'), store.merchant, store.id).expect(201)).body as { id: string };
      const started = (await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, created.id)))[0]!;
      expect(started).toMatchObject({ via: 'camera', firstPhotoAt: null, publishedAt: null });
      const photo = await uploadReady(store.merchant, store.id);
      await publish(created.id, { name: 'Medido pela câmera', basePriceCents: 1500, categoryId, imageIds: [photo] }, {}, store.merchant, store.id).expect(200);
      const done = (await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, created.id)))[0]!;
      expect(done.firstPhotoAt).not.toBeNull();
      expect(done.publishedAt!.getTime()).toBeGreaterThanOrEqual(done.startedAt.getTime());
      expect(done).toMatchObject({ photosCount: 1, variationsCount: 1 });
    });
  });
});
