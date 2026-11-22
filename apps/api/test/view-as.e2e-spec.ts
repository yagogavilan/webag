import { randomUUID } from 'node:crypto';
import { Controller, Get, Logger, Param } from '@nestjs/common';
import { ModulesContainer } from '@nestjs/core';
import { and, count, eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { vi } from 'vitest';
import { StorePermission, ViewAs } from '../src/platform/auth/decorators.js';
import { AuditService } from '../src/modules/admin/index.js';
import { listViewAsHandlers, ViewAsService } from '../src/modules/identity/index.js';
import { adminProfiles, adminViewSessions, auditLog, exchangeRequests, orderItems, orders, productVariants, products, sessions, storeHours, stores, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, listRoutes, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, insertStoreRow, loginAdmin, type TestAdmin } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';
import { responseSchemaOf, validateAgainst, validateValue, viewAsOperations } from './helpers/openapi-schema.js';

/**
 * WB-352 "Ver como o lojista" (ADR-018 D8, threat model §14 e §15): abuso VA-01 a VA-26. Segredos de teste inventados nas colunas de texto livre
 * do cliente servem de isca: se um deles aparecer em QUALQUER resposta da visão, o teste falha.
 */
const BAIT = { lastName: 'Souzaisca', phone: '11988887777', street: 'RuaIsca', complement: 'ApIsca77', note: 'ObsIsca', cancelReason: 'MotivoIscaCancela', exchangeText: 'TextoIscaTroca estou gravida me liga' };

/** Rota só deste teste: `@ViewAs` SEM `@Get`/`@StorePermission` (VA-23: a API não pode subir). */
@Controller('v1/test-view-as-bad')
class BadViewAsController {
  @ViewAs('badOp')
  @Get(':storeId')
  bad(@Param('storeId') id: string) {
    return { id };
  }
}
@Controller('v1/test-view-as-good')
class GoodViewAsController {
  @ViewAs('goodOp')
  @StorePermission('member')
  @Get(':storeId')
  good(@Param('storeId') id: string) {
    return { id };
  }
}

describe('Ver como o lojista (WB-352)', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;
  let ops: TestAdmin;
  let support: TestAdmin;
  let shop: Awaited<ReturnType<typeof shopWith>>;
  let other: Awaited<ReturnType<typeof shopWith>>;
  let activeOrderId: string;
  let cancelledOrderId: string;
  let exchangeId: string;
  let productId: string;
  const logged: string[] = [];

  const open = (admin: TestAdmin, storeId: string, reason: Record<string, unknown> = { code: 'merchant_support' }) =>
    ctx.http.post(`/v1/admin/stores/${storeId}/view-as`).set(bearer(admin.accessToken)).send({ reason });
  const openOk = async (admin: TestAdmin, storeId: string) => (await open(admin, storeId).expect(201)).body as { id: string; token: string; storeId: string; storeName: string | null; expiresAt: string };
  const viewGet = (admin: { accessToken: string }, path: string, token: string) => ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', token);
  const rows = (adminId: string) => ctx.db.select().from(adminViewSessions).where(eq(adminViewSessions.adminUserId, adminId)).orderBy(adminViewSessions.openedAt);
  const auditOf = (action: string, adminId?: string) => ctx.db.select().from(auditLog).where(and(eq(auditLog.action, action), adminId ? eq(auditLog.actorId, adminId) : undefined));
  const service = () => ctx.app.get(ViewAsService);
  const everything = (value: unknown) => JSON.stringify(value);

  beforeAll(async () => {
    for (const level of ['log', 'warn', 'error', 'debug'] as const) {
      vi.spyOn(Logger.prototype, level).mockImplementation((...args: unknown[]) => void logged.push(JSON.stringify(args)));
    }
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    [superAdmin, ops, support] = [await createAdmin(ctx, 'super_admin'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'support')];

    shop = await shopWith(ctx, [{ name: 'Camiseta Visao', priceCents: 8_000, stock: 50 }]);
    other = await shopWith(ctx, [{ name: 'Outra Loja', priceCents: 1_000, stock: 5 }]);
    productId = shop.store.productIds[0]!;
    // a base de teste grava o dia inteiro como 0..1440 ("24:00"), que a API real nunca aceita (validateDayIntervals); normaliza para o que o lojista pode gravar
    await ctx.db.update(storeHours).set({ endMin: 1439 }).where(eq(storeHours.storeId, shop.store.id));
    await ctx.db.update(stores).set({ addressCep: '07900100', addressStreet: 'Rua da Loja', addressNumber: '99', addressNeighborhood: 'Centro', addressCityName: 'Francisco Morato', addressState: 'SP' }).where(eq(stores.id, shop.store.id));
    const buyer = await customerAt(ctx, shop.origin, { number: '10' });
    await ctx.db.update(users).set({ name: `Maria ${BAIT.lastName}`, phone: BAIT.phone }).where(eq(users.id, buyer.user.userId));
    await addToCart(ctx, buyer.user, shop.variants[0]!, 2).expect(200);

    const place = async () => {
      await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
      const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
      await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
      return created.id;
    };
    activeOrderId = await place();
    await ctx.db.update(orders).set({ address: { ...((await ctx.db.select().from(orders).where(eq(orders.id, activeOrderId)))[0]!.address as object), street: BAIT.street, complement: BAIT.complement, neighborhood: 'Bairro Visao' } }).where(eq(orders.id, activeOrderId));
    cancelledOrderId = await place();
    await ctx.http.post(`/v1/orders/${cancelledOrderId}/cancel`).set(bearer(buyer.user.accessToken)).send({ reason: BAIT.cancelReason }).expect(200);

    // pedido entregue com troca aberta, com descrição digitada pelo cliente
    const deliveredId = await place();
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date(Date.now() - 86_400_000), exchangeVoluntaryDays: 7 }).where(eq(orders.id, deliveredId));
    const [item] = await ctx.db.select().from(orderItems).where(eq(orderItems.orderId, deliveredId));
    const [size] = await ctx.db.insert(productVariants).values({ productId, storeId: shop.store.id, attributes: { Tamanho: 'M' }, attributesKey: `tamanho=m-${randomUUID()}`, stock: 5, reserved: 0 }).returning();
    const exchange = await ctx.http.post(`/v1/orders/${deliveredId}/exchanges`).set(bearer(buyer.user.accessToken)).set('Idempotency-Key', randomUUID()).send({ orderItemId: item!.id, type: 'size_color', reasonCode: 'size', method: 'pickup_at_home', newVariantId: size!.id, description: BAIT.exchangeText });
    expect(exchange.status, JSON.stringify(exchange.body)).toBe(201);
    exchangeId = (exchange.body as { id: string }).id;
    expect((await ctx.db.select().from(exchangeRequests).where(eq(exchangeRequests.id, exchangeId)))[0]?.description).toContain('TextoIscaTroca');
  });
  afterAll(async () => {
    vi.restoreAllMocks();
    await ctx.close();
  });

  const READS = (storeId: string) => [
    ['getStore', `/v1/stores/${storeId}`],
    ['getStoreSettings', `/v1/stores/${storeId}/settings`],
    ['listProducts', `/v1/stores/${storeId}/products`],
    ['getProduct', `/v1/stores/${storeId}/products/${productId}`],
    ['listSections', `/v1/stores/${storeId}/sections`],
    ['listStoreOrders', `/v1/stores/${storeId}/orders`],
    ['countStoreOrders', `/v1/stores/${storeId}/orders/counts`],
    ['getStoreOrder', `/v1/stores/${storeId}/orders/${activeOrderId}`],
    ['listStoreExchanges', `/v1/stores/${storeId}/exchanges`],
    ['getStoreExchange', `/v1/stores/${storeId}/exchanges/${exchangeId}`],
    ['getStoreReviewsSummary', `/v1/stores/${storeId}/reviews/summary`],
    ['listStoreReviews', `/v1/stores/${storeId}/reviews`],
  ] as const;

  describe('abertura e encerramento', () => {
    it('abre com motivo, devolve a credencial vas_ uma vez, guarda só o hash e audita view_as.open (WB-352 C3, C6, C9)', async () => {
      const view = await openOk(support, shop.store.id);
      expect(view.token).toMatch(/^vas_[A-Za-z0-9_-]{43}$/);
      expect(view.storeId).toBe(shop.store.id);
      const [row] = await rows(support.userId);
      expect(row?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
      expect(JSON.stringify(row)).not.toContain(view.token);
      const ms = new Date(view.expiresAt).getTime() - Date.now();
      expect(ms).toBeGreaterThan(29 * 60_000);
      expect(ms).toBeLessThanOrEqual(30 * 60_000);
      const [audit] = await auditOf('view_as.open', support.userId);
      expect(audit).toMatchObject({ actorId: support.userId, targetType: 'store', targetId: shop.store.id, storeId: shop.store.id });
      expect(audit?.after).toMatchObject({ viewAsId: view.id, motive: 'merchant_support' });
      expect(everything(audit)).not.toContain(view.token);
      expect(everything(audit)).not.toContain(row!.tokenHash);
    });

    it('VA-18: sem motivo = 422 REASON_REQUIRED (e "outro" sem nota); campo extra = 400; loja inexistente = 404; perfil sem a permissão é negado', async () => {
      for (const body of [{}, { reason: {} }, { reason: { code: 'other' } }]) {
        const res = await ctx.http.post(`/v1/admin/stores/${shop.store.id}/view-as`).set(bearer(ops.accessToken)).send(body);
        expect(res.status, JSON.stringify(body)).toBe(422);
        expect(res.body.code).toBe('REASON_REQUIRED');
      }
      await open(ops, shop.store.id, { code: 'merchant_support', extra: 1 }).expect(400);
      await open(ops, randomUUID()).expect(404);
      const customer = await createCustomer(ctx);
      await open(customer as unknown as TestAdmin, shop.store.id).expect(403);
    });

    it('VA-18: a 11ª abertura na hora é 429', async () => {
      const admin = await createAdmin(ctx, 'finance');
      for (let i = 0; i < 10; i += 1) await openOk(admin, shop.store.id);
      const res = await open(admin, shop.store.id);
      expect(res.status).toBe(429);
    });

    it('VA-20: abrir a segunda visão encerra a primeira (replaced) e só a segunda vale', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const first = await openOk(admin, shop.store.id);
      await viewGet(admin, `/v1/stores/${shop.store.id}`, first.token).expect(200);
      const second = await openOk(admin, other.store.id);
      await viewGet(admin, `/v1/stores/${shop.store.id}`, first.token).expect(403);
      await viewGet(admin, `/v1/stores/${other.store.id}`, second.token).expect(200);
      const [a, b] = await rows(admin.userId);
      expect(a).toMatchObject({ id: first.id, closeCause: 'replaced' });
      expect(b?.closedAt).toBeNull();
      const closes = await auditOf('view_as.close', admin.userId);
      expect(closes.map((c) => (c.after as { cause: string }).cause)).toEqual(['replaced']);
      expect((closes[0]!.after as { reads: number }).reads).toBe(1);
    });

    it('endViewAs: encerra na hora com a causa e a contagem por operationId; repetir é 204 sem nova linha; outro admin = 404 (idor)', async () => {
      const admin = await createAdmin(ctx, 'support');
      const view = await openOk(admin, shop.store.id);
      await viewGet(admin, `/v1/stores/${shop.store.id}/orders`, view.token).expect(200);
      await viewGet(admin, `/v1/stores/${shop.store.id}/orders`, view.token).expect(200);
      await ctx.http.post(`/v1/admin/view-as/${view.id}/end`).set(bearer(superAdmin.accessToken)).expect(404);
      await ctx.http.post(`/v1/admin/view-as/${view.id}/end`).set(bearer(admin.accessToken)).expect(204);
      await ctx.http.post(`/v1/admin/view-as/${view.id}/end`).set(bearer(admin.accessToken)).expect(204);
      await ctx.http.post(`/v1/admin/view-as/${randomUUID()}/end`).set(bearer(admin.accessToken)).expect(404);
      await viewGet(admin, `/v1/stores/${shop.store.id}/orders`, view.token).expect(403);
      const closes = await auditOf('view_as.close', admin.userId);
      expect(closes).toHaveLength(1);
      expect(closes[0]!.after).toMatchObject({ cause: 'ended', reads: 2, byOperation: { listStoreOrders: 2 } });
    });

    it('VA-19: se a auditoria de abertura falhar, 500 sem credencial e sem linha órfã', async () => {
      const admin = await createAdmin(ctx, 'finance');
      const audit = ctx.app.get(AuditService);
      const original = audit.record.bind(audit);
      const spy = vi.spyOn(audit, 'record').mockImplementation((exec, c, entry) => (entry.action === 'view_as.open' ? Promise.reject(new Error('falha injetada')) : original(exec, c, entry)));
      const res = await open(admin, shop.store.id);
      spy.mockRestore();
      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toMatch(/vas_/);
      expect(await rows(admin.userId)).toHaveLength(0);
      expect(await auditOf('view_as.open', admin.userId)).toHaveLength(0);
    });
  });

  describe('o que a visão lê (apresentadores e contrato)', () => {
    let view: { id: string; token: string };
    beforeAll(async () => {
      view = await openOk(superAdmin, shop.store.id);
    });

    it('VA-26 e Cache-Control: a resposta REAL das rotas existentes cabe no schema da visão (ou no normal) com additionalProperties: false em todos os níveis', async () => {
      const marked = new Map(viewAsOperations().map((o) => [o.operationId, o]));
      for (const [operationId, path] of READS(shop.store.id)) {
        const res = await viewGet(superAdmin, path, view.token);
        expect(res.status, `${operationId}: ${JSON.stringify(res.body)}`).toBe(200);
        expect(res.headers['cache-control'], operationId).toBe('private, no-store');
        const schemaName = marked.get(operationId)?.viewAsSchema;
        const errors = schemaName ? validateAgainst(schemaName, res.body) : validateValue(responseSchemaOf(operationId), res.body);
        expect(errors, `${operationId} (${schemaName ?? 'schema normal'}) ${JSON.stringify(res.body).slice(0, 300)}`).toEqual([]);
        for (const bait of Object.values(BAIT)) expect(everything(res.body), `${operationId} vaza ${bait}`).not.toContain(bait);
      }
    });

    it('VA-11: getStore e getStoreSettings sem documento, razão social, comissão, tarifa, conta, settings embutido nem notificações (o dono vê)', async () => {
      const seen = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}`, view.token).expect(200)).body as Record<string, unknown>;
      for (const key of ['document', 'documentType', 'legalName', 'commissionPct', 'commissionSource', 'commissionCategories', 'providerFeePct', 'settings', 'role']) expect(seen, key).not.toHaveProperty(key);
      expect(seen.address).toEqual({ neighborhood: expect.any(String), city: expect.any(String), state: 'SP' });
      const owner = (await ctx.http.get(`/v1/stores/${shop.store.id}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body as Record<string, unknown>;
      expect(owner).toHaveProperty('document');
      expect(owner).toHaveProperty('settings');
      const settings = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/settings`, view.token).expect(200)).body as Record<string, unknown>;
      expect(settings).not.toHaveProperty('notifications');
      expect(Object.keys(settings).sort()).toEqual(['delivery', 'exchangePolicy', 'holidays', 'hours', 'isOpenNow', 'lowStockThreshold', 'pause', 'pickup']);
    });

    it('VA-12 e C2: pedido ATIVO na visão só com primeiro nome e bairro; o lojista, que o lê pela rota normal, recebe o dado', async () => {
      const seen = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/orders/${activeOrderId}`, view.token).expect(200)).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(seen.status).toBe('received');
      expect(seen.customer).toEqual({ firstName: 'Maria' });
      expect(seen.delivery).toMatchObject({ neighborhood: 'Bairro Visao' });
      expect(Object.keys(seen.delivery).sort()).toEqual(['eta', 'etaMaxMinutes', 'etaMinMinutes', 'neighborhood']);
      expect(seen.allowedActions).toEqual([]);
      expect(seen.values).not.toHaveProperty('commission');
      expect(seen.values).not.toHaveProperty('netBeforeProviderFee');
      for (const forbidden of [BAIT.lastName, BAIT.phone, BAIT.street, BAIT.complement, '07900']) expect(everything(seen)).not.toContain(forbidden);
      const owner = (await ctx.http.get(`/v1/stores/${shop.store.id}/orders/${activeOrderId}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(owner.customer.phone).toBe(BAIT.phone);
      expect(everything(owner.delivery)).toContain(BAIT.street);
      const list = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/orders`, view.token).expect(200)).body as { data: { allowedActions: unknown[]; customerFirstName: string }[] };
      expect(list.data.length).toBeGreaterThan(0);
      for (const row of list.data) {
        expect(row.allowedActions).toEqual([]);
        expect(row.customerFirstName).toBe('Maria');
      }
    });

    it('VA-25 e SEC-209: pedido cancelado pelo cliente com motivo e troca com descrição, lidos pela visão: nenhum texto do cliente, nem na linha do tempo', async () => {
      const raw = (await ctx.db.select().from(orders).where(eq(orders.id, cancelledOrderId)))[0]!;
      expect(raw.cancelReason).toBe(BAIT.cancelReason);
      const order = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/orders/${cancelledOrderId}`, view.token).expect(200)).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(order.status).toBe('cancelled');
      expect(order.cancellation).toEqual({ by: 'customer', at: expect.any(String) });
      for (const entry of order.timeline) expect(Object.keys(entry).sort()).toEqual(['actor', 'at', 'status']);
      expect(everything(order)).not.toContain(BAIT.cancelReason);
      // o lojista (rota normal) lê o motivo: o dado existe e é a visão que o corta
      const normal = (await ctx.http.get(`/v1/stores/${shop.store.id}/orders/${cancelledOrderId}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(everything(normal)).toContain(BAIT.cancelReason);

      const exchange = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/exchanges/${exchangeId}`, view.token).expect(200)).body as Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
      expect(exchange).not.toHaveProperty('description');
      expect(exchange).not.toHaveProperty('photos');
      expect(exchange).not.toHaveProperty('refund');
      expect(exchange).not.toHaveProperty('decisionReason');
      for (const entry of exchange.timeline) expect(entry).not.toHaveProperty('reason');
      expect(everything(exchange)).not.toContain('TextoIscaTroca');
      const storeSide = (await ctx.http.get(`/v1/stores/${shop.store.id}/exchanges/${exchangeId}`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(everything(storeSide)).toContain('TextoIscaTroca'); // VA-13: o lojista vê, a visão não
      const list = (await viewGet(superAdmin, `/v1/stores/${shop.store.id}/exchanges`, view.token).expect(200)).body;
      expect(everything(list)).not.toContain('TextoIscaTroca');
    });

    it('VA-14: produtos e lista sem "você recebe" nem comissão (listProductTable chega na R1.2 e herda este teste)', async () => {
      for (const path of [`/v1/stores/${shop.store.id}/products`, `/v1/stores/${shop.store.id}/products/${productId}`]) {
        const res = await viewGet(superAdmin, path, view.token).expect(200);
        expect(everything(res.body)).not.toMatch(/youReceive|commission|netBefore/i);
      }
    });

    it('VA-15: o admin que é dono da loja e manda o cabeçalho recebe o nível visualizador, não o de dono', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const own = await insertStoreRow(ctx, admin.userId, { status: 'approved', name: 'Loja do Admin' });
      const asOwner = (await ctx.http.get(`/v1/stores/${own.id}`).set(bearer(admin.accessToken)).expect(200)).body as Record<string, unknown>;
      expect(asOwner).toHaveProperty('document');
      const opened = await openOk(admin, own.id);
      const seen = (await viewGet(admin, `/v1/stores/${own.id}`, opened.token).expect(200)).body as Record<string, unknown>;
      expect(seen).not.toHaveProperty('document');
      expect(seen).not.toHaveProperty('settings');
      expect(seen).not.toHaveProperty('commissionPct');
      await ctx.http.patch(`/v1/stores/${own.id}/profile`).set(bearer(admin.accessToken)).set('X-View-As', opened.token).send({ name: 'Invadida' }).expect(403);
    });
  });

  describe('somente leitura e escopo (VA-01 a VA-10)', () => {
    it('VA-01: POST, PUT, PATCH e DELETE em cada rota /v1/stores/{id}/* com a visão válida = 403 VIEW_AS_READ_ONLY, sem gravar', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const writes = listRoutes(ctx.app).filter((r) => r.path.startsWith('/v1/stores/:storeId') && r.method !== 'GET');
      expect(writes.length).toBeGreaterThan(40);
      const before = await ctx.db.select({ n: count() }).from(products).where(eq(products.storeId, shop.store.id));
      const auditBefore = await ctx.db.select({ n: count() }).from(auditLog);
      let view = await openOk(admin, shop.store.id);
      let used = 0;
      for (const route of writes) {
        if (used >= 15) {
          view = await openOk(admin, shop.store.id); // 20 negações encerram a visão (VA-21): renova a cada 15
          used = 0;
        }
        used += 1;
        const path = route.path.replace(':storeId', shop.store.id).replace(/:[A-Za-z]+/g, randomUUID());
        const res = await ctx.http[route.method.toLowerCase() as 'post'](path).set(bearer(admin.accessToken)).set('X-View-As', view.token).send({});
        expect(res.status, `${route.method} ${route.path}`).toBe(403);
        expect(res.body.code, `${route.method} ${route.path}`).toBe('VIEW_AS_READ_ONLY');
      }
      const after = await ctx.db.select({ n: count() }).from(products).where(eq(products.storeId, shop.store.id));
      expect(after[0]?.n).toBe(before[0]?.n);
      // só a trilha da própria visão cresceu (denied/open/close), nenhuma ação de negócio
      const added = (await ctx.db.select({ action: auditLog.action }).from(auditLog)).length - (auditBefore[0]?.n ?? 0);
      expect(added).toBeGreaterThan(0);
      const actions = new Set((await ctx.db.select({ action: auditLog.action }).from(auditLog).where(eq(auditLog.actorId, admin.userId))).map((a) => a.action));
      for (const action of actions) expect(action, 'ação de negócio gravada na visão').toMatch(/^(view_as\.|admin\.|auth\.|session)/);
    });

    it('VA-02: GET de loja fora da lista (documentos, onboarding, equipe, atividade, financeiro, cupons, comanda, conta) = 403', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const gets = listRoutes(ctx.app).filter((r) => r.path.startsWith('/v1/stores/:storeId') && r.method === 'GET');
      const allowed = new Set(viewAsOperationsIn(ctx));
      let view = await openOk(admin, shop.store.id);
      let used = 0;
      for (const route of gets) {
        if (allowed.has(`${route.method} ${route.path}`)) continue;
        if (used >= 15) {
          view = await openOk(admin, shop.store.id);
          used = 0;
        }
        used += 1;
        const path = route.path.replace(':storeId', shop.store.id).replace(/:[A-Za-z]+/g, randomUUID());
        const res = await ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', view.token);
        expect(res.status, `GET ${route.path}`).toBe(403);
        expect(res.body.code, `GET ${route.path}`).toBe('VIEW_AS_READ_ONLY');
      }
      expect(gets.length).toBeGreaterThan(25);
    });

    it('VA-03: X-View-As em rota /v1/admin/*, /v1/me, pública e de cliente = 403', async () => {
      const view = await openOk(ops, shop.store.id);
      for (const path of ['/v1/admin/stores', `/v1/admin/stores/${shop.store.id}`, '/v1/admin/orders', '/v1/me', '/v1/home', '/v1/orders', '/v1/cart?mode=pickup']) {
        const res = await viewGet(ops, path, view.token);
        expect(res.status, path).toBe(403);
        expect(res.body.code, path).toBe('VIEW_AS_READ_ONLY');
      }
      // pública, sem Bearer: também recusa (cabeçalho presente e visão não autorizada)
      expect((await ctx.http.get('/v1/home').set('X-View-As', view.token)).status).toBe(403);
      await ctx.http.post(`/v1/admin/stores/${shop.store.id}/view-as`).set(bearer(ops.accessToken)).set('X-View-As', view.token).send({ reason: { code: 'merchant_support' } }).expect(403);
    });

    it('VA-04 e VA-05: sem Bearer = 401; a credencial no Authorization não é JWT = 401', async () => {
      const view = await openOk(support, shop.store.id);
      await ctx.http.get(`/v1/stores/${shop.store.id}`).set('X-View-As', view.token).expect(401);
      await ctx.http.get(`/v1/stores/${shop.store.id}`).set('Authorization', `Bearer ${view.token}`).expect(401);
      await ctx.http.get(`/v1/stores/${shop.store.id}`).set('Authorization', `Bearer ${view.token}`).set('X-View-As', view.token).expect(401);
    });

    it('VA-06, VA-07 e VA-08: Bearer de outro admin, outra sessão do mesmo admin e outra loja = 403 VIEW_AS_EXPIRED, sem dado', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const view = await openOk(admin, shop.store.id);
      const wrongAdmin = await viewGet(ops, `/v1/stores/${shop.store.id}`, view.token);
      expect([wrongAdmin.status, wrongAdmin.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      const second = await loginAdmin(ctx, { email: admin.email, password: admin.password, totpSecret: admin.totpSecret });
      const wrongSession = await viewGet(second, `/v1/stores/${shop.store.id}`, view.token);
      expect([wrongSession.status, wrongSession.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      const wrongStore = await viewGet(admin, `/v1/stores/${other.store.id}`, view.token);
      expect([wrongStore.status, wrongStore.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      expect(everything(wrongStore.body)).not.toContain('Outra Loja');
      expect((await viewGet(admin, `/v1/stores/${shop.store.id}`, view.token)).status).toBe(200);
    });

    it('VA-09: depois de 30 min (sweep expired com at = expires_at), de endViewAs, do logout, da revogação e da inatividade = negado e linha fechada com a causa', async () => {
      // 30 min
      const a = await createAdmin(ctx, 'support');
      const va = await openOk(a, shop.store.id);
      const past = new Date(Date.now() - 60_000);
      await ctx.db.update(adminViewSessions).set({ expiresAt: past }).where(eq(adminViewSessions.id, va.id));
      const expired = await viewGet(a, `/v1/stores/${shop.store.id}`, va.token);
      expect([expired.status, expired.body.code]).toEqual([403, 'VIEW_AS_EXPIRED']);
      await service().sweep();
      const [rowA] = await rows(a.userId);
      expect(rowA).toMatchObject({ closeCause: 'expired' });
      expect(rowA!.closedAt!.getTime()).toBe(past.getTime());
      // logout
      const b = await createAdmin(ctx, 'support');
      const vb = await openOk(b, shop.store.id);
      await ctx.http.post('/v1/auth/logout').set(bearer(b.accessToken)).expect(204);
      await viewGet(b, `/v1/stores/${shop.store.id}`, vb.token).expect(401);
      await service().sweep();
      expect((await rows(b.userId))[0]).toMatchObject({ closeCause: 'session_ended' });
      // revogação da sessão
      const c = await createAdmin(ctx, 'finance');
      const vc = await openOk(c, shop.store.id);
      await ctx.db.update(sessions).set({ revokedAt: new Date(), revokedReason: 'teste' }).where(eq(sessions.id, (await rows(c.userId))[0]!.adminSessionId));
      await viewGet(c, `/v1/stores/${shop.store.id}`, vc.token).expect(401);
      await service().sweep();
      expect((await rows(c.userId))[0]).toMatchObject({ closeCause: 'session_ended' });
      // inatividade do admin
      const d = await createAdmin(ctx, 'operations');
      const vd = await openOk(d, shop.store.id);
      await ctx.db.update(sessions).set({ lastUsedAt: new Date(Date.now() - 24 * 3_600_000) }).where(eq(sessions.id, (await rows(d.userId))[0]!.adminSessionId));
      const idle = await viewGet(d, `/v1/stores/${shop.store.id}`, vd.token);
      expect([idle.status, idle.body.code]).toEqual([401, 'SESSION_IDLE']);
      await service().sweep();
      expect((await rows(d.userId))[0]).toMatchObject({ closeCause: 'session_ended' });
    });

    it('VA-10: admin desativado (ou sem o perfil) com a visão aberta: a próxima leitura é negada e o sweep fecha com permission_lost', async () => {
      const admin = await createAdmin(ctx, 'support');
      const view = await openOk(admin, shop.store.id);
      await viewGet(admin, `/v1/stores/${shop.store.id}`, view.token).expect(200);
      await ctx.db.update(adminProfiles).set({ active: false }).where(eq(adminProfiles.userId, admin.userId));
      expect((await viewGet(admin, `/v1/stores/${shop.store.id}`, view.token)).status).toBe(403);
      await service().sweep();
      expect((await rows(admin.userId))[0]).toMatchObject({ closeCause: 'permission_lost' });
    });
  });

  describe('falha fechada e abuso (VA-16, VA-17, VA-21, VA-22, VA-23, VA-24)', () => {
    it('VA-16: cabeçalho vazio, repetido ou com vírgula = READ_ONLY; formato inválido = EXPIRED (§15.2)', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const view = await openOk(admin, shop.store.id);
      const path = `/v1/stores/${shop.store.id}`;
      const code = async (req: Promise<{ status: number; body: { code?: string } }>) => {
        const res = await req;
        return [res.status, res.body.code];
      };
      expect(await code(ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', '') as never)).toEqual([403, 'VIEW_AS_READ_ONLY']);
      expect(await code(ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', [view.token, view.token] as never) as never)).toEqual([403, 'VIEW_AS_READ_ONLY']);
      expect(await code(ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', `${view.token},${view.token}`) as never)).toEqual([403, 'VIEW_AS_READ_ONLY']);
      for (const bad of ['vas_curto', 'xyz', `${view.token}x`, view.token.toUpperCase(), `Bearer ${view.token}`]) {
        expect(await code(ctx.http.get(path).set(bearer(admin.accessToken)).set('X-View-As', bad) as never), bad).toEqual([403, 'VIEW_AS_EXPIRED']);
      }
      expect((await viewGet(admin, path, view.token)).status).toBe(200); // a credencial correta segue valendo
    });

    it('VA-17: X-HTTP-Method-Override não muda o método (um GET com DELETE no cabeçalho não apaga nada)', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const view = await openOk(admin, shop.store.id);
      const res = await viewGet(admin, `/v1/stores/${shop.store.id}/products/${productId}`, view.token).set('X-HTTP-Method-Override', 'DELETE');
      expect(res.status).toBe(200);
      expect((await ctx.db.select().from(products).where(eq(products.id, productId)))[0]?.status).not.toBe('archived');
    });

    it('VA-21: a 121ª leitura no minuto = 429; 20 negações encerram a visão (abuse) e a visão deixa de valer', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const view = await openOk(admin, shop.store.id);
      const statuses: number[] = [];
      for (let i = 0; i < 121; i += 1) statuses.push((await viewGet(admin, `/v1/stores/${shop.store.id}/orders/counts`, view.token)).status);
      expect(statuses.slice(0, 120).every((s) => s === 200)).toBe(true);
      expect(statuses[120]).toBe(429);

      const abuser = await createAdmin(ctx, 'super_admin');
      const v2 = await openOk(abuser, shop.store.id);
      for (let i = 0; i < 20; i += 1) await ctx.http.delete(`/v1/stores/${shop.store.id}/products/${randomUUID()}`).set(bearer(abuser.accessToken)).set('X-View-As', v2.token).expect(403);
      expect((await rows(abuser.userId))[0]).toMatchObject({ id: v2.id, closeCause: 'abuse' });
      expect((await viewGet(abuser, `/v1/stores/${shop.store.id}`, v2.token)).body.code).toBe('VIEW_AS_EXPIRED');
      const denied = await auditOf('view_as.denied', abuser.userId);
      expect(denied.filter((d) => (d.after as { denial: string }).denial === 'VIEW_AS_READ_ONLY')).toHaveLength(1); // no máximo 1 linha por minuto por sessão e código; o resto só conta
      const close = (await auditOf('view_as.close', abuser.userId))[0];
      expect(close?.after).toMatchObject({ cause: 'abuse' });
    });

    it('VA-22: o Socket.IO ignora X-View-As: o admin com a visão não entra na sala do pedido da loja', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const view = await openOk(admin, shop.store.id);
      await ctx.app.listen(0, '127.0.0.1');
      const url = `${await ctx.app.getUrl()}/rt`;
      const socket: Socket = io(url, { auth: { token: admin.accessToken }, extraHeaders: { 'X-View-As': view.token }, transports: ['websocket'], reconnection: false, forceNew: true });
      try {
        await new Promise<void>((resolve, reject) => {
          socket.once('connect', () => resolve());
          socket.once('connect_error', reject);
        });
        expect(await socket.emitWithAck('subscribe', { orderId: activeOrderId })).toEqual({ ok: false });
      } finally {
        socket.close();
      }
    });

    it('VA-23: o conjunto @ViewAs() das rotas reais é o x-view-as do contrato (nos dois sentidos, sem as planejadas); sem @Get ou sem @StorePermission a API não sobe', async () => {
      const real = listViewAsHandlers(ctx.app.get(ModulesContainer)).map((h) => h.operationId).sort();
      const documented = viewAsOperations().filter((o) => !o.planned).map((o) => o.operationId).sort();
      expect(real).toEqual(documented);
      expect(real).toHaveLength(13);
      const good = await createTestApp({ controllers: [GoodViewAsController] });
      await good.close();
      await expect(createTestApp({ controllers: [BadViewAsController] })).rejects.toThrow(/@ViewAs exige @Get e @StorePermission.*BadViewAsController\.bad/);
    });

    it('VA-24: nenhuma credencial vas_ nos logs da API depois de toda a bateria (leituras, negações, auditoria)', () => {
      expect(logged.length).toBeGreaterThan(20);
      expect(logged.filter((line) => line.includes('vas_'))).toEqual([]);
      expect(logged.some((line) => line.includes('view_as.read'))).toBe(true);
    });
  });
});

/** `METHOD /caminho` das rotas reais com `@ViewAs` (para separar, em VA-02, as permitidas das de fora da lista). */
function viewAsOperationsIn(ctx: TestContext): string[] {
  const handlers = listViewAsHandlers(ctx.app.get(ModulesContainer));
  const wanted = new Set(handlers.map((h) => `${h.controller}.${h.handler}`));
  return listRoutes(ctx.app).filter((r) => wanted.has(r.operation)).map((r) => `${r.method} ${r.path}`);
}
