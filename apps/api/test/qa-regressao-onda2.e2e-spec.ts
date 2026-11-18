import { eq } from 'drizzle-orm';
import { invitations, productVariants, products, storeActivity, storeDocuments, storeHours } from '../src/platform/database/schema.js';
import { bearer, createTestApp, uniqueEmail, type TestContext } from './helpers/app.js';
import {
  CPF_DOCS,
  createAdmin,
  createMerchant,
  createStoreViaApi,
  ensureCategory,
  ensureLegalDocs,
  insertStoreRow,
  jpegBuffer,
  reauth,
  uploadFile,
  type TestAdmin,
  type TestMerchant,
} from './helpers/fixtures.js';

/** Regressão da Onda 2 pedida pelo QA a partir da revisão do tech-lead (`docs/arquitetura/reviews/review-onda2-api.md`, I1 a I9), contra Postgres e Redis reais. */
describe('Regressão QA da Onda 2 (achados I1 a I9 da revisão do tech-lead)', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  let categoryId: string;
  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const products_ = (suffix = '', id = storeId) => `/v1/stores/${id}/products${suffix}`;

  /** Produto ativo, com categoria, 1 foto, 1 variação (estoque 10) e preço de R$ 50,00. */
  async function activeProduct(): Promise<{ id: string; variantId: string }> {
    const created = await ctx.http.post(products_()).set(as(owner)).send({ name: `Produto ${uniqueEmail().slice(0, 6)}`, categoryId, basePriceCents: 5000 }).expect(201);
    const id = created.body.id as string;
    const withVariant = await ctx.http.put(products_(`/${id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    const upload = await uploadFile(ctx, owner, { storeId, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    await ctx.http.put(products_(`/${id}/images`)).set(as(owner)).send({ imageIds: [(upload.completed!.body as { id: string }).id] }).expect(200);
    await ctx.http.post(products_(`/${id}/publish`)).set(as(owner)).send({}).expect(200);
    return { id, variantId: withVariant.body.variants[0].id as string };
  }

  /** Uma loja aprovada por dono (índice único `stores_owner_uq`). */
  async function freshStore(name: string): Promise<{ merchant: TestMerchant; id: string }> {
    const merchant = await createMerchant(ctx);
    return { merchant, id: (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name })).id };
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    ops = await createAdmin(ctx, 'operations');
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja QA Regressão' })).id;
    other = await createMerchant(ctx);
    await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Loja QA Alheia' });
    categoryId = await ensureCategory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('I1: revogar convite de outra loja não pode mudar nada (SEC-020, O2-EQP-09)', () => {
    it('BUG-001: lojista B revoga o convite de A: 404 e o convite de A continua válido (hoje o 404 sai DEPOIS de revogar)', async () => {
      await reauth(ctx, owner);
      const invite = await ctx.http
        .post(`/v1/stores/${storeId}/members/invitations`)
        .set(as(owner))
        .send({ email: uniqueEmail('func'), name: 'Funcionária Alvo', permissions: ['catalog'] })
        .expect(201);
      const invitationId = invite.body.invitationId as string;

      const otherStoreId = (await ctx.http.get('/v1/stores/mine').set(as(other)).expect(200)).body.data[0].id as string;
      await reauth(ctx, other);
      await ctx.http.delete(`/v1/stores/${otherStoreId}/members/invitations/${invitationId}`).set(as(other)).expect(404);

      const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, invitationId));
      expect(row?.revokedAt).toBeNull();
    });

    it('o dono da própria loja revoga o convite normalmente (caminho feliz continua valendo)', async () => {
      await reauth(ctx, owner);
      const invite = await ctx.http.post(`/v1/stores/${storeId}/members/invitations`).set(as(owner)).send({ email: uniqueEmail('func'), name: 'Funcionária Dois', permissions: [] }).expect(201);
      await ctx.http.delete(`/v1/stores/${storeId}/members/invitations/${invite.body.invitationId}`).set(as(owner)).expect(204);
      const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, invite.body.invitationId));
      expect(row?.revokedAt).not.toBeNull();
    });
  });

  describe('I2: "quem fez o quê" mostra os eventos mais recentes (WB-075 C8)', () => {
    it('BUG-002: com 60 eventos, o mais recente aparece na lista (hoje devolve os 50 mais antigos)', async () => {
      const base = Date.now() - 3_600_000;
      await ctx.db.insert(storeActivity).values(
        Array.from({ length: 60 }, (_, i) => ({ storeId, actorId: owner.userId, action: `qa.evento.${String(i).padStart(2, '0')}`, createdAt: new Date(base + i * 1000) })),
      );
      const res = await ctx.http.get(`/v1/stores/${storeId}/activity`).set(as(owner)).expect(200);
      const actions = (res.body.data as { action: string }[]).map((e) => e.action);
      expect(actions).toContain('qa.evento.59');
    });
  });

  describe('I3: cursor de produtos não perde linhas com o mesmo created_at (microssegundos)', () => {
    /** 5 produtos nascidos na mesma transação (mesmo `now()` com microssegundos), como em importação, seed ou migração. */
    async function insertSameInstant(targetStore: string, n: number, marker: string): Promise<void> {
      const values = Array.from({ length: n }, (_, i) => `('${targetStore}', '${marker} ${i}', 'draft', timestamptz '2026-02-03 10:00:00.123456+00')`).join(',');
      await ctx.pool.query(`insert into products (store_id, name, status, created_at) values ${values}`);
    }

    it('BUG-003: lista do lojista paginada de 2 em 2 devolve os 5 produtos (hoje a 2ª página vem vazia)', async () => {
      const { merchant: own_, id: own } = await freshStore('Loja Cursor A');
      await insertSameInstant(own, 5, 'Cursor lojista');
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 6; page++) {
        const res = await ctx.http.get(products_('', own)).set(as(own_)).query({ limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...(res.body.data as { id: string }[]).map((p) => p.id));
        cursor = res.body.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen.length).toBeGreaterThanOrEqual(2); // preparação: a 1ª página veio cheia
      expect(new Set(seen).size).toBe(5);
    });

    it('BUG-003: fila de moderação do admin paginada de 2 em 2 devolve os 5 produtos (mesmo defeito)', async () => {
      const { id: own } = await freshStore('Loja Cursor B');
      await insertSameInstant(own, 5, 'Cursor admin');
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 6; page++) {
        const res = await ctx.http.get('/v1/admin/products').set(as(ops)).query({ storeId: own, limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...(res.body.data as { id: string }[]).map((p) => p.id));
        cursor = res.body.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(seen.length).toBeGreaterThanOrEqual(2);
      expect(new Set(seen).size).toBe(5);
    });

    it('controle: produtos com created_at distinto (milissegundos diferentes) paginam sem perda', async () => {
      const { merchant: own_, id: own } = await freshStore('Loja Cursor C');
      const values = Array.from({ length: 5 }, (_, i) => `('${own}', 'Distinto ${i}', 'draft', timestamptz '2026-02-03 10:00:0${i}.100000+00')`).join(',');
      await ctx.pool.query(`insert into products (store_id, name, status, created_at) values ${values}`);
      const seen: string[] = [];
      let cursor: string | null = null;
      for (let page = 0; page < 6; page++) {
        const res = await ctx.http.get(products_('', own)).set(as(own_)).query({ limit: '2', ...(cursor ? { cursor } : {}) }).expect(200);
        seen.push(...(res.body.data as { id: string }[]).map((p) => p.id));
        cursor = res.body.nextCursor as string | null;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(5);
    });
  });

  describe('I4: operações relativas de catálogo são idempotentes com `Idempotency-Key`', () => {
    it('BUG-004: ajuste de estoque `delta` repetido com a mesma chave (retry de rede) soma uma vez só', async () => {
      const { id, variantId } = await activeProduct();
      const key = `estoque-${uniqueEmail().slice(0, 8)}`;
      const url = products_(`/${id}/variants/${variantId}/stock`);
      await ctx.http.post(url).set(as(owner)).set('Idempotency-Key', key).send({ delta: 2 }).expect(200);
      await ctx.http.post(url).set(as(owner)).set('Idempotency-Key', key).send({ delta: 2 }).expect(200);
      const [variant] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId));
      expect(variant?.stock).toBeGreaterThanOrEqual(12); // preparação: o ajuste foi aplicado ao menos uma vez
      expect(variant?.stock).toBe(12);
    });

    it('BUG-004: reajuste de preço em massa por percentual repetido com a mesma chave aplica uma vez só', async () => {
      const { id } = await activeProduct();
      const key = `preco-${uniqueEmail().slice(0, 8)}`;
      const body = { productIds: [id], action: { type: 'price_adjust', mode: 'percent', value: 10 } };
      await ctx.http.post(products_('/bulk')).set(as(owner)).set('Idempotency-Key', key).send(body).expect(200);
      await ctx.http.post(products_('/bulk')).set(as(owner)).set('Idempotency-Key', key).send(body).expect(200);
      const [row] = await ctx.db.select().from(products).where(eq(products.id, id));
      expect(row?.basePriceCents).toBeGreaterThanOrEqual(5500); // preparação: o reajuste de 10% foi aplicado ao menos uma vez
      expect(row?.basePriceCents).toBe(5500);
    });

    it('controle: sem chave, duas chamadas são duas operações (comportamento atual do contrato)', async () => {
      const { id, variantId } = await activeProduct();
      const url = products_(`/${id}/variants/${variantId}/stock`);
      await ctx.http.post(url).set(as(owner)).send({ delta: 1 }).expect(200);
      await ctx.http.post(url).set(as(owner)).send({ delta: 1 }).expect(200);
      const [variant] = await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId));
      expect(variant?.stock).toBe(12);
    });
  });

  describe('I5: horários salvos em paralelo (duas abas, toque duplo)', () => {
    it('BUG-005: 8 `PUT /hours` simultâneos iguais deixam exatamente os intervalos enviados (hoje acumulam duplicados)', async () => {
      const own = await createMerchant(ctx);
      const hoursStore = (await insertStoreRow(ctx, own.userId, { status: 'approved', name: 'Loja Horários QA' })).id;
      const days = [{ weekday: 1, intervals: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] }];
      await ctx.http.put(`/v1/stores/${hoursStore}/hours`).set(as(own)).send({ days }).expect(204);
      for (let round = 0; round < 5; round++) {
        const results = await Promise.all(Array.from({ length: 8 }, () => ctx.http.put(`/v1/stores/${hoursStore}/hours`).set(as(own)).send({ days })));
        expect(results.every((r) => r.status === 204)).toBe(true);
        expect(await ctx.db.select().from(storeHours).where(eq(storeHours.storeId, hoursStore))).toHaveLength(2);
      }
    });

    it('BUG-005: 6 `PUT /holidays` simultâneos iguais terminam sem erro 500 (hoje a violação de unicidade vaza)', async () => {
      const own = await createMerchant(ctx);
      const holidayStore = (await insertStoreRow(ctx, own.userId, { status: 'approved', name: 'Loja Feriados QA' })).id;
      const body = { holidays: [{ date: '2027-12-25', label: 'Natal' }] };
      await ctx.http.put(`/v1/stores/${holidayStore}/holidays`).set(as(own)).send(body).expect(204);
      for (let round = 0; round < 5; round++) {
        const results = await Promise.all(Array.from({ length: 6 }, () => ctx.http.put(`/v1/stores/${holidayStore}/holidays`).set(as(own)).send(body)));
        expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      }
    });
  });

  describe('I6: um documento vigente por tipo (store_documents)', () => {
    it('BUG-006: 6 anexos simultâneos do mesmo tipo deixam um único documento vigente', async () => {
      const own = await createMerchant(ctx);
      const draft = await createStoreViaApi(ctx, own);
      const uploads: string[] = [];
      for (let i = 0; i < 6; i++) {
        const sent = await uploadFile(ctx, own, { storeId: draft.id, purpose: 'store_document', contentType: 'image/jpeg', body: await jpegBuffer(600 + i, 400) });
        uploads.push((sent.completed!.body as { id: string }).id);
      }
      const results = await Promise.all(uploads.map((uploadId) => ctx.http.post(`/v1/stores/${draft.id}/documents`).set(as(own)).send({ kind: CPF_DOCS[0], uploadId })));
      expect(results.filter((r) => r.status >= 500)).toHaveLength(0);
      const rows = await ctx.db.select().from(storeDocuments).where(eq(storeDocuments.storeId, draft.id));
      expect(rows.filter((r) => r.kind === CPF_DOCS[0] && r.supersededAt === null)).toHaveLength(1);
    });
  });

  describe('I7: produto ativo não perde a categoria (invariante de vitrine)', () => {
    it('BUG-007: `PATCH categoryId: null` em produto ativo → 422 (hoje devolve 200 e deixa produto sem categoria na vitrine)', async () => {
      const { id } = await activeProduct();
      const [before] = await ctx.db.select().from(products).where(eq(products.id, id));
      expect(before).toMatchObject({ status: 'active', categoryId }); // preparação
      await ctx.http.patch(products_(`/${id}`)).set(as(owner)).send({ categoryId: null }).expect(422);
      const [row] = await ctx.db.select().from(products).where(eq(products.id, id));
      expect(row?.categoryId).toBe(categoryId);
    });

    it('rascunho pode ficar sem categoria (regra só vale para ativo)', async () => {
      const draft = await ctx.http.post(products_()).set(as(owner)).send({ name: 'Rascunho livre', categoryId }).expect(201);
      await ctx.http.patch(products_(`/${draft.body.id}`)).set(as(owner)).send({ categoryId: null }).expect(200);
    });
  });

  describe('I9: confirmar a importação duas vezes não duplica produtos', () => {
    const csv = (tag: string) => ['nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo', `Importado ${tag} A;Mercado;;10,00;;;;;;5;`, `Importado ${tag} B;Mercado;;20,00;;;;;;5;`].join('\r\n');

    it('BUG-008: duas confirmações iguais (toque duplo / retry) com a mesma `Idempotency-Key` criam um conjunto só', async () => {
      const own = await createMerchant(ctx);
      const importStore = (await insertStoreRow(ctx, own.userId, { status: 'approved', name: 'Loja Importação QA' })).id;
      const { categories } = await import('../src/platform/database/schema.js');
      await ctx.db.insert(categories).values({ name: 'Mercado', icon: 'storefront' }).onConflictDoNothing();
      const tag = uniqueEmail().slice(0, 6);
      const key = `import-${tag}-0000`;
      const send = () =>
        ctx.http.post(`/v1/stores/${importStore}/products/import`).query({ mode: 'commit' }).set(as(own)).set('Content-Type', 'text/csv').set('Idempotency-Key', key).send(csv(tag));
      const first = await send();
      await send();
      // O pré-requisito do teste: a categoria "Mercado" existe e a primeira confirmação criou os 2 produtos.
      expect(first.status).toBe(200);
      expect(first.body.created).toBe(2);
      const rows = await ctx.db.select().from(products).where(eq(products.storeId, importStore));
      expect(rows.length).toBeGreaterThanOrEqual(2);
      expect(rows).toHaveLength(2);
    });
  });
});
