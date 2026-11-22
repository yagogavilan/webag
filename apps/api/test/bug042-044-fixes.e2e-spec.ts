import { and, eq, sql } from 'drizzle-orm';
import pg from 'pg';
import { ProductDraftsService } from '../src/modules/catalog/drafts.service.js';
import { productModerationEvents, products, storeAdminChanges, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureCity, ensureLegalDocs, insertStoreRow, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';
import { TEST_ENV } from './test-env.js';

/** Regressão dos BUG-042 (apagar rascunho com evento de moderação; vencimento em lotes) e BUG-044 (`NO_CHANGE` do admin na retirada e no horário). */
describe('BUG-042 e BUG-044', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let categoryId: string;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const tag = () => uniqueTag(8);
  const base = (id: string) => `/v1/stores/${id}`;
  const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
  const freshStore = async () => {
    const merchant = await createMerchant(ctx);
    const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Loja ${uniqueTag(5)}` })).id;
    return { merchant, id };
  };
  const exists = async (id: string) => (await ctx.db.select({ id: products.id }).from(products).where(eq(products.id, id))).length === 1;
  const newDraft = async (user: TestMerchant, id: string) => (await ctx.http.post(`${base(id)}/product-drafts`).set(as(user)).set('Idempotency-Key', `d-${tag()}`).send({ via: 'camera' }).expect(201)).body as { id: string };
  const activeProduct = async (user: TestMerchant, id: string) => {
    const pid = (await ctx.http.post(`${base(id)}/products`).set(as(user)).send({ name: `Produto ${tag()}`, categoryId, basePriceCents: 4000 }).expect(201)).body.id as string;
    await ctx.http.put(`${base(id)}/products/${pid}/variants`).set(as(user)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    await ctx.db.update(products).set({ status: 'active', publishedAt: new Date() }).where(eq(products.id, pid));
    return pid;
  };
  /** Cópia de produto removido pela moderação: nasce rascunho COM 1 evento de moderação (DEC-131). */
  const moderatedCopy = async (merchant: TestMerchant, id: string) => {
    const pid = await activeProduct(merchant, id);
    await ctx.http.post(`/v1/admin/products/${pid}/moderation`).set(as(ops)).send({ action: 'remove', reason: 'Teste BUG-042' }).expect((r) => expect([200, 201, 204]).toContain(r.status));
    return (await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(merchant)).set('Idempotency-Key', `dup-${tag()}`).send({}).expect(201)).body.id as string;
  };
  const removals = async (id: string) => (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(productModerationEvents).where(and(eq(productModerationEvents.storeId, id), eq(productModerationEvents.action, 'remove'))))[0]!.n;
  const versionOf = async (id: string) => (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
  const putSection = async (id: string, section: string, data: unknown, version?: number) =>
    ctx.http.put(`/v1/admin/stores/${id}/config/${section}`).set(as(ops)).send({ reason: ask, expectedVersion: version ?? (await versionOf(id)), data });
  const adminChanges = async (id: string) => (await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id))).length;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    categoryId = await ensureCategory(ctx);
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('BUG-042: apagar rascunho com evento de moderação', () => {
    it('a rota de excluir devolve 204, apaga a linha e o evento sobrevive sem produto (a contagem de remoções da loja não zera)', async () => {
      const { merchant, id } = await freshStore();
      const copyId = await moderatedCopy(merchant, id);
      const removalsBefore = await removals(id);
      expect(removalsBefore).toBe(1);
      await ctx.http.delete(`${base(id)}/products/${copyId}`).set(as(merchant)).expect(204);
      expect(await exists(copyId)).toBe(false);
      expect(await ctx.db.select().from(productModerationEvents).where(eq(productModerationEvents.productId, copyId))).toHaveLength(0);
      expect(await removals(id)).toBe(removalsBefore);
      expect((await ctx.db.select().from(productModerationEvents).where(and(eq(productModerationEvents.storeId, id), sql`${productModerationEvents.productId} is null`))).length).toBeGreaterThanOrEqual(1);
    });

    it('rascunho removido pelo admin pelo id e depois apagado pelo lojista: 204 e a remoção continua contando para a loja', async () => {
      const { merchant, id } = await freshStore();
      const draft = await newDraft(merchant, id);
      await ctx.http.post(`/v1/admin/products/${draft.id}/moderation`).set(as(ops)).send({ action: 'remove', reason: 'Teste BUG-042' }).expect((r) => expect([200, 201, 204]).toContain(r.status));
      await ctx.http.delete(`${base(id)}/products/${draft.id}`).set(as(merchant)).expect(204);
      expect(await exists(draft.id)).toBe(false);
      expect(await removals(id)).toBe(1);
    });

    it('vencimento: uma linha ruim não trava as demais (o lote que falha é refeito linha a linha); a ruim fica e é tentada de novo na rodada seguinte', async () => {
      const { merchant, id } = await freshStore();
      const copyId = await moderatedCopy(merchant, id);
      const plain = [await newDraft(merchant, id), await newDraft(merchant, id), await newDraft(merchant, id)];
      const bad = await newDraft(merchant, id);
      const badName = `BUG042-linha-ruim-${tag()}`;
      await ctx.db.update(products).set({ name: badName }).where(eq(products.id, bad.id));
      const old = new Date(Date.now() - 40 * 86_400_000);
      const ids = [copyId, bad.id, ...plain.map((d) => d.id)];
      await ctx.db.update(products).set({ updatedAt: old }).where(sql`${products.id} in (${sql.join(ids.map((i) => sql`${i}::uuid`), sql`, `)})`);

      // Trigger só na linha ruim, criado como dono do banco e removido no fim (os arquivos e2e rodam em série).
      const fn = `bug042_block_${tag().toLowerCase()}`;
      const owner = new pg.Client({ connectionString: TEST_ENV.databaseUrl });
      await owner.connect();
      await owner.query(`CREATE FUNCTION ${fn}() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'linha ruim de teste'; END $$`);
      await owner.query(`CREATE TRIGGER ${fn} BEFORE DELETE ON products FOR EACH ROW WHEN (OLD.name = '${badName}') EXECUTE FUNCTION ${fn}()`);
      try {
        const sweep = ctx.app.get(ProductDraftsService);
        await expect(sweep.sweepExpired()).resolves.toBeGreaterThanOrEqual(4);
        for (const gone of [copyId, ...plain.map((d) => d.id)]) expect(await exists(gone), `rascunho vencido ${gone} deve ser apagado`).toBe(false);
        expect(await exists(bad.id), 'a linha ruim fica').toBe(true);
        await owner.query(`DROP TRIGGER ${fn} ON products`);
        await expect(sweep.sweepExpired()).resolves.toBeGreaterThanOrEqual(1);
        expect(await exists(bad.id), 'sem o defeito, a próxima rodada apaga').toBe(false);
      } finally {
        await owner.query(`DROP TRIGGER IF EXISTS ${fn} ON products`);
        await owner.query(`DROP FUNCTION IF EXISTS ${fn}()`);
        await owner.end();
        await ctx.db.delete(products).where(eq(products.id, bad.id));
      }
    });
  });

  describe('BUG-044: NO_CHANGE só quando nada mudou de fato', () => {
    const pickup = { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 };

    it('A: retirada com `enabled` igual e qualquer outro campo diferente grava (200, versão +1, histórico com antes e depois do campo); o mesmo valor dá 422', async () => {
      const { id } = await freshStore();
      expect((await putSection(id, 'pickup', pickup)).status).toBe(200);
      const steps: [string, Record<string, unknown>][] = [
        ['preparo máximo', { ...pickup, prepMaxMinutes: 25 }],
        ['preparo mínimo', { ...pickup, prepMaxMinutes: 25, prepMinMinutes: 12 }],
        ['instruções', { ...pickup, prepMaxMinutes: 25, prepMinMinutes: 12, instructions: 'Tocar a campainha' }],
        ['endereço próprio', { enabled: true, useStoreAddress: false, address: 'Rua das Flores, 10', instructions: 'Tocar a campainha', prepMinMinutes: 12, prepMaxMinutes: 25 }],
        ['só o endereço', { enabled: true, useStoreAddress: false, address: 'Rua das Flores, 99', instructions: 'Tocar a campainha', prepMinMinutes: 12, prepMaxMinutes: 25 }],
        ['volta ao endereço da loja', { enabled: true, useStoreAddress: true, instructions: 'Tocar a campainha', prepMinMinutes: 12, prepMaxMinutes: 25 }],
      ];
      for (const [label, data] of steps) {
        const v = await versionOf(id);
        const res = await putSection(id, 'pickup', data, v);
        expect([label, res.status, res.body.code]).toEqual([label, 200, undefined]);
        expect(await versionOf(id)).toBe(v + 1);
        const same = await putSection(id, 'pickup', data, v + 1);
        expect([label, same.status, same.body.code]).toEqual([label, 422, 'NO_CHANGE']);
        expect(await versionOf(id)).toBe(v + 1);
      }
      const last = (await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id))).at(-1)!;
      expect(last.before).toMatchObject({ useStoreAddress: false, address: 'Rua das Flores, 99' });
      expect(last.after).toMatchObject({ useStoreAddress: true, address: null, instructions: 'Tocar a campainha', prepMinMinutes: 12, prepMaxMinutes: 25 });
    });

    it('B: horário reenviado igual dá 422 NO_CHANGE (sem versão, sem histórico); mudar um intervalo, trocar a ordem dos dias não conta como mudança e remover um dia conta', async () => {
      const { id } = await freshStore();
      const days = [
        { weekday: 1, intervals: [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        { weekday: 3, intervals: [{ start: '08:00', end: '18:00' }] },
      ];
      expect((await putSection(id, 'hours', { days })).status).toBe(200);
      const v = await versionOf(id);
      const changes = await adminChanges(id);
      const same = await putSection(id, 'hours', { days }, v);
      expect([same.status, same.body.code]).toEqual([422, 'NO_CHANGE']);
      const reordered = await putSection(id, 'hours', { days: [days[1], days[0]] }, v);
      expect([reordered.status, reordered.body.code]).toEqual([422, 'NO_CHANGE']);
      expect(await versionOf(id)).toBe(v);
      expect(await adminChanges(id)).toBe(changes);

      const edited = await putSection(id, 'hours', { days: [{ ...days[0]!, intervals: [days[0]!.intervals[0]!, { start: '14:00', end: '19:00' }] }, days[1]] }, v);
      expect(edited.status).toBe(200);
      const removed = await putSection(id, 'hours', { days: [days[1]] }, v + 1);
      expect(removed.status).toBe(200);
      expect(await versionOf(id)).toBe(v + 2);
      const row = (await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.storeId, id))).at(-1)!;
      expect(row.after).toEqual({ 0: [], 1: [], 2: [], 3: [{ startMin: 480, endMin: 1080 }], 4: [], 5: [], 6: [] });
    });
  });
});
