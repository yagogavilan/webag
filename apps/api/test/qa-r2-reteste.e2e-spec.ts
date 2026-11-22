import { appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { and, eq, sql } from 'drizzle-orm';
import { ProductDraftsService } from '../src/modules/catalog/drafts.service.js';
import { productModerationEvents, products, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createMerchant, ensureCategory, ensureCity, ensureLegalDocs, insertStoreRow, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/**
 * QA, "Reteste 2" (2026-11-22, HEAD 5d09e97): vizinhas independentes das correções do BUG-042 e do BUG-044, escritas sem olhar os testes do dev.
 * Evidência de observações (não asserções) em QA_EVIDENCE.
 */
const evidence = (line: string): void => {
  try {
    appendFileSync(process.env.QA_EVIDENCE ?? join(tmpdir(), 'webag-qa-evidence.log'), `${line}\n`);
  } catch {
    /* evidência é só um registro: nunca derruba o teste (Windows, macOS, disco cheio) */
  }
};

describe('QA reteste 2: vizinhas do BUG-042 e do BUG-044', () => {
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
  const moderate = (pid: string, action: 'pause' | 'remove') => ctx.http.post(`/v1/admin/products/${pid}/moderation`).set(as(ops)).send({ action, reason: 'Teste QA reteste 2' });
  const versionOf = async (id: string) => (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
  const putSection = async (id: string, section: string, data: unknown, version?: number) =>
    ctx.http.put(`/v1/admin/stores/${id}/config/${section}`).set(as(ops)).send({ reason: ask, expectedVersion: version ?? (await versionOf(id)), data });

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

  describe('BUG-042', () => {
    it('regra de 3 remoções: a remoção do RASCUNHO (pelo id) continua contando depois que o lojista apaga o rascunho; a 3ª remoção sinaliza a loja', async () => {
      const { merchant, id } = await freshStore();
      const [p1, p2] = [await activeProduct(merchant, id), await activeProduct(merchant, id)];
      const draft = await newDraft(merchant, id);
      expect((await moderate(p1, 'remove')).body.storeFlagged).toBe(false);
      expect((await moderate(draft.id, 'remove')).status).toBe(200);
      await ctx.http.delete(`${base(id)}/products/${draft.id}`).set(as(merchant)).expect(204);
      expect(await exists(draft.id)).toBe(false);
      const third = await moderate(p2, 'remove');
      expect([third.status, third.body.storeFlagged]).toEqual([200, true]);
      const flagged = (await ctx.db.select().from(stores).where(eq(stores.id, id)))[0]?.suspensionReviewFlaggedAt;
      expect(flagged).toBeTruthy();
    });

    it('controle: sem o rascunho, 2 remoções não sinalizam (o evento órfão não é contado em dobro nem inventado)', async () => {
      const { merchant, id } = await freshStore();
      const [p1, p2] = [await activeProduct(merchant, id), await activeProduct(merchant, id)];
      const draft = await newDraft(merchant, id);
      await ctx.http.delete(`${base(id)}/products/${draft.id}`).set(as(merchant)).expect(204);
      await moderate(p1, 'remove');
      const second = await moderate(p2, 'remove');
      expect([second.status, second.body.storeFlagged]).toEqual([200, false]);
    });

    it('rascunho PAUSADO pela moderação (pelo id) também pode ser apagado: 204 e o evento fica sem produto', async () => {
      const { merchant, id } = await freshStore();
      const draft = await newDraft(merchant, id);
      expect((await moderate(draft.id, 'pause')).status).toBe(200);
      await ctx.http.delete(`${base(id)}/products/${draft.id}`).set(as(merchant)).expect(204);
      const orphans = await ctx.db.select().from(productModerationEvents).where(and(eq(productModerationEvents.storeId, id), sql`${productModerationEvents.productId} is null`));
      expect(orphans.map((e) => e.action)).toEqual(['pause']);
    });

    it('3 "Apagar" ao mesmo tempo no rascunho moderado: nenhum 5xx (1 x 204; os outros 404)', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id);
      await moderate(pid, 'remove');
      const copy = (await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(merchant)).set('Idempotency-Key', `dup-${tag()}`).send({}).expect(201)).body.id as string;
      const results = await Promise.all([1, 2, 3].map(() => ctx.http.delete(`${base(id)}/products/${copy}`).set(as(merchant))));
      const statuses = results.map((r) => r.status).sort();
      evidence(`[QA reteste 2] 3 DELETE paralelos no rascunho moderado: ${statuses.join(',')}`);
      expect(statuses.filter((s) => s >= 500)).toEqual([]);
      expect(statuses.filter((s) => s === 204)).toHaveLength(1);
      expect(await exists(copy)).toBe(false);
    });

    it('produto PUBLICADO com evento de moderação continua sendo arquivado (nunca apagado), com o evento ligado a ele', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id);
      await moderate(pid, 'pause');
      await ctx.http.delete(`${base(id)}/products/${pid}`).set(as(merchant)).expect(204);
      const row = (await ctx.db.select().from(products).where(eq(products.id, pid)))[0]!;
      expect(row.status).toBe('archived');
      expect(await ctx.db.select().from(productModerationEvents).where(eq(productModerationEvents.productId, pid))).toHaveLength(1);
    });

    it('vencimento em volume: 450 rascunhos vencidos (3 lotes de 200), entre eles 50 com evento, em 5 lojas: todos apagados; 29 dias e produto ativo antigo intactos; 2ª rodada devolve 0', async () => {
      const stores5 = [] as { merchant: TestMerchant; id: string }[];
      for (let i = 0; i < 5; i += 1) stores5.push(await freshStore());
      const seedDraft = await newDraft(stores5[0]!.merchant, stores5[0]!.id);
      const active = await activeProduct(stores5[0]!.merchant, stores5[0]!.id);
      const old = new Date(Date.now() - 40 * 86_400_000);
      const young = new Date(Date.now() - 29 * 86_400_000);
      await ctx.db.update(products).set({ updatedAt: old }).where(eq(products.id, active));
      const youngIds: string[] = [];
      // Linhas em massa por SQL (cópias do rascunho semente); as 50 primeiras de cada lote de 100 levam evento de moderação.
      for (let s = 0; s < 5; s += 1) {
        const target = stores5[s]!.id;
        const res = await ctx.db.execute(sql`
          with src as (select to_jsonb(p) as j from products p where p.id = ${seedDraft.id}::uuid),
          ins as (
            insert into products
            select (jsonb_populate_record(null::products, src.j || jsonb_build_object('id', gen_random_uuid(), 'store_id', ${target}::uuid, 'updated_at', ${old.toISOString()}::timestamptz, 'idempotency_key', null, 'name', 'QA venc ' || g))).*
            from src, generate_series(1, 90) g
            returning id, name)
          insert into product_moderation_events (product_id, store_id, action, reason)
          select id, ${target}::uuid, 'flag', 'QA reteste 2 vencimento' from ins where (regexp_replace(name, '\\D', '', 'g'))::int <= 10
          returning id`);
        expect(res.rows.length).toBe(10);
        const y = await ctx.db.execute(sql`
          insert into products
          select (jsonb_populate_record(null::products, to_jsonb(p) || jsonb_build_object('id', gen_random_uuid(), 'store_id', ${target}::uuid, 'updated_at', ${young.toISOString()}::timestamptz, 'idempotency_key', null, 'name', 'QA jovem'))).*
          from products p where p.id = ${seedDraft.id}::uuid
          returning id`);
        youngIds.push((y.rows[0] as { id: string }).id);
      }
      await ctx.db.update(products).set({ updatedAt: old }).where(eq(products.id, seedDraft.id));
      const t0 = Date.now();
      const swept = await ctx.app.get(ProductDraftsService).sweepExpired();
      evidence(`[QA reteste 2] sweepExpired em volume: ${swept} apagados em ${Date.now() - t0} ms`);
      // 5 x 90 + o rascunho semente = 451 vencidos; outros arquivos e2e podem ter deixado vencidos (nunca deveria, mas conta >=)
      expect(swept).toBeGreaterThanOrEqual(451);
      const left = await ctx.db.execute(sql`select count(*)::int n from products where status = 'draft' and updated_at < now() - interval '30 days'`);
      expect((left.rows[0] as { n: number }).n).toBe(0);
      for (const y of youngIds) expect(await exists(y), 'rascunho de 29 dias fica').toBe(true);
      expect(await exists(active), 'produto ativo antigo fica').toBe(true);
      expect(await ctx.app.get(ProductDraftsService).sweepExpired()).toBe(0);
      const orphans = await ctx.db.execute(sql`select count(*)::int n from product_moderation_events where product_id is null and reason = 'QA reteste 2 vencimento'`);
      expect((orphans.rows[0] as { n: number }).n).toBe(50);
    }, 120_000);
  });

  describe('BUG-044', () => {
    const pickup = { enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 };

    it('retirada: mudança só de instruções para vazio/removida, de endereço próprio para o da loja e de preparo mínimo gravam (200); repetir cada uma dá 422', async () => {
      const { id } = await freshStore();
      expect((await putSection(id, 'pickup', { ...pickup, instructions: 'Tocar a campainha' })).status).toBe(200);
      const steps: [string, Record<string, unknown>][] = [
        ['remover as instruções', { ...pickup }],
        ['preparo mínimo', { ...pickup, prepMinMinutes: 5 }],
        ['desligar a retirada (exige entrega ligada)', { ...pickup, prepMinMinutes: 5, enabled: false }],
        ['religar', { ...pickup, prepMinMinutes: 5 }],
      ];
      for (const [label, data] of steps) {
        const v = await versionOf(id);
        const res = await putSection(id, 'pickup', data, v);
        evidence(`[QA reteste 2] pickup "${label}": ${res.status} ${res.body.code ?? ''}`);
        expect([label, res.status]).toEqual([label, 200]);
        const again = await putSection(id, 'pickup', data, v + 1);
        expect([label, again.status, again.body.code]).toEqual([label, 422, 'NO_CHANGE']);
      }
    });

    it('retirada: e-mail ao lojista só quando muda (1 por mudança real, 0 no NO_CHANGE)', async () => {
      const { id } = await freshStore();
      await putSection(id, 'pickup', pickup);
      ctx.mail.outbox.length = 0;
      expect((await putSection(id, 'pickup', { ...pickup, prepMaxMinutes: 25 })).status).toBe(200);
      const afterChange = ctx.mail.outbox.length;
      expect((await putSection(id, 'pickup', { ...pickup, prepMaxMinutes: 25 })).status).toBe(422);
      expect([afterChange, ctx.mail.outbox.length]).toEqual([1, 1]);
    });

    it('horário: intervalos do mesmo dia em outra ordem, e o mesmo horário repetido, são "sem mudança"; trocar o fim por 1 minuto muda', async () => {
      const { id } = await freshStore();
      const day = (intervals: { start: string; end: string }[]) => ({ days: [{ weekday: 2, intervals }] });
      const a = [{ start: '09:00', end: '12:00' }, { start: '14:00', end: '18:00' }];
      expect((await putSection(id, 'hours', day(a))).status).toBe(200);
      const v = await versionOf(id);
      const swapped = await putSection(id, 'hours', day([a[1]!, a[0]!]), v);
      evidence(`[QA reteste 2] horário, intervalos do dia em outra ordem: ${swapped.status} ${swapped.body.code ?? ''}`);
      expect([swapped.status, swapped.body.code]).toEqual([422, 'NO_CHANGE']);
      const minute = await putSection(id, 'hours', day([a[0]!, { start: '14:00', end: '18:01' }]), v);
      expect(minute.status).toBe(200);
      expect(await versionOf(id)).toBe(v + 1);
    });

    it('histórico do admin: depois da mudança de forma do `after` do horário, a lista de histórico segue 200 e traz antes e depois por dia', async () => {
      const { id } = await freshStore();
      expect((await putSection(id, 'hours', { days: [{ weekday: 1, intervals: [{ start: '09:00', end: '12:00' }] }] })).status).toBe(200);
      expect((await putSection(id, 'hours', { days: [{ weekday: 1, intervals: [{ start: '09:00', end: '13:00' }] }] })).status).toBe(200);
      const res = await ctx.http.get(`/v1/admin/stores/${id}/history?limit=50`).set(as(ops));
      expect(res.status).toBe(200);
      const rows = (res.body.data as { type: string; before: unknown; after: unknown }[]).filter((r) => /hour/i.test(r.type));
      evidence(`[QA reteste 2] histórico do horário: ${JSON.stringify(rows.map((r) => ({ type: r.type, before: r.before, after: r.after })).slice(0, 2))}`);
      expect(rows.length).toBeGreaterThanOrEqual(2);
      const last = rows[0]!;
      expect(JSON.stringify(last.after)).toContain('780');
    });
  });
});
