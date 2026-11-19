import { eq } from 'drizzle-orm';
import { reviews, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { shopWith } from './helpers/orders.js';

/** T.1 e T.4 (DEC-037): parâmetros de troca, piso legal fixo, tabela de medidas, "sem troca voluntária" e "como vestiu?". */
describe('Regras de troca e campos do produto (WB-244, WB-246, WB-247)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  it('piso legal (arrependimento 7, defeito 30 e 90) não é editável nem pelo super admin; prazo voluntário e SLA são parâmetros dentro de faixas', async () => {
    const superAdmin = await createAdmin(ctx, 'super_admin');
    const put = (key: string, value: number) => ctx.http.put(`/v1/admin/parameters/${key}`).set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste das regras de troca' });
    for (const key of ['troca_arrependimento_dias', 'troca_defeito_dias', 'troca_defeito_duravel_dias']) expect((await put(key, 1)).body.code).toBe('PARAMETER_LOCKED');
    const params = (await ctx.http.get('/v1/admin/parameters').set(bearer(superAdmin.accessToken)).expect(200)).body.data as { key: string; value: number }[];
    const val = (key: string) => params.find((p) => p.key === key)?.value;
    expect(val('troca_resposta_h')).toBe(24); // SLA da loja: 24 h (DEC-037)
    expect(val('troca_voluntaria_dias_min')).toBe(3);
    expect(val('troca_voluntaria_dias_max')).toBe(30);
    expect(val('troca_voluntaria_max_por_pedido')).toBe(1);
    expect((await put('troca_resposta_h', 3)).status).toBe(422); // abaixo do mínimo de 4 h
    expect((await put('troca_voluntaria_max_por_pedido', 0)).status).toBe(422);
    expect((await put('troca_resposta_h', 36)).status).toBe(200);
    expect((await put('troca_resposta_h', 24)).status).toBe(200);
  });

  it('lojista edita tabela de medidas e "sem troca voluntária" no produto; o público vê a tabela e se aceita troca', async () => {
    const shop = await shopWith(ctx, [{ name: 'Camiseta Polo', priceCents: 5_990, stock: 10 }]);
    const owner = bearer(shop.store.owner.accessToken);
    const productId = shop.store.productIds[0]!;
    const url = `/v1/stores/${shop.store.id}/products/${productId}`;
    const before = (await ctx.http.get(url).set(owner).expect(200)).body;
    expect(before).toMatchObject({ sizeChart: null, noVoluntaryExchange: false });

    const chart = 'P: peito 50 cm, comprimento 68 cm\nM: peito 53 cm, comprimento 70 cm\nG: peito 56 cm, comprimento 72 cm';
    await ctx.http.patch(url).set(owner).send({ sizeChart: chart, noVoluntaryExchange: true }).expect(200);
    expect((await ctx.http.get(url).set(owner).expect(200)).body).toMatchObject({ sizeChart: chart, noVoluntaryExchange: true });
    const pub = (await ctx.http.get(`/v1/browse/products/${productId}`).expect(200)).body;
    expect(pub).toMatchObject({ sizeChart: chart, acceptsVoluntaryExchange: false });
    await ctx.http.patch(url).set(owner).send({ sizeChart: 'x'.repeat(2_001) }).expect(400);
    await ctx.http.patch(url).set(owner).send({ sizeChart: null, noVoluntaryExchange: false }).expect(200);
    expect((await ctx.http.get(`/v1/browse/products/${productId}`).expect(200)).body).toMatchObject({ sizeChart: null, acceptsVoluntaryExchange: true });
    // outro lojista não edita o produto (IDOR)
    const other = await shopWith(ctx, [{ name: 'Outra', priceCents: 1_000, stock: 1 }]);
    await ctx.http.patch(url).set(bearer(other.store.owner.accessToken)).send({ sizeChart: 'invasão' }).expect(404);
  });

  it('avaliação traz "como vestiu?" (pequeno, fiel, grande) na API pública', async () => {
    const shop = await shopWith(ctx, [{ name: 'Tênis', priceCents: 9_990, stock: 10 }], { ratings: [5] });
    const productId = shop.store.productIds[0]!;
    const [buyer] = await ctx.db.select().from(users).limit(1);
    const [row] = await ctx.db.insert(reviews).values({ storeId: shop.store.id, productId, userId: buyer!.id, orderId: crypto.randomUUID(), rating: 4, comment: 'Ficou apertado', fit: 'small' }).returning();
    const list = (await ctx.http.get(`/v1/browse/products/${productId}/reviews`).expect(200)).body.data as { id: string; fit: string | null }[];
    expect(list.find((r) => r.id === row!.id)?.fit).toBe('small');
    await ctx.db.delete(reviews).where(eq(reviews.id, row!.id));
  });
});
