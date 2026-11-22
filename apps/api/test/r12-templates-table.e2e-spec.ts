import { and, eq } from 'drizzle-orm';
import { seedOnda1 } from '../seed/onda1.js';
import { auditLog, categories, products, storeMembers } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, jpegBuffer, registerUser, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';
import { addToCart, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/**
 * v1.1 R1.2: WB-375 (modelos por categoria, `listCategoryTemplates` e `setCategoryTemplate`) e WB-377 (somente a LEITURA: `listProductTable`, com "Ver como" e
 * `youReceiveCents` nulo sem `catalog`, VA-14). A edição em massa por lote e o desfazer são da R1.3.
 */
describe('Modelos por categoria (WB-375) e tabela de preço e estoque (WB-377, leitura)', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  const as = (u: { accessToken: string }) => bearer(u.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    [ops, finance, support] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja da Tabela' })).id;
    other = await createMerchant(ctx);
    await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra da Tabela' });
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('WB-375: modelos por categoria', () => {
    it('o seed aplica os modelos iniciais (Calçados 34 a 44, Cosméticos com descrição obrigatória) sem sobrescrever o que o admin editou; rodar de novo não muda nada', async () => {
      await seedOnda1(ctx.db, {});
      const all = await ctx.db.select().from(categories);
      const byName = (name: string) => all.find((c) => c.name === name)!;
      expect(byName('Calçados').template?.attributes[0]?.values).toHaveLength(11);
      expect(byName('Cuidados pessoais')).toMatchObject({ descriptionRequired: true, descriptionMinChars: 20 });
      expect(byName('Eletrônicos')).toMatchObject({ descriptionRequired: true });
      expect(byName('Mercado')).toMatchObject({ template: null, descriptionRequired: false });
      const edited = { attributes: [{ name: 'Editado', values: ['1'] }], sizeChartHint: false, noVoluntaryExchangeHint: false };
      await ctx.db.update(categories).set({ template: edited, descriptionRequired: false }).where(eq(categories.id, byName('Papelaria').id));
      await seedOnda1(ctx.db, {});
      expect((await ctx.db.select().from(categories).where(eq(categories.id, byName('Papelaria').id)))[0]).toMatchObject({ template: edited, descriptionRequired: false });
    });

    it('C1/C2/C5: lista pública (sem login), só categorias ATIVAS com modelo ou descrição obrigatória; a subcategoria some com a mãe inativa; ETag/304; sem dado pessoal', async () => {
      const root = await ensureCategory(ctx, `Raiz ${uniqueTag(4)}`);
      const [child] = await ctx.db.insert(categories).values({ name: `Filha ${uniqueTag(4)}`, icon: 'storefront', parentId: root, descriptionRequired: true }).returning();
      const plain = await ensureCategory(ctx, `Sem modelo ${uniqueTag(3)}`);
      const res = await ctx.http.get('/v1/category-templates').expect(200);
      expect(res.body.nextCursor).toBeNull();
      const ids = (res.body.data as { categoryId: string }[]).map((t) => t.categoryId);
      expect(ids).toContain(child!.id);
      expect(ids).not.toContain(plain); // C5: sem modelo não aparece
      expect(ids).not.toContain(root);
      const shoes = (res.body.data as { categoryId: string; attributes: { name: string }[]; sizeChartHint: boolean }[]).find((t) => t.attributes[0]?.name === 'Tamanho' && t.sizeChartHint);
      expect(shoes).toBeTruthy();
      expect(Object.keys(res.body.data[0]).sort()).toEqual(['attributes', 'categoryId', 'descriptionMinChars', 'descriptionRequired', 'noVoluntaryExchangeHint', 'sizeChartHint']);
      expect(res.headers['cache-control']).toBe('public, max-age=60');
      await ctx.http.get('/v1/category-templates').set('If-None-Match', res.headers.etag as string).expect(304);
      await ctx.db.update(categories).set({ active: false }).where(eq(categories.id, root));
      const hidden = await ctx.http.get('/v1/category-templates').expect(200);
      expect((hidden.body.data as { categoryId: string }[]).map((t) => t.categoryId)).not.toContain(child!.id);
    });

    it('setCategoryTemplate: operação e super admin editam (auditado, antes/depois); financeiro, suporte e lojista = 403; 404, 400 e 422; vale na hora para novas publicações', async () => {
      const cat = await ensureCategory(ctx, `Editável ${uniqueTag(4)}`);
      const body = { attributes: [{ name: 'Tamanho', values: ['P', 'M'] }], sizeChartHint: true, noVoluntaryExchangeHint: false, descriptionRequired: true, descriptionMinChars: 30 };
      for (const denied of [finance, support, owner]) await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(denied)).send(body).expect(403);
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).send(body).expect(401);
      const saved = await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send(body).expect(200);
      expect(saved.body).toEqual({ categoryId: cat, ...body });
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'category.template_set'), eq(auditLog.targetId, cat)));
      expect(trail).toHaveLength(1);
      expect(trail[0]).toMatchObject({ actorId: ops.userId, before: { descriptionRequired: false }, after: { descriptionRequired: true, descriptionMinChars: 30 } });
      await ctx.http.put(`/v1/admin/category-templates/3f2b8c1e-5d44-4a0b-9d7a-0a6f1f9b2c11`).set(as(ops)).send(body).expect(404);
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send({ ...body, extra: 1 }).expect(400);
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send({ ...body, attributes: [{ name: 'A', values: Array.from({ length: 31 }, (_, i) => String(i)) }] }).expect(400);
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send({ ...body, attributes: [{ name: 'Cor', values: [] }, { name: 'cor', values: [] }] }).expect(422);
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send({ ...body, attributes: [{ name: 'Co\u0007r', values: [] }] }).expect(400);

      // DEC-106: o que o admin liga vale NA HORA na publicação do produto (novo e ainda não ativo)
      const created = (await ctx.http.post(`/v1/stores/${storeId}/products`).set(as(owner)).send({ name: 'Produto do modelo', categoryId: cat, basePriceCents: 1000 }).expect(201)).body as { id: string };
      await ctx.http.put(`/v1/stores/${storeId}/products/${created.id}/variants`).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 2 }] }).expect(200);
      const up = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
      await ctx.http.put(`/v1/stores/${storeId}/products/${created.id}/images`).set(as(owner)).send({ imageIds: [(up.completed!.body as { id: string }).id] }).expect(200);
      expect((await ctx.http.post(`/v1/stores/${storeId}/products/${created.id}/publish`).set(as(owner)).send({}).expect(422)).body.code).toBe('DESCRIPTION_REQUIRED');
      await ctx.http.put(`/v1/admin/category-templates/${cat}`).set(as(ops)).send({ ...body, descriptionRequired: false }).expect(200);
      await ctx.http.post(`/v1/stores/${storeId}/products/${created.id}/publish`).set(as(owner)).send({}).expect(200); // C4: o modelo só sugere; sem a exigência, nada é obrigatório além da RN-Q1
    });
  });

  describe('WB-377 (leitura): listProductTable', () => {
    async function activeProduct(store: string, user: TestMerchant, name: string, price: number, stock: number): Promise<{ id: string; variantId: string }> {
      const cat = await ensureCategory(ctx);
      const created = (await ctx.http.post(`/v1/stores/${store}/products`).set(as(user)).send({ name, categoryId: cat, basePriceCents: price }).expect(201)).body as { id: string };
      const variants = await ctx.http.put(`/v1/stores/${store}/products/${created.id}/variants`).set(as(user)).send({ attributes: [], variants: [{ attributes: {}, stock }] }).expect(200);
      const up = await uploadFile(ctx, user, { storeId: store, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
      await ctx.http.put(`/v1/stores/${store}/products/${created.id}/images`).set(as(user)).send({ imageIds: [(up.completed!.body as { id: string }).id] }).expect(200);
      await ctx.http.post(`/v1/stores/${store}/products/${created.id}/publish`).set(as(user)).send({}).expect(200);
      return { id: created.id, variantId: (variants.body.variants[0] as { id: string }).id };
    }

    it('C1/C9: linhas enxutas (preço, "Você recebe", disponível, reservado, singleVariantId, versão), `matchingCount` EXATO do filtro, cursor, rascunho e arquivado fora; `/products/table` não cai em {productId} (A2)', async () => {
      const merchant = await createMerchant(ctx);
      const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Tabela ${uniqueTag(4)}` })).id;
      const a = await activeProduct(id, merchant, 'Camiseta tabela A', 5_000, 10);
      const b = await activeProduct(id, merchant, 'Camiseta tabela B', 8_000, 4);
      const c = await activeProduct(id, merchant, 'Caneca tabela', 2_500, 0);
      await ctx.http.post(`/v1/stores/${id}/products/${b.id}/pause`).set(as(merchant)).send({}).expect(200);
      await ctx.http.post(`/v1/stores/${id}/product-drafts`).set(as(merchant)).set('Idempotency-Key', `t-${uniqueTag(8)}`).send({ via: 'camera' }).expect(201);
      const archived = await activeProduct(id, merchant, 'Arquivada', 1_000, 1);
      await ctx.http.delete(`/v1/stores/${id}/products/${archived.id}`).set(as(merchant)).expect(204);
      // grade: 2 variações, sem singleVariantId
      const grid = (await ctx.http.post(`/v1/stores/${id}/products`).set(as(merchant)).send({ name: 'Camiseta com grade', categoryId: await ensureCategory(ctx), basePriceCents: 4_000 }).expect(201)).body as { id: string };
      await ctx.http.put(`/v1/stores/${id}/products/${grid.id}/variants`).set(as(merchant)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 3 }, { attributes: { Tamanho: 'M' }, stock: 2 }] }).expect(200);
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, grid.id));

      const res = await ctx.http.get(`/v1/stores/${id}/products/table`).set(as(merchant)).expect(200);
      expect(res.body.matchingCount).toBe(4); // A, B (pausado), caneca e grade; sem rascunho nem arquivado
      const rows = res.body.data as { id: string; name: string; status: string; basePriceCents: number; youReceiveCents: number; available: number; reserved: number; variantCount: number; singleVariantId: string | null; version: number }[];
      expect(rows).toHaveLength(4);
      const rowA = rows.find((r) => r.id === a.id)!;
      expect(rowA).toMatchObject({ name: 'Camiseta tabela A', status: 'active', basePriceCents: 5_000, available: 10, reserved: 0, variantCount: 1, singleVariantId: a.variantId });
      expect(rowA.youReceiveCents).toBeGreaterThan(0);
      expect(rowA.youReceiveCents).toBeLessThan(5_000); // menos a comissão e a tarifa estimada
      expect(rowA.version).toBeGreaterThanOrEqual(1);
      expect(rows.find((r) => r.id === b.id)!.status).toBe('paused');
      expect(rows.find((r) => r.id === c.id)).toMatchObject({ available: 0 });
      expect(rows.find((r) => r.id === grid.id)).toMatchObject({ variantCount: 2, singleVariantId: null, available: 5 });
      expect(rows.some((r) => r.name === 'Arquivada')).toBe(false);

      const filtered = await ctx.http.get(`/v1/stores/${id}/products/table?q=camiseta`).set(as(merchant)).expect(200);
      expect(filtered.body.matchingCount).toBe(3);
      expect((await ctx.http.get(`/v1/stores/${id}/products/table?q=camiseta&status=paused`).set(as(merchant)).expect(200)).body.matchingCount).toBe(1);
      const page1 = await ctx.http.get(`/v1/stores/${id}/products/table?limit=3`).set(as(merchant)).expect(200);
      expect(page1.body.data).toHaveLength(3);
      expect(page1.body.matchingCount).toBe(4); // a contagem é do filtro todo, não da página
      const page2 = await ctx.http.get(`/v1/stores/${id}/products/table?limit=3&cursor=${page1.body.nextCursor}`).set(as(merchant)).expect(200);
      expect(page2.body.data).toHaveLength(1);
      expect(page2.body.nextCursor).toBeNull();
      expect(new Set([...page1.body.data, ...page2.body.data].map((r: { id: string }) => r.id)).size).toBe(4);
      await ctx.http.get(`/v1/stores/${id}/products/table?limit=500`).set(as(merchant)).expect(400);
      await ctx.http.get(`/v1/stores/${id}/products/table?status=draft`).set(as(merchant)).expect(400);
      await ctx.http.get(`/v1/stores/${id}/products/table?foo=1`).set(as(merchant)).expect(400);
      // os outros segmentos estáticos também não caem em {productId}: `import/template` responde o CSV, `bulk` é POST
      await ctx.http.get(`/v1/stores/${id}/products/import/template`).set(as(merchant)).expect(200);
    });

    it('o reservado aparece na linha (pedido em andamento) e o pedido NÃO muda a versão do produto', async () => {
      const shop = await shopWith(ctx, [{ name: 'Item reservado', priceCents: 4_000, stock: 10 }]);
      const before = (await ctx.http.get(`/v1/stores/${shop.store.id}/products/table`).set(as(shop.store.owner)).expect(200)).body.data[0] as { available: number; reserved: number; version: number };
      expect(before).toMatchObject({ available: 10, reserved: 0 });
      const { user, addressId } = await customerAt(ctx, shop.origin);
      await addToCart(ctx, user, shop.variants[0]!, 3).expect(200);
      expect((await placeOrder(ctx, user, addressId)).status).toBe(201);
      const after = (await ctx.http.get(`/v1/stores/${shop.store.id}/products/table`).set(as(shop.store.owner)).expect(200)).body.data[0] as { available: number; reserved: number; version: number };
      expect(after).toMatchObject({ available: 7, reserved: 3, version: before.version });
    });

    it('WB-377 C6 (DEC-118 item 2): qualquer membro lê; sem `catalog` o `youReceiveCents` vem nulo; com `catalog` vem preenchido; não-membro = 404; loja não aprovada = 409', async () => {
      const merchant = await createMerchant(ctx);
      const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Tabela perm ${uniqueTag(4)}` })).id;
      await activeProduct(id, merchant, 'Produto da permissão', 3_000, 5);
      const staffOrders = await registerUser(ctx);
      const staffCatalog = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values([
        { storeId: id, userId: staffOrders.userId, role: 'staff', permissions: ['orders'] },
        { storeId: id, userId: staffCatalog.userId, role: 'staff', permissions: ['catalog'] },
      ]);
      const read = async (user: { accessToken: string }) => (await ctx.http.get(`/v1/stores/${id}/products/table`).set(as(user)).expect(200)).body.data[0] as { youReceiveCents: number | null; basePriceCents: number };
      expect((await read(merchant)).youReceiveCents).not.toBeNull();
      expect((await read(staffCatalog)).youReceiveCents).not.toBeNull();
      const readOnly = await read(staffOrders); // somente leitura: preço e estoque sim, comissão não
      expect(readOnly).toMatchObject({ basePriceCents: 3_000, youReceiveCents: null });
      await ctx.http.get(`/v1/stores/${id}/products/table`).set(as(other)).expect(404);
      await ctx.http.get(`/v1/stores/${id}/products/table`).expect(401);
      const pending = await createMerchant(ctx);
      const pendingId = (await insertStoreRow(ctx, pending.userId, { status: 'in_review', name: 'Em análise da tabela' })).id;
      expect((await ctx.http.get(`/v1/stores/${pendingId}/products/table`).set(as(pending)).expect(409)).body.code).toBe('STORE_NOT_APPROVED');
      // as rotas de ESCRITA seguem exigindo `catalog`: o funcionário sem a permissão é negado
      await ctx.http.post(`/v1/stores/${id}/product-drafts`).set(as(staffOrders)).set('Idempotency-Key', `p-${uniqueTag(8)}`).send({ via: 'camera' }).expect(403);
    });

    it('VA-14: com `X-View-As` a tabela vem com `youReceiveCents` NULO em todas as linhas (mesmo para o admin que abriu a visão), só por GET; escrita com a visão = 403', async () => {
      const merchant = await createMerchant(ctx);
      const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Tabela visão ${uniqueTag(4)}` })).id;
      await activeProduct(id, merchant, 'Produto da visão', 6_000, 8);
      const opened = await ctx.http.post(`/v1/admin/stores/${id}/view-as`).set(as(ops)).send({ reason: { code: 'merchant_support' } }).expect(201);
      const token = (opened.body as { token: string }).token;
      const viaView = await ctx.http.get(`/v1/stores/${id}/products/table`).set(as(ops)).set('X-View-As', token).expect(200);
      expect(viaView.headers['cache-control']).toContain('no-store');
      expect(viaView.body.data).toHaveLength(1);
      expect(viaView.body.data[0]).toMatchObject({ basePriceCents: 6_000, available: 8, youReceiveCents: null });
      expect((await ctx.http.get(`/v1/stores/${id}/products/table`).set(as(merchant)).expect(200)).body.data[0].youReceiveCents).not.toBeNull();
      expect((await ctx.http.post(`/v1/stores/${id}/product-drafts`).set(as(ops)).set('X-View-As', token).set('Idempotency-Key', `v-${uniqueTag(8)}`).send({ via: 'camera' }).expect(403)).body.code).toBe('VIEW_AS_READ_ONLY');
    });
  });
});
