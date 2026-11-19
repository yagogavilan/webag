import { Controller, Get, Param } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { StorePermission } from '../src/platform/auth/decorators.js';
import { ADMIN_PERMISSIONS, adminHasPermission, type AdminPermission } from '../src/platform/auth/permissions.js';
import { auditLog, storeMembers, userRoles } from '../src/platform/database/schema.js';
import { ADMIN_PROFILES } from '../src/modules/identity/db/schema.js';
import { bearer, createTestApp, listRoutes, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, insertStoreRow, registerUser, type TestAdmin } from './helpers/fixtures.js';

/** Rotas só para o teste de RBAC por loja (a tabela `stores` nasce na Onda 2). */
@Controller('v1/test-stores/:storeId')
class TestStoreController {
  @Get('orders')
  @StorePermission('orders')
  orders(@Param('storeId') storeId: string) {
    return { storeId, area: 'orders' };
  }

  @Get('finance')
  @StorePermission('finance')
  finance(@Param('storeId') storeId: string) {
    return { storeId, area: 'finance' };
  }
}

/** Uma rota representativa (leitura) para cada permissão de admin. */
const ROUTE_BY_PERMISSION: Record<AdminPermission, { method: 'get'; path: string } | null> = {
  'regions:read': { method: 'get', path: '/v1/admin/regions/cities' },
  'regions:write': null,
  'categories:read': { method: 'get', path: '/v1/admin/categories' },
  'categories:write': null,
  'banners:read': { method: 'get', path: '/v1/admin/banners' },
  'banners:write': null,
  'parameters:read': { method: 'get', path: '/v1/admin/parameters' },
  'parameters:write': null,
  'flags:read': { method: 'get', path: '/v1/admin/feature-flags' },
  'flags:write': null,
  'legal:read': { method: 'get', path: '/v1/admin/legal/privacy' },
  'legal:write': null,
  'audit:own': { method: 'get', path: '/v1/admin/audit-log' },
  'admins:manage': { method: 'get', path: '/v1/admin/admins' },
  'stores:read': { method: 'get', path: '/v1/admin/stores' },
  'stores:write': null,
  'stores:decide': null,
  'stores:documents': null,
  'products:read': null,
  'products:moderate': null,
  'moderation:read': null,
  'moderation:write': null,
  'commissions:read': null,
  'commissions:write': null,
  'exchanges:report': { method: 'get', path: '/v1/admin/exchanges/report?from=2026-01-01&to=2026-01-31' },
  'exchanges:mediate': { method: 'get', path: '/v1/admin/exchanges/mediations' },
  'exchanges:read': { method: 'get', path: '/v1/admin/exchange-requests' },
  'exchanges:waive-fee': null,
  'privacy:manage': { method: 'get', path: '/v1/admin/privacy-requests' },
  'marketing:push': { method: 'get', path: '/v1/admin/push/campaigns' },
  'reports:operations': { method: 'get', path: '/v1/admin/reports/operations?from=2026-01-01&to=2026-01-31' },
  'coupons:read': { method: 'get', path: '/v1/admin/coupons' },
  'coupons:write': null,
  'payments:alerts:read': { method: 'get', path: '/v1/admin/payments/alerts' },
  'payments:webhooks:reprocess': null,
  'orders:refund': null,
  'delivery-fees:read': { method: 'get', path: '/v1/admin/delivery-fees' },
  'delivery-fees:write': null,
  'logistics:read': { method: 'get', path: '/v1/admin/logistics/couriers' },
  'logistics:write': null,
  'logistics:payout': null,
  'logistics:report': { method: 'get', path: '/v1/admin/logistics/reports/summary?from=2026-01-01&to=2026-01-31' },
  'logistics:contact': null,
  'payments:refunds:read': { method: 'get', path: '/v1/admin/payments/refund-queue' },
  'payments:refunds:retry': null,
  'payments:refunds:cover': null,
};

describe('RBAC (SEC-020, SEC-021, WB-100 C4/C5, SEC-014)', () => {
  let ctx: TestContext;
  const admins = new Map<string, TestAdmin>();

  beforeAll(async () => {
    ctx = await createTestApp({ controllers: [TestStoreController] });
    await ensureLegalDocs(ctx);
    for (const profile of ADMIN_PROFILES) admins.set(profile, await createAdmin(ctx, profile));
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('SEC-021: toda rota não pública responde 401 sem token (nega por padrão)', async () => {
    const routes = listRoutes(ctx.app).filter((r) => !r.path.startsWith('/v1/test-stores'));
    expect(routes.length).toBeGreaterThan(30);
    const uuid = randomUUID();
    for (const route of routes.filter((r) => !r.isPublic)) {
      const path = route.path.replace(/:[A-Za-z]+/g, uuid);
      const res = await ctx.http[route.method.toLowerCase() as 'get'](path).send({});
      expect(res.status, `${route.method} ${route.path}`).toBe(401);
    }
  });

  it('SEC-021: a lista de rotas públicas é exatamente a esperada (rota nova sem decorator nunca vira pública)', () => {
    const publicRoutes = listRoutes(ctx.app).filter((r) => r.isPublic).map((r) => `${r.method} ${r.path}`).sort();
    expect(publicRoutes).toEqual(
      [
        'GET /health',
        'GET /health/ready',
        'GET /v1/banners',
        'GET /v1/browse/products/:productId',
        'GET /v1/browse/products/:productId/reviews',
        'GET /v1/browse/stores/:storeId',
        'GET /v1/browse/stores/:storeId/products',
        'GET /v1/browse/stores/:storeId/reviews',
        'GET /v1/categories',
        'GET /v1/config/flags',
        'GET /v1/data-exports/download/:token',
        'GET /v1/legal/:type',
        'GET /v1/home',
        'GET /v1/regions',
        'GET /v1/search/products',
        'GET /v1/search/stores',
        'GET /v1/search/suggestions',
        'POST /v1/auth/account-deletion/cancel',
        'POST /v1/auth/account-deletion/finish',
        'POST /v1/auth/account-deletion/review',
        'POST /v1/auth/account-deletion/start',
        'POST /v1/auth/account-deletion/verify-code',
        'POST /v1/auth/email-exists',
        'POST /v1/auth/invitations/accept',
        'POST /v1/auth/login',
        'POST /v1/auth/mfa/verify',
        'POST /v1/auth/store-invitations/accept',
        'POST /v1/auth/password/forgot',
        'POST /v1/auth/password/reset',
        'POST /v1/auth/password/reset/complete',
        'POST /v1/auth/refresh',
        'POST /v1/auth/register',
        'POST /v1/banners/:bannerId/events',
        'POST /v1/privacy/requests',
        'POST /v1/webhooks/:provider',
      ].sort(),
    );
    // Rotas públicas de pagamento entram no teste de pagamentos (webhook assinado).
    for (const route of publicRoutes) expect(route).not.toContain('/admin/');
  });

  it('SEC-021: matriz perfil × permissão bate com a tabela única (permissions.ts)', async () => {
    for (const [permission, route] of Object.entries(ROUTE_BY_PERMISSION) as [AdminPermission, (typeof ROUTE_BY_PERMISSION)[AdminPermission]][]) {
      if (!route) continue;
      for (const profile of ADMIN_PROFILES) {
        const admin = admins.get(profile);
        const res = await ctx.http[route.method](route.path).set(bearer(admin!.accessToken));
        const expected = adminHasPermission(profile, permission) ? 200 : 403;
        expect(res.status, `${profile} → ${permission} (${route.path})`).toBe(expected);
      }
    }
    expect(Object.keys(ADMIN_PERMISSIONS).length).toBe(Object.keys(ROUTE_BY_PERMISSION).length);
  });

  it('WB-100 C4: cliente e lojista nas rotas admin → 403 e registro de auditoria', async () => {
    const customer = await registerUser(ctx);
    const merchant = await registerUser(ctx);
    await ctx.db.insert(userRoles).values({ userId: merchant.userId, role: 'merchant' });
    for (const user of [customer, merchant]) {
      await ctx.http.get('/v1/admin/parameters').set(bearer(user.accessToken)).expect(403);
      await ctx.http.get('/v1/admin/audit-log').set(bearer(user.accessToken)).expect(403);
      await ctx.http.post('/v1/admin/regions/cities').set(bearer(user.accessToken)).send({ name: 'Teste' }).expect(403);
    }
    const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, customer.userId), eq(auditLog.action, 'admin.access_denied')));
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });

  describe('RBAC por loja', () => {
    let storeId: string = randomUUID();
    let owner: Awaited<ReturnType<typeof registerUser>>;
    let staff: typeof owner;
    let staffNoPerm: typeof owner;
    let outsider: typeof owner;

    beforeAll(async () => {
      [owner, staff, staffNoPerm, outsider] = [await registerUser(ctx), await registerUser(ctx), await registerUser(ctx), await registerUser(ctx)];
      storeId = (await insertStoreRow(ctx, owner.userId)).id; // a FK de store_members exige loja real (DT-019 paga)
      await ctx.db.delete(storeMembers).where(eq(storeMembers.storeId, storeId));
      await ctx.db.insert(storeMembers).values([
        { storeId, userId: owner.userId, role: 'owner', permissions: [] },
        { storeId, userId: staff.userId, role: 'staff', permissions: ['orders'] },
        { storeId, userId: staffNoPerm.userId, role: 'staff', permissions: [] },
      ]);
    });

    it('dono acessa tudo da própria loja', async () => {
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(owner.accessToken)).expect(200);
      await ctx.http.get(`/v1/test-stores/${storeId}/finance`).set(bearer(owner.accessToken)).expect(200);
    });

    it('funcionário só acessa o que o dono marcou; financeiro é só do dono (RN-13)', async () => {
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(staff.accessToken)).expect(200);
      await ctx.http.get(`/v1/test-stores/${storeId}/finance`).set(bearer(staff.accessToken)).expect(403);
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(staffNoPerm.accessToken)).expect(403);
    });

    it('SEC-020: quem não é da loja recebe 404 (não revela que existe); ID inválido também', async () => {
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(outsider.accessToken)).expect(404);
      await ctx.http.get(`/v1/test-stores/${randomUUID()}/orders`).set(bearer(owner.accessToken)).expect(404);
      await ctx.http.get('/v1/test-stores/nao-e-uuid/orders').set(bearer(owner.accessToken)).expect(404);
    });

    it('SEC-014: funcionário removido perde o acesso na próxima requisição', async () => {
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(staff.accessToken)).expect(200);
      await ctx.db.delete(storeMembers).where(and(eq(storeMembers.storeId, storeId), eq(storeMembers.userId, staff.userId)));
      await ctx.http.get(`/v1/test-stores/${storeId}/orders`).set(bearer(staff.accessToken)).expect(404);
    });
  });
});
