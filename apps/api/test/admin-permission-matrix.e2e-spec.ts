import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { parse } from 'yaml';
import { ADMIN_PERMISSIONS, adminHasPermission, type AdminPermission } from '../src/platform/auth/permissions.js';
import { ADMIN_PROFILES } from '../src/modules/identity/db/schema.js';
import { adminProfiles, auditLog, userRoles } from '../src/platform/database/schema.js';
import { bearer, createTestApp, listRoutes, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type TestAdmin } from './helpers/fixtures.js';

/**
 * WB-355 C1 (C-ADM-01): matriz de permissões percorrendo TODAS as rotas `/v1/admin/*` reais, com os 4 perfis, um lojista e um cliente,
 * contra `x-admin-permission` do `openapi.yaml` e a tabela única (`permissions.ts`). O guard registra `admin.access_denied` quando nega;
 * é essa linha (e não só o 403) que distingue "o guard negou" de "a regra de negócio recusou", então um perfil permitido que recebe 403
 * do handler (ex.: limite de estorno) não é confundido com falha de permissão.
 */
interface Contract {
  paths: Record<string, Record<string, { 'x-admin-permission'?: string; 'x-planned'?: string }>>;
}
const contract = parse(readFileSync(resolve(import.meta.dirname, '../../../docs/arquitetura/api/openapi.yaml'), 'utf8')) as Contract;
const SELF = 'admin-self';
/** Corpo de sonda: nenhum schema estrito aceita, então o handler nunca grava nada (a validação responde 400 antes). */
const PROBE = { __wb355_probe: true };

describe('WB-355: matriz de permissões do admin (todas as rotas /v1/admin/*)', () => {
  let ctx: TestContext;
  const admins = new Map<string, TestAdmin>();
  let merchant: Awaited<ReturnType<typeof registerUser>>;
  let customer: Awaited<ReturnType<typeof registerUser>>;

  const adminRoutes = () => listRoutes(ctx.app).filter((r) => r.path.startsWith('/v1/admin/'));
  const toKey = (r: { method: string; path: string }) => `${r.method} ${r.path.replace(/:([A-Za-z]+)/g, '{$1}')}`;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    for (const profile of ADMIN_PROFILES) admins.set(profile, await createAdmin(ctx, profile));
    merchant = await registerUser(ctx);
    await ctx.db.insert(userRoles).values({ userId: merchant.userId, role: 'merchant' });
    customer = await registerUser(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('C1: a permissão do `@AdminOnly` de cada rota real é a do `x-admin-permission` do contrato (nos dois sentidos)', () => {
    expect(adminRoutes().filter((r) => r.adminPermission === null).map(toKey)).toEqual([]); // C3: toda rota de admin declara a permissão (nega por padrão)
    const real = new Map(adminRoutes().map((r) => [toKey(r), String(r.adminPermission)]));
    const documented = new Map<string, string>();
    for (const [path, item] of Object.entries(contract.paths)) {
      if (!path.startsWith('/v1/admin/')) continue;
      for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
        const op = item[method];
        if (op && op['x-planned'] === undefined) documented.set(`${method.toUpperCase()} ${path}`, String(op['x-admin-permission']));
      }
    }
    expect(real.size).toBeGreaterThan(130);
    expect([...real.entries()].sort()).toEqual([...documented.entries()].sort());
  });

  it('C1: cada rota x {super, operação, financeiro, suporte, lojista, cliente}: nega com 403 e auditoria quem não tem a permissão; quem tem passa do guard', async () => {
    const principals: { label: string; token: string; userId: string; profile: string | null }[] = [
      ...ADMIN_PROFILES.map((p) => ({ label: p, token: admins.get(p)!.accessToken, userId: admins.get(p)!.userId, profile: p })),
      { label: 'merchant', token: merchant.accessToken, userId: merchant.userId, profile: null },
      { label: 'customer', token: customer.accessToken, userId: customer.userId, profile: null },
    ];
    const uuid = randomUUID();
    const failures: string[] = [];
    let denied = 0;
    let passed = 0;
    for (const route of adminRoutes()) {
      const path = route.path.replace(/:[A-Za-z]+/g, uuid);
      const permission = route.adminPermission === SELF ? null : (route.adminPermission as AdminPermission);
      for (const who of principals) {
        const call = ctx.http[route.method.toLowerCase() as 'get'](path).set(bearer(who.token));
        const res = route.method === 'GET' ? await call : await call.send(PROBE);
        const allowed = permission === null ? who.profile !== null : who.profile !== null && adminHasPermission(who.profile as never, permission);
        const [deniedRow] = await ctx.db
          .select({ id: auditLog.id })
          .from(auditLog)
          .where(and(eq(auditLog.actorId, who.userId), eq(auditLog.action, 'admin.access_denied'), eq(auditLog.targetId, `${route.method} ${route.path.startsWith('/') ? route.path.replace(/:[A-Za-z]+/g, uuid) : route.path}`)))
          .limit(1);
        const tag = `${who.label} ${route.method} ${route.path} -> ${res.status}`;
        if (allowed) {
          passed += 1;
          // passou do guard: nada de 401, e o 403 só vale se for do handler (reautenticação, limite de valor), nunca o do guard
          if (res.status === 401 || (res.status === 403 && deniedRow)) failures.push(`${tag} (esperado passar do guard)`);
        } else {
          denied += 1;
          if (res.status !== 403) failures.push(`${tag} (esperado 403)`);
          else if (!deniedRow) failures.push(`${tag} (403 sem registro de auditoria)`);
        }
      }
    }
    expect(failures).toEqual([]);
    expect(denied).toBeGreaterThan(400);
    expect(passed).toBeGreaterThan(300);
  }, 120_000);

  it('C1: o perfil é lido do banco a cada requisição (rebaixar ou desativar vale na próxima chamada, sem novo login)', async () => {
    const ops = await createAdmin(ctx, 'operations');
    await ctx.http.get('/v1/admin/stores').set(bearer(ops.accessToken)).expect(200);
    await ctx.http.get('/v1/admin/exchanges/mediations').set(bearer(ops.accessToken)).expect(200);
    await ctx.db.update(adminProfiles).set({ profile: 'support' }).where(eq(adminProfiles.userId, ops.userId));
    await ctx.http.get('/v1/admin/stores').set(bearer(ops.accessToken)).expect(200); // suporte lê lojas
    await ctx.http.get('/v1/admin/exchanges/mediations').set(bearer(ops.accessToken)).expect(403);
    await ctx.db.update(adminProfiles).set({ active: false }).where(eq(adminProfiles.userId, ops.userId));
    await ctx.http.get('/v1/admin/stores').set(bearer(ops.accessToken)).expect(403);
  });

  it('C2: operação tentando alterar comissão recebe 403 e a tentativa fica registrada', async () => {
    const ops = admins.get('operations')!;
    const storeId = randomUUID();
    await ctx.http.put(`/v1/admin/stores/${storeId}/commission`).set(bearer(ops.accessToken)).send({ pct: 5, reason: 'tentativa da operação' }).expect(403);
    const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, ops.userId), eq(auditLog.action, 'admin.access_denied'), eq(auditLog.targetId, `PUT /v1/admin/stores/${storeId}/commission`)));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.after).toMatchObject({ permission: 'commissions:write' });
  });

  it('a tabela única não tem permissão sem rota no contrato nem rota de admin fora dela', () => {
    const used = new Set(adminRoutes().map((r) => r.adminPermission).filter(Boolean));
    // as 4 permissões novas da R1 só passam a ter rota quando a WB correspondente for implementada (WB-351 reutiliza stores:write; WB-352 usa view-as:open)
    const PENDING_R1 = new Set(['store-catalog:write', 'store-history:export', 'view-as:open', 'analytics:read', 'stores:write']);
    const unused = Object.keys(ADMIN_PERMISSIONS).filter((p) => !used.has(p) && !PENDING_R1.has(p));
    expect(unused).toEqual([]);
  });
});
