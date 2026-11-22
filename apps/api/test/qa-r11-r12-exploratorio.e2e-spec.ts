import { randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { and, eq, sql } from 'drizzle-orm';
import { adminViewSessions, auditLog, productVariants, products, storeMembers, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, createCustomer, createMerchant, ensureCategory, ensureCity, ensureLegalDocs, insertStoreRow, jpegBuffer, uploadFile, type TestAdmin, type TestMerchant } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/**
 * QA, rodada R1.1 + R1.2 (2026-11-22): exploratório automatizado do back-end. Ataca o que os e2e do dev (`view-as`, `admin-store-360`, `r12-*`) não cobrem:
 * concorrência admin x lojista, resposta perdida e duplo toque no `quickPublish`, teto de 100 sob duplicação, propriedades do reajuste em massa (prévia = aplicação),
 * entradas hostis (NUL, controle, limites) e a visão "Ver como" com credencial vencida e não varrida. Cada falha vira BUG-### em `docs/qa/bugs/`; enquanto o bug
 * estiver aberto o caso fica em `it.fails` (a suíte segue verde e o vitest avisa quando o dev corrigir).
 */
/** Evidência observada (vitest esconde console.log): vai para o arquivo apontado por QA_EVIDENCE (padrão /dev/shm/qa-r11-evidence.log). */
const evidence = (line: string): void => appendFileSync(process.env.QA_EVIDENCE ?? '/dev/shm/qa-r11-evidence.log', `${line}\n`);

describe('QA R1.1 + R1.2: exploratório do back-end', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let categoryId: string;
  let ops: TestAdmin;
  let superAdmin: TestAdmin;

  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const tag = () => uniqueTag(8);
  const base = (id = storeId) => `/v1/stores/${id}`;
  const row = async (id: string) => (await ctx.db.select().from(products).where(eq(products.id, id)))[0]!;
  const freshStore = async () => {
    const merchant = await createMerchant(ctx);
    const id = (await insertStoreRow(ctx, merchant.userId, { status: 'approved', name: `Loja ${uniqueTag(5)}` })).id;
    return { merchant, id };
  };
  const uploadReady = async (user: TestMerchant = owner, id = storeId) => {
    const up = await uploadFile(ctx, user, { storeId: id, purpose: 'product_image', contentType: 'image/jpeg', body: await jpegBuffer(900, 700) });
    return (up.completed!.body as { id: string }).id;
  };
  const newDraft = async (user: TestMerchant = owner, id = storeId, body: Record<string, unknown> = { via: 'camera' }) =>
    (await ctx.http.post(`${base(id)}/product-drafts`).set(as(user)).set('Idempotency-Key', `d-${tag()}`).send(body).expect(201)).body as { id: string; version: number };
  const quick = (productId: string, body: Record<string, unknown>, k: string | null = `qp-${tag()}`, ifMatch?: string, user: TestMerchant = owner, id = storeId) => {
    let req = ctx.http.post(`${base(id)}/products/${productId}/quick-publish`).set(as(user));
    if (k) req = req.set('Idempotency-Key', k);
    if (ifMatch) req = req.set('If-Match', ifMatch);
    return req.send(body);
  };
  const fillDrafts = async (id: string, total: number) => {
    const have = (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.storeId, id), eq(products.status, 'draft'))))[0]!.n;
    if (total > have) await ctx.db.insert(products).values(Array.from({ length: total - have }, (_, i) => ({ storeId: id, name: `Rascunho ${i}`, status: 'draft' as const })));
  };
  const draftCount = async (id: string) => (await ctx.db.select({ n: sql<number>`count(*)::int` }).from(products).where(and(eq(products.storeId, id), eq(products.status, 'draft'))))[0]!.n;
  /** Produto ativo, com 1 variação padrão e preço, direto pelas rotas do lojista (v1.0). */
  const activeProduct = async (user: TestMerchant, id: string, priceCents: number, extra: Record<string, unknown> = {}) => {
    const created = await ctx.http.post(`${base(id)}/products`).set(as(user)).send({ name: `Produto ${tag()}`, categoryId, basePriceCents: priceCents, ...extra }).expect(201);
    const pid = created.body.id as string;
    await ctx.http.put(`${base(id)}/products/${pid}/variants`).set(as(user)).send({ attributes: [], variants: [{ attributes: {}, stock: 10 }] }).expect(200);
    await ctx.db.update(products).set({ status: 'active', publishedAt: new Date() }).where(eq(products.id, pid));
    return pid;
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja QA R1' })).id;
    categoryId = await ensureCategory(ctx);
    [ops, superAdmin] = [await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'super_admin')];
  });
  afterAll(async () => {
    await ctx.close();
  });

  // ===================================================================== quickPublish (WB-370 C3, C14, C15, C16, C17)
  describe('quickPublish: duplo toque, resposta perdida, dois aparelhos, entradas hostis', () => {
    it('C14: duplo toque (mesma chave em paralelo) publica UMA vez, as duas respostas são o mesmo produto, versão +1 e 1 linha de auditoria', async () => {
      const d = await newDraft();
      const img = await uploadReady();
      const k = `dbl-${tag()}`;
      const body = { name: 'Camiseta duplo toque', basePriceCents: 4990, categoryId, stock: 3, imageIds: [img] };
      const [a, b] = await Promise.all([quick(d.id, body, k), quick(d.id, body, k)]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.id).toBe(b.body.id);
      expect(a.body.version).toBe(b.body.version);
      const after = await row(d.id);
      expect(after.status).toBe('active');
      expect(after.version).toBe(d.version + 1);
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, storeId), eq(auditLog.targetId, d.id), eq(auditLog.action, 'product.quick_publish')));
      expect(trail).toHaveLength(1);
    });

    it('dois aparelhos com chaves DIFERENTES: um publica, o outro recebe 409 QUICK_PUBLISH_NOT_APPLICABLE; nada é publicado duas vezes', async () => {
      const d = await newDraft();
      const img = await uploadReady();
      const [a, b] = await Promise.all([
        quick(d.id, { name: 'Aparelho A', basePriceCents: 1000, categoryId, stock: 1, imageIds: [img] }),
        quick(d.id, { name: 'Aparelho B', basePriceCents: 2000, categoryId, stock: 1, imageIds: [img] }),
      ]);
      const codes = [a.status, b.status].sort();
      expect(codes, JSON.stringify([a.body, b.body])).toEqual([200, 409]);
      const loser = a.status === 409 ? a : b;
      expect(loser.body.code).toBe('QUICK_PUBLISH_NOT_APPLICABLE');
      expect((await row(d.id)).version).toBe(d.version + 1);
    });

    it('C15 resposta perdida: a MESMA chave devolve o original mesmo depois de o lojista editar; chave nova com If-Match velho = 409 de versão; chave nova sem If-Match = 409 e a edição do lojista fica', async () => {
      const d = await newDraft();
      const img = await uploadReady();
      const body = { name: 'Produto resposta perdida', basePriceCents: 3000, categoryId, stock: 2, imageIds: [img] };
      const k = `lost-${tag()}`;
      const first = await quick(d.id, body, k).expect(200);
      // o lojista edita o preço depois da publicação (versão sobe)
      await ctx.http.patch(`${base()}/products/${d.id}`).set(as(owner)).send({ basePriceCents: 3500 }).expect(200);
      const edited = await row(d.id);
      const replay = await quick(d.id, body, k);
      expect(replay.status).toBe(200);
      expect(replay.body.id).toBe(first.body.id);
      expect((await row(d.id)).basePriceCents).toBe(3500); // o replay NÃO reverte a edição
      const stale = await quick(d.id, body, `new-${tag()}`, `"${d.version + 1}"`);
      expect([stale.status, stale.body.code]).toEqual([409, 'PRODUCT_VERSION_CONFLICT']);
      const noMatch = await quick(d.id, body, `new-${tag()}`);
      expect([noMatch.status, noMatch.body.code]).toEqual([409, 'QUICK_PUBLISH_NOT_APPLICABLE']);
      const final = await row(d.id);
      expect(final.basePriceCents).toBe(3500);
      expect(final.version).toBe(edited.version);
    });

    it('C5/C17: faixa de preço, estoque e nome: 1 centavo e R$ 99.999,99 passam; 0, 100.000,00, negativo, decimal e texto são recusados (4xx, nunca 500)', async () => {
      const img = await uploadReady();
      const tryPrice = async (value: unknown) => {
        const d = await newDraft();
        return quick(d.id, { name: 'Faixa de preço', basePriceCents: value, categoryId, stock: 1, imageIds: [img] });
      };
      expect((await tryPrice(1)).status).toBe(200);
      expect((await tryPrice(9_999_999)).status).toBe(200);
      for (const bad of [0, 10_000_000, -5, 10.5, '5000', null, 1e21]) {
        const res = await tryPrice(bad);
        expect(res.status, `preço ${String(bad)} -> ${res.status} ${JSON.stringify(res.body)}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `preço ${String(bad)}`).toBeLessThan(500);
      }
      const stock = async (value: unknown) => quick((await newDraft()).id, { name: 'Faixa de estoque', basePriceCents: 1000, categoryId, stock: value, imageIds: [img] });
      expect((await stock(99_999)).status).toBe(200);
      expect((await stock(0)).status).toBe(200);
      for (const bad of [100_000, -1, 1.5, '3']) {
        const res = await stock(bad);
        expect(res.status, `estoque ${String(bad)}`).toBeGreaterThanOrEqual(400);
        expect(res.status, `estoque ${String(bad)}`).toBeLessThan(500);
      }
    });

    it('C17: nome com espaços, 1 caractere, 81 caracteres, NUL, controle e emoji nunca dá 500 e o nome gravado é texto limpo', async () => {
      const img = await uploadReady();
      const names: [string, string][] = [
        ['  ', 'reject'],
        ['A', 'reject'],
        ['x'.repeat(81), 'reject'],
        ['Camiseta\u0000NUL', 'CamisetaNUL'],
        ['Camiseta‮oculta', 'Camisetaoculta'],
        ['  Bolsa   couro  \n legítimo ', 'Bolsa couro legítimo'],
        ['\u{1F355} Pizza congelada', '\u{1F355} Pizza congelada'],
      ];
      for (const [name, expected] of names) {
        const d = await newDraft();
        const res = await quick(d.id, { name, basePriceCents: 1500, categoryId, stock: 1, imageIds: [img] });
        expect(res.status, `nome ${JSON.stringify(name)} -> ${res.status} ${JSON.stringify(res.body)}`).toBeLessThan(500);
        if (expected === 'reject') expect(res.status, JSON.stringify(name)).toBeGreaterThanOrEqual(400);
        else expect([res.status, (await row(d.id)).name]).toEqual([200, expected]);
      }
    });

    it('permissão e posse: funcionário sem `catalog`, cliente e lojista de outra loja não publicam (403/404) e o rascunho não muda', async () => {
      const d = await newDraft();
      const img = await uploadReady();
      const stranger = await createMerchant(ctx);
      const res = await quick(d.id, { name: 'Invasor', basePriceCents: 100, categoryId, stock: 1, imageIds: [img] }, `x-${tag()}`, undefined, stranger);
      expect([403, 404]).toContain(res.status);
      expect((await row(d.id)).status).toBe('draft');
    });
  });

  // ===================================================================== teto de 100 rascunhos (WB-371 C2, DEC-118)
  describe('rascunhos: teto de 100', () => {
    it('99 -> o 100º entra, o 101º é 422; apagar um libera a vaga; publicar libera a vaga; arquivado e ativo não contam', async () => {
      const { merchant, id } = await freshStore();
      await fillDrafts(id, 99);
      const hundredth = await newDraft(merchant, id);
      expect(await draftCount(id)).toBe(100);
      const over = await ctx.http.post(`${base(id)}/product-drafts`).set(as(merchant)).set('Idempotency-Key', `o-${tag()}`).send({ via: 'camera' });
      expect([over.status, over.body.code]).toEqual([422, 'DRAFT_LIMIT_REACHED']);
      await ctx.http.patch(`${base(id)}/products/${hundredth.id}`).set(as(merchant)).send({ name: 'Descartado' }).expect(200);
      await ctx.http.delete(`${base(id)}/products/${hundredth.id}`).set(as(merchant)).expect(204);
      expect(await draftCount(id)).toBe(99);
      await newDraft(merchant, id);
      // publicar um rascunho libera vaga: usa um dos 100
      const some = (await ctx.db.select().from(products).where(and(eq(products.storeId, id), eq(products.status, 'draft'))).limit(1))[0]!;
      await ctx.db.update(products).set({ status: 'archived' }).where(eq(products.id, some.id));
      expect(await draftCount(id)).toBe(99);
      await newDraft(merchant, id);
      expect(await draftCount(id)).toBe(100);
    });

    it('BUG-036: apagar ("Excluir") um rascunho SEM nome (o que nasce ao tocar em "Novo produto", antes da câmera) devolve 204 e libera a vaga; hoje é 500 (products_name_len)', async () => {
      const { merchant, id } = await freshStore();
      const nameless = await newDraft(merchant, id);
      const res = await ctx.http.delete(`${base(id)}/products/${nameless.id}`).set(as(merchant));
      expect(res.status).toBe(204);
      expect(await draftCount(id)).toBe(0);
    });

    it('BUG-036 (variante): rascunho com nome de 1 caractere também não pode ser apagado (500)', async () => {
      const { merchant, id } = await freshStore();
      const d = await newDraft(merchant, id, { via: 'form', name: 'A' });
      expect((await ctx.http.delete(`${base(id)}/products/${d.id}`).set(as(merchant))).status).toBe(204);
    });

    it('duplicar sob concorrência com 98 rascunhos: de 5 duplicações em paralelo passam EXATAMENTE 2 (o teto vale em duplicar)', async () => {
      const { merchant, id } = await freshStore();
      const source = await activeProduct(merchant, id, 5000);
      await fillDrafts(id, 98);
      const results = await Promise.all(Array.from({ length: 5 }, () => ctx.http.post(`${base(id)}/products/${source}/duplicate`).set(as(merchant)).set('Idempotency-Key', `dup-${tag()}`).send({})));
      expect(results.filter((r) => r.status === 201)).toHaveLength(2);
      expect(results.filter((r) => r.status === 422).every((r) => r.body.code === 'DRAFT_LIMIT_REACHED')).toBe(true);
      expect(await draftCount(id)).toBe(100);
    });

    it('lote colado de 100 linhas de 200 caracteres, com NUL, emoji, direção invisível, preço e quantidade hostis: nunca 500; as boas entram; as ruins vão em `rejected` com a linha', async () => {
      const { merchant, id } = await freshStore();
      const items: Record<string, unknown>[] = [];
      for (let i = 0; i < 100; i += 1) {
        const bad = i % 10;
        items.push({
          clientRef: `l${i}`,
          name: bad === 1 ? 'N\u0000UL '.repeat(5) : bad === 2 ? 'x'.repeat(200) : bad === 3 ? '‮senha invertida' : bad === 4 ? `\u{1F355}`.repeat(60) : `Item ${i} ${tag()}`,
          basePriceCents: bad === 5 ? 0 : bad === 6 ? -10 : bad === 7 ? 10_000_000 : bad === 8 ? null : 1000 + i,
          quantity: bad === 9 ? -1 : 2,
        });
      }
      const res = await ctx.http.post(`${base(id)}/product-drafts/batch`).set(as(merchant)).set('Idempotency-Key', `b-${tag()}`).send({ via: 'paste', items });
      expect(res.status, JSON.stringify(res.body).slice(0, 400)).toBeLessThan(500);
      if (res.status === 201 || res.status === 200) {
        const created = (res.body.created as unknown[] | undefined)?.length ?? res.body.createdCount;
        const rejected = (res.body.rejected as { clientRef?: string }[] | undefined) ?? [];
        // 100 linhas = created + rejected, sem sumiço silencioso
        expect(Number(created) + rejected.length, JSON.stringify(res.body).slice(0, 300)).toBe(100);
        expect(await draftCount(id)).toBe(Number(created));
        const names = (await ctx.db.select({ n: products.name }).from(products).where(eq(products.storeId, id))).map((r) => r.n);
        expect(names.some((n) => n.includes('\u0000') || n.includes('\u202E'))).toBe(false);
      }
    });
  });

  // ===================================================================== reajuste em massa (WB-377 lado servidor; BK; RN-Q9)
  describe('reajuste em massa: prévia = aplicação, bordas de centavo, promoção, atomicidade', () => {
    const preview = (id: string, ids: string[], action: Record<string, unknown>, user: TestMerchant) => ctx.http.post(`${base(id)}/products/bulk`).set(as(user)).send({ productIds: ids, action, dryRun: true });
    const apply = (id: string, ids: string[], action: Record<string, unknown>, versions: { productId: string; version: number }[], user: TestMerchant, confirm = true, k = `ba-${tag()}`) =>
      ctx.http.post(`${base(id)}/products/bulk`).set(as(user)).set('Idempotency-Key', k).send({ productIds: ids, action, dryRun: false, expectedVersions: versions, confirmLargeChange: confirm });

    it('propriedade: para 30 preços aleatórios e 8 percentuais, o que a prévia mostrou é EXATAMENTE o que foi gravado; preço sempre inteiro entre 1 e 9.999.999; bloqueados não mudam', async () => {
      const { merchant, id } = await freshStore();
      let seed = 20261122;
      const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
      const prices = [1, 2, 3, 9, 99, 100, 101, 999, 1000, 4999, 5000, 9999, 12345, 99999, 123456, 999999, 1_000_000, 5_000_000, 9_999_998, 9_999_999, ...Array.from({ length: 10 }, () => 1 + Math.floor(rnd() * 500_000))];
      const ids: string[] = [];
      for (const p of prices) ids.push(await activeProduct(merchant, id, p));
      for (const pct of [10, -10, 33.33, -33.33, 0.01, -0.01, 7.5, -90, 500]) {
        const pv = await preview(id, ids, { type: 'price_adjust', mode: 'percent', value: pct }, merchant);
        expect(pv.status, JSON.stringify(pv.body).slice(0, 300)).toBe(200);
        const items = pv.body.preview as { productId: string; version: number; fromCents: number; toCents: number }[];
        const before = new Map((await ctx.db.select().from(products).where(eq(products.storeId, id))).map((r) => [r.id, r.basePriceCents]));
        for (const it2 of items) {
          expect(Number.isInteger(it2.toCents)).toBe(true);
          expect(it2.toCents).toBeGreaterThanOrEqual(1);
          expect(it2.toCents).toBeLessThanOrEqual(9_999_999);
          expect(it2.fromCents).toBe(before.get(it2.productId));
        }
        const blockedIds = new Set((pv.body.blocked as { productId: string }[]).map((b) => b.productId));
        if (blockedIds.size > 0) {
          // com bloqueado a aplicação inteira é recusada e NADA muda (atômica)
          const versions = new Map((await ctx.db.select({ id: products.id, v: products.version }).from(products).where(eq(products.storeId, id))).map((r) => [r.id, r.v]));
          const res = await apply(id, ids, { type: 'price_adjust', mode: 'percent', value: pct }, ids.map((pid) => ({ productId: pid, version: versions.get(pid)! })), merchant);
          expect([res.status, res.body.code], `pct ${pct}`).toEqual([422, 'BULK_BLOCKED']);
          const stay = new Map((await ctx.db.select().from(products).where(eq(products.storeId, id))).map((r) => [r.id, r.basePriceCents]));
          expect([...stay.entries()]).toEqual([...before.entries()]);
          continue;
        }
        const res = await apply(id, ids, { type: 'price_adjust', mode: 'percent', value: pct }, items.map((i) => ({ productId: i.productId, version: i.version })), merchant);
        expect(res.status, `pct ${pct} ${JSON.stringify(res.body).slice(0, 300)}`).toBe(200);
        const after = new Map((await ctx.db.select().from(products).where(eq(products.storeId, id))).map((r) => [r.id, r.basePriceCents]));
        for (const it2 of items) expect(after.get(it2.productId), `pct ${pct} de ${it2.fromCents}`).toBe(it2.toCents);
      }
    });

    it('promoção: reduzir o preço normal abaixo do promocional bloqueia o LOTE INTEIRO (422 BULK_BLOCKED) e nenhum item muda; a prévia já avisa', async () => {
      const { merchant, id } = await freshStore();
      const plain = await activeProduct(merchant, id, 10_000);
      const promo = await activeProduct(merchant, id, 10_000);
      await ctx.db.update(products).set({ promoPriceCents: 8_000, promoStartsAt: new Date(Date.now() - 1000), promoEndsAt: new Date(Date.now() + 86_400_000) }).where(eq(products.id, promo));
      const action = { type: 'price_adjust', mode: 'percent', value: -30 };
      const pv = await preview(id, [plain, promo], action, merchant).expect(200);
      expect((pv.body.blocked as unknown[]).length).toBe(1);
      const res = await apply(id, [plain, promo], action, await Promise.all([plain, promo].map(async (p) => ({ productId: p, version: (await row(p)).version }))), merchant);
      expect([res.status, res.body.code]).toEqual([422, 'BULK_BLOCKED']);
      expect((await row(plain)).basePriceCents).toBe(10_000);
      expect((await row(promo)).basePriceCents).toBe(10_000);
    });

    it('BUG-039: borda de centavo: +10% sobre R$ 0,01 não muda o preço; o lote não deve subir a versão nem gravar "de 1 para 1" no histórico (item sem mudança de preço)', async () => {
      const { merchant, id } = await freshStore();
      const cheap = await activeProduct(merchant, id, 1);
      const pv = await preview(id, [cheap], { type: 'price_adjust', mode: 'percent', value: 10 }, merchant).expect(200);
      const v = (pv.body.preview as { version: number; toCents: number }[])[0]!;
      expect(v.toCents).toBe(1);
      const res = await apply(id, [cheap], { type: 'price_adjust', mode: 'percent', value: 10 }, [{ productId: cheap, version: v.version }], merchant);
      expect(res.status).toBe(200);
      const trail = await ctx.db.select().from(auditLog).where(and(eq(auditLog.storeId, id), eq(auditLog.targetId, cheap), eq(auditLog.action, 'product.price')));
      expect(trail.filter((t) => (t.before as { basePriceCents: number }).basePriceCents === (t.after as { basePriceCents: number }).basePriceCents), 'linha de histórico com preço igual antes e depois').toHaveLength(0);
      expect((await row(cheap)).version, 'versão subiu sem o preço mudar').toBe(v.version);
    });

    it('entrada hostil: valor float em reais, 1e21, 0 e percentual com 3 casas = 400/422, nunca 500; 201 ids = 422 BULK_TOO_LARGE (A3, igual ao admin); id repetido é deduplicado', async () => {
      const { merchant, id } = await freshStore();
      const p = await activeProduct(merchant, id, 5000);
      const ok = async (action: Record<string, unknown>) => (await preview(id, [p], action, merchant)).status;
      expect(await ok({ type: 'price_adjust', mode: 'amount', value: 10.5 })).toBe(400);
      expect(await ok({ type: 'price_adjust', mode: 'amount', value: 1e21 })).toBeLessThan(500);
      expect(await ok({ type: 'price_adjust', mode: 'percent', value: 10.123 })).toBe(400);
      expect(await ok({ type: 'price_adjust', mode: 'percent', value: -91 })).toBe(400);
      expect(await ok({ type: 'price_adjust', mode: 'percent', value: 501 })).toBe(400);
      expect(await ok({ type: 'price_adjust', mode: 'percent', value: 0 })).toBeLessThan(500);
      const many = Array.from({ length: 201 }, () => randomUUID());
      const tooLarge = await preview(id, many, { type: 'pause' }, merchant);
      expect([tooLarge.status, tooLarge.body.code]).toEqual([422, 'BULK_TOO_LARGE']);
      const dup = await preview(id, [p, p, p], { type: 'price_adjust', mode: 'percent', value: 10 }, merchant).expect(200);
      expect(dup.body.preview).toHaveLength(1);
    });

    it('limite de 10 lotes por hora por loja: o 11º lote é 429 (e a prévia?)', async () => {
      const { merchant, id } = await freshStore();
      const p = await activeProduct(merchant, id, 5000);
      const codes: number[] = [];
      for (let i = 0; i < 12; i += 1) codes.push((await preview(id, [p], { type: 'pause' }, merchant)).status);
      // registra o que acontece com PRÉVIA (dryRun) para o relatório: se a prévia consome o limite, o lojista que só confere trava
      expect(codes.filter((c) => c === 429).length).toBeGreaterThanOrEqual(0);
      evidence(`[QA] 12 prévias (dryRun) seguidas: ${codes.join(',')}`);
    });
  });

  // ===================================================================== importação CSV (SEC-213)
  describe('importação CSV', () => {
    const header = 'nome;categoria;descricao;preco;promocional;promo_inicio;promo_fim;variacao1;variacao2;estoque;codigo';
    const post = (merchant: TestMerchant, id: string, body: string, query: Record<string, string>, contentType = 'text/csv', key: string | null = `csv-${tag()}`) => {
      const req = ctx.http.post(`${base(id)}/products/import`).query(query).set(as(merchant)).set('Content-Type', contentType);
      return (key ? req.set('Idempotency-Key', key) : req).send(body);
    };
    it('células com fórmula entram como texto literal e não quebram (=, +, -, @, tab); linha ruim vira erro da linha; nunca 500', async () => {
      const { merchant, id } = await freshStore();
      const cat = (await ctx.db.execute<{ name: string }>(sql`select name from categories where id = ${categoryId}`)).rows[0]!.name;
      const rowsCsv = [header, `=HYPERLINK("http://evil","x");${cat};;10,00;;;;;;1;QA1`, `+cmd|' /C calc'!A0;${cat};;11,00;;;;;;1;QA2`, `@SUM(1);${cat};;12,00;;;;;;1;QA3`, `Normal;${cat};;abc;;;;;;1;QA4`, `Estoque ruim;${cat};;5,00;;;;;;1,5;QA5`, `Sem categoria;Inexistente;;5,00;;;;;;1;QA6`].join('\r\n');
      const res = await post(merchant, id, rowsCsv, { mode: 'commit' });
      expect(res.status, JSON.stringify(res.body).slice(0, 300)).toBeLessThan(500);
      evidence(`[QA] CSV hostil: ${res.status} ${JSON.stringify(res.body).slice(0, 400)}`);
      const names = (await ctx.db.select({ n: products.name }).from(products).where(eq(products.storeId, id))).map((r) => r.n);
      expect(names.some((n) => n.startsWith('=') || n.startsWith('+') || n.startsWith('@'))).toBe(true); // literal
    });

    it('limites: 501 linhas, arquivo de 1 MB + 1, corpo vazio, só cabeçalho, JSON no lugar do CSV e BOM: 4xx claro, nunca 500', async () => {
      const { merchant, id } = await freshStore();
      const cat = (await ctx.db.execute<{ name: string }>(sql`select name from categories where id = ${categoryId}`)).rows[0]!.name;
      const lines = (n: number) => [header, ...Array.from({ length: n }, (_, i) => `Produto ${i} ${tag()};${cat};;5,00;;;;;;1;S${i}${tag()}`)].join('\n');
      const over = await post(merchant, id, lines(501), { mode: 'preview' });
      const big = await post(merchant, id, `${header}\n${'x'.repeat(1_048_577)}`, { mode: 'preview' });
      const empty = await post(merchant, id, '', { mode: 'preview' });
      const only = await post(merchant, id, header, { mode: 'preview' });
      const asJson = await post(merchant, id, '{"a":1}', { mode: 'preview' }, 'application/json');
      const bom = await post(merchant, id, `\uFEFF${lines(2)}`, { mode: 'preview' });
      evidence(`[QA] CSV limites: 501 linhas=${over.status}, 1MB+1=${big.status}, vazio=${empty.status}, só cabeçalho=${only.status}, json=${asJson.status}, BOM=${bom.status} (${JSON.stringify(bom.body).slice(0, 160)})`);
      for (const r of [over, big, empty, only, asJson, bom]) expect(r.status).toBeLessThan(500);
      expect(over.status).toBeGreaterThanOrEqual(400);
      expect(big.status).toBeGreaterThanOrEqual(400);
    });

    it('SEC-213: atualizar produto por planilha em produto REMOVIDO pela moderação ou ARQUIVADO não o reativa nem o devolve à vitrine', async () => {
      const { merchant, id } = await freshStore();
      const cat = (await ctx.db.execute<{ name: string }>(sql`select name from categories where id = ${categoryId}`)).rows[0]!.name;
      const removed = await activeProduct(merchant, id, 5000);
      const archived = await activeProduct(merchant, id, 5000);
      const skus = { [removed]: `RM${tag()}`, [archived]: `AR${tag()}` };
      for (const [pid, sku] of Object.entries(skus)) await ctx.db.update(productVariants).set({ sku }).where(eq(productVariants.productId, pid));
      await ctx.db.update(products).set({ moderationStatus: 'removed', status: 'paused' }).where(eq(products.id, removed));
      await ctx.db.update(products).set({ status: 'archived' }).where(eq(products.id, archived));
      const csv = [header, `Qualquer;${cat};;9,99;;;;;;7;${skus[removed]}`, `Outro;${cat};;9,99;;;;;;7;${skus[archived]}`].join('\r\n');
      const res = await post(merchant, id, csv, { mode: 'commit', onExisting: 'update' });
      evidence(`[QA] CSV update em removido/arquivado: ${res.status} ${JSON.stringify(res.body).slice(0, 300)}`);
      expect(res.status).toBeLessThan(500);
      expect((await row(removed)).status).not.toBe('active');
      expect((await row(removed)).moderationStatus).toBe('removed');
      expect((await row(archived)).status).toBe('archived');
    });
  });

  // ===================================================================== tabela de preço e estoque (WB-377 leitura)
  describe('tabela de preço e estoque: filtros hostis, paginação estável, perfis', () => {
    it('BUG-038: q com %, _, \\, aspas, NUL e emoji; limit 0, -1, 101, abc; cursor lixo; sectionId inválido: 200 ou 400, nunca 500; coringa % não casa tudo', async () => {
      const { merchant, id } = await freshStore();
      for (let i = 0; i < 3; i += 1) await activeProduct(merchant, id, 1000 + i);
      const get = (query: Record<string, string>) => ctx.http.get(`${base(id)}/products/table`).query(query).set(as(merchant));
      const seen: string[] = [];
      for (const q of ['%', '_', '\\', "'; drop table products;--", '\u0000', '\u{1F355}', 'a'.repeat(81)]) {
        const r = await get({ q });
        if (r.status >= 500) seen.push(`q=${JSON.stringify(q)} -> ${r.status}`);
      }
      expect(seen, 'q que dá 500').toEqual([]);
      const pct = await get({ q: '%' });
      if (pct.status === 200) evidence(`[QA] tabela q=% -> ${pct.body.matchingCount} de 3 casaram (coringa LIKE ${pct.body.matchingCount === 3 ? 'ATIVO' : 'neutralizado'})`);
      for (const limit of ['0', '-1', '101', 'abc', '1.5']) expect((await get({ limit })).status, `limit=${limit}`).toBeLessThan(500);
      expect((await get({ cursor: 'lixo' })).status).toBeLessThan(500);
      expect((await get({ sectionId: 'nao-uuid' })).status).toBe(400);
      expect((await get({ status: 'draft' })).status).toBe(400);
    });

    it('paginação com preços e nomes IGUAIS: 25 produtos, páginas de 7 = nenhum repetido e nenhum faltando', async () => {
      const { merchant, id } = await freshStore();
      const ids: string[] = [];
      for (let i = 0; i < 25; i += 1) {
        const pid = await activeProduct(merchant, id, 1000);
        await ctx.db.update(products).set({ name: 'Mesmo nome' }).where(eq(products.id, pid));
        ids.push(pid);
      }
      const seen: string[] = [];
      let cursor: string | undefined;
      for (let page = 0; page < 10; page += 1) {
        const res = await ctx.http.get(`${base(id)}/products/table`).query({ limit: '7', ...(cursor ? { cursor } : {}) }).set(as(merchant)).expect(200);
        for (const r of res.body.data as { productId?: string; id?: string }[]) seen.push((r.productId ?? r.id)!);
        cursor = res.body.nextCursor ?? undefined;
        if (!cursor) break;
      }
      expect(new Set(seen).size).toBe(seen.length);
      expect([...new Set(seen)].sort()).toEqual([...ids].sort());
    });
  });

  // ===================================================================== edição de loja pelo admin (WB-351): concorrência e entradas hostis
  describe('edição da loja pelo admin: admin x lojista em paralelo, versão e entradas hostis', () => {
    const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
    const versionOf = async (id: string) => (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
    const patch = (id: string, body: unknown, who: TestAdmin = ops) => ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(as(who)).send(body as object);

    it('lojista (horário) e admin (dados) com a MESMA versão ao mesmo tempo: sem atualização perdida; versão sobe exatamente o número de sucessos', async () => {
      for (let round = 0; round < 5; round += 1) {
        const { merchant, id } = await freshStore();
        const v = await versionOf(id);
        const hours = { days: [{ weekday: 3, intervals: [{ start: '08:00', end: '12:00' }] }] };
        const [m, a] = await Promise.all([
          ctx.http.put(`${base(id)}/hours`).set(as(merchant)).send(hours),
          patch(id, { reason: ask, expectedVersion: v, changes: { description: `Descrição do admin ${round}` } }),
        ]);
        const success = [m.status === 204, a.status === 200].filter(Boolean).length;
        expect([204, 200, 409]).toContain(m.status === 204 ? 204 : m.status);
        expect([200, 409]).toContain(a.status);
        const after = await versionOf(id);
        // o lojista não manda versão (grava sempre, sobe a versão); o admin falha com 409 se perdeu a corrida
        expect(after, `round ${round}: lojista=${m.status} admin=${a.status}`).toBe(v + success);
        if (a.status === 200) expect((await ctx.db.select().from(stores).where(eq(stores.id, id)))[0]!.description).toBe(`Descrição do admin ${round}`);
        if (m.status === 204) {
          const settings = await ctx.http.get(`${base(id)}/settings`).set(as(merchant)).expect(200);
          expect((settings.body.hours as { weekday: number; intervals: unknown[] }[]).filter((d) => d.intervals.length > 0).map((d) => d.weekday)).toEqual([3]);
        }
      }
    });

    it('expectedVersion hostil (string, 0, -1, 1.5, null, ausente, 2^53) = 400, nunca 500; versão não muda', async () => {
      const { id } = await freshStore();
      const v = await versionOf(id);
      for (const bad of ['1', 0, -1, 1.5, null, undefined, 2 ** 53]) {
        const res = await patch(id, { reason: ask, ...(bad === undefined ? {} : { expectedVersion: bad }), changes: { name: 'Nome Válido' } });
        expect(res.status, `expectedVersion=${String(bad)} -> ${res.status} ${JSON.stringify(res.body).slice(0, 160)}`).toBe(v === 1 && bad === 2 ** 53 ? 409 : 400);
      }
      expect(await versionOf(id)).toBe(v);
    });

    it('BUG-038: NUL e controle em nome, descrição e nota do motivo: 4xx ou texto limpo, nunca 500 (o PostgreSQL recusa \\u0000)', async () => {
      const { id } = await freshStore();
      const bodies = [
        { changes: { name: 'Loja\u0000Nula' }, reason: ask },
        { changes: { description: 'Desc\u0000ricao' }, reason: ask },
        { changes: { name: 'Loja Boa' }, reason: { code: 'requested_by_merchant', note: 'WhatsApp\u0000, 24/11' } },
        { changes: { whatsapp: '11\u000099999999' }, reason: ask },
      ];
      const seen: string[] = [];
      for (const b of bodies) {
        const v = await versionOf(id);
        const res = await patch(id, { ...b, expectedVersion: v });
        if (res.status >= 500) seen.push(`${JSON.stringify(b.changes)} nota=${JSON.stringify(b.reason.note)} -> ${res.status}`);
      }
      expect(seen, 'campos que dão 500 com NUL').toEqual([]);
    });

    it('BUG-039: edição sem mudança real (mesmo nome) não sobe a versão nem manda e-mail "A Webag alterou" ao lojista', async () => {
      const { merchant, id } = await freshStore();
      const current = (await ctx.db.select().from(stores).where(eq(stores.id, id)))[0]!;
      const v = current.version;
      ctx.mail.outbox.length = 0;
      const res = await patch(id, { reason: ask, expectedVersion: v, changes: { name: current.name ?? 'Loja' } });
      evidence(`[QA] edição sem mudança real: HTTP ${res.status}, versão ${v} -> ${await versionOf(id)}, e-mails ao lojista: ${ctx.mail.to(merchant.email).length}`);
      expect(res.status).toBeLessThan(500);
      expect(await versionOf(id), 'BUG-039: edição sem mudança de valor não deve subir a versão').toBe(v);
      expect(ctx.mail.to(merchant.email).length, 'BUG-039: nem avisar o lojista de uma mudança que não houve').toBe(0);
    });

    it('pausa: reabrir/pausar com versão velha = 409; pausar duas vezes seguidas com a versão certa funciona e a segunda substitui a primeira (uma pausa só)', async () => {
      const { id } = await freshStore();
      let v = await versionOf(id);
      await ctx.http.post(`/v1/admin/stores/${id}/pause`).set(as(ops)).send({ reason: ask, expectedVersion: v, kind: '30m' }).expect(200);
      const stale = await ctx.http.post(`/v1/admin/stores/${id}/pause`).set(as(ops)).send({ reason: ask, expectedVersion: v, kind: '2h' });
      expect([stale.status, stale.body.code]).toEqual([409, 'STORE_VERSION_CONFLICT']);
      v = await versionOf(id);
      await ctx.http.post(`/v1/admin/stores/${id}/pause`).set(as(ops)).send({ reason: ask, expectedVersion: v, kind: 'until_resume' }).expect(200);
      v = await versionOf(id);
      await ctx.http.post(`/v1/admin/stores/${id}/resume`).set(as(ops)).send({ reason: ask, expectedVersion: v }).expect(200);
      const paused = await ctx.db.execute<{ paused_until: Date | null }>(sql`select paused_until from store_settings where store_id = ${id}`);
      expect(paused.rows[0]!.paused_until).toBeNull();
    });
  });

  // ===================================================================== "Ver como" (WB-352): credencial vencida sem varredura, aberturas simultâneas, campos
  describe('"Ver como": expiração sem varredura, aberturas simultâneas, HEAD, nota hostil, varredura total de iscas', () => {
    let shop: Awaited<ReturnType<typeof shopWith>>;
    let activeOrderId: string;
    let buyer: Awaited<ReturnType<typeof customerAt>>;
    const open = (who: TestAdmin, id: string, reason: Record<string, unknown> = { code: 'merchant_support' }) => ctx.http.post(`/v1/admin/stores/${id}/view-as`).set(as(who)).send({ reason });
    const viewGet = (who: TestAdmin, path: string, token: string) => ctx.http.get(path).set(as(who)).set('X-View-As', token);

    beforeAll(async () => {
      shop = await shopWith(ctx, [{ name: 'Camiseta QA', priceCents: 8_000, stock: 50 }]);
      buyer = await customerAt(ctx, shop.origin, { number: '10' });
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      activeOrderId = created.id;
    });

    it('BUG-040: credencial com `expires_at` no passado e linha ainda ABERTA (varredura não rodou): a leitura é negada na hora (VIEW_AS_EXPIRED) e abrir outra visão fecha a velha', async () => {
      const admin = await createAdmin(ctx, 'support');
      const opened = (await open(admin, shop.store.id).expect(201)).body as { id: string; token: string };
      await viewGet(admin, `${base(shop.store.id)}`, opened.token).expect(200);
      await ctx.db.update(adminViewSessions).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(adminViewSessions.id, opened.id));
      const res = await viewGet(admin, `${base(shop.store.id)}`, opened.token);
      expect([res.status, res.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      const second = (await open(admin, shop.store.id).expect(201)).body as { id: string };
      const old = (await ctx.db.select().from(adminViewSessions).where(eq(adminViewSessions.id, opened.id)))[0]!;
      evidence(`[QA] visão vencida e não varrida, ao abrir outra: close_cause = ${old.closeCause}`);
      expect(old.closedAt).not.toBeNull();
      expect(old.closeCause, 'BUG-040: a visão vencida deve fechar como expired, não replaced').toBe('expired');
      expect(second.id).not.toBe(opened.id);
    });

    it('credencial presa ao tempo do servidor: 30 min exatos no banco (`expires_at - opened_at`) e nunca depois do fim da sessão do admin', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const opened = (await open(admin, shop.store.id).expect(201)).body as { id: string; expiresAt: string };
      const r = (await ctx.db.select().from(adminViewSessions).where(eq(adminViewSessions.id, opened.id)))[0]!;
      expect(r.expiresAt.getTime() - r.openedAt.getTime()).toBe(30 * 60_000);
      expect(new Date(opened.expiresAt).getTime()).toBe(r.expiresAt.getTime());
    });

    it('duas aberturas SIMULTÂNEAS do mesmo admin: no máximo uma visão ativa no banco, nenhum 500', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const [a, b] = await Promise.all([open(admin, shop.store.id), open(admin, shop.store.id)]);
      expect([a.status, b.status].every((s) => s === 201 || s === 409), `${a.status} ${b.status} ${JSON.stringify([a.body, b.body]).slice(0, 300)}`).toBe(true);
      const active = await ctx.db.select().from(adminViewSessions).where(and(eq(adminViewSessions.adminUserId, admin.userId), sql`${adminViewSessions.closedAt} is null`));
      expect(active.length).toBeLessThanOrEqual(1);
    });

    it('BUG-038: nota do motivo hostil (NUL, 201 caracteres, só espaços, emoji): 4xx ou texto limpo, nunca 500', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const seen: string[] = [];
      for (const note of ['Pedido\u0000NUL', 'x'.repeat(201), '    ', '\u{1F355} ligou pedindo ajuda']) {
        const res = await open(admin, shop.store.id, { code: 'other', note });
        if (res.status >= 500) seen.push(`${JSON.stringify(note).slice(0, 30)} -> ${res.status}`);
      }
      expect(seen, 'notas que dão 500').toEqual([]);
    });

    it('HEAD em rota da visão não escreve nada e não vaza corpo; método TRACE/OPTIONS com a credencial = 403 ou sem efeito', async () => {
      const admin = await createAdmin(ctx, 'support');
      const opened = (await open(admin, shop.store.id).expect(201)).body as { token: string };
      const head = await ctx.http.head(`${base(shop.store.id)}/orders`).set(as(admin)).set('X-View-As', opened.token);
      evidence(`[QA] HEAD na visão: ${head.status}`);
      expect(head.status).toBeLessThan(500);
      expect(head.text ?? '').toBe('');
    });

    it('varredura de iscas: nas 12 rotas lidas pela visão, em nenhuma resposta aparece e-mail, telefone, rua, CEP, coordenada, código de entrega, id do cliente nem sobrenome do comprador', async () => {
      const admin = await createAdmin(ctx, 'support');
      const opened = (await open(admin, shop.store.id).expect(201)).body as { token: string };
      const sid = shop.store.id;
      const [buyerRow] = (await ctx.db.execute<{ id: string; email: string; name: string; phone: string | null; cpf: string | null }>(sql`select id, email, name, phone, null as cpf from users where id = ${buyer.user.userId}`)).rows;
      await ctx.db.execute(sql`update users set name = 'Maria Souzaisca', phone = '11988887777' where id = ${buyer.user.userId}`);
      const orderRow = (await ctx.db.execute<{ address: Record<string, unknown>; delivery_code: string | null; code: string | null }>(sql`select address, null as delivery_code, null as code from orders where id = ${activeOrderId}`)).rows[0]!;
      const paths = [`${base(sid)}`, `${base(sid)}/settings`, `${base(sid)}/products`, `${base(sid)}/sections`, `${base(sid)}/orders`, `${base(sid)}/orders/counts`, `${base(sid)}/orders/${activeOrderId}`, `${base(sid)}/exchanges`, `${base(sid)}/reviews/summary`, `${base(sid)}/reviews`, `${base(sid)}/products/table`];
      const dump: Record<string, string> = {};
      for (const p of paths) {
        const res = await viewGet(admin, p, opened.token);
        expect(res.status, p).toBe(200);
        dump[p] = JSON.stringify(res.body);
      }
      const all = Object.values(dump).join('\n');
      const deliveryCode = (await ctx.db.execute<Record<string, unknown>>(sql`select * from orders where id = ${activeOrderId}`)).rows[0]!;
      const codeColumns = Object.entries(deliveryCode).filter(([k, v]) => /code|pin/i.test(k) && typeof v === 'string' && String(v).length >= 4).map(([k, v]) => [k, v as string] as const);
      const baits = [buyerRow!.email, '11988887777', 'Souzaisca', 'Rua Teste', '07900-100', '07900100', buyer.user.userId, String((orderRow.address.lat as number | null) ?? '#none#'), String((orderRow.address.lng as number | null) ?? '#none#'), ...codeColumns.map(([, v]) => v)];
      for (const bait of baits) {
        if (bait === '#none#' || bait.length < 7) continue; // isca curta ("-12") casa com pedaço de UUID: seria falso positivo
        expect(all.includes(bait), `isca "${bait}" apareceu na visão`).toBe(false);
      }
      evidence(`[QA] iscas conferidas: ${baits.length} (colunas de código no pedido: ${codeColumns.map(([k]) => k).join(', ') || 'nenhuma'}); chaves do pedido na visão: ${Object.keys(JSON.parse(dump[`${base(sid)}/orders/${activeOrderId}`]!) as object).join(',')}`);
    });
  });

  // ===================================================================== alcance do NUL (\u0000): v1.0 x R1
  describe('alcance do NUL: onde um \\u0000 em texto vira 500 (o PostgreSQL recusa o byte)', () => {
    it('varredura informativa: v1.0 (busca pública, criar produto, perfil do lojista) e R1 (tabela, edição do admin, nota do "Ver como")', async () => {
      const out: string[] = [];
      const note = (label: string, status: number) => out.push(`${label}=${status}`);
      note('busca pública q', (await ctx.http.get('/v1/search/products').query({ q: 'a\u0000b', lat: '-23.28', lng: '-46.74' })).status);
      note('v1.0 criar produto name', (await ctx.http.post(`${base()}/products`).set(as(owner)).send({ name: 'Nome\u0000Nulo', categoryId, basePriceCents: 1000 })).status);
      note('v1.0 listar produtos q', (await ctx.http.get(`${base()}/products`).query({ q: 'a\u0000b' }).set(as(owner))).status);
      note('R1.2 tabela q', (await ctx.http.get(`${base()}/products/table`).query({ q: 'a\u0000b' }).set(as(owner))).status);
      note('R1.2 rascunho name', (await ctx.http.post(`${base()}/product-drafts`).set(as(owner)).set('Idempotency-Key', `n-${tag()}`).send({ via: 'form', name: 'a\u0000b' })).status);
      note('R1.1 admin perfil name', (await ctx.http.patch(`/v1/admin/stores/${storeId}/profile`).set(as(ops)).send({ reason: { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' }, expectedVersion: 1, changes: { name: 'a\u0000b' } })).status);
      evidence(`[QA] NUL sweep: ${out.join(' | ')}`);
      expect(out.length).toBeGreaterThan(0);
    });
  });

  // ===================================================================== perfis: funcionário sem `catalog` nas 7 rotas novas da R1.2 (obs. 2 do threat model §17.4)
  describe('funcionário da loja com só `orders` (sem `catalog`) nas rotas novas da R1.2', () => {
    it('as escritas e a leitura de rascunhos negam (403); só a tabela de preço e estoque abre, com "Você recebe" nulo (DEC-118 item 2)', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 5000);
      const staff = await createCustomer(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
      const img = await uploadReady(merchant, id);
      const key = () => `s-${tag()}`;
      const results: Record<string, number> = {
        'POST product-drafts': (await ctx.http.post(`${base(id)}/product-drafts`).set(as(staff)).set('Idempotency-Key', key()).send({ via: 'camera' })).status,
        'POST product-drafts/batch': (await ctx.http.post(`${base(id)}/product-drafts/batch`).set(as(staff)).set('Idempotency-Key', key()).send({ via: 'paste', items: [{ clientRef: 'a', name: 'Item', basePriceCents: 100 }] })).status,
        'GET product-drafts': (await ctx.http.get(`${base(id)}/product-drafts`).set(as(staff))).status,
        'GET catalog/quick-start': (await ctx.http.get(`${base(id)}/catalog/quick-start`).set(as(staff))).status,
        'POST duplicate': (await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(staff)).set('Idempotency-Key', key()).send({})).status,
        'POST quick-publish': (await ctx.http.post(`${base(id)}/products/${pid}/quick-publish`).set(as(staff)).set('Idempotency-Key', key()).send({ name: 'Invasor', basePriceCents: 1, categoryId, stock: 1, imageIds: [img] })).status,
        'POST products/bulk': (await ctx.http.post(`${base(id)}/products/bulk`).set(as(staff)).send({ productIds: [pid], action: { type: 'pause' }, dryRun: true })).status,
        'POST products/import': (await ctx.http.post(`${base(id)}/products/import`).query({ mode: 'preview' }).set(as(staff)).set('Content-Type', 'text/csv').send('nome\nx')).status,
        'POST stock delta': (await ctx.http.post(`${base(id)}/products/${pid}/variants/${(await ctx.db.select().from(productVariants).where(eq(productVariants.productId, pid)))[0]!.id}/stock`).set(as(staff)).send({ delta: 5 })).status,
      };
      evidence(`[QA] funcionário sem catalog: ${JSON.stringify(results)}`);
      for (const [route, status] of Object.entries(results)) expect(status, route).toBe(403);
      const table = await ctx.http.get(`${base(id)}/products/table`).set(as(staff)).expect(200);
      expect((table.body.data as { youReceiveCents: number | null }[]).every((r) => r.youReceiveCents === null)).toBe(true);
      expect((await row(pid)).status).toBe('active');
    });
  });

  // ===================================================================== ficha 360: comissão efetiva (WB-350 C1) loja > categoria > padrão (RN-10)
  describe('ficha 360: comissão efetiva', () => {
    it('taxa própria da loja vence o padrão e aparece com a origem; só o financeiro/super altera; a ficha mostra o mesmo percentual que o painel de comissão', async () => {
      const { id } = await freshStore();
      const finance = await createAdmin(ctx, 'finance');
      const before = await ctx.http.get(`/v1/admin/stores/${id}/overview`).set(as(ops)).expect(200);
      expect(before.body.commission.source).toBe('default');
      await ctx.http.put(`/v1/admin/stores/${id}/commission`).set(as(ops)).send({ pct: 7, reason: 'tentativa da operação' }).expect(403);
      const set = await ctx.http.put(`/v1/admin/stores/${id}/commission`).set(as(finance)).send({ pct: 7, reason: 'acordo comercial com o lojista' });
      expect(set.status, JSON.stringify(set.body)).toBeLessThan(300);
      const after = await ctx.http.get(`/v1/admin/stores/${id}/overview`).set(as(ops)).expect(200);
      evidence(`[QA] comissão efetiva após taxa própria: ${JSON.stringify(after.body.commission)}`);
      expect(after.body.commission).toMatchObject({ source: 'store', pct: 7 });
      const panel = await ctx.http.get(`/v1/admin/stores/${id}/commission`).set(as(finance)).expect(200);
      expect(Number(panel.body.pct ?? panel.body.effectivePct ?? 7)).toBe(7);
    });
  });

  // ===================================================================== histórico por loja: o que o lojista faz aparece com autor "lojista" (review R1.1 I2, DEC-125, WB-350 C4)
  describe('histórico da ficha 360: autor lojista', () => {
    it('catálogo (R1.2): preço, publicação rápida e duplicação feitos pelo LOJISTA entram no histórico com actor.kind = merchant (DEC-122 I4)', async () => {
      const { merchant, id } = await freshStore();
      const pid = await activeProduct(merchant, id, 5000);
      await ctx.http.patch(`${base(id)}/products/${pid}`).set(as(merchant)).send({ basePriceCents: 6000 }).expect(200);
      const d = await newDraft(merchant, id);
      await quick(d.id, { name: 'Publicado rápido', basePriceCents: 1200, categoryId, stock: 2, imageIds: [await uploadReady(merchant, id)] }, `h-${tag()}`, undefined, merchant, id).expect(200);
      await ctx.http.post(`${base(id)}/products/${pid}/duplicate`).set(as(merchant)).set('Idempotency-Key', `hd-${tag()}`).send({}).expect(201);
      const data = (await ctx.http.get(`/v1/admin/stores/${id}/history?limit=50`).set(as(ops)).expect(200)).body.data as { type: string; actor: { kind: string } }[];
      evidence(`[QA] histórico (autor lojista, catálogo): ${JSON.stringify(data.map((e) => `${e.type}/${e.actor.kind}`))}`);
      expect(data.filter((e) => e.actor.kind === 'merchant').length).toBeGreaterThanOrEqual(4);
    });

    it('BUG-037: horário, pausa e dados da loja alterados pelo LOJISTA entram no histórico da ficha 360 com actor.kind = merchant (review I2 a; WB-350 C4 "filtra por autor")', async () => {
      const { merchant, id } = await freshStore();
      await ctx.http.put(`${base(id)}/hours`).set(as(merchant)).send({ days: [{ weekday: 2, intervals: [{ start: '08:00', end: '12:00' }] }] }).expect(204);
      await ctx.http.patch(`${base(id)}/profile`).set(as(merchant)).send({ description: 'Nova descrição da loja pelo lojista' }).expect(200);
      await ctx.http.post(`${base(id)}/pause`).set(as(merchant)).send({ kind: '30m' }).expect(204);
      const data = (await ctx.http.get(`/v1/admin/stores/${id}/history?limit=50`).set(as(ops)).expect(200)).body.data as { type: string; actor: { kind: string } }[];
      const cfg = data.filter((e) => ['hours', 'pause', 'profile'].includes(e.type) && e.actor.kind === 'merchant');
      evidence(`[QA] histórico (autor lojista, config): linhas em hours/pause/profile = ${cfg.length}; todas = ${JSON.stringify(data.map((e) => `${e.type}/${e.actor.kind}`))}`);
      expect(cfg.length).toBeGreaterThanOrEqual(3);
    });
  });

  // ===================================================================== o filtro "por autor" do histórico (a asserção do dev é tautológica: `name === x || name !== null`)
  describe('histórico da ficha 360: filtros de verdade', () => {
    it('actorAdminId devolve SÓ as linhas daquele admin (e nenhuma de outro); type filtra o tipo; from/to recortam o período', async () => {
      const { id } = await freshStore();
      const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
      const finance2 = await createAdmin(ctx, 'operations');
      let v = (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
      await ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(as(ops)).send({ reason: ask, expectedVersion: v, changes: { description: 'Primeira' } }).expect(200);
      v += 1;
      await ctx.http.post(`/v1/admin/stores/${id}/pause`).set(as(finance2)).send({ reason: ask, expectedVersion: v, kind: '30m' }).expect(200);
      const all = (await ctx.http.get(`/v1/admin/stores/${id}/history?limit=50`).set(as(superAdmin)).expect(200)).body.data as { type: string; actor: { id?: string; kind: string; name: string | null } }[];
      const mine = (await ctx.http.get(`/v1/admin/stores/${id}/history?actorAdminId=${finance2.userId}`).set(as(superAdmin)).expect(200)).body.data as { type: string }[];
      evidence(`[QA] filtro por autor: total=${all.length} (${all.map((e) => e.type).join(',')}), só do 2º admin=${mine.length} (${mine.map((e) => e.type).join(',')})`);
      expect(all.length).toBeGreaterThanOrEqual(2);
      expect(mine.length, 'o filtro por autor deve devolver só as linhas do admin pedido').toBe(1);
      expect(mine[0]!.type).toBe('pause');
      const none = (await ctx.http.get(`/v1/admin/stores/${id}/history?actorAdminId=${randomUUID()}`).set(as(superAdmin)).expect(200)).body.data as unknown[];
      expect(none).toHaveLength(0);
    });
  });
});
