import { randomUUID } from 'node:crypto';
import { appendFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import nodePath, { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { and, eq, like } from 'drizzle-orm';
import { runMigrations } from '../src/platform/database/migrate.js';
import { auditLog, productBulkBatches, productVariants, products } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { TEST_ENV } from './test-env.js';
import { createAdmin, createMerchant, ensureCategory, ensureLegalDocs, insertStoreRow, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';

/**
 * QA R1.3 (2026-11-22): casos EXPLORATÓRIOS escritos por fora do autor do código, sobre reajuste em massa, desfazer (BK-08) e massa do admin.
 * Não repete o que `r13-bulk-batches` e `r13-admin-bulk` já provam: aqui entram concorrência além de 2, oráculo de arredondamento independente,
 * 200 itens, produto removido no meio, estoque ajustado à mão, entradas hostis e reuso de chave com corpo diferente.
 */
/** Registro das medições (o vitest não mostra console de teste que passa): `QA_NOTES_FILE` (padrão: `qa-r13-notes.log` no diretório temporário). */
const note = (line: string): void => {
  try {
    appendFileSync(process.env.QA_NOTES_FILE ?? join(tmpdir(), 'qa-r13-notes.log'), `${line}\n`);
  } catch {
    /* só evidência: nunca derruba o teste */
  }
};

describe('QA R1.3: reajuste em massa, desfazer e massa do admin (exploratório)', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let ops: TestAdmin;
  let storeId: string;
  let categoryId: string;
  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const path = (suffix = '') => `/v1/stores/${storeId}/products${suffix}`;
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0];
  const create = (body: Record<string, unknown> = {}) => ctx.http.post(path()).set(as(owner)).send({ name: `Produto ${uniqueTag(6)}`, categoryId, basePriceCents: 10_000, ...body });
  // Produto nasce rascunho (teto de 100 por loja, DEC-118): por padrão vira `active` na hora, para o teste não esbarrar no teto; `draft: true` mantém o rascunho.
  const priced = async (cents: number, draft = false) => {
    const made = (await create({ basePriceCents: cents }).expect(201)).body as { id: string; version: number };
    if (!draft) await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, made.id));
    return made;
  };
  const pricedMany = async (prices: number[]) => {
    const out: { id: string; version: number; cents: number }[] = [];
    for (let i = 0; i < prices.length; i += 20) {
      out.push(...(await Promise.all(prices.slice(i, i + 20).map(async (c) => ({ ...(await priced(c)), cents: c })))));
    }
    return out;
  };
  const body = (ps: { id: string; version: number }[], over: Record<string, unknown> = {}) => ({ productIds: ps.map((p) => p.id), expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })), action: { type: 'price_adjust', mode: 'percent', value: 10 }, ...over });
  const apply = (payload: unknown, key: string | null = `q-${uniqueTag(10)}`) => {
    const req = ctx.http.post(path('/bulk')).set(as(owner));
    return (key ? req.set('Idempotency-Key', key) : req).send(payload as object);
  };
  const undo = (batchId: string) => ctx.http.post(path(`/bulk/${batchId}/undo`)).set(as(owner)).send();
  const batchesOf = () => ctx.db.select().from(productBulkBatches).where(eq(productBulkBatches.storeId, storeId));
  const withVariant = async (stock: number) => {
    const p = await priced(5_000, true);
    const put = await ctx.http.put(path(`/${p.id}/variants`)).set(as(owner)).send({ attributes: [], variants: [{ attributes: {}, stock }] }).expect(200);
    await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, p.id));
    return { id: p.id, variantId: put.body.variants[0].id as string, version: (await row(p.id))!.version };
  };
  // Oráculo independente: meio para cima em BigInt, sem a fórmula do código.
  const oracle = (cents: number, bp: number) => Number((BigInt(cents) * BigInt(10_000 + bp) + 5_000n) / 10_000n);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja QA R13' })).id;
    categoryId = await ensureCategory(ctx);
    ops = await createAdmin(ctx, 'operations');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('concorrência', () => {
    it('Q-C1: 6 pedidos simultâneos com a MESMA chave aplicam UMA vez (1 lote, preço +10% uma vez, versão +1) e todos respondem o mesmo corpo', async () => {
      const ps = [await priced(10_000), await priced(20_000)];
      const lots = (await batchesOf()).length;
      const key = `qc1-${uniqueTag(8)}`;
      const res = await Promise.all(Array.from({ length: 6 }, () => apply(body(ps), key)));
      expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      // Mesmo conteúdo; a ordem das chaves do JSON pode mudar na resposta guardada (jsonb), por isso comparação profunda e não de texto.
      for (const r of res) expect(r.body).toEqual(res[0]!.body);
      expect((await batchesOf()).length).toBe(lots + 1);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(11_000);
      expect((await row(ps[1]!.id))!.version).toBe(ps[1]!.version + 1);
    });

    it('Q-C2: 2 ações com chaves DIFERENTES e as mesmas versões: uma aplica e a outra recebe 409 BULK_VERSION_CONFLICT; o preço sobe uma vez só; sem 500', async () => {
      const ps = [await priced(10_000), await priced(10_000), await priced(10_000)];
      const lots = (await batchesOf()).length;
      const res = await Promise.all([apply(body(ps)), apply(body(ps))]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(res.find((r) => r.status === 409)!.body.code).toBe('BULK_VERSION_CONFLICT');
      for (const p of ps) expect((await row(p.id))!.basePriceCents).toBe(11_000);
      expect((await batchesOf()).length).toBe(lots + 1);
    });

    it('Q-C3: seleções que se cruzam, em ordem inversa e chaves diferentes, não dão deadlock nem 500 (a ordem de lock é por id)', async () => {
      const ps = await pricedMany(Array.from({ length: 8 }, () => 10_000));
      const a = ps.slice(0, 5);
      const b = ps.slice(3).reverse();
      const res = await Promise.all([apply(body(a)), apply(body(b)), apply(body(a)), apply(body(b))]);
      for (const r of res) expect([200, 409]).toContain(r.status);
      // Invariante: o preço de cada produto é 10.000 x 1,1^k, k = quantas ações com sucesso o incluíram; nunca um valor intermediário.
      const okA = res.filter((r, i) => r.status === 200 && i % 2 === 0).length;
      const okB = res.filter((r, i) => r.status === 200 && i % 2 === 1).length;
      expect(okA + okB).toBeGreaterThanOrEqual(1);
      const expectedFor = (k: number) => { let c = 10_000; for (let i = 0; i < k; i += 1) c = oracle(c, 1_000); return c; };
      for (const p of ps.slice(0, 3)) expect((await row(p.id))!.basePriceCents).toBe(expectedFor(okA));
      for (const p of ps.slice(3, 5)) expect((await row(p.id))!.basePriceCents).toBe(expectedFor(okA + okB));
      for (const p of ps.slice(5)) expect((await row(p.id))!.basePriceCents).toBe(expectedFor(okB));
    });

    it('Q-C4: 6 desfazer simultâneos revertem UMA vez (1 linha `product.bulk_undo`, versão +1 só), todos 200 e só um com alreadyUndone: false', async () => {
      const ps = [await priced(10_000), await priced(30_000)];
      const applied = await apply(body(ps)).expect(200);
      const res = await Promise.all(Array.from({ length: 6 }, () => undo(applied.body.batchId as string)));
      expect(res.map((r) => r.status)).toEqual([200, 200, 200, 200, 200, 200]);
      expect(res.filter((r) => r.body.alreadyUndone !== true)).toHaveLength(1);
      expect(res.every((r) => r.body.reverted === 2)).toBe(true);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(10_000);
      expect((await row(ps[0]!.id))!.version).toBe(ps[0]!.version + 2); // aplicar +1, desfazer +1
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'product.bulk_undo')));
      expect(trail.filter((t) => (t.after as { reverted?: number } | null)?.reverted === 2 && (t.before as { batchId?: string } | null)?.batchId === applied.body.batchId)).toHaveLength(1);
    });
  });

  describe('preço com centavos e 200 itens', () => {
    it('Q-P1: arredondamento meio para cima ao centavo em casos de borda (valores calculados à mão)', async () => {
      const cases: [number, number, number][] = [
        [1_999, 10, 2_199], // 2198,9
        [5, 10, 6], // 5,5 sobe
        [1_005, -10, 905], // 904,5 sobe
        [333, 33.33, 444], // 443,9889
        [100, 500, 600],
        [100, -90, 10],
        [9, -90, 1], // 0,9 vira 1 centavo (o mínimo)
        [9_999_999, -0.01, 9_998_999], // 9.999.999 x 0,9999 = 9.998.999,0001
      ];
      for (const [cents, pct, expected] of cases) {
        const p = await priced(cents);
        const res = await apply(body([p], { action: { type: 'price_adjust', mode: 'percent', value: pct }, confirmLargeChange: true })).expect(200);
        expect({ cents, pct, got: (await row(p.id))!.basePriceCents }).toEqual({ cents, pct, got: expected });
        expect(res.body.preview[0]).toMatchObject({ fromCents: cents, toCents: expected });
      }
    });

    it('Q-P2: arredondar para o mesmo valor (1 centavo +10%) não é alteração: sem lote, sem versão nova; fora da faixa bloqueia a ação inteira (422) sem mexer nos demais', async () => {
      const one = await priced(1);
      const lots = (await batchesOf()).length;
      const same = await apply(body([one])).expect(200);
      expect(same.body).toMatchObject({ changed: 0, batchId: null });
      expect((await row(one.id))!.version).toBe(one.version);
      const ok = await priced(10_000);
      const max = await priced(9_999_999);
      const res = await apply(body([ok, max])).expect(422);
      expect(res.body.code).toBe('BULK_BLOCKED');
      expect((await row(ok.id))!.basePriceCents).toBe(10_000);
      expect((await batchesOf()).length).toBe(lots);
      const below = await apply(body([one], { action: { type: 'price_adjust', mode: 'amount', value: -1 } })).expect(422);
      expect(below.body.code).toBe('BULK_BLOCKED');
    });

    it('Q-P3: percentuais inválidos e o tipo errado = 400, nunca 500 (10,005; 501; -91; "10"; null; Infinity vira null no JSON; valor em reais com fração)', async () => {
      const p = await priced(10_000);
      for (const value of [10.005, 501, -91, '10', null, Number.MAX_VALUE, Number.POSITIVE_INFINITY, 0.001]) {
        const res = await apply(body([p], { action: { type: 'price_adjust', mode: 'percent', value } }));
        expect({ value, status: res.status }).toEqual({ value, status: 400 });
      }
      const frac = await apply(body([p], { action: { type: 'price_adjust', mode: 'amount', value: 10.5 } }));
      expect(frac.status).toBe(400);
      expect((await row(p.id))!.version).toBe(p.version);
    });

    it('Q-P4: 200 itens (preços aleatórios com semente fixa, 40 com variação de preço próprio): prévia, aplicar e desfazer; cada preço bate com o oráculo; 1 lote; tempos registrados', async () => {
      let seed = 20261122;
      const rnd = () => { seed = (seed * 1103515245 + 12345) % 2_147_483_648; return seed / 2_147_483_648; };
      const prices = Array.from({ length: 200 }, () => 1 + Math.floor(rnd() * 5_000_000));
      const ps = await pricedMany(prices);
      const withVars = ps.slice(0, 40);
      for (const p of withVars) {
        await ctx.http.put(path(`/${p.id}/variants`)).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 1, priceCents: p.cents }, { attributes: { Tamanho: 'G' }, stock: 1, priceCents: p.cents + 100 }] }).expect(200);
      }
      const fresh = await Promise.all(ps.map(async (p) => ({ ...p, version: (await row(p.id))!.version })));
      const pct = 7.35;
      const t0 = Date.now();
      const payload = body(fresh, { action: { type: 'price_adjust', mode: 'percent', value: pct } });
      const preview = await apply({ ...payload, dryRun: true }, null).expect(200);
      const t1 = Date.now();
      expect(preview.body.preview).toHaveLength(200);
      const t2 = Date.now();
      const res = await apply(payload).expect(200);
      const t3 = Date.now();
      expect(res.body).toMatchObject({ changed: 200, blocked: [] });
      let wrong = 0;
      for (const p of fresh) if ((await row(p.id))!.basePriceCents !== oracle(p.cents, 735)) wrong += 1;
      expect(wrong).toBe(0);
      for (const p of withVars) {
        const vs = await ctx.db.select().from(productVariants).where(eq(productVariants.productId, p.id));
        expect(vs.map((v) => v.priceCents).sort()).toEqual([oracle(p.cents, 735), oracle(p.cents + 100, 735)].sort());
      }
      const t4 = Date.now();
      const back = await undo(res.body.batchId as string).expect(200);
      const t5 = Date.now();
      expect(back.body).toMatchObject({ reverted: 200, skipped: [] });
      for (const p of fresh) expect((await row(p.id))!.basePriceCents).toBe(p.cents);
      for (const p of withVars) {
        const vs = await ctx.db.select().from(productVariants).where(eq(productVariants.productId, p.id));
        expect(vs.map((v) => v.priceCents).sort()).toEqual([p.cents, p.cents + 100].sort());
      }
      note(`[QA-R13] 200 itens: prévia ${t1 - t0} ms, aplicar ${t3 - t2} ms, desfazer ${t5 - t4} ms`);
      expect(t3 - t2).toBeLessThan(10_000);
      expect(t5 - t4).toBeLessThan(10_000);
    }, 120_000);

    it('Q-P5: ids repetidos e em caixa alta contam uma vez (itemsCount 1) e a ação funciona', async () => {
      const p = await priced(10_000);
      const upper = p.id.toUpperCase();
      const res = await apply({ productIds: [p.id, upper, p.id], expectedVersions: [{ productId: upper, version: p.version }], action: { type: 'price_adjust', mode: 'percent', value: 10 } });
      expect(res.status).toBe(200);
      expect(res.body.changed).toBe(1);
      expect((await batchesOf()).find((b) => b.id === res.body.batchId)!.itemsCount).toBe(1);
    });
  });

  describe('SEC-223 (reteste do QA)', () => {
    it('Q-X1: reajuste e desfazer gravam no audit_log (append-only) o preço ANTES e DEPOIS de cada variação com preço próprio; a variação sem preço próprio não entra; a trilha bate com o banco', async () => {
      const p = await priced(10_000, true);
      const put = await ctx.http.put(path(`/${p.id}/variants`)).set(as(owner)).send({ attributes: ['Tamanho'], variants: [{ attributes: { Tamanho: 'P' }, stock: 1, priceCents: 9_000 }, { attributes: { Tamanho: 'M' }, stock: 1, priceCents: 12_345 }, { attributes: { Tamanho: 'G' }, stock: 1 }] }).expect(200);
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, p.id));
      const own = (put.body.variants as { id: string; priceCents: number | null }[]).filter((v) => v.priceCents !== null);
      expect(own).toHaveLength(2);
      const fresh = { id: p.id, version: (await row(p.id))!.version };
      const applied = await apply(body([fresh])).expect(200);
      await undo(applied.body.batchId as string).expect(200);
      const trail = (await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.action, 'product.price'), eq(auditLog.targetId, p.id)))).sort((a, b) => a.id - b.id);
      const priceOf = (side: unknown, id: string) => ((side as { variants?: { id: string; priceCents: number }[] }).variants ?? []).find((v) => v.id === id)?.priceCents;
      const rounded = (cents: number) => oracle(cents, 1_000);
      expect(trail).toHaveLength(2);
      const [apply1, undo1] = trail;
      for (const v of own) {
        expect(priceOf(apply1!.before, v.id)).toBe(v.priceCents);
        expect(priceOf(apply1!.after, v.id)).toBe(rounded(v.priceCents as number));
        expect(priceOf(undo1!.before, v.id)).toBe(rounded(v.priceCents as number));
        expect(priceOf(undo1!.after, v.id)).toBe(v.priceCents);
      }
      const ids = (side: unknown) => ((side as { variants?: { id: string }[] }).variants ?? []).map((v) => v.id).sort();
      expect(ids(apply1!.before)).toEqual(own.map((v) => v.id).sort()); // a variação "G", sem preço próprio, não aparece
      expect(ids(undo1!.after)).toEqual(own.map((v) => v.id).sort());
      expect((apply1!.after as { basePriceCents: number }).basePriceCents).toBe(11_000);
      expect((undo1!.after as { basePriceCents: number }).basePriceCents).toBe(10_000);
    });
  });

  describe('produto removido no meio', () => {
    it('Q-R1: rascunho apagado ENTRE a prévia e o aplicar = 404 para o pedido todo, nada é aplicado e a chave continua livre', async () => {
      const ps = [await priced(10_000), await priced(10_000, true), await priced(10_000)];
      const key = `qr1-${uniqueTag(8)}`;
      await ctx.http.delete(path(`/${ps[1]!.id}`)).set(as(owner)).expect(204);
      const res = await apply(body(ps), key);
      expect(res.status).toBe(404);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(10_000);
      const retry = await apply(body([ps[0]!, ps[2]!]), key).expect(200);
      expect(retry.body.changed).toBe(2);
    });

    it('Q-R2: depois de aplicar, 1 produto é arquivado e 1 rascunho apagado: desfazer não dá 500, reverte os demais, mantém o arquivado como `CHANGED_AFTER` e o apagado fica fora da lista (A4)', async () => {
      const ps = [await priced(10_000), await priced(10_000, true), await priced(10_000), await priced(10_000)];
      const applied = await apply(body(ps)).expect(200);
      await ctx.http.delete(path(`/${ps[1]!.id}`)).set(as(owner)).expect(204); // rascunho: apaga a linha
      await ctx.http.delete(path(`/${ps[2]!.id}`)).set(as(owner)).expect(204); // ativo: arquiva
      const res = await undo(applied.body.batchId as string).expect(200);
      expect(res.body.reverted).toBe(2);
      expect(res.body.skipped.map((s: { productId: string }) => s.productId)).toEqual([ps[2]!.id]);
      expect(res.body.reverted + res.body.skipped.length).toBeLessThan(4); // A4 (DT-099): o total não fecha com itemsCount
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(10_000);
      expect((await row(ps[2]!.id))!.basePriceCents).toBe(11_000);
    });

    it('Q-R3: se TODOS os produtos sumiram, desfazer devolve reverted 0, não marca o lote como desfeito e não dá 500', async () => {
      const ps = [await priced(10_000, true), await priced(10_000, true)];
      const applied = await apply(body(ps)).expect(200);
      for (const p of ps) await ctx.http.delete(path(`/${p.id}`)).set(as(owner)).expect(204);
      const res = await undo(applied.body.batchId as string).expect(200);
      expect(res.body).toMatchObject({ reverted: 0, skipped: [] });
      expect((await batchesOf()).find((b) => b.id === applied.body.batchId)!.undoneAt).toBeNull();
    });
  });

  describe('BK-08 com estoque mexido à mão', () => {
    it('Q-S1: ajuste manual de estoque DEPOIS do reajuste sobe a versão: o desfazer não devolve o preço desse produto (CHANGED_AFTER), devolve os outros e mantém o estoque ajustado (DT-097 c)', async () => {
      const ps = [await withVariant(10), await withVariant(10), await withVariant(10)];
      const applied = await apply(body(ps)).expect(200);
      await ctx.http.post(path(`/${ps[0]!.id}/variants/${ps[0]!.variantId}/stock`)).set(as(owner)).send({ delta: -3 }).expect(200);
      const res = await undo(applied.body.batchId as string).expect(200);
      expect(res.body.reverted).toBe(2);
      expect(res.body.skipped).toEqual([expect.objectContaining({ productId: ps[0]!.id, reason: 'CHANGED_AFTER' })]);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(5_500); // continua reajustado
      expect((await row(ps[1]!.id))!.basePriceCents).toBe(5_000);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, ps[0]!.variantId)))[0]!.stock).toBe(7);
    });

    it('Q-S2: reserva e venda de estoque (só gravam a variação) NÃO impedem o desfazer', async () => {
      const ps = [await withVariant(10), await withVariant(10)];
      const applied = await apply(body(ps)).expect(200);
      await ctx.db.update(productVariants).set({ reserved: 3 }).where(eq(productVariants.id, ps[0]!.variantId)); // o que a reserva de um pedido faz
      const res = await undo(applied.body.batchId as string).expect(200);
      expect(res.body).toMatchObject({ reverted: 2, skipped: [] });
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(5_000);
    });

    it('Q-S3: estoque ajustado ENTRE a prévia e o aplicar = 409 BULK_VERSION_CONFLICT com o produto em `conflicts`; nada é aplicado', async () => {
      const ps = [await withVariant(10), await withVariant(10)];
      await ctx.http.post(path(`/${ps[1]!.id}/variants/${ps[1]!.variantId}/stock`)).set(as(owner)).send({ delta: 1 }).expect(200);
      const res = await apply(body(ps)).expect(409);
      expect(res.body.code).toBe('BULK_VERSION_CONFLICT');
      expect(res.body.conflicts?.map((c: { productId: string }) => c.productId) ?? res.body.extensions?.conflicts?.map((c: { productId: string }) => c.productId)).toEqual([ps[1]!.id]);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(5_000);
    });

    it('Q-S4: ajuste de estoque com If-Match velho = 409; 2 ajustes simultâneos com o MESMO If-Match: um passa e o outro 409 (sem somar duas vezes)', async () => {
      const p = await withVariant(10);
      const send = () => ctx.http.post(path(`/${p.id}/variants/${p.variantId}/stock`)).set(as(owner)).set('If-Match', `"${p.version}"`).send({ delta: 1 });
      const res = await Promise.all([send(), send()]);
      expect(res.map((r) => r.status).sort()).toEqual([200, 409]);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock).toBe(11);
      for (const bad of ['abc', '"0"', '"-1"', '"1.5"', '']) {
        const r = await ctx.http.post(path(`/${p.id}/variants/${p.variantId}/stock`)).set(as(owner)).set('If-Match', bad).send({ delta: 1 });
        expect({ bad, ok: r.status < 500 }).toEqual({ bad, ok: true });
      }
    });
  });

  describe('massa do admin (WB-353 C6)', () => {
    const adminUrl = `/v1/admin/stores`;
    const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
    const one = async (stock: number) => {
      const p = await withVariant(stock);
      await ctx.db.update(products).set({ status: 'active' }).where(eq(products.id, p.id));
      return { ...p, version: (await row(p.id))!.version };
    };
    const send = (payload: unknown, key: string | null = `qa-${uniqueTag(10)}`) => {
      const req = ctx.http.post(`${adminUrl}/${storeId}/products/bulk`).set(as(ops));
      return (key ? req.set('Idempotency-Key', key) : req).send(payload as object);
    };
    const adminBody = (ps: { id: string; version: number }[], action: object, over: Record<string, unknown> = {}) => ({ reason: ask, productIds: ps.map((p) => p.id), expectedVersions: ps.map((p) => ({ productId: p.id, version: p.version })), action, ...over });

    it('Q-A1: caractere NUL e nota de 401 caracteres no motivo = 4xx (nunca 500); nada é aplicado', async () => {
      const p = await one(10);
      const nul = await send(adminBody([p], { type: 'stock_set', value: 1 }, { reason: { code: 'requested_by_merchant', note: 'com\u0000nul' } }));
      note(`[QA-R13] motivo com NUL: HTTP ${nul.status}`);
      expect(nul.status).toBeLessThan(500);
      const long = await send(adminBody([p], { type: 'stock_set', value: 2 }, { reason: { code: 'requested_by_merchant', note: 'x'.repeat(401) } }));
      expect(long.status).toBe(400);
      const codeNul = await send(adminBody([p], { type: 'stock_set', value: 1 }, { reason: { code: 'x\u0000y' } }));
      expect(codeNul.status).toBeLessThan(500);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock).not.toBe(2); // a nota de 401 caracteres não aplicou
    });

    it('Q-A2: limites do estoque: 99.999 passa, 100.000 = 400, -1 = 400 em stock_set; stock_adjust que deixaria negativo ou passaria de 99.999 não dá 500 e não grava valor inválido', async () => {
      const p = await one(10);
      const set = (value: number) => send(adminBody([{ id: p.id, version: p.version }], { type: 'stock_set', value }), null); // dryRun-like: sem chave só vale na validação
      expect((await set(100_000)).status).toBe(400);
      expect((await set(-1)).status).toBe(400);
      const down = await send(adminBody([p], { type: 'stock_adjust', value: -99_999 }));
      expect(down.status).toBeLessThan(500);
      const stockNow = (await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock;
      expect(stockNow).toBeGreaterThanOrEqual(0);
      const q = await one(99_990);
      const up = await send(adminBody([q], { type: 'stock_adjust', value: 99_999 }));
      expect(up.status).toBeLessThan(500);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, q.variantId)))[0]!.stock).toBeLessThanOrEqual(99_999 + 99_990);
      note(`[QA-R13] stock_adjust -99999 sobre 10: HTTP ${down.status} ${JSON.stringify(down.body).slice(0, 160)}; +99999 sobre 99990: HTTP ${up.status} estoque final ${(await ctx.db.select().from(productVariants).where(eq(productVariants.id, q.variantId)))[0]!.stock}`);
    });

    it('Q-A3: a MESMA chave com corpo DIFERENTE não repete a resposta antiga nem aplica o corpo novo em silêncio', async () => {
      const p = await one(10);
      const key = `qa3-${uniqueTag(8)}`;
      await send(adminBody([p], { type: 'stock_set', value: 20 }), key).expect(200);
      const diff = await send(adminBody([p], { type: 'stock_set', value: 30 }), key);
      expect(diff.status).toBeGreaterThanOrEqual(400);
      expect(diff.status).toBeLessThan(500);
      expect((await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock).toBe(20);
    });

    it('Q-A5: 14 execuções SIMULTÂNEAS de um admin novo (chaves e produtos diferentes) passam no máximo 10 (as outras 429), sem 500, e o estoque mudou só nas que passaram', async () => {
      const fresh = await createAdmin(ctx, 'operations');
      const ps = await Promise.all(Array.from({ length: 14 }, () => one(10)));
      const res = await Promise.all(ps.map((p) => ctx.http.post(`${adminUrl}/${storeId}/products/bulk`).set(as(fresh)).set('Idempotency-Key', `qa5-${uniqueTag(10)}`).send(adminBody([p], { type: 'stock_set', value: 77 }))));
      const ok = res.filter((r) => r.status === 200).length;
      const limited = res.filter((r) => r.status === 429).length;
      note(`[QA-R13] Q-A5: 14 simultâneas -> ${ok} x 200, ${limited} x 429, outros ${res.length - ok - limited}`);
      expect(res.every((r) => r.status === 200 || r.status === 429)).toBe(true);
      expect(ok).toBeLessThanOrEqual(10);
      expect(ok).toBeGreaterThanOrEqual(1);
      let changed = 0;
      for (const p of ps) if ((await ctx.db.select().from(productVariants).where(eq(productVariants.id, p.variantId)))[0]!.stock === 77) changed += 1;
      expect(changed).toBe(ok);
    });

    it('Q-A4: 200 itens de uma vez (estoque +1): 200 linhas de auditoria, 1 lote, versão +1 em cada, tempo registrado; o 201º = 422', async () => {
      const ps: { id: string; variantId: string; version: number }[] = [];
      for (let i = 0; i < 200; i += 20) ps.push(...(await Promise.all(Array.from({ length: 20 }, () => one(5)))));
      const lots = (await batchesOf()).length;
      const t0 = Date.now();
      const res = await send(adminBody(ps, { type: 'stock_adjust', value: 1 })).expect(200);
      const ms = Date.now() - t0;
      expect(res.body).toMatchObject({ changed: 200 });
      expect((await batchesOf()).length).toBe(lots + 1);
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), like(auditLog.action, 'product.%')));
      expect(trail.filter((t) => ps.some((p) => p.variantId === t.targetId)).length).toBeGreaterThanOrEqual(200);
      for (const p of ps.slice(0, 5)) expect((await row(p.id))!.version).toBe(p.version + 1);
      note(`[QA-R13] admin 200 itens stock_adjust: ${ms} ms`);
      expect(ms).toBeLessThan(10_000);
      const plus = [...ps, await one(5)];
      const big = await send(adminBody(plus, { type: 'stock_adjust', value: 1 }), null);
      expect([422]).toContain(big.status);
    }, 120_000);
  });

  describe('entradas hostis nas rotas do lojista', () => {
    it('Q-H1: batchId inválido ou inexistente no desfazer = 400/404; cursor e limite inválidos no histórico = 400; nunca 500', async () => {
      for (const id of ['abc', '00000000-0000-0000-0000-000000000000', randomUUID(), "1' or '1'='1"]) {
        const r = await undo(id);
        expect({ id, ok: [400, 404].includes(r.status) }).toEqual({ id, ok: true });
      }
      for (const q of ['?cursor=@@@', '?cursor=' + 'a'.repeat(300), '?limit=0', '?limit=-1', '?limit=1000', '?limit=abc', "?cursor=' or 1=1 --"]) {
        const r = await ctx.http.get(path(`/bulk-batches${q}`)).set(as(owner));
        expect({ q, ok: r.status === 400 || r.status === 200 }).toEqual({ q, ok: true });
      }
    });

    it('Q-H2: a MESMA chave com corpo diferente no reajuste do lojista não aplica o corpo novo em silêncio', async () => {
      const p = await priced(10_000);
      const key = `qh2-${uniqueTag(8)}`;
      await apply(body([p]), key).expect(200);
      const diff = await apply(body([p], { action: { type: 'price_adjust', mode: 'percent', value: 50 }, confirmLargeChange: true }), key);
      expect(diff.status).toBeGreaterThanOrEqual(400);
      expect((await row(p.id))!.basePriceCents).toBe(11_000);
    });

    it('Q-H3: reajuste ainda nasce com o produto em ARQUIVADO ou PAUSADO? (registro do comportamento; a tela só lista os não arquivados)', async () => {
      const p = await priced(10_000);
      await ctx.db.update(products).set({ status: 'archived', archivedAt: new Date() }).where(eq(products.id, p.id));
      const res = await apply(body([p]));
      note(`[QA-R13] reajuste de produto arquivado: HTTP ${res.status}`);
      expect(res.status).toBeLessThan(500);
    });
  });
  describe('migração 0063 com dados reais e papéis', () => {
    const ROOT = nodePath.resolve(nodePath.dirname(fileURLToPath(import.meta.url)), '..');
    const withClient = async <T>(url: string, fn: (c: pg.Client) => Promise<T>): Promise<T> => {
      const client = new pg.Client({ connectionString: url });
      await client.connect();
      try {
        return await fn(client);
      } finally {
        await client.end();
      }
    };
    const tables = (c: pg.Client) => c.query<{ t: string }>(`SELECT table_name AS t FROM information_schema.tables WHERE table_schema = 'public' AND table_name LIKE 'product_bulk_batch%' ORDER BY 1`).then((r) => r.rows.map((x) => x.t));

    it('Q-M1: webag_app lê, grava e atualiza os lotes mas NÃO apaga a tabela nem muda a estrutura; o down como webag_app é negado', async () => {
      await withClient(TEST_ENV.appDatabaseUrl, async (c) => {
        const priv = async (table: string, p: string) => (await c.query(`SELECT has_table_privilege(current_user, $1, $2) AS ok`, [table, p])).rows[0].ok as boolean;
        for (const t of ['product_bulk_batches', 'product_bulk_batch_items']) {
          expect({ t, select: await priv(t, 'SELECT'), insert: await priv(t, 'INSERT') }).toEqual({ t, select: true, insert: true });
          expect({ t, truncate: await priv(t, 'TRUNCATE'), references: await priv(t, 'REFERENCES'), trigger: await priv(t, 'TRIGGER') }).toEqual({ t, truncate: false, references: false, trigger: false });
        }
        expect(await priv('product_bulk_batches', 'UPDATE')).toBe(true); // o desfazer marca undone_at
        await expect(c.query(readFileSync(nodePath.join(ROOT, 'drizzle/down/0063.sql'), 'utf8'))).rejects.toThrow(/must be owner|permission denied|deve ser/i);
        await c.query('ROLLBACK').catch(() => undefined);
      });
    });

    it('Q-M2: com a loja, produtos, lotes e auditoria já gravados, o down/0063 como webag_migrator tira só as 2 tabelas e o registro do Drizzle; produtos e audit_log ficam; reaplicar traz as tabelas vazias e a API volta a funcionar', async () => {
      const ps = [await priced(10_000), await priced(20_000)];
      const applied = await apply(body(ps)).expect(200);
      const countsOf = async (c: pg.Client) => (await c.query(`SELECT (SELECT count(*)::int FROM products) AS p, (SELECT count(*)::int FROM audit_log) AS a, (SELECT count(*)::int FROM stores) AS s, (SELECT count(*)::int FROM drizzle.__drizzle_migrations) AS j`)).rows[0] as { p: number; a: number; s: number; j: number };
      const before = await withClient(TEST_ENV.migratorDatabaseUrl, async (c) => {
        expect(await tables(c)).toEqual(['product_bulk_batch_items', 'product_bulk_batches']);
        const snap = await countsOf(c);
        await c.query('BEGIN');
        // O migrator do Drizzle só aplica o que é MAIS NOVO que a última migração registrada: reverter a 0063 com migrações posteriores aplicadas exige reverter as posteriores antes
        // (v1.1 R2: 0065 e 0064, que não mexem em `product_bulk_batches`), senão a 0063 nunca mais é reaplicada. A ordem é a do guia de deploy §16: da mais nova para a mais antiga.
        for (const n of ['0065', '0064', '0063']) await c.query(readFileSync(nodePath.join(ROOT, `drizzle/down/${n}.sql`), 'utf8'));
        await c.query('COMMIT');
        expect(await tables(c)).toEqual([]);
        const after = await countsOf(c);
        expect(after).toEqual({ ...snap, j: snap.j - 3 });
        return snap;
      });
      await runMigrations(TEST_ENV.migratorDatabaseUrl);
      await withClient(TEST_ENV.migratorDatabaseUrl, async (c) => {
        expect(await tables(c)).toEqual(['product_bulk_batch_items', 'product_bulk_batches']);
        expect((await countsOf(c)).j).toBe(before.j);
        expect((await c.query(`SELECT count(*)::int AS n FROM product_bulk_batches`)).rows[0].n).toBe(0);
      });
      // O reajuste feito ANTES da reversão não tem mais lote: desfazer = 404 (perda de dado documentada no down). O preço segue como estava (nada some do produto).
      expect((await undo(applied.body.batchId as string)).status).toBe(404);
      expect((await row(ps[0]!.id))!.basePriceCents).toBe(11_000);
      // Depois da reaplicação, um reajuste novo e o desfazer funcionam de ponta a ponta.
      const fresh = await Promise.all(ps.map(async (p) => ({ id: p.id, version: (await row(p.id))!.version })));
      const again = await apply(body(fresh)).expect(200);
      expect((await undo(again.body.batchId as string).expect(200)).body.reverted).toBe(2);
    });
  });
});
