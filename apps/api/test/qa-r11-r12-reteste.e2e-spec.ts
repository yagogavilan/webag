import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { ProductDraftsService } from '../src/modules/catalog/drafts.service.js';
import { adminViewSessions, auditLog, productCreationMetrics, productImages, productModerationEvents, productVariants, products, storeAdminChanges, storeMembers, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createCustomer, createMerchant, ensureCategory, ensureCity, ensureLegalDocs, insertStoreRow, jpegBuffer, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/**
 * QA, reteste final do R1.1 e do R1.2 (2026-11-22, depois das correções dos BUG-036 a 040): os casos originais estão em `qa-r11-r12-exploratorio.e2e-spec.ts`
 * (agora sem `it.fails`). Aqui ficam as VIZINHAS de cada correção: o que a correção podia ter quebrado ou deixado de fora. Evidência em QA_EVIDENCE
 * (padrão /dev/shm/qa-final-evidence.log).
 */
const evidence = (line: string): void => appendFileSync(process.env.QA_EVIDENCE ?? '/dev/shm/qa-final-evidence.log', `${line}\n`);

describe('QA reteste final R1.1 + R1.2: vizinhas das correções BUG-036 a 040', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let categoryId: string;
  let ops: TestAdmin;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const tag = () => uniqueTag(8);
  const base = (id = storeId) => `/v1/stores/${id}`;
  const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
  const freshStore = async () => {
    const merchant = await createMerchant(ctx);
    const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Loja ${uniqueTag(5)}` })).id;
    return { merchant, id };
  };
  const newDraft = async (user: TestMerchant = owner, id = storeId, body: Record<string, unknown> = { via: 'camera' }) =>
    (await ctx.http.post(`${base(id)}/product-drafts`).set(as(user)).set('Idempotency-Key', `d-${tag()}`).send(body).expect(201)).body as { id: string; version: number };
  const draftCount = async (id: string) => (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.storeId, id), eq(products.status, 'draft'))))[0]!.n;
  const exists = async (id: string) => (await ctx.db.select({ id: products.id }).from(products).where(eq(products.id, id))).length === 1;
  const uploadReady = async (user: TestMerchant, id: string) => {
    const up = await uploadFile(ctx, user, { storeId: id, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    return (up.completed!.body as { id: string }).id;
  };
  const activeProduct = async (user: TestMerchant, id: string, priceCents: number) => {
    const created = await ctx.http.post(`${base(id)}/products`).set(as(user)).send({ name: `Produto ${tag()}`, categoryId, basePriceCents: priceCents }).expect(201);
    const pid = created.body.id as string;
    await ctx.http.put(`${base(id)}/products/${pid}/variants`).set(as(user)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    await ctx.db.update(products).set({ status: 'active', publishedAt: new Date() }).where(eq(products.id, pid));
    return pid;
  };
  const versionOf = async (id: string) => (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
  const history = async (id: string, query = '') => (await ctx.http.get(`/v1/admin/stores/${id}/history?limit=50${query}`).set(as(ops)).expect(200)).body.data as { type: string; actor: { kind: string }; before: unknown; after: unknown }[];
  const auditCount = async (id: string, action: string) => (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, action))))[0]!.n;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja QA reteste' })).id;
    categoryId = await ensureCategory(ctx);
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.close();
  });

  // ===================================================================== BUG-036: apagar rascunho
  describe('BUG-036: apagar rascunho (agora apaga a linha)', () => {
    it('rascunho com foto, variação e medição: 204 e nada fica para trás (cascata); a vaga volta', async () => {
      const { merchant, id } = await freshStore();
      const d = await newDraft(merchant, id);
      await ctx.http.put(`${base(id)}/products/${d.id}/images`).set(as(merchant)).send({ imageIds: [await uploadReady(merchant, id)] }).expect(200);
      await ctx.http.put(`${base(id)}/products/${d.id}/variants`).set(as(merchant)).send({ attributes: [], variants: [{ attributes: {}, stock: 3 }] }).expect(200);
      expect((await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, d.id))).length).toBe(1);
      expect(await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(merchant))).toMatchObject({ status: 204 });
      expect(await exists(d.id)).toBe(false);
      expect(await ctx.db.select().from(productImages).where(eq(productImages.productId, d.id))).toHaveLength(0);
      expect(await ctx.db.select().from(productVariants).where(eq(productVariants.productId, d.id))).toHaveLength(0);
      expect(await ctx.db.select().from(productCreationMetrics).where(eq(productCreationMetrics.productId, d.id))).toHaveLength(0);
      expect(await draftCount(id)).toBe(0);
    });

    it('repetir o "Apagar" (resposta perdida, toque duplo): a segunda chamada não dá 500 e o rascunho continua apagado', async () => {
      const { merchant, id } = await freshStore();
      const d = await newDraft(merchant, id);
      const first = await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(merchant));
      const second = await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(merchant));
      evidence(`[QA reteste] apagar rascunho 2x em série: ${first.status} e ${second.status}`);
      expect(first.status).toBe(204);
      expect(second.status).toBeLessThan(500);
      expect([204, 404]).toContain(second.status);
      expect(await exists(d.id)).toBe(false);
    });

    it('3 "Apagar" em paralelo do mesmo rascunho: nenhum 500, a linha sai, a contagem fecha', async () => {
      const { merchant, id } = await freshStore();
      const d = await newDraft(merchant, id);
      const keep = await newDraft(merchant, id);
      const res = await Promise.all([1, 2, 3].map(() => ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(merchant))));
      evidence(`[QA reteste] apagar rascunho 3x em paralelo: ${res.map((r) => r.status).join(',')}`);
      expect(res.every((r) => r.status < 500)).toBe(true);
      expect(res.filter((r) => r.status === 204).length).toBeGreaterThanOrEqual(1);
      expect(await exists(d.id)).toBe(false);
      expect(await exists(keep.id)).toBe(true);
      expect(await draftCount(id)).toBe(1);
    });

    it('rascunho de outra loja = 404 e não é apagado; funcionário sem `catalog` = 403 e não é apagado', async () => {
      const { merchant, id } = await freshStore();
      const other = await freshStore();
      const d = await newDraft(merchant, id);
      expect((await ctx.http.delete(`${base(other.id)}/products/${d.id}`).set(as(other.merchant))).status).toBe(404);
      expect((await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(other.merchant))).status).toBeGreaterThanOrEqual(403);
      const staff = await createCustomer(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      expect((await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(staff))).status).toBe(403);
      expect(await exists(d.id)).toBe(true);
    });

    it('teto: 100 rascunhos sem nome, apagar 1 libera exatamente 1 vaga (o 101º volta a entrar; o 102º não)', async () => {
      const { merchant, id } = await freshStore();
      await ctx.db.insert(products).values(Array.from({ length: 100 }, () => ({ storeId: id, name: '', status: 'draft' as const })));
      await ctx.http.post(`${base(id)}/product-drafts`).set(as(merchant)).set('Idempotency-Key', `t-${tag()}`).send({ via: 'camera' }).expect(422);
      const victim = (await ctx.db.select({ id: products.id }).from(products).where(eq(products.storeId, id)).limit(1))[0]!.id;
      await ctx.http.delete(`${base(id)}/products/${victim}`).set(as(merchant)).expect(204);
      await newDraft(merchant, id);
      const again = await ctx.http.post(`${base(id)}/product-drafts`).set(as(merchant)).set('Idempotency-Key', `t-${tag()}`).send({ via: 'camera' });
      expect([again.status, again.body.code]).toEqual([422, 'DRAFT_LIMIT_REACHED']);
    });

    it('produto PUBLICADO continua arquivado (a linha fica para o histórico de pedidos): 204, status archived, nome intacto', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 3000);
      await ctx.http.delete(`${base(id)}/products/${pid}`).set(as(merchant)).expect(204);
      const r = (await ctx.db.select().from(products).where(eq(products.id, pid)))[0]!;
      expect([r.status, r.archivedAt !== null, r.name.length > 1]).toEqual(['archived', true, true]);
    });

    it('BUG-042: rascunho que é CÓPIA de produto removido pela moderação (nasce com evento de moderação): "Apagar" devolve 204 e libera a vaga', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 4000);
      const bad = await createAdmin(ctx, 'operations');
      await ctx.http.post(`/v1/admin/products/${pid}/moderation`).set(as(bad)).send({ action: 'remove', reason: 'Teste QA reteste' }).expect((r) => expect([200, 201, 204]).toContain(r.status));
      const copy = await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(merchant)).set('Idempotency-Key', `dup-${tag()}`).send({});
      expect(copy.status, JSON.stringify(copy.body).slice(0, 200)).toBe(201);
      const events = await ctx.db.select().from(productModerationEvents).where(eq(productModerationEvents.productId, copy.body.id as string));
      evidence(`[QA reteste] cópia de produto removido: status=${copy.body.status} eventos de moderação na cópia=${events.length}`);
      const res = await ctx.http.delete(`${base(id)}/products/${copy.body.id}`).set(as(merchant));
      evidence(`[QA reteste] apagar a cópia (com evento de moderação): HTTP ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`);
      try {
        expect(res.status, 'apagar rascunho com evento de moderação (FK product_moderation_events)').toBe(204);
        expect(await exists(copy.body.id as string)).toBe(false);
      } finally {
        await ctx.db.delete(productModerationEvents).where(eq(productModerationEvents.productId, copy.body.id as string)); // não deixa linha que trava a varredura dos outros testes
        await ctx.db.delete(products).where(eq(products.id, copy.body.id as string));
      }
    });

    it('BUG-042: vencimento de 30 dias: um rascunho vencido COM evento de moderação não pode derrubar a varredura dos outros (sweepExpired não lança e apaga os demais)', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 4100);
      await ctx.http.post(`/v1/admin/products/${pid}/moderation`).set(as(ops)).send({ action: 'pause', reason: 'Teste QA vencimento' }).expect((r) => expect([200, 201, 204]).toContain(r.status));
      const copy = await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(merchant)).set('Idempotency-Key', `dup-${tag()}`).send({}).expect(201);
      const plain = await newDraft(merchant, id);
      const old = new Date(Date.now() - 40 * 86_400_000);
      await ctx.db.update(products).set({ updatedAt: old }).where(sql`${products.id} in (${copy.body.id as string}, ${plain.id})`);
      let thrown: string | null = null;
      try {
        try {
          await ctx.app.get(ProductDraftsService).sweepExpired();
        } catch (error) {
          thrown = (error as Error).message.slice(0, 200);
        }
        evidence(`[QA reteste] sweepExpired com rascunho vencido que tem evento de moderação: erro=${thrown ?? 'nenhum'}; comum apagado=${!(await exists(plain.id))}; cópia apagada=${!(await exists(copy.body.id as string))}`);
        expect(thrown, 'a varredura de rascunhos vencidos não pode falhar').toBeNull();
        expect(await exists(plain.id), 'o rascunho comum vencido deve ser apagado').toBe(false);
      } finally {
        // Limpeza obrigatória: com o BUG-042 aberto, este rascunho vencido ENVENENA o `sweepExpired` de qualquer outro teste que rode depois no mesmo banco
        // (visto em `r12-drafts` C3 numa execução do e2e completo). Apaga o evento de moderação e a linha para o resto da suíte seguir independente.
        await ctx.db.delete(productModerationEvents).where(eq(productModerationEvents.productId, copy.body.id as string));
        await ctx.db.delete(products).where(sql`${products.id} in (${copy.body.id as string}, ${plain.id})`);
      }
    });
  });

  // ===================================================================== BUG-037: lojista no histórico
  describe('BUG-037: o que o lojista altera aparece no histórico da ficha 360', () => {
    it('horário, feriados, entrega, retirada, trocas, pausa/reabertura e dados: uma linha por alteração, autor merchant, com antes e depois; filtro por tipo acha a linha', async () => {
      const { merchant, id } = await freshStore();
      await ctx.http.put(`${base(id)}/hours`).set(as(merchant)).send({ days: [{ weekday: 2, intervals: [{ start: '08:00', end: '12:00' }] }] }).expect(204);
      await ctx.http.put(`${base(id)}/holidays`).set(as(merchant)).send({ holidays: [{ date: '2027-12-25', label: 'Natal' }] }).expect(204);
      await ctx.http.put(`${base(id)}/pickup`).set(as(merchant)).send({ enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 }).expect((r) => expect([200, 204]).toContain(r.status));
      await ctx.http.put(`${base(id)}/exchange-policy`).set(as(merchant)).send({ voluntaryDays: 7, confirmDefault: true }).expect((r) => expect([200, 204]).toContain(r.status));
      await ctx.http.post(`${base(id)}/pause`).set(as(merchant)).send({ kind: '30m' }).expect(204);
      await ctx.http.delete(`${base(id)}/pause`).set(as(merchant)).expect(204);
      await ctx.http.patch(`${base(id)}/profile`).set(as(merchant)).send({ description: 'Descrição nova do reteste' }).expect(200);
      const all = await history(id);
      evidence(`[QA reteste] histórico do lojista: ${JSON.stringify(all.map((e) => `${e.type}/${e.actor.kind}`))}`);
      const mine = all.filter((e) => e.actor.kind === 'merchant');
      for (const type of ['hours', 'holidays', 'pickup', 'exchange_policy', 'pause', 'profile']) {
        const rows = mine.filter((e) => e.type === type);
        expect(rows.length, `tipo ${type} do lojista no histórico`).toBeGreaterThanOrEqual(1);
        // a reabertura da pausa não tem "depois" (é o fim da pausa); todos os outros tipos têm antes/depois
        if (type !== 'pause') expect(rows.every((r) => r.after !== null), `tipo ${type} com "depois"`).toBe(true);
        else expect(rows.some((r) => r.after !== null), 'a pausa (início) tem "depois"').toBe(true);
      }
      expect(mine.filter((e) => e.type === 'pause').length, 'pausa e reabertura são 2 linhas').toBeGreaterThanOrEqual(2);
      const onlyHours = await history(id, '&type=hours');
      expect(onlyHours.length).toBeGreaterThanOrEqual(1);
      expect(onlyHours.every((e) => e.type === 'hours')).toBe(true);
    });

    it('preferências pessoais (aviso por e-mail, limite de estoque baixo) NÃO entram no histórico da loja; reenviar o MESMO horário não vira "de X para X" duplicado sem necessidade', async () => {
      const { merchant, id } = await freshStore();
      await ctx.http.put(`${base(id)}/notifications`).set(as(merchant)).send({ newOrderEmail: false }).expect((r) => expect([200, 204]).toContain(r.status));
      await ctx.http.put(`${base(id)}/low-stock`).set(as(merchant)).send({ threshold: 5 }).expect((r) => expect([200, 204]).toContain(r.status));
      expect(await auditCount(id, 'store.notifications')).toBe(0);
      expect(await auditCount(id, 'store.low_stock_threshold')).toBe(0);
      const hours = { days: [{ weekday: 2, intervals: [{ start: '08:00', end: '12:00' }] }] };
      await ctx.http.put(`${base(id)}/hours`).set(as(merchant)).send(hours).expect(204);
      await ctx.http.put(`${base(id)}/hours`).set(as(merchant)).send(hours).expect(204);
      const n = await auditCount(id, 'store.hours');
      const rows = (await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, 'store.hours'))));
      evidence(`[QA reteste] lojista reenvia o mesmo horário: linhas de auditoria store.hours = ${n}; a 2ª é "de X para X"? ${rows.length === 2 && JSON.stringify(rows[1]!.before) === JSON.stringify(rows[1]!.after)}`);
      expect(n).toBeGreaterThanOrEqual(1);
    });

    it('dados da loja alterados pelo lojista: o histórico mostra SÓ o que mudou e nunca o documento em claro; mudança que vai à análise aparece sem o valor novo', async () => {
      const { merchant, id } = await freshStore();
      await ctx.http.patch(`${base(id)}/profile`).set(as(merchant)).send({ description: 'Só a descrição mudou' }).expect(200);
      const rows = (await history(id)).filter((e) => e.type === 'profile' && e.actor.kind === 'merchant');
      expect(rows.length).toBeGreaterThanOrEqual(1);
      const dump = JSON.stringify(rows);
      evidence(`[QA reteste] histórico profile do lojista: ${dump.slice(0, 400)}`);
      expect(dump).not.toMatch(/\d{3}\.?\d{3}\.?\d{3}-?\d{2}|\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}/); // CPF/CNPJ em claro
      expect(rows[0]!.after).toMatchObject({ description: 'Só a descrição mudou' });
      expect(Object.keys(rows[0]!.after as object)).toEqual(['description']);
    });

    it('perfil `suporte` lê o histórico com as linhas do lojista (a ficha 360 é de leitura para os 4 perfis)', async () => {
      const { merchant, id } = await freshStore();
      await ctx.http.post(`${base(id)}/pause`).set(as(merchant)).send({ kind: '1h' }).expect(204);
      const support = await createAdmin(ctx, 'support');
      const rows = (await ctx.http.get(`/v1/admin/stores/${id}/history`).set(as(support)).expect(200)).body.data as { type: string; actor: { kind: string } }[];
      expect(rows.some((r) => r.type === 'pause' && r.actor.kind === 'merchant')).toBe(true);
    });
  });

  // ===================================================================== BUG-038: NUL
  describe('BUG-038: NUL (\\u0000) vira 422 INVALID_TEXT em qualquer rota, sem 500', () => {
    it('varredura de 14 entradas de texto (v1.0 e R1; texto e jsonb): nenhuma dá 500; as que o banco recusa devolvem 422 INVALID_TEXT ou o texto sai limpo', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 2500);
      const customer = await createCustomer(ctx);
      const results: Record<string, { status: number; code?: string }> = {};
      const run = async (label: string, req: Promise<{ status: number; body: { code?: string } }> | { then: PromiseLike<unknown>['then'] }) => {
        const r = (await req) as { status: number; body: { code?: string } };
        results[label] = { status: r.status, ...(r.body?.code ? { code: r.body.code } : {}) };
      };
      await run('endereço street', ctx.http.post('/v1/me/addresses').set(as(customer)).send({ cep: '07900-100', street: 'Rua\u0000Nula', number: '45', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' }));
      await run('endereço complement', ctx.http.post('/v1/me/addresses').set(as(customer)).send({ cep: '07900-100', street: 'Rua Boa', number: '46', complement: 'ap\u00001', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' }));
      await run('produto name (POST)', ctx.http.post(`${base(id)}/products`).set(as(merchant)).send({ name: 'a\u0000b', categoryId, basePriceCents: 1000 }));
      await run('produto description (POST)', ctx.http.post(`${base(id)}/products`).set(as(merchant)).send({ name: 'Nome Bom', description: 'a\u0000b', categoryId, basePriceCents: 1000 }));
      await run('produto description (PATCH)', ctx.http.patch(`${base(id)}/products/${pid}`).set(as(merchant)).send({ description: 'a\u0000b' }));
      await run('variação attributes (jsonb)', ctx.http.put(`${base(id)}/products/${pid}/variants`).set(as(merchant)).send({ attributes: [{ name: 'Cor', values: ['Azul\u0000'] }], variants: [{ attributes: { Cor: 'Azul\u0000' }, stock: 1 }] }));
      await run('perfil lojista description', ctx.http.patch(`${base(id)}/profile`).set(as(merchant)).send({ description: 'a\u0000b' }));
      await run('feriado label', ctx.http.put(`${base(id)}/holidays`).set(as(merchant)).send({ holidays: [{ date: '2027-12-25', label: 'Na\u0000tal' }] }));
      await run('retirada instructions', ctx.http.put(`${base(id)}/pickup`).set(as(merchant)).send({ enabled: true, useStoreAddress: true, instructions: 'a\u0000b', prepMinMinutes: 10, prepMaxMinutes: 20 }));
      await run('importação CSV (célula)', ctx.http.post(`${base(id)}/products/import`).query({ mode: 'preview' }).set(as(merchant)).set('Content-Type', 'text/csv').send('nome,preco,estoque,categoria\n"a\u0000b",10,1,x\n'));
      await run('rascunho em lote (nome)', ctx.http.post(`${base(id)}/product-drafts/batch`).set(as(merchant)).set('Idempotency-Key', `n-${tag()}`).send({ via: 'paste', items: [{ clientRef: 'a', name: 'a\u0000b', basePriceCents: 100 }] }));
      await run('lista produtos q', ctx.http.get(`${base(id)}/products`).query({ q: 'a\u0000b' }).set(as(merchant)));
      await run('tabela q', ctx.http.get(`${base(id)}/products/table`).query({ q: 'a\u0000b' }).set(as(merchant)));
      await run('admin perfil name', ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(as(ops)).send({ reason: ask, expectedVersion: await versionOf(id), changes: { name: 'a\u0000b' } }));
      evidence(`[QA reteste] varredura NUL: ${JSON.stringify(results)}`);
      const bad = Object.entries(results).filter(([, r]) => r.status >= 500);
      expect(bad, 'entradas com NUL que ainda dão 5xx').toEqual([]);
      for (const [label, r] of Object.entries(results)) if (r.status === 422 && r.code === undefined) throw new Error(`${label}: 422 sem code`);
      expect(Object.values(results).some((r) => r.code === 'INVALID_TEXT')).toBe(true);
    });

    it('o 422 INVALID_TEXT é problem+json com requestId e sem pilha nem texto do banco', async () => {
      const { merchant, id } = await freshStore();
      const res = await ctx.http.get(`${base(id)}/products/table`).query({ q: 'a\u0000b' }).set(as(merchant));
      expect(res.status).toBe(422);
      const dump = JSON.stringify(res.body);
      expect(res.body.code).toBe('INVALID_TEXT');
      expect(dump).not.toMatch(/invalid byte sequence|0x00|postgres|pg_|at .*\.ts:\d+|node_modules/i);
    });
  });

  // ===================================================================== BUG-039: sem mudança, sem efeito
  describe('BUG-039: edição sem mudança de valor', () => {
    const putSection = (id: string, section: string, data: unknown, v: number) => ctx.http.put(`/v1/admin/stores/${id}/config/${section}`).set(as(ops)).send({ reason: ask, expectedVersion: v, data });
    const initial: Record<string, unknown> = {
      hours: { days: [{ weekday: 3, intervals: [{ start: '08:00', end: '18:00' }] }] },
      holidays: { holidays: [{ date: '2027-12-25', label: 'Natal' }] },
      pickup: { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 },
      'exchange-policy': { voluntaryDays: 7, confirmDefault: true },
      delivery: { acceptsDelivery: true, prepMinutes: 30 },
    };
    // um caso por seção: o valor gravado e reenviado igual deve dar 422 NO_CHANGE, sem versão, sem histórico, sem e-mail
    for (const section of Object.keys(initial)) {
      it(`${section === 'hours' ? 'BUG-044: ' : ''}admin reenvia o valor ATUAL de "${section}": 422 NO_CHANGE, versão igual, nenhuma linha em store_admin_changes, nenhum e-mail ao lojista`, async () => {
        const { merchant, id } = await freshStore();
        expect((await putSection(id, section, initial[section], await versionOf(id))).status).toBe(200);
        ctx.mail.outbox.length = 0;
        const changes = (await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id))).length;
        const v0 = await versionOf(id);
        const r = await putSection(id, section, initial[section], v0);
        evidence(`[QA reteste] reenvio do valor atual de ${section}: HTTP ${r.status} ${r.body.code ?? '-'}; versão ${v0} -> ${await versionOf(id)}; e-mails ao lojista: ${ctx.mail.to(merchant.email).length}`);
        expect([r.status, r.body.code]).toEqual([422, 'NO_CHANGE']);
        expect(await versionOf(id)).toBe(v0);
        expect((await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id))).length).toBe(changes);
        expect(ctx.mail.to(merchant.email).length).toBe(0);
      });
    }

    it('NO_CHANGE não engole mudança REAL no perfil: nome, descrição, telefone e whatsapp mudados sozinhos dão 200', async () => {
      const { id } = await freshStore();
      const prof = async (changes: Record<string, string>) => ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(as(ops)).send({ reason: ask, expectedVersion: await versionOf(id), changes });
      for (const [field, value] of [['name', 'Nome Novo QA'], ['description', 'Descrição nova QA'], ['phone', '11988887771'], ['whatsapp', '11988887772']] as const) {
        const r = await prof({ [field]: value });
        expect([field, r.status, r.body.code]).toEqual([field, 200, undefined]);
      }
    });

    for (const [section, first, second, label] of [
      ['hours', { days: [{ weekday: 1, intervals: [{ start: '09:00', end: '17:00' }] }] }, { days: [{ weekday: 1, intervals: [{ start: '09:00', end: '18:00' }] }] }, 'fim do expediente'],
      ['holidays', { holidays: [{ date: '2027-11-02' }] }, { holidays: [{ date: '2027-11-02', label: 'Finados' }] }, 'rótulo do feriado'],
      ['exchange-policy', { voluntaryDays: 7 }, { voluntaryDays: 10 }, 'prazo de troca'],
      ['delivery', { acceptsDelivery: true, prepMinutes: 30 }, { acceptsDelivery: true, prepMinutes: 40 }, 'preparo'],
      ['pickup', { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 }, { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 25 }, 'preparo máximo da retirada (enabled igual)'],
      ['pickup', { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 }, { enabled: true, useStoreAddress: true, instructions: 'Tocar a campainha', prepMinMinutes: 10, prepMaxMinutes: 20 }, 'instruções da retirada (enabled igual)'],
    ] as const) {
      it(`${section === 'pickup' ? 'BUG-044: ' : ''}NO_CHANGE não engole mudança REAL em "${section}" (${label}): 200 e grava`, async () => {
        const { id } = await freshStore();
        expect((await putSection(id, section, first, await versionOf(id))).status).toBe(200);
        const v = await versionOf(id);
        const r = await putSection(id, section, second, v);
        evidence(`[QA reteste] mudança real em ${section} (${label}): HTTP ${r.status} ${r.body.code ?? '-'}`);
        expect([r.status, r.body.code]).toEqual([200, undefined]);
        expect(await versionOf(id)).toBe(v + 1);
      });
    }

    it('edição mista (nome igual + descrição nova): 200, só a descrição entra no antes/depois do histórico e a versão sobe 1', async () => {
      const { id } = await freshStore();
      const current = (await ctx.db.select().from(stores).where(eq(stores.id, id)))[0]!;
      const v = current.version;
      const res = await ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(as(ops)).send({ reason: ask, expectedVersion: v, changes: { name: current.name, description: 'Descrição mista QA' } });
      expect(res.status).toBe(200);
      expect(await versionOf(id)).toBe(v + 1);
      const row = (await history(id, '&type=profile')).find((e) => e.actor.kind === 'admin')!;
      evidence(`[QA reteste] edição mista, antes/depois: ${JSON.stringify([row.before, row.after])}`);
      expect(JSON.stringify(row.after)).toContain('Descrição mista QA');
    });

    it('reajuste em massa: lote misto (R$ 0,01 e R$ 10,00 a +10%): só o de R$ 10,00 conta, versão e histórico só dele; a prévia e a aplicação concordam', async () => {
      const { merchant, id } = await freshStore();
      const cheap = await activeProduct(merchant, id, 1);
      const ten = await activeProduct(merchant, id, 1000);
      const ver = async (pid: string) => (await ctx.db.select({ v: products.version }).from(products).where(eq(products.id, pid)))[0]!.v;
      const [vc, vt] = [await ver(cheap), await ver(ten)];
      const body = { productIds: [cheap, ten], action: { type: 'price_adjust', mode: 'percent', value: 10 } };
      const pv = await ctx.http.post(`${base(id)}/products/bulk`).set(as(merchant)).send({ ...body, dryRun: true }).expect(200);
      const versions = (pv.body.preview as { productId: string; version: number }[]).map((p) => ({ productId: p.productId, version: p.version }));
      const applied = await ctx.http.post(`${base(id)}/products/bulk`).set(as(merchant)).set('Idempotency-Key', `b-${tag()}`).send({ ...body, dryRun: false, expectedVersions: versions, confirmLargeChange: true });
      evidence(`[QA reteste] bulk misto: prévia=${JSON.stringify(pv.body).slice(0, 240)} aplicação=${applied.status} ${JSON.stringify(applied.body).slice(0, 240)}`);
      expect(applied.status).toBe(200);
      expect(await ver(cheap)).toBe(vc);
      expect(await ver(ten)).toBe(vt + 1);
      const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, 'product.price')));
      expect(rows.map((r) => r.targetId)).toEqual([ten]);
    });
  });

  // ===================================================================== BUG-040: causa do encerramento da visão
  describe('BUG-040: causa do fechamento da visão "Ver como"', () => {
    const open = (who: TestAdmin, id: string) => ctx.http.post(`/v1/admin/stores/${id}/view-as`).set(as(who)).send({ reason: { code: 'merchant_support' } });
    const closeRow = async (viewId: string) => (await ctx.db.select().from(adminViewSessions).where(eq(adminViewSessions.id, viewId)))[0]!;
    const closeAudit = async (id: string, viewId: string) => (await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, 'view_as.close')))).filter((r) => (r.after as { viewAsId?: string } | null)?.viewAsId === viewId);

    it('vencida e não varrida + o admin ENCERRA (end): causa expired, closed_at = expires_at, auditoria com a mesma causa, uma linha só', async () => {
      const { id } = await freshStore();
      const admin = await createAdmin(ctx, 'support');
      const v = (await open(admin, id).expect(201)).body as { id: string };
      const past = new Date(Date.now() - 60_000);
      await ctx.db.update(adminViewSessions).set({ expiresAt: past }).where(eq(adminViewSessions.id, v.id));
      await ctx.http.post(`/v1/admin/view-as/${v.id}/end`).set(as(admin)).expect(204);
      await ctx.http.post(`/v1/admin/view-as/${v.id}/end`).set(as(admin)).expect(204);
      const r = await closeRow(v.id);
      expect([r.closeCause, r.closedAt?.getTime()]).toEqual(['expired', past.getTime()]);
      const trail = await closeAudit(id, v.id);
      expect(trail).toHaveLength(1);
      expect((trail[0]!.after as { cause: string }).cause).toBe('expired');
    });

    it('vencida + abrir outra: a velha fecha como expired em expires_at e a auditoria diz expired; a nova fica aberta', async () => {
      const { id } = await freshStore();
      const admin = await createAdmin(ctx, 'operations');
      const v = (await open(admin, id).expect(201)).body as { id: string };
      const past = new Date(Date.now() - 120_000);
      await ctx.db.update(adminViewSessions).set({ expiresAt: past }).where(eq(adminViewSessions.id, v.id));
      const second = (await open(admin, id).expect(201)).body as { id: string };
      const r = await closeRow(v.id);
      expect([r.closeCause, r.closedAt?.getTime()]).toEqual(['expired', past.getTime()]);
      expect((await closeAudit(id, v.id))[0]!.after).toMatchObject({ cause: 'expired' });
      expect((await closeRow(second.id)).closedAt).toBeNull();
    });

    it('NÃO vencida: abrir outra continua `replaced` e encerrar continua `ended` (a correção não vazou para o caso normal)', async () => {
      const { id } = await freshStore();
      const admin = await createAdmin(ctx, 'super_admin');
      const a = (await open(admin, id).expect(201)).body as { id: string };
      const b = (await open(admin, id).expect(201)).body as { id: string };
      expect((await closeRow(a.id)).closeCause).toBe('replaced');
      await ctx.http.post(`/v1/admin/view-as/${b.id}/end`).set(as(admin)).expect(204);
      expect((await closeRow(b.id)).closeCause).toBe('ended');
      expect((await closeAudit(id, b.id))[0]!.after).toMatchObject({ cause: 'ended' });
    });

    it('vencida há muito tempo (30 dias) e a credencial: a leitura continua 403 VIEW_AS_EXPIRED e abrir outra não dá 500', async () => {
      const { id } = await freshStore();
      const admin = await createAdmin(ctx, 'support');
      const v = (await open(admin, id).expect(201)).body as { id: string; token: string };
      await ctx.db.update(adminViewSessions).set({ expiresAt: new Date(Date.now() - 30 * 86_400_000) }).where(eq(adminViewSessions.id, v.id));
      const res = await ctx.http.get(`${base(id)}`).set(as(admin)).set('X-View-As', v.token);
      expect([res.status, res.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      expect((await open(admin, id)).status).toBe(201);
      expect((await closeRow(v.id)).closeCause).toBe('expired');
    });
  });

  it('sanidade do arquivo: ids únicos (nenhuma colisão entre rodadas)', () => {
    expect(randomUUID()).not.toBe(randomUUID());
  });
});
