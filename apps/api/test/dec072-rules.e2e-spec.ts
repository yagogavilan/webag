import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';
import { useParam } from './helpers/fees.js';
import { addToCart, approve, attemptOf, cartView, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/** DEC-072 (código alinhado às regras): faixas de parâmetro, parcelas na intenção do cartão, tarifa do provedor e dado do cliente só com pedido ativo. */
describe('DEC-072: regras alinhadas ao código', () => {
  let ctx: TestContext;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(() => ctx.close());
  const put = (key: string, value: unknown) => ctx.http.put(`/v1/admin/parameters/${key}`).set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste da DEC-072' });

  it('troca_resposta_h vai de 6 a 72 (RN-02): 5 e 73 são recusados, 6 e 72 valem', async () => {
    try {
      expect((await put('troca_resposta_h', 5)).status).toBe(422);
      expect((await put('troca_resposta_h', 73)).status).toBe(422);
      expect((await put('troca_resposta_h', 6)).status).toBe(200);
      expect((await put('troca_resposta_h', 72)).status).toBe(200);
    } finally {
      await put('troca_resposta_h', 24);
    }
  });

  it('comissão padrão nasce em 15% e as tarifas estimadas do provedor têm padrão (PIX 0,99%, cartão 4,98%) e faixa', async () => {
    const list = (await ctx.http.get('/v1/admin/parameters').set(bearer(superAdmin.accessToken)).expect(200)).body.data as { key: string; default: number; min: number; max: number }[];
    expect(list.find((p) => p.key === 'comissao_padrao_pct')).toMatchObject({ default: 15 });
    expect(list.find((p) => p.key === 'taxa_provedor_pix_pct')).toMatchObject({ default: 0.99, min: 0 });
    expect(list.find((p) => p.key === 'taxa_provedor_cartao_pct')).toMatchObject({ default: 4.98, min: 0 });
    expect((await put('taxa_provedor_pix_pct', 11)).status).toBe(422);
  });

  it('WB-242 C1: o painel do dono recebe a tarifa estimada do provedor (e o valor muda com o parâmetro)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Tarifa', priceCents: 5_000, stock: 5 }]);
    try {
      const view = (await ctx.http.get(`/v1/stores/${shop.store.id}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(view.providerFeePct).toEqual({ pix: 0.99, card: 4.98 });
      await useParam(ctx, 'taxa_provedor_cartao_pct', 5.5);
      expect((await ctx.http.get(`/v1/stores/${shop.store.id}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body.providerFeePct).toEqual({ pix: 0.99, card: 5.5 });
    } finally {
      await useParam(ctx, 'taxa_provedor_cartao_pct', 4.98);
    }
  });

  it('D-09: a intenção do cartão lê `parcelas_max` e `parcela_min_cents` (a página não oferece parcela que o servidor recusa)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Parcelas', priceCents: 10_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const view = await cartView(ctx, user, addressId);
    const intent = async () => {
      const res = await ctx.http.post('/v1/card-intents').set(bearer(user.accessToken)).send({ mode: 'delivery', addressId, cartRevision: view.revision, expectedTotalCents: view.totalCents }).expect(201);
      return (await ctx.http.get(`/v1/card-intents/${new URL(res.body.url as string).searchParams.get('i')}`).expect(200)).body as { installmentsMax: number; installmentMinCents: number };
    };
    try {
      expect(view.totalCents).toBeGreaterThan(9_000); // ~R$ 105: cabe em 3 x R$ 30
      expect(await intent()).toMatchObject({ installmentsMax: 3, installmentMinCents: 3_000 });
      await useParam(ctx, 'parcelas_max', 12);
      expect((await intent()).installmentsMax).toBe(Math.floor(view.totalCents / 3_000)); // limitado pela parcela mínima
      await useParam(ctx, 'parcelas_max', 2);
      expect((await intent()).installmentsMax).toBe(2);
      await useParam(ctx, 'parcelas_max', 12);
      await useParam(ctx, 'parcela_min_cents', 9_000);
      expect((await intent()).installmentsMax).toBe(1); // só à vista
    } finally {
      await useParam(ctx, 'parcela_min_cents', 3_000);
      await useParam(ctx, 'parcelas_max', 3);
    }
  });

  it('HIP-036 não vale (RN-14): o lojista vê telefone e endereço do cliente só com o pedido ativo; concluído ou cancelado, não', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Dado Cliente', priceCents: 5_000, stock: 5 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    const owner = bearer(shop.store.owner.accessToken);
    const url = `/v1/stores/${shop.store.id}/orders/${created.id}`;

    const active = (await ctx.http.get(url).set(owner).expect(200)).body;
    expect(active.delivery.address).toMatchObject({ street: 'Rua Teste' });
    expect((await ctx.http.get(`${url}/ticket`).set(owner).expect(200)).body.destination).toContain('Rua Teste');

    await ctx.http.post(`${url}/refuse`).set(owner).send({ reason: 'sem estoque do item' }).expect(200);
    const closed = (await ctx.http.get(url).set(owner).expect(200)).body;
    expect(closed.customer.phone).toBeNull();
    expect(closed.delivery.address).toEqual({}); // vazio: o contrato segue (objeto), sem dado pessoal
    expect(JSON.stringify(closed)).not.toContain('Rua Teste');
    const ticket = (await ctx.http.get(`${url}/ticket`).set(owner).expect(200)).body;
    expect(ticket.destination).toBe('Entrega');
  });
});
