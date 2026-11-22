import { randomUUID } from 'node:crypto';
import { and, eq, like } from 'drizzle-orm';
import type { Response } from 'supertest';
import { vi } from 'vitest';
import { AuditService } from '../src/modules/admin/index.js';
import { auditLog, idempotencyKeys, productBulkBatches, productVariants, products, storeAdminChanges } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';
import { validateAgainst } from './helpers/openapi-schema.js';

/**
 * v1.1 R1.3, WB-353 C6/C11 e C-ADM-07 (ADR-018 D6, D7, D17, D18): `bulkAdminStoreProducts`. Pausar, reativar e ajustar estoque de até 200 produtos da loja pelo admin,
 * com motivo, versão por item, 1 linha de auditoria por item, 1 aviso agregado ao lojista, limite de 10 por hora por admin e idempotência na MESMA transação (SEC-208).
 */
describe('Ação em massa do admin no catálogo da loja (WB-353 C6, C11, C-ADM-07)', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;
  let superAdmin: TestAdmin;
  let owner: TestMerchant;
  let other: TestMerchant;
  let storeId: string;
  let otherStoreId: string;
  let categoryId: string;
  const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const url = (id = storeId) => `/v1/admin/stores/${id}/products/bulk`;
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!;
  const stockOf = async (variantId: string) => (await ctx.db.select().from(productVariants).where(eq(productVariants.id, variantId)))[0]!;

  /** Produto ativo com 1 variação (estoque `stock`), pelas rotas reais do lojista e um UPDATE de status (publicar exige foto). */
  async function product(stock = 10, status: 'active' | 'paused' | 'draft' = 'active', id = storeId, user: { accessToken: string } = owner): Promise<{ id: string; variantId: string; version: number }> {
    const created = await ctx.http.post(`/v1/stores/${id}/products`).set(as(user)).send({ name: `Produto ${uniqueTag(6)}`, categoryId, basePriceCents: 5_000 }).expect(201);
    const pid = created.body.id as string;
    const withVariant = await ctx.http.put(`/v1/stores/${id}/products/${pid}/variants`).set(as(user)).send({ attributes: [], variants: [{ attributes: {}, stock }] }).expect(200);
    await ctx.db.update(products).set({ status }).where(eq(products.id, pid));
    return { id: pid, variantId: withVariant.body.variants[0].id as string, version: (await row(pid)).version };
  }
  const body = (ps: { id: string }[], action: object, over: Record<string, unknown> = {}) => ({ reason: ask, productIds: ps.map((p) => p.id), action, ...over });
  const versionsOf = async (ps: { id: string }[]) => Promise.all(ps.map(async (p) => ({ productId: p.id, version: (await row(p.id)).version })));
  const send = (who: { accessToken: string }, payload: unknown, key: string | null, id = storeId) => {
    const req = ctx.http.post(url(id)).set(as(who));
    return (key ? req.set('Idempotency-Key', key) : req).send(payload as object);
  };
  type Call = Promise<Response> & { expect: (status: number) => Promise<Response> };
  const run = (ps: { id: string }[], action: object, key: string | null = `ab-${uniqueTag(10)}`, who: { accessToken: string } = ops, over: Record<string, unknown> = {}): Call => {
    const call = (async () => send(who, body(ps, action, { expectedVersions: await versionsOf(ps), ...over }), key))() as Promise<Response>;
    return Object.assign(call, {
      expect: async (status: number) => {
        const res = await call;
        if (res.status !== status) throw new Error(`esperado ${status}, veio ${res.status}: ${JSON.stringify(res.body)}`);
        return res;
      },
    });
  };
  const trail = (action: string, id = storeId) => ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.action, action)));
  const feedRows = (id = storeId) => ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id));
  const batches = (id = storeId) => ctx.db.select().from(productBulkBatches).where(eq(productBulkBatches.storeId, id));
  const setFlag = (enabled: boolean) => ctx.http.put('/v1/admin/feature-flags/admin_edita_catalogo_sem_pedido').set(as(superAdmin)).send({ enabled, reason: 'teste da WB-353' }).expect(200);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    [superAdmin, ops, finance, support] = [await createAdmin(ctx, 'super_admin'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Massa Admin' })).id;
    other = await createMerchant(ctx);
    otherStoreId = (await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra Loja Massa Admin' })).id;
    categoryId = await ensureCategory(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('acesso e motivo', () => {
    it('só super admin e operação (`store-catalog:write`): financeiro, suporte, lojista dono e cliente = 403; sem token = 401; loja inexistente = 404', async () => {
      const ps = [await product()];
      for (const who of [finance, support, owner]) await send(who, body(ps, { type: 'pause' }), null).expect(403);
      await send(ops, body(ps, { type: 'pause' }, { dryRun: true }), null, '00000000-0000-4000-8000-000000000000').expect(404);
      await ctx.http.post(url()).send(body(ps, { type: 'pause' })).expect(401);
      expect((await row(ps[0]!.id)).status).toBe('active');
      await send(superAdmin, body(ps, { type: 'pause' }, { dryRun: true }), null).expect(200);
    });

    it('C-ADM-03/J27: sem motivo = 422 REASON_REQUIRED; com a flag `admin_edita_catalogo_sem_pedido` DESLIGADA só vale "solicitado pelo lojista" (422 REASON_NOT_ALLOWED); ligada, vale o catálogo todo', async () => {
      const ps = [await product()];
      for (const reason of [undefined, {}, { code: 'requested_by_merchant' }, { code: 'porque_sim', note: 'x' }]) {
        const res = await send(ops, { reason, productIds: [ps[0]!.id], action: { type: 'pause' }, dryRun: true }, null);
        expect(res.status, JSON.stringify(reason)).toBe(422);
        expect(res.body.code).toBe('REASON_REQUIRED');
      }
      const off = await send(ops, body(ps, { type: 'pause' }, { reason: { code: 'error_fix' }, dryRun: true }), null).expect(422);
      expect(off.body.code).toBe('REASON_NOT_ALLOWED');
      await setFlag(true);
      try {
        await send(ops, body(ps, { type: 'pause' }, { reason: { code: 'error_fix' }, dryRun: true }), null).expect(200);
      } finally {
        await setFlag(false);
      }
    });

    it('corpo estrito (campo a mais, ação desconhecida, valor fora de 0..99.999) = 400; mais de 200 itens = 422 BULK_TOO_LARGE e nada é feito', async () => {
      const ps = [await product()];
      await send(ops, { ...body(ps, { type: 'pause' }), extra: 1 }, null).expect(400);
      await send(ops, body(ps, { type: 'price_adjust', mode: 'percent', value: 10 }), null).expect(400); // preço em massa pelo admin NÃO existe na R1 (D7)
      await send(ops, body(ps, { type: 'stock_set', value: 100_000 }), null).expect(400);
      await send(ops, body(ps, { type: 'stock_set', value: 1.5 }), null).expect(400);
      const many = Array.from({ length: 201 }, () => ({ id: randomUUID() }));
      const tooLarge = await send(ops, body(many, { type: 'pause' }, { dryRun: true }), null).expect(422);
      expect(tooLarge.body.code).toBe('BULK_TOO_LARGE');
    });
  });

  describe('visão do lojista e chave de outro admin (SEC §19.4 obs. 1)', () => {
    it('com `X-View-As` (visão válida) a rota de massa do admin = 403 VIEW_AS_READ_ONLY, prévia e execução, e nada é aplicado nem gravado', async () => {
      const ps = [await product()];
      const view = (await ctx.http.post(`/v1/admin/stores/${storeId}/view-as`).set(as(ops)).send({ reason: { code: 'merchant_support' } }).expect(201)).body as { token: string };
      const lots = (await batches()).length;
      const key = `va-${uniqueTag(10)}`;
      for (const over of [{ dryRun: true }, { expectedVersions: await versionsOf(ps) }]) {
        const res = await send(ops, body(ps, { type: 'pause' }, over), key).set('X-View-As', view.token);
        expect([res.status, res.body.code], JSON.stringify(over)).toEqual([403, 'VIEW_AS_READ_ONLY']);
      }
      expect((await row(ps[0]!.id)).status).toBe('active');
      expect((await batches()).length).toBe(lots);
      expect(await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))).toHaveLength(0);
    });

    it('a MESMA `Idempotency-Key` usada por OUTRO admin não colide: cada um executa o seu (o escopo inclui o admin) e a repetição de cada um devolve a própria resposta', async () => {
      const ps = [await product(10), await product(10)];
      const key = `shared-${uniqueTag(10)}`;
      const [first, second] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'operations')]; // admins próprios: o limite de 10/h do `ops` é consumido pelo resto do arquivo
      const a = await run(ps, { type: 'stock_adjust', value: 1 }, key, first).expect(200);
      const b = await run(ps, { type: 'stock_adjust', value: 1 }, key, second).expect(200); // outro admin, mesma chave, mesmo corpo: executa de novo (não devolve a resposta do primeiro)
      expect(b.body.batchId).not.toBe(a.body.batchId);
      expect((await stockOf(ps[0]!.variantId)).stock).toBe(12);
      const again = await send(first, body(ps, { type: 'stock_adjust', value: 1 }, { expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })) }), key).expect(200);
      expect(again.body).toEqual(a.body);
      expect((await stockOf(ps[0]!.variantId)).stock).toBe(12); // a repetição do primeiro não soma de novo
      const scopes = (await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))).map((r) => r.scope).sort();
      expect(scopes).toEqual([`admin-bulk:${storeId}:${first.userId}`, `admin-bulk:${storeId}:${second.userId}`].sort());
    });
  });

  describe('prévia (dryRun)', () => {
    it('devolve a versão de TODOS os itens e o que seria bloqueado, sem gravar nada, sem exigir chave e sem consumir o limite de 10 por hora', async () => {
      const a = await product(10);
      const draft = await product(10, 'draft');
      const batchesBefore = (await batches()).length;
      const trailBefore = (await trail('product.stock_adjust')).length;
      const res = await send(ops, body([a, draft], { type: 'stock_adjust', value: 5 }, { dryRun: true }), null).expect(200);
      expect(validateAgainst('AdminBulkResult', res.body)).toEqual([]);
      expect(res.body).toMatchObject({ dryRun: true, willChange: 1, changed: 0, auditEntries: 0, batchId: null, merchantNotified: 'none' });
      expect(res.body.preview).toEqual(expect.arrayContaining([{ productId: a.id, name: expect.any(String), version: a.version }, { productId: draft.id, name: expect.any(String), version: draft.version }]));
      expect(res.body.blocked).toEqual([{ productId: draft.id, name: expect.any(String), reason: 'NOT_ACTIVE' }]);
      expect((await stockOf(a.variantId)).stock).toBe(10);
      expect((await batches()).length).toBe(batchesBefore);
      expect((await trail('product.stock_adjust')).length).toBe(trailBefore);
      for (let i = 0; i < 12; i += 1) await send(ops, body([a], { type: 'pause' }, { dryRun: true }), null).expect(200); // 12 prévias não gastam o limite
    });
  });

  describe('execução', () => {
    it('exige Idempotency-Key (400 IDEMPOTENCY_KEY_REQUIRED) e expectedVersions de TODOS os itens (400 EXPECTED_VERSIONS_REQUIRED); nada é aplicado sem elas', async () => {
      const ps = [await product(), await product()];
      expect((await send(ops, body(ps, { type: 'pause' }, { expectedVersions: await versionsOf(ps) }), null).expect(400)).body.code).toBe('IDEMPOTENCY_KEY_REQUIRED');
      const key = `ab-${uniqueTag(10)}`;
      expect((await send(ops, body(ps, { type: 'pause' }), key).expect(400)).body.code).toBe('EXPECTED_VERSIONS_REQUIRED');
      expect((await send(ops, body(ps, { type: 'pause' }, { expectedVersions: [(await versionsOf(ps))[0]] }), key).expect(400)).body.code).toBe('EXPECTED_VERSIONS_REQUIRED');
      expect((await row(ps[0]!.id)).status).toBe('active');
    });

    it('pausar N produtos: 1 lote, 1 linha de auditoria POR ITEM (admin como autor, motivo e loja), versão +1 em cada, 1 linha agregada no painel do lojista e 1 e-mail (nunca N)', async () => {
      const ps = await Promise.all(Array.from({ length: 5 }, () => product()));
      const feedBefore = (await feedRows()).length;
      const itemTrailBefore = (await trail('product.pause')).length;
      ctx.mail.outbox.length = 0;
      const res = await run(ps, { type: 'pause' }).expect(200);
      expect(validateAgainst('AdminBulkResult', res.body)).toEqual([]);
      expect(res.body).toMatchObject({ dryRun: false, willChange: 5, changed: 5, auditEntries: 5, merchantNotified: 'aggregate', blocked: [] });
      for (const p of ps) expect(await row(p.id)).toMatchObject({ status: 'paused', version: p.version + 1 });
      const items = (await trail('product.pause')).slice(itemTrailBefore);
      expect(items).toHaveLength(5);
      expect(items.every((r) => r.actorId === ops.userId && r.reason === 'requested_by_merchant|WhatsApp, 24/11' && r.storeId === storeId)).toBe(true);
      expect(items.find((r) => r.targetId === ps[0]!.id)).toMatchObject({ before: { status: 'active', version: ps[0]!.version }, after: { status: 'paused', version: ps[0]!.version + 1 } });
      const lot = (await batches()).find((b) => b.id === res.body.batchId)!;
      expect(lot).toMatchObject({ kind: 'pause', source: 'admin', actorUserId: ops.userId, itemsCount: 5, undoUntil: null });
      const feed = (await feedRows()).slice(feedBefore);
      expect(feed).toHaveLength(1);
      expect(feed[0]).toMatchObject({ type: 'bulk', reasonLabel: 'Solicitado pelo lojista (WhatsApp, 24/11)' });
      expect(feed[0]!.summary).toContain('5 produtos');
      expect(ctx.mail.to(owner.email).filter((m) => /Webag alterou/.test(m.subject))).toHaveLength(1);
      // o lojista vê UMA linha, autor "Webag", e o lote no histórico de ações em massa
      const mine = await ctx.http.get(`/v1/stores/${storeId}/admin-changes`).set(as(owner)).expect(200);
      expect(mine.body.data[0]).toMatchObject({ actor: 'Webag', type: 'bulk' });
      expect(JSON.stringify(mine.body)).not.toContain(ops.email);
      const history = await ctx.http.get(`/v1/stores/${storeId}/products/bulk-batches`).set(as(owner)).expect(200);
      expect(history.body.data[0]).toMatchObject({ id: res.body.batchId, kind: 'pause', source: 'admin', actorName: 'Webag', itemsCount: 5 });
      expect(JSON.stringify(history.body)).not.toContain('Admin operations');
      // e o admin o vê no histórico da loja (tipo `bulk` na linha da loja e `catalog` por item)
      const adminHistory = await ctx.http.get(`/v1/admin/stores/${storeId}/history?limit=50`).set(as(ops)).expect(200);
      expect(adminHistory.body.data.some((e: { type: string; actor: { kind: string } }) => e.type === 'bulk' && e.actor.kind === 'admin')).toBe(true);
    });

    it('reativar: produto pausado volta; já ativo não é alteração; o que a MODERAÇÃO pausou é PRODUCT_MODERATED (bloqueado, o resto passa)', async () => {
      const paused = await product(10, 'paused');
      const already = await product(10, 'active');
      const moderated = await product(10, 'paused');
      await ctx.db.update(products).set({ moderationStatus: 'paused' }).where(eq(products.id, moderated.id));
      const res = await run([paused, already, moderated], { type: 'resume' }).expect(200);
      expect(res.body).toMatchObject({ willChange: 1, changed: 1, auditEntries: 1 });
      expect(res.body.blocked).toEqual([{ productId: moderated.id, name: expect.any(String), reason: 'PRODUCT_MODERATED' }]);
      expect((await row(paused.id)).status).toBe('active');
      expect((await row(moderated.id)).status).toBe('paused'); // a moderação manda
      expect((await row(already.id)).version).toBe(already.version); // sem alteração, sem versão nova
    });

    it('estoque: `stock_set` e `stock_adjust` em produto de UMA variação; abaixo do reservado = STOCK_BELOW_RESERVED, grade = MULTIPLE_VARIANTS, rascunho = NOT_ACTIVE (bloqueados ficam de fora e o resto é aplicado); antes/depois por item', async () => {
      const ok = await product(10);
      const reserved = await product(10);
      await ctx.db.update(productVariants).set({ reserved: 6 }).where(eq(productVariants.id, reserved.variantId));
      const grid = await product(10);
      await ctx.http.put(`/v1/stores/${storeId}/products/${grid.id}/variants`).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 5 }, { attributes: { Tamanho: 'M' }, stock: 5 }] }).expect(200);
      const draft = await product(10, 'draft');
      const all = [ok, reserved, grid, draft];
      const res = await run(all, { type: 'stock_set', value: 3 }).expect(200);
      expect(res.body).toMatchObject({ willChange: 1, changed: 1, auditEntries: 1 });
      expect([...res.body.blocked].sort((a: { reason: string }, b: { reason: string }) => a.reason.localeCompare(b.reason)).map((b: { reason: string }) => b.reason)).toEqual(['MULTIPLE_VARIANTS', 'NOT_ACTIVE', 'STOCK_BELOW_RESERVED']);
      expect((await stockOf(ok.variantId)).stock).toBe(3);
      expect((await stockOf(reserved.variantId)).stock).toBe(10);
      expect((await row(ok.id)).version).toBe(ok.version + 1);
      const line = (await trail('product.stock_adjust')).find((r) => r.targetId === ok.variantId)!;
      expect(line).toMatchObject({ actorId: ops.userId, targetType: 'variant', before: { stock: 10 }, after: { stock: 3 } });
      const adjust = await run([ok], { type: 'stock_adjust', value: -2 }).expect(200);
      expect(adjust.body.changed).toBe(1);
      expect((await stockOf(ok.variantId)).stock).toBe(1);
      const below = await run([ok], { type: 'stock_adjust', value: -50 }).expect(200);
      expect(below.body).toMatchObject({ changed: 0, batchId: null, merchantNotified: 'none' });
      expect(below.body.blocked[0].reason).toBe('STOCK_BELOW_RESERVED');
      expect((await stockOf(ok.variantId)).stock).toBe(1);
    });

    it('A2: o estoque novo acima do limite REARMA o aviso de estoque baixo da variação; abaixo do limite não desarma (a regra é `lowStockTransition`)', async () => {
      const p = await product(10);
      const admin = await createAdmin(ctx, 'operations'); // admin próprio: o limite de 10/h do `ops` é consumido pelo resto do arquivo
      await ctx.db.update(productVariants).set({ lowStockArmed: false }).where(eq(productVariants.id, p.variantId));
      await run([p], { type: 'stock_set', value: 1 }, undefined, admin).expect(200); // baixo: continua desarmado
      expect((await stockOf(p.variantId)).lowStockArmed).toBe(false);
      await run([p], { type: 'stock_set', value: 500 }, undefined, admin).expect(200); // acima do limite: rearma
      expect((await stockOf(p.variantId)).lowStockArmed).toBe(true);
      await run([p], { type: 'stock_set', value: 1 }, undefined, admin).expect(200); // armado e baixo: o admin não desarma
      expect((await stockOf(p.variantId)).lowStockArmed).toBe(true);
    });

    it('produto de OUTRA loja ou inexistente = 404 para o pedido todo (nada aplicado); loja não aprovada = 409', async () => {
      const mine = await product();
      const theirs = await product(10, 'active', otherStoreId, other);
      await run([mine, theirs], { type: 'pause' }).expect(404);
      expect((await row(mine.id)).status).toBe('active');
      await send(ops, body([mine], { type: 'pause' }, { expectedVersions: await versionsOf([mine]) }), `ab-${uniqueTag(10)}`, otherStoreId).expect(404);
      const pending = await createMerchant(ctx);
      const pendingId = (await insertStoreRow(ctx, pending.userId, { status: 'in_review', name: 'Loja em análise' })).id;
      expect((await send(ops, body([mine], { type: 'pause' }, { dryRun: true }), null, pendingId).expect(409)).body.code).toBe('STORE_NOT_APPROVED');
    });
  });

  describe('versão e idempotência (SEC-208, BK)', () => {
    it('a MESMA chave devolve o MESMO corpo e o MESMO batchId, sem nova auditoria, novo aviso ou novo lote (e a repetição não gasta o limite)', async () => {
      const ps = [await product(), await product()];
      const key = `ab-${uniqueTag(10)}`;
      const first = await run(ps, { type: 'pause' }, key).expect(200);
      const lots = (await batches()).length;
      const trailCount = (await trail('product.pause')).length;
      const feedCount = (await feedRows()).length;
      ctx.mail.outbox.length = 0;
      const again = await send(ops, body(ps, { type: 'pause' }, { expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })) }), key).expect(200);
      expect(again.body).toEqual(first.body);
      expect((await batches()).length).toBe(lots);
      expect((await trail('product.pause')).length).toBe(trailCount);
      expect((await feedRows()).length).toBe(feedCount);
      expect(ctx.mail.to(owner.email)).toHaveLength(0);
      expect((await row(ps[0]!.id)).version).toBe(ps[0]!.version + 1);
      const reused = await send(ops, body(ps, { type: 'resume' }, { expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })) }), key).expect(422);
      expect(reused.body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    });

    it('2 requisições simultâneas com a mesma chave aplicam UMA vez (Promise.all) e respondem o mesmo corpo', async () => {
      const ps = [await product(10), await product(10)];
      const key = `ab-${uniqueTag(10)}`;
      const payload = body(ps, { type: 'stock_adjust', value: 4 }, { expectedVersions: await versionsOf(ps) });
      const [a, b] = await Promise.all([send(ops, payload, key), send(ops, payload, key)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body).toEqual(b.body);
      expect((await stockOf(ps[0]!.variantId)).stock).toBe(14); // nunca +8
    });

    it('versão alterada depois da prévia (o lojista editou) = 409 BULK_VERSION_CONFLICT com `conflicts`, NADA é aplicado (tudo ou nada), a chave fica livre e a prévia nova funciona', async () => {
      const ps = [await product(), await product()];
      const preview = await send(ops, body(ps, { type: 'pause' }, { dryRun: true }), null).expect(200);
      const seen = (preview.body.preview as { productId: string; version: number }[]).map((p) => ({ productId: p.productId, version: p.version }));
      await ctx.http.patch(`/v1/stores/${storeId}/products/${ps[1]!.id}`).set(as(owner)).send({ name: 'Alterado pelo lojista' }).expect(200);
      const key = `ab-${uniqueTag(10)}`;
      const conflict = await send(ops, body(ps, { type: 'pause' }, { expectedVersions: seen }), key).expect(409);
      expect(conflict.body.code).toBe('BULK_VERSION_CONFLICT');
      expect(conflict.body.conflicts).toEqual([{ productId: ps[1]!.id, name: 'Alterado pelo lojista', currentVersion: ps[1]!.version + 1 }]);
      expect((await row(ps[0]!.id)).status).toBe('active');
      expect(await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))).toHaveLength(0);
      const fresh = await send(ops, body(ps, { type: 'pause' }, { dryRun: true }), null).expect(200);
      await send(ops, body(ps, { type: 'pause' }, { expectedVersions: (fresh.body.preview as { productId: string; version: number }[]).map((p) => ({ productId: p.productId, version: p.version })) }), key).expect(200);
      expect((await row(ps[0]!.id)).status).toBe('paused');
    });

    it('falha ao gravar a auditoria de um item desfaz o lote inteiro (estoque, versão, lote, aviso e chave): nada fica sem trilha', async () => {
      const ps = [await product(10), await product(10)];
      const key = `ab-${uniqueTag(10)}`;
      const lots = (await batches()).length;
      const feedCount = (await feedRows()).length;
      const audit = ctx.app.get(AuditService);
      const original = audit.record.bind(audit);
      let calls = 0;
      const spy = vi.spyOn(audit, 'record').mockImplementation(async (...args) => {
        calls += 1;
        if (calls === 2) throw new Error('falha na trilha');
        return original(...args);
      });
      await run(ps, { type: 'stock_adjust', value: 5 }, key).expect(500);
      spy.mockRestore();
      expect((await stockOf(ps[0]!.variantId)).stock).toBe(10);
      expect((await row(ps[0]!.id)).version).toBe(ps[0]!.version);
      expect((await batches()).length).toBe(lots);
      expect((await feedRows()).length).toBe(feedCount);
      expect(await ctx.db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, key))).toHaveLength(0);
      await run(ps, { type: 'stock_adjust', value: 5 }, key).expect(200);
      expect((await stockOf(ps[0]!.variantId)).stock).toBe(15);
    });
  });

  describe('limite de 10 ações em massa por hora por admin (C6)', () => {
    it('a 11ª execução = 429 com Retry-After e NADA é aplicado; prévia, lote sem alteração e repetição da mesma chave não contam; outro admin não é afetado', async () => {
      const limited = await createAdmin(ctx, 'operations');
      const ps = [await product(), await product()];
      for (let i = 0; i < 10; i += 1) {
        const res = await run(ps, { type: i % 2 === 0 ? 'pause' : 'resume' }, `lim-${i}-${uniqueTag(8)}`, limited).expect(200);
        expect(res.body.changed).toBe(2);
      }
      // sem alteração (já estão ativos): não consome nem é barrado
      const noop = await run(ps, { type: 'resume' }, `lim-noop-${uniqueTag(8)}`, limited).expect(200);
      expect(noop.body).toMatchObject({ changed: 0, batchId: null });
      const over = await run(ps, { type: 'pause' }, `lim-over-${uniqueTag(8)}`, limited);
      expect(over.status).toBe(429);
      expect(over.headers['retry-after']).toBeDefined();
      expect(over.body.code).toBe('RATE_LIMITED');
      expect((await row(ps[0]!.id)).status).toBe('active'); // nada mudou com o 429
      expect(await ctx.db.select().from(idempotencyKeys).where(like(idempotencyKeys.key, 'lim-over-%'))).toHaveLength(0); // a chave não ficou presa
      await send(limited, body(ps, { type: 'pause' }, { dryRun: true }), null).expect(200);
      await run(ps, { type: 'pause' }, `lim-other-${uniqueTag(8)}`, ops).expect(200); // outro admin tem o seu limite
    });
  });
});
