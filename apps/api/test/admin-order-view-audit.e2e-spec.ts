import { and, eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { AuditService } from '../src/modules/admin/index.js';
import { auditLog } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, type TestAdmin } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

/**
 * WB-352 C14 e ADR-018 D20(a): cada abertura da ficha do pedido no admin (`getAdminOrder`) grava `admin.order.view` ANTES de devolver o dado
 * (falha de gravação = 500 sem dado), no máximo 1 linha por (admin, pedido) a cada 10 min, contada da ÚLTIMA linha gravada. AO-01 a AO-05 (threat model §15.6).
 */
describe('Auditoria de leitura da ficha do pedido (AO-01 a AO-05)', () => {
  let ctx: TestContext;
  let support: TestAdmin;
  const orderIds: string[] = [];
  let storeId: string;

  const open = (who: { accessToken: string }, orderId: string) => ctx.http.get(`/v1/admin/orders/${orderId}`).set(bearer(who.accessToken));
  const views = (adminId: string, orderId?: string) =>
    ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'admin.order.view'), eq(auditLog.actorId, adminId), orderId ? eq(auditLog.targetId, orderId) : undefined));

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    support = await createAdmin(ctx, 'support');
    const shop = await shopWith(ctx, [{ name: 'Produto AO', priceCents: 3_000, stock: 30 }]);
    storeId = shop.store.id;
    const buyer = await customerAt(ctx, shop.origin);
    for (let i = 0; i < 3; i += 1) {
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      orderIds.push(created.id);
    }
  });
  afterAll(async () => {
    vi.useRealTimers();
    await ctx.close();
  });

  it('AO-01: abrir 2 vezes em 1 min = 1 linha; depois de 10 min = 2; 3 pedidos distintos = 3 linhas (uma por pedido)', async () => {
    const admin = await createAdmin(ctx, 'operations');
    const [a, b, c] = orderIds as [string, string, string];
    await open(admin, a).expect(200);
    await open(admin, a).expect(200);
    expect(await views(admin.userId, a)).toHaveLength(1);

    vi.useFakeTimers({ toFake: ['Date'], now: Date.now() + 11 * 60_000 });
    try {
      await open(admin, a).expect(200);
      expect(await views(admin.userId, a)).toHaveLength(2); // a janela conta da ÚLTIMA linha gravada
    } finally {
      vi.useRealTimers();
    }
    await open(admin, a).expect(200);
    expect(await views(admin.userId, a)).toHaveLength(2); // recarga logo depois da 2ª linha: dedupe de novo
    await open(admin, b).expect(200);
    await open(admin, c).expect(200);
    expect((await views(admin.userId)).map((r) => r.targetId).sort()).toEqual([a, a, b, c].sort());
    // outro admin no mesmo pedido: a linha dele é dele (o dedupe é por admin)
    await open(support, a).expect(200);
    expect(await views(support.userId, a)).toHaveLength(1);
  });

  it('AO-02: falha na gravação da auditoria = 500 sem corpo do pedido (falha fechada)', async () => {
    const admin = await createAdmin(ctx, 'finance');
    const audit = ctx.app.get(AuditService);
    const original = audit.record.bind(audit);
    const spy = vi.spyOn(audit, 'record').mockImplementation((exec, c, entry) => (entry.action === 'admin.order.view' ? Promise.reject(new Error('falha injetada')) : original(exec, c, entry)));
    const res = await open(admin, orderIds[0]!);
    spy.mockRestore();
    expect(res.status).toBe(500);
    expect(JSON.stringify(res.body)).not.toMatch(/items|payment|customer|"id"/);
    expect(await views(admin.userId)).toHaveLength(0);
  });

  it('AO-03: sem a permissão `orders:read` (lojista, cliente) = 403 e nenhuma linha de visualização', async () => {
    const customer = await createCustomer(ctx);
    await open(customer, orderIds[0]!).expect(403);
    await open({ accessToken: (await shopOwnerToken()) }, orderIds[0]!).expect(403);
    expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'admin.order.view'), eq(auditLog.actorId, customer.userId))))).toHaveLength(0);
  });

  it('AO-04: com X-View-As a rota recusa (403 VIEW_AS_READ_ONLY), mesmo com a visão válida, e não grava visualização', async () => {
    const admin = await createAdmin(ctx, 'support');
    const view = (await ctx.http.post(`/v1/admin/stores/${storeId}/view-as`).set(bearer(admin.accessToken)).send({ reason: { code: 'merchant_support' } }).expect(201)).body as { token: string };
    const res = await open(admin, orderIds[0]!).set('X-View-As', view.token);
    expect([res.status, res.body.code]).toEqual([403, 'VIEW_AS_READ_ONLY']);
    expect(await views(admin.userId)).toHaveLength(0);
  });

  it('AO-05: a linha traz admin, sessão, pedido, loja e hora, e NUNCA o conteúdo exibido (nome, e-mail, endereço, itens)', async () => {
    const admin = await createAdmin(ctx, 'operations');
    const res = await open(admin, orderIds[1]!).expect(200);
    const [row] = await views(admin.userId, orderIds[1]);
    expect(row).toMatchObject({ actorId: admin.userId, targetType: 'order', targetId: orderIds[1], storeId });
    expect(row?.at).toBeInstanceOf(Date);
    expect(row?.after).toEqual({ adminSessionId: expect.any(String) });
    expect(row?.before).toBeNull();
    const text = JSON.stringify(row);
    const body = res.body as { items?: { name: string }[]; customer?: { name?: string; email?: string } };
    expect(body.items?.length ?? 0).toBeGreaterThan(0); // a resposta TEM o conteúdo; a trilha, não
    for (const leak of ['Produto AO', body.customer?.name, body.customer?.email, 'Rua Teste', '@'].filter((v): v is string => Boolean(v))) expect(text, leak).not.toContain(leak);
  });

  async function shopOwnerToken(): Promise<string> {
    const owner = await createCustomer(ctx);
    return owner.accessToken;
  }
});
