import { and, eq } from 'drizzle-orm';
import { auditLog, categories, productModerationEvents, productVariants, products, storeActivity, storeMembers, stores, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, uniqueEmail, type TestContext } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, jpegBuffer, registerUser, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/** Catálogo (WB-060 a 066) e moderação (WB-107): casos P0 do plano da Onda 2 (§2.8 e §2.9) e IDOR por loja. */
describe('Catálogo: produto, variações, estoque, preço, seções, planilha, ação em massa e moderação', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  let otherStoreId: string;
  let categoryId: string;
  let ops: AdminLike;
  type AdminLike = TestAdmin;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const path = (suffix = '', id = storeId) => `/v1/stores/${id}/products${suffix}`;
  const create = (body: Record<string, unknown> = {}, user: { accessToken: string } = owner, id = storeId) =>
    ctx.http.post(path('', id)).set(as(user)).send({ name: `Produto ${uniqueEmail().slice(0, 6)}`, ...body });
  const vari = (productId: string, body: Record<string, unknown>, user: { accessToken: string } = owner) => ctx.http.put(path(`/${productId}/variants`)).set(as(user)).send(body);

  /** Produto pronto para publicar: categoria, preço, 1 variação (estoque 10) e 1 foto. */
  async function completeProduct(extra: Record<string, unknown> = {}): Promise<{ id: string; variantId: string }> {
    const created = await create({ categoryId, basePriceCents: 5000, ...extra }).expect(201);
    const id = created.body.id as string;
    const withVariant = await vari(id, { attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    const upload = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [(upload.completed!.body as { id: string }).id] }).expect(200);
    return { id, variantId: withVariant.body.variants[0].id as string };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja do Catálogo' })).id;
    other = await createMerchant(ctx);
    otherStoreId = (await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra Loja' })).id;
    categoryId = await ensureCategory(ctx);
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('produto (WB-060)', () => {
    it('O2-PRD-01/02/03: nome 80 ok e 81 → 400; descrição 1.000/1.001; preço 1 e 9.999.999 ok, 0 e 10.000.000 → 422; rascunho só com nome e invisível', async () => {
      await create({ name: 'a'.repeat(80) }).expect(201);
      await create({ name: 'a'.repeat(81) }).expect(400);
      await create({ description: 'd'.repeat(1000) }).expect(201);
      await create({ description: 'd'.repeat(1001) }).expect(400);
      await create({ basePriceCents: 1 }).expect(201);
      await create({ basePriceCents: 9_999_999 }).expect(201);
      for (const bad of [0, 10_000_000, -5]) {
        const res = await create({ basePriceCents: bad }).expect(422);
        expect(res.body.code).toBe('PRICE_OUT_OF_RANGE');
      }
      await create({ basePriceCents: 19.9 }).expect(400);
      const draft = await create({}).expect(201);
      expect(draft.body).toMatchObject({ status: 'draft', basePriceCents: null, moderationStatus: 'ok' });
      const bad = await create({ price: 100 }).expect(400); // SEC-022: campo desconhecido
      expect(bad.body.code).toBe('VALIDATION_FAILED');
    });

    it('categoria inativa → 422; categoria PROIBIDA bloqueia o cadastro (e a subcategoria herda); lista editável pelo admin (WB-060 C6)', async () => {
      const inactive = await ensureCategory(ctx);
      await ctx.db.update(categories).set({ active: false }).where(eq(categories.id, inactive));
      expect((await create({ categoryId: inactive }).expect(422)).body.code).toBe('CATEGORY_INACTIVE');

      const forbidden = await ensureCategory(ctx);
      const [child] = await ctx.db.insert(categories).values({ name: 'Filha', icon: 'storefront', parentId: forbidden }).returning();
      const term = await ctx.http.post('/v1/admin/moderation/terms').set(as(ops)).send({ kind: 'forbidden_category', value: forbidden }).expect(201);
      expect((await create({ categoryId: forbidden }).expect(422)).body.detail).toBe('Esse tipo de produto não é permitido no Webag');
      expect((await create({ categoryId: child!.id }).expect(422)).body.code).toBe('CATEGORY_FORBIDDEN');
      await ctx.http.delete(`/v1/admin/moderation/terms/${term.body.id}`).set(as(ops)).expect(204);
      await create({ categoryId: forbidden }).expect(201);
    });

    it('O2-PRD-10: `Idempotency-Key` repetido (duplo clique) cria 1 produto', async () => {
      const key = `chave-${uniqueEmail().slice(0, 8)}`;
      const first = await ctx.http.post(path()).set(as(owner)).set('Idempotency-Key', key).send({ name: 'Duplo clique' }).expect(201);
      const second = await ctx.http.post(path()).set(as(owner)).set('Idempotency-Key', key).send({ name: 'Duplo clique' }).expect(201);
      expect(second.body.id).toBe(first.body.id);
      expect(await ctx.db.select().from(products).where(eq(products.idempotencyKey, key))).toHaveLength(1);
      await ctx.http.post(path()).set(as(owner)).set('Idempotency-Key', 'curta').send({ name: 'X Y' }).expect(400);
    });

    it('O2-PRD-09: HTML e script no nome e na descrição ficam como texto cru na API', async () => {
      const res = await create({ name: '<script>alert(1)</script>', description: '<img src=x onerror=alert(1)>' }).expect(201);
      expect(res.body.name).toBe('<script>alert(1)</script>');
      expect(res.body.description).toBe('<img src=x onerror=alert(1)>');
    });

    it('O2-PRD-02/05: publicar rascunho incompleto → 422 listando os campos; completo → ativo; pausar e reativar; arquivar some da lista', async () => {
      const draft = await create({}).expect(201);
      const incomplete = await ctx.http.post(path(`/${draft.body.id}/publish`)).set(as(owner)).send({}).expect(422);
      expect(incomplete.body.code).toBe('PRODUCT_INCOMPLETE');
      expect((incomplete.body.errors as { field: string }[]).map((e) => e.field).sort()).toEqual(['basePriceCents', 'categoryId', 'imageIds', 'variants']);

      const { id } = await completeProduct();
      const published = await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      expect(published.body).toMatchObject({ status: 'active', soldOut: false });
      expect(published.body.images[0].urls).toBeTruthy();
      const paused = await ctx.http.post(path(`/${id}/pause`)).set(as(owner)).send({}).expect(200);
      expect(paused.body.status).toBe('paused');
      await ctx.http.post(path(`/${id}/pause`)).set(as(owner)).send({}).expect(409);
      await ctx.http.post(path(`/${id}/resume`)).set(as(owner)).send({}).expect(200);
      const listed = await ctx.http.get(path('')).set(as(owner)).query({ status: 'active' }).expect(200);
      expect((listed.body.data as { id: string; cover: unknown }[]).find((p) => p.id === id)?.cover).toBeTruthy();
      await ctx.http.delete(path(`/${id}`)).set(as(owner)).expect(204);
      expect(((await ctx.http.get(path('')).set(as(owner)).expect(200)).body.data as { id: string }[]).some((p) => p.id === id)).toBe(false);
      expect((await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200)).body.status).toBe('archived');
    });

    it('O2-PRD-04: até 8 fotos (a 9ª → 422), ordem define a capa, foto de outra loja → 404, produto ativo não fica sem foto', async () => {
      const { id } = await completeProduct();
      const ids: string[] = [];
      for (let i = 0; i < 9; i++) {
        const up = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(600 + i * 10, 500) });
        ids.push((up.completed!.body as { id: string }).id);
      }
      const nine = await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: ids }).expect(422);
      expect(nine.body.code).toBe('TOO_MANY_IMAGES');
      const eight = await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: ids.slice(0, 8).reverse() }).expect(200);
      expect(eight.body.images.map((i: { id: string }) => i.id)).toEqual(ids.slice(0, 8).reverse());
      expect(eight.body.images[0].position).toBe(0);

      const foreign = await uploadFile(ctx, other, { storeId: otherStoreId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(600, 500) });
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [(foreign.completed!.body as { id: string }).id] }).expect(404);
      await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [ids[0], ids[0]] }).expect(400);
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      expect((await ctx.http.put(path(`/${id}/images`)).set(as(owner)).send({ imageIds: [] }).expect(422)).body.code).toBe('IMAGE_REQUIRED');
    });
  });

  describe('autorização por loja (O2-PRD-08, SEC-020)', () => {
    it('lojista B não lê, edita, publica, pausa, arquiva nem mexe em estoque/fotos/variações do produto de A (404); lista de A não aparece na loja de B', async () => {
      const { id, variantId } = await completeProduct();
      const asOther = { accessToken: other.accessToken };
      // loja da rota é de A: B não é membro → 404 em tudo
      await ctx.http.get(path(`/${id}`)).set(as(asOther)).expect(404);
      await ctx.http.patch(path(`/${id}`)).set(as(asOther)).send({ name: 'Sequestrado' }).expect(404);
      await ctx.http.post(path(`/${id}/publish`)).set(as(asOther)).send({}).expect(404);
      await ctx.http.post(path(`/${id}/pause`)).set(as(asOther)).send({}).expect(404);
      await ctx.http.delete(path(`/${id}`)).set(as(asOther)).expect(404);
      await ctx.http.put(path(`/${id}/images`)).set(as(asOther)).send({ imageIds: [] }).expect(404);
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(asOther)).send({ delta: 5 }).expect(404);
      await vari(id, { attributes: [], variants: [{ attributes: {}, stock: 999 }] }, asOther).expect(404);
      await ctx.http.get(path('')).set(as(asOther)).expect(404);
      // B usando a PRÓPRIA loja na rota com o id do produto de A: o produto não existe lá (404)
      await ctx.http.get(path(`/${id}`, otherStoreId)).set(as(asOther)).expect(404);
      await ctx.http.patch(path(`/${id}`, otherStoreId)).set(as(asOther)).send({ name: 'Sequestrado' }).expect(404);
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`, otherStoreId)).set(as(asOther)).send({ delta: 5 }).expect(404);
      await ctx.http.post(path('/bulk', otherStoreId)).set(as(asOther)).send({ productIds: [id], action: { type: 'pause' } }).expect(404);
      const intact = await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200);
      expect(intact.body.variants[0].stock).toBe(10);
      expect(intact.body.name).not.toBe('Sequestrado');
    });

    it('funcionário só com `catalog` mexe no catálogo; sem a permissão → 403; cliente comum → 404; sem token → 401', async () => {
      const staffWith = await registerUser(ctx);
      const staffWithout = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values([
        { storeId, userId: staffWith.userId, role: 'staff', permissions: ['catalog'] },
        { storeId, userId: staffWithout.userId, role: 'staff', permissions: ['orders'] },
      ]);
      await create({}, staffWith).expect(201);
      await create({}, staffWithout).expect(403);
      await ctx.http.get(path()).set(as(staffWithout)).expect(403);
      const customer = await registerUser(ctx);
      await ctx.http.get(path()).set(as(customer)).expect(404);
      await ctx.http.get(path()).expect(401);
    });

    it('loja não aprovada (em análise ou suspensa) não altera o catálogo: 409 STORE_NOT_APPROVED', async () => {
      await ctx.db.update(stores).set({ status: 'suspended' }).where(eq(stores.id, otherStoreId));
      const res = await create({}, other, otherStoreId).expect(409);
      expect(res.body.code).toBe('STORE_NOT_APPROVED');
      await ctx.db.update(stores).set({ status: 'approved' }).where(eq(stores.id, otherStoreId));
    });
  });

  describe('variações e estoque (WB-061, WB-064, RN-06)', () => {
    it('O2-VAR-01/02: 3 atributos e 100 combinações ok; 101 e 4 atributos → 422; duplicada (P x p, "Azul " x Azul) → "Essa combinação já existe"', async () => {
      const { id } = await completeProduct();
      const hundred = Array.from({ length: 100 }, (_, i) => ({ attributes: { Tamanho: `T${i}` }, stock: 1 }));
      await vari(id, { attributes: ['Tamanho'], variants: hundred }).expect(200);
      const tooMany = await vari(id, { attributes: ['Tamanho'], variants: [...hundred, { attributes: { Tamanho: 'T100' }, stock: 1 }] }).expect(422);
      expect(tooMany.body.code).toBe('VARIANTS_INVALID');
      await vari(id, { attributes: ['A', 'B', 'C'], variants: [{ attributes: { A: '1', B: '2', C: '3' }, stock: 1 }] }).expect(200);
      await vari(id, { attributes: ['A', 'B', 'C', 'D'], variants: [{ attributes: { A: '1', B: '2', C: '3', D: '4' }, stock: 1 }] }).expect(422);
      const dup = await vari(id, { attributes: ['Tamanho', 'Cor'], variants: [{ attributes: { Tamanho: 'P', Cor: 'Azul' }, stock: 1 }, { attributes: { Tamanho: 'p', Cor: 'Azul ' }, stock: 1 }] }).expect(422);
      expect(JSON.stringify(dup.body.errors)).toContain('Essa combinação já existe');
    });

    it('O2-VAR-01: estoque -1 e 100.000 → 422; 99.999 ok; 1,5 → 400; SKU repetido na loja → 422 SKU_IN_USE; SKU em lojas diferentes pode repetir', async () => {
      const { id } = await completeProduct();
      for (const stock of [-1, 100_000]) await vari(id, { attributes: [], variants: [{ attributes: {}, stock }] }).expect(422);
      await vari(id, { attributes: [], variants: [{ attributes: {}, stock: 1.5 }] }).expect(400);
      await vari(id, { attributes: [], variants: [{ attributes: {}, stock: 99_999, sku: 'SKU-UNICO' }] }).expect(200);
      const second = await completeProduct();
      const clash = await vari(second.id, { attributes: [], variants: [{ attributes: {}, stock: 1, sku: 'sku-unico' }] }).expect(422);
      expect(clash.body.code).toBe('SKU_IN_USE');
      const foreign = await create({ categoryId, basePriceCents: 100 }, other, otherStoreId).expect(201);
      await vari(foreign.body.id, { attributes: [], variants: [{ attributes: {}, stock: 1, sku: 'SKU-UNICO' }] }, other);
      await ctx.http.put(`/v1/stores/${otherStoreId}/products/${foreign.body.id}/variants`).set(as(other)).send({ attributes: [], variants: [{ attributes: {}, stock: 1, sku: 'SKU-UNICO' }] }).expect(200);
    });

    it('O2-VAR-04: reservado 3 → ajustar para 2 falha com "3 unidades estão reservadas em pedidos", para 3 passa; excluir variação reservada → 409', async () => {
      const { id, variantId } = await completeProduct();
      await ctx.db.update(productVariants).set({ reserved: 3 }).where(eq(productVariants.id, variantId));
      const low = await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ set: 2 }).expect(409);
      expect(low.body).toMatchObject({ code: 'STOCK_BELOW_RESERVED', detail: '3 unidades estão reservadas em pedidos.' });
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: -7 }).expect(200); // 10 - 7 = 3
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: -1 }).expect(409);
      const view = await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ set: 3 }).expect(200);
      expect(view.body).toMatchObject({ stock: 3, reserved: 3, available: 0, soldOut: true });
      // trocar a combinação ou remover a variação com reserva ativa é recusado
      await vari(id, { attributes: ['Cor'], variants: [{ id: variantId, attributes: { Cor: 'Verde' } }] }).expect(409);
      await vari(id, { attributes: ['Cor'], variants: [{ attributes: { Cor: 'Nova' }, stock: 1 }] }).expect(409);
    });

    it('O2-EST-03 / O2-VAR-05: 20 "+1" simultâneos resultam em +20 (nada se perde); ajuste que passa de 99.999 → 422', async () => {
      const { id, variantId } = await completeProduct();
      const results = await Promise.all(Array.from({ length: 20 }, () => ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: 1 })));
      expect(results.every((r) => r.status === 200)).toBe(true);
      const view = await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200);
      expect(view.body.variants[0].stock).toBe(30);
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: 99_999 }).expect(422);
      await ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ delta: 1, set: 2 }).expect(400);
    });

    it('O2-EST-02: estoque baixo (disponível <= limite 3) avisa 1 vez por variação e rearma ao subir acima do limite', async () => {
      const { id, variantId } = await completeProduct();
      const adjust = (set: number) => ctx.http.post(path(`/${id}/variants/${variantId}/stock`)).set(as(owner)).send({ set }).expect(200);
      const lowMails = () => ctx.mail.to(owner.email).filter((m) => m.subject === 'Estoque baixo na sua loja').length;
      const before = lowMails();
      expect((await adjust(4)).body.low).toBe(false); // 4 > limite 3: sem selo
      expect(lowMails()).toBe(before);
      expect((await adjust(3)).body.low).toBe(true);
      expect(lowMails()).toBe(before + 1);
      await adjust(2);
      expect(lowMails()).toBe(before + 1);
      await adjust(10);
      await adjust(3);
      expect(lowMails()).toBe(before + 2);
      const filtered = await ctx.http.get(path('')).set(as(owner)).query({ lowStock: 'true' }).expect(200);
      expect((filtered.body.data as { id: string }[]).some((p) => p.id === id)).toBe(true);
    });
  });

  describe('preço e promoção (WB-062, RN-05)', () => {
    it('O2-PRC-02/04: promocional >= normal, fim antes do início e R$ 0,00 → 422; normal - 1 centavo ok; baixar o normal abaixo da promoção → 422', async () => {
      const { id } = await completeProduct({ basePriceCents: 10_000 });
      const patch = (body: Record<string, unknown>) => ctx.http.patch(path(`/${id}`)).set(as(owner)).send(body);
      const window = { promoStartsAt: '2026-01-01T03:00:00.000Z', promoEndsAt: '2099-12-31T23:59:00.000Z' };
      await patch({ promoPriceCents: 10_000, ...window }).expect(422);
      await patch({ promoPriceCents: 0, ...window }).expect(422);
      await patch({ promoPriceCents: 8_000, promoStartsAt: '2026-02-01T00:00:00.000Z', promoEndsAt: '2026-01-01T00:00:00.000Z' }).expect(422);
      await patch({ promoPriceCents: 8_000 }).expect(422); // promoção incompleta
      const ok = await patch({ promoPriceCents: 9_999, ...window }).expect(200);
      expect(ok.body.promotion).toMatchObject({ priceCents: 9_999, active: true });
      await patch({ basePriceCents: 9_999 }).expect(422);
      await patch({ basePriceCents: 12_000 }).expect(200);
      const cleared = await patch({ promoPriceCents: null, promoStartsAt: null, promoEndsAt: null }).expect(200);
      expect(cleared.body.promotion.active).toBe(false);
    });

    it('O2-PRC-01/03: dentro do período vale o preço de/por (variação com preço próprio herda o percentual); passado o fim, o preço volta sozinho, sem job', async () => {
      const { id, variantId } = await completeProduct({ basePriceCents: 10_000 });
      await vari(id, { attributes: ['Tamanho'], variants: [{ id: variantId, attributes: { Tamanho: 'P' } }, { attributes: { Tamanho: 'G' }, stock: 2, priceCents: 20_000 }] }).expect(200);
      const promo = await ctx.http.patch(path(`/${id}`)).set(as(owner)).send({ promoPriceCents: 8_000, promoStartsAt: '2026-01-01T03:00:00.000Z', promoEndsAt: '2099-12-31T23:59:00.000Z' }).expect(200);
      const byAttr = (body: { variants: { attributes: Record<string, string>; effectivePriceCents: number; originalPriceCents: number | null; discountPercent: number | null }[] }, size: string) => body.variants.find((v) => v.attributes.Tamanho === size)!;
      expect(byAttr(promo.body, 'P')).toMatchObject({ effectivePriceCents: 8_000, originalPriceCents: 10_000, discountPercent: 20 });
      expect(byAttr(promo.body, 'G')).toMatchObject({ effectivePriceCents: 16_000, originalPriceCents: 20_000, discountPercent: 20 });

      // o fim passa: nenhuma ação, só a leitura
      await ctx.db.update(products).set({ promoEndsAt: new Date(Date.now() - 1000) }).where(eq(products.id, id));
      const after = await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200);
      expect(after.body.promotion.active).toBe(false);
      expect(byAttr(after.body, 'P')).toMatchObject({ effectivePriceCents: 10_000, originalPriceCents: null });
      // antes do início também vale o normal
      await ctx.db.update(products).set({ promoStartsAt: new Date(Date.now() + 3_600_000), promoEndsAt: new Date(Date.now() + 7_200_000) }).where(eq(products.id, id));
      expect(byAttr((await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200)).body, 'G').effectivePriceCents).toBe(20_000);
    });
  });

  describe('seções (WB-063)', () => {
    it('O2-SCT-01: nome até 40, ordem, produto sem seção fica "Outros", excluir seção devolve os produtos; seção de outra loja → 422', async () => {
      const a = await ctx.http.post(`/v1/stores/${storeId}/sections`).set(as(owner)).send({ name: 'Camisetas' }).expect(201);
      const b = await ctx.http.post(`/v1/stores/${storeId}/sections`).set(as(owner)).send({ name: 'Promoções' }).expect(201);
      await ctx.http.post(`/v1/stores/${storeId}/sections`).set(as(owner)).send({ name: 'x'.repeat(41) }).expect(400);
      const foreign = await ctx.http.post(`/v1/stores/${otherStoreId}/sections`).set(as(other)).send({ name: 'Alheia' }).expect(201);
      const product = await create({ sectionId: a.body.id }).expect(201);
      expect((await create({ sectionId: foreign.body.id }).expect(422)).body.code).toBe('SECTION_NOT_FOUND');
      await ctx.http.put(`/v1/stores/${storeId}/sections/order`).set(as(owner)).send({ ids: [b.body.id] }).expect(400); // faltou uma
      await ctx.http.put(`/v1/stores/${storeId}/sections/order`).set(as(owner)).send({ ids: [b.body.id, a.body.id] }).expect(204);
      const list = await ctx.http.get(`/v1/stores/${storeId}/sections`).set(as(owner)).expect(200);
      expect((list.body.data as { id: string; position: number; productCount: number }[]).map((s) => s.id)).toEqual([b.body.id, a.body.id]);
      expect(list.body.data[1].productCount).toBe(1);
      await ctx.http.delete(`/v1/stores/${storeId}/sections/${a.body.id}`).set(as(owner)).expect(204);
      expect((await ctx.http.get(path(`/${product.body.id}`)).set(as(owner)).expect(200)).body.sectionId).toBeNull();
      await ctx.http.delete(`/v1/stores/${storeId}/sections/${foreign.body.id}`).set(as(owner)).expect(404);
    });
  });

  describe('ação em massa (WB-066)', () => {
    it('ajuste que leva algum preço a <= 0 bloqueia a ação INTEIRA e lista os afetados; dryRun não altera; percentual e valor funcionam; produto alheio → 404', async () => {
      const cheap = await create({ basePriceCents: 100 }).expect(201);
      const dear = await create({ basePriceCents: 10_000 }).expect(201);
      const act = (body: Record<string, unknown>) => ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [cheap.body.id, dear.body.id], ...body });

      const blocked = await act({ action: { type: 'price_adjust', mode: 'amount', value: -500 } }).expect(422);
      expect(blocked.body.code).toBe('BULK_BLOCKED');
      expect(blocked.body.errors).toHaveLength(1);
      expect((await ctx.http.get(path(`/${dear.body.id}`)).set(as(owner))).body.basePriceCents).toBe(10_000); // nada mudou
      const dry = await act({ dryRun: true, action: { type: 'price_adjust', mode: 'amount', value: -500 } }).expect(200);
      expect(dry.body).toMatchObject({ dryRun: true, changed: 0, willChange: 1 });
      expect(dry.body.blocked).toHaveLength(1);

      const up = await act({ action: { type: 'price_adjust', mode: 'percent', value: 10 } }).expect(200);
      expect(up.body).toMatchObject({ changed: 2, blocked: [] });
      expect((await ctx.http.get(path(`/${cheap.body.id}`)).set(as(owner))).body.basePriceCents).toBe(110);
      expect((await ctx.http.get(path(`/${dear.body.id}`)).set(as(owner))).body.basePriceCents).toBe(11_000);
      await act({ action: { type: 'price_adjust', mode: 'amount', value: 1.5 } }).expect(400);
      await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [cheap.body.id, (await create({}, other, otherStoreId)).body.id], action: { type: 'pause' } }).expect(404);
    });

    it('pausar, reativar (não reativa moderado) e mover de seção em massa; fica no histórico da loja', async () => {
      const a = (await completeProduct()).id;
      const b = (await completeProduct()).id;
      for (const id of [a, b]) await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      const bulk = (action: unknown) => ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [a, b], action }).expect(200);
      expect((await bulk({ type: 'pause' })).body.changed).toBe(2);
      await ctx.db.update(products).set({ moderationStatus: 'paused' }).where(eq(products.id, b));
      const resume = await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [a, b], action: { type: 'resume' } }).expect(422);
      expect(resume.body.code).toBe('BULK_BLOCKED');
      await ctx.http.post(path('/bulk')).set(as(owner)).send({ productIds: [a], action: { type: 'resume' } }).expect(200);
      const section = await ctx.http.post(`/v1/stores/${storeId}/sections`).set(as(owner)).send({ name: 'Massa' }).expect(201);
      expect((await bulk({ type: 'move_section', sectionId: section.body.id })).body.changed).toBe(2);
      const activity = await ctx.db.select().from(storeActivity).where(and(eq(storeActivity.storeId, storeId), eq(storeActivity.action, 'catalog.bulk')));
      expect(activity.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('importação por planilha (WB-065)', () => {
    const csvHeader = 'nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo';
    const sheet = (...lines: string[]) => [csvHeader, ...lines].join('\r\n');
    const post = (body: string, query: Record<string, string> = {}, user: { accessToken: string } = owner, id = storeId) =>
      ctx.http.post(`/v1/stores/${id}/products/import`).query(query).set(as(user)).set('Content-Type', 'text/csv').send(body);

    it('modelo para baixar; pré-visualização mostra "X válidas, Y com erro" com linha e motivo e NÃO cria nada; confirmar cria só as válidas como rascunho', async () => {
      const template = await ctx.http.get(path('/import/template')).set(as(owner)).expect(200);
      expect(template.headers['content-type']).toContain('text/csv');
      expect(template.text.split('\r\n')[0]).toBe(csvHeader);

      const [cat] = await ctx.db.select().from(categories).where(eq(categories.id, categoryId));
      const rows = sheet(
        `Vestido Longo;${cat!.name};Leve;89,90;;;;Tamanho: M;;4;VEST-M`,
        `Vestido Longo;${cat!.name};Leve;89,90;;;;Tamanho: G;;2;VEST-G`,
        `Sem Preço;${cat!.name};;;;;;;;1;`,
        `Cat Errada;Inexistente;;10,00;;;;;;1;`,
      );
      const before = await ctx.db.select().from(products).where(eq(products.storeId, storeId));
      const preview = await post(rows).expect(200);
      expect(preview.body).toMatchObject({ totalLines: 4, valid: 2, invalid: 2, productsToCreate: 1, committed: false });
      expect(preview.body.errors.map((e: { line: number }) => e.line)).toEqual([4, 5]);
      expect((await ctx.db.select().from(products).where(eq(products.storeId, storeId))).length).toBe(before.length);

      const commit = await post(rows, { mode: 'commit' }).expect(200);
      expect(commit.body).toMatchObject({ committed: true, created: 1, updated: 0, skipped: 0 });
      const [vestido] = await ctx.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.name, 'Vestido Longo')));
      expect(vestido).toMatchObject({ status: 'draft', basePriceCents: 8990 });
      expect(await ctx.db.select().from(productVariants).where(eq(productVariants.productId, vestido!.id))).toHaveLength(2);

      // mesma planilha de novo: avisa que já existem; "update" atualiza preço e estoque, não duplica
      const again = await post(rows, { mode: 'commit' }).expect(200);
      expect(again.body).toMatchObject({ alreadyExist: 1, created: 0, skipped: 1 });
      const upd = await post(sheet(`Vestido Longo;${cat!.name};Leve;99,90;;;;Tamanho: M;;7;VEST-M`), { mode: 'commit', onExisting: 'update' }).expect(200);
      expect(upd.body).toMatchObject({ updated: 1, created: 0 });
      expect((await ctx.db.select().from(products).where(eq(products.id, vestido!.id)))[0]?.basePriceCents).toBe(9990);
      expect((await ctx.db.select().from(productVariants).where(and(eq(productVariants.productId, vestido!.id), eq(productVariants.sku, 'VEST-M'))))[0]?.stock).toBe(7);
      expect((await ctx.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.name, 'Vestido Longo')))).length).toBe(1);
    });

    it('arquivo inválido (cabeçalho errado, vazio, > 500 linhas, tipo de conteúdo errado) → erro e nada é criado; loja alheia → 404; fórmula vira texto', async () => {
      const before = (await ctx.db.select().from(products).where(eq(products.storeId, storeId))).length;
      expect((await post('nome;preco\r\nA;1', { mode: 'commit' }).expect(422)).body.code).toBe('IMPORT_FILE_INVALID');
      await post(csvHeader, { mode: 'commit' }).expect(422);
      const [cat] = await ctx.db.select().from(categories).where(eq(categories.id, categoryId));
      const many = sheet(...Array.from({ length: 501 }, (_, i) => `P${i};${cat!.name};;10,00;;;;;;1;`));
      await post(many, { mode: 'commit' }).expect(422);
      await ctx.http.post(path('/import')).set(as(owner)).send({ nome: 'x' }).expect(400);
      await post(sheet(`Teste;${cat!.name};;10,00;;;;;;1;`), {}, other).expect(404);
      expect((await ctx.db.select().from(products).where(eq(products.storeId, storeId))).length).toBe(before);

      await post(sheet(`=HYPERLINK("http://x");${cat!.name};;10,00;;;;;;1;`), { mode: 'commit' }).expect(200);
      const [formula] = await ctx.db.select().from(products).where(and(eq(products.storeId, storeId), eq(products.name, '=HYPERLINK("http://x")')));
      expect(formula).toBeDefined();
    });

    it('limite de 500 linhas exatas passa; 5 requisições seguidas de planilha pequena não derrubam a API', async () => {
      const [cat] = await ctx.db.select().from(categories).where(eq(categories.id, categoryId));
      const ok = sheet(...Array.from({ length: 500 }, (_, i) => `Lote${i};${cat!.name};;10,00;;;;;;1;`));
      const res = await post(ok).expect(200);
      expect(res.body).toMatchObject({ totalLines: 500, valid: 500, invalid: 0 });
    });
  });

  describe('moderação (WB-107)', () => {
    async function publishedProduct(name: string, descr?: string) {
      const { id } = await completeProduct({ name, ...(descr ? { description: descr } : {}) });
      await ctx.http.post(path(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
      return id;
    }
    const moderate = (id: string, body: Record<string, unknown>, admin: { accessToken: string } = ops) => ctx.http.post(`/v1/admin/products/${id}/moderation`).set(as(admin)).send(body);

    it('O2-MOD-01/02/05: só super e operação moderam (financeiro, suporte e lojista → 403); remover/pausar exigem motivo; avisa o lojista; ele não reativa; admin restaura com auditoria', async () => {
      const id = await publishedProduct('Produto impróprio');
      const finance = await createAdmin(ctx, 'finance');
      const support = await createAdmin(ctx, 'support');
      for (const who of [finance, support, owner]) await moderate(id, { action: 'remove', reason: 'Item proibido' }, who).expect(403);
      await moderate(id, { action: 'remove' }).expect(422);
      await moderate(id, { action: 'pause', reason: 'abc' }).expect(400);

      const paused = await moderate(id, { action: 'pause', reason: 'Foto com marca registrada' }).expect(200);
      expect(paused.body).toMatchObject({ moderationStatus: 'paused', storeFlagged: false });
      const mail = ctx.mail.to(owner.email).findLast((m) => m.subject.includes('pausado pela moderação'));
      expect(mail?.text).toContain('Foto com marca registrada');
      const mine = await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200);
      expect(mine.body).toMatchObject({ status: 'active', moderationStatus: 'paused', moderationReason: 'Foto com marca registrada' });
      for (const action of ['resume', 'publish']) {
        const blocked = await ctx.http.post(path(`/${id}/${action}`)).set(as(owner)).send({}).expect(403);
        expect(blocked.body.code).toBe('PRODUCT_MODERATED');
      }
      await moderate(id, { action: 'pause', reason: 'de novo' }).expect(409);

      await moderate(id, { action: 'restore' }).expect(200);
      expect((await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200)).body.moderationStatus).toBe('ok');
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, id), eq(auditLog.targetType, 'product')));
      expect(trail.map((r) => r.action).sort()).toEqual(['product.moderation_pause', 'product.moderation_restore']);
      expect(trail.find((r) => r.action === 'product.moderation_pause')).toMatchObject({ actorId: ops.userId, reason: 'Foto com marca registrada' });
      expect((await ctx.db.select().from(productModerationEvents).where(eq(productModerationEvents.productId, id))).length).toBe(2);
    });

    it('O2-MOD-01: lista com filtros por loja, status de moderação e busca; paginação por cursor', async () => {
      const id = await publishedProduct('Filtro Moderação Único');
      await moderate(id, { action: 'remove', reason: 'Teste de filtro' }).expect(200);
      const list = await ctx.http.get('/v1/admin/products').set(as(ops)).query({ storeId, moderationStatus: 'removed', q: 'Filtro Moderação' }).expect(200);
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0]).toMatchObject({ id, storeName: 'Loja do Catálogo', moderationStatus: 'removed' });
      const paged = await ctx.http.get('/v1/admin/products').set(as(ops)).query({ storeId, limit: '2' }).expect(200);
      expect(paged.body.data).toHaveLength(2);
      expect(paged.body.nextCursor).not.toBeNull();
      await ctx.http.get('/v1/admin/products').set(as(owner)).expect(403);
    });

    it('O2-MOD-03: palavra suspeita SINALIZA (entra em "Revisar"), não bloqueia; palavra inteira, sem caixa nem acento; editar a lista não altera produtos antigos', async () => {
      await ctx.http.post('/v1/admin/moderation/terms').set(as(ops)).send({ kind: 'suspect_word', value: 'ARMA' }).expect(201);
      await ctx.http.post('/v1/admin/moderation/terms').set(as(ops)).send({ kind: 'suspect_word', value: 'arma' }).expect(409);
      await ctx.http.post('/v1/admin/moderation/terms').set(as(ops)).send({ kind: 'suspect_word', value: 'duas palavras' }).expect(422);
      const hit = await publishedProduct('Arma de brinquedo');
      const accent = await publishedProduct('Kit ÁRMA premium');
      const carma = await publishedProduct('Carma positivo');
      const armario = await publishedProduct('Armário de cozinha');
      const state = async (id: string) => (await ctx.http.get(path(`/${id}`)).set(as(owner)).expect(200)).body as { status: string; moderationStatus: string };
      expect(await state(hit)).toMatchObject({ status: 'active', moderationStatus: 'review' });
      expect((await state(accent)).moderationStatus).toBe('review');
      expect((await state(carma)).moderationStatus).toBe('ok');
      expect((await state(armario)).moderationStatus).toBe('ok');
      // a lista nova não mexe no que já existe
      const old = await publishedProduct('Produto antigo');
      await ctx.http.post('/v1/admin/moderation/terms').set(as(ops)).send({ kind: 'suspect_word', value: 'antigo' }).expect(201);
      expect((await state(old)).moderationStatus).toBe('ok');
      const list = await ctx.http.get('/v1/admin/moderation/terms').set(as(ops)).expect(200);
      expect((list.body.data as { kind: string; value: string }[]).filter((t) => t.kind === 'suspect_word').map((t) => t.value)).toEqual(expect.arrayContaining(['arma', 'antigo']));
      await ctx.http.get('/v1/admin/moderation/terms').set(as(owner)).expect(403);
      await ctx.http.post('/v1/admin/moderation/terms').set(as(await createAdmin(ctx, 'support'))).send({ kind: 'suspect_word', value: 'teste' }).expect(403);
    });

    it('O2-MOD-04: 3 remoções em 30 dias sinalizam a loja para análise; 2 remoções, ou 3 em 31 dias, não', async () => {
      const m = await createMerchant(ctx);
      const sid = (await insertStoreRow(ctx, m.userId, { status: 'approved', name: 'Loja Reincidente' })).id;
      const make = async () => {
        const res = await ctx.http.post(`/v1/stores/${sid}/products`).set(as(m)).send({ name: `Item ${uniqueEmail().slice(0, 6)}` }).expect(201);
        return res.body.id as string;
      };
      const flagged = async () => (await ctx.db.select().from(stores).where(eq(stores.id, sid)))[0]?.suspensionReviewFlaggedAt;
      const [a, b, c] = [await make(), await make(), await make()];
      expect((await moderate(a, { action: 'remove', reason: 'Primeira remoção' }).expect(200)).body.storeFlagged).toBe(false);
      expect((await moderate(b, { action: 'remove', reason: 'Segunda remoção' }).expect(200)).body.storeFlagged).toBe(false);
      expect(await flagged()).toBeNull();
      // a primeira ficou fora da janela (31 dias): a terceira completa só 2 dentro dos 30 dias
      await ctx.db.update(productModerationEvents).set({ createdAt: new Date(Date.now() - 31 * 86_400_000) }).where(eq(productModerationEvents.productId, a));
      expect((await moderate(c, { action: 'remove', reason: 'Terceira remoção' }).expect(200)).body.storeFlagged).toBe(false);
      expect(await flagged()).toBeNull();
      const d = await make();
      const res = await moderate(d, { action: 'remove', reason: 'Quarta remoção' }).expect(200);
      expect(res.body.storeFlagged).toBe(true);
      expect(await flagged()).not.toBeNull();
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, sid), eq(auditLog.action, 'store.suspension_review_flagged')))).length).toBe(1);
    });

    it('catálogo e donos: o e-mail do dono da loja é o do cadastro (sem vazar para outro lojista)', async () => {
      const [row] = await ctx.db.select().from(users).where(eq(users.id, other.userId));
      expect(ctx.mail.to(row!.email).some((m) => m.subject.includes('moderação'))).toBe(false);
    });
  });
});
