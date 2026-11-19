import { eq } from 'drizzle-orm';
import { ORDER_STATUSES } from '../src/modules/orders/domain/state.js';
import { orders } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

const DAY = 86_400_000;

/**
 * Bug das capturas finais: `IMPLEMENTED_ACTIONS` omitia `rate` e `request_exchange`, então o app nunca mostrava "Avaliar" nem "Pedir troca"
 * num pedido entregue vindo da API real. Prazos contam do `deliveredAt` (DEC-062/WB-262): avaliar = `avaliacao_janela_dias` (30); troca = o maior
 * prazo dos 3 tipos (arrependimento 7, troca da loja, defeito 90 com produto durável).
 */
describe('allowedActions do cliente por estado e por prazo da entrega', () => {
  let ctx: TestContext;
  let token: string;
  let orderId: string;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    orderId = ((await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string }).id;
    await approve(ctx, buyer.user, (await attemptOf(ctx, orderId)).id);
    token = buyer.user.accessToken;
  });
  afterAll(() => ctx.close());

  const set = (values: Partial<typeof orders.$inferInsert>) => ctx.db.update(orders).set(values).where(eq(orders.id, orderId));
  const actions = async () => ((await ctx.http.get(`/v1/orders/${orderId}`).set(bearer(token)).expect(200)).body.allowedActions as string[]).sort();

  it('por estado (sem entrega): cada estado mostra só o que a máquina de estados permite; "avaliar" e "pedir troca" só em entregue', async () => {
    const expected: Record<string, string[]> = {
      awaiting_payment: ['cancel', 'contact_store'],
      received: ['cancel', 'contact_store'],
      accepted: ['cancel', 'contact_store'],
      in_preparation: ['contact_store', 'request_cancel'],
      ready_for_collection: ['contact_store'],
      out_for_delivery: ['contact_store', 'report_not_received'],
      ready_for_pickup: ['contact_store'],
      cancelled: [],
      refused: [],
      expired: [],
    };
    for (const status of ORDER_STATUSES.filter((s) => s !== 'delivered')) {
      await set({ status, deliveredAt: null });
      expect(await actions(), status).toEqual(expected[status]);
    }
    // entregue sem `deliveredAt` (dado antigo/incompleto): sem prazo não há como contar, então nem avaliar nem trocar
    await set({ status: 'delivered', deliveredAt: null });
    expect(await actions()).toEqual(['contact_store']);
  });

  it('entregue há 1 dia: avaliar, pedir troca, falar com a loja e "não recebi" (48 h)', async () => {
    await set({ status: 'delivered', deliveredAt: new Date(Date.now() - DAY), exchangeVoluntaryDays: 7 });
    expect(await actions()).toEqual(['contact_store', 'rate', 'report_not_received', 'request_exchange']);
  });

  it('a janela de avaliação conta da entrega (30 dias); a de troca vale até o maior prazo dos 3 tipos (defeito, 90 dias)', async () => {
    await set({ deliveredAt: new Date(Date.now() - 29 * DAY) });
    expect(await actions()).toEqual(['contact_store', 'rate', 'request_exchange']); // 3 dias depois some o "não recebi"
    await set({ deliveredAt: new Date(Date.now() - 31 * DAY) });
    expect(await actions()).toEqual(['contact_store', 'request_exchange']); // avaliação fechou; defeito ainda vale
    await set({ deliveredAt: new Date(Date.now() - 89 * DAY) });
    expect(await actions()).toEqual(['contact_store', 'request_exchange']);
    await set({ deliveredAt: new Date(Date.now() - 91 * DAY) });
    expect(await actions()).toEqual(['contact_store']); // todos os prazos acabaram
  });

  it('loja sem troca voluntária: o arrependimento (7 dias) e o defeito continuam valendo', async () => {
    await set({ exchangeVoluntaryDays: 0, deliveredAt: new Date(Date.now() - 20 * DAY) });
    expect(await actions()).toContain('request_exchange');
  });

  it('o prazo de avaliação é o parâmetro do admin, não 30 fixo', async () => {
    const { ParametersService } = await import('../src/modules/admin/index.js');
    const params = ctx.app.get(ParametersService);
    const spy = vi.spyOn(params, 'getNumber').mockImplementation(async (key: string) => (key === 'avaliacao_janela_dias' ? 7 : 30));
    try {
      await set({ deliveredAt: new Date(Date.now() - 8 * DAY), exchangeVoluntaryDays: 7 });
      expect(await actions()).not.toContain('rate');
      await set({ deliveredAt: new Date(Date.now() - 6 * DAY) });
      expect(await actions()).toContain('rate');
    } finally {
      spy.mockRestore();
    }
  });

  it('o que o app passa a mostrar é aceito pela API: avaliar dentro do prazo funciona (201) e fora dele é 422', async () => {
    await set({ deliveredAt: new Date(Date.now() - 31 * DAY) });
    const closed = await ctx.http.post(`/v1/orders/${orderId}/reviews`).set(bearer(token)).send({ rating: 5 });
    expect(closed.status).toBe(422);
    expect(closed.body.code).toBe('REVIEW_WINDOW_CLOSED');
    await set({ deliveredAt: new Date(Date.now() - 2 * DAY) });
    expect((await ctx.http.post(`/v1/orders/${orderId}/reviews`).set(bearer(token)).send({ rating: 5 })).status).toBe(201);
  });
});
