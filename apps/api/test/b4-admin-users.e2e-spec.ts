import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { auditLog, stores, userStatusHistory } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, orderRow, placeOrder, shopWith } from './helpers/orders.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** B4 / WB-102 (DEC-073): usuários no admin. Buscar, ver (mascarado), bloquear e desbloquear com motivo e auditoria; sem redefinir senha. */
describe('B4: usuários no admin', () => {
  let ctx: TestContext;
  const admins = {} as Record<'super_admin' | 'finance' | 'operations' | 'support', Admin>;
  const tag = `Zq${randomUUID().replace(/-/g, '').slice(0, 8)}`; // nome único: a busca por trecho acha só os usuários deste teste

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    for (const profile of ['super_admin', 'finance', 'operations', 'support'] as const) admins[profile] = await createAdmin(ctx, profile);
  });
  afterAll(() => ctx.close());

  const search = (who: Admin, query: string) => ctx.http.get(`/v1/admin/users?${query}`).set(bearer(who.accessToken));
  const detail = (who: Admin, id: string) => ctx.http.get(`/v1/admin/users/${id}`).set(bearer(who.accessToken));
  const block = (who: Admin, id: string, reason = 'abuso: vários pedidos falsos em 1 dia') => ctx.http.post(`/v1/admin/users/${id}/block`).set(bearer(who.accessToken)).send({ reason });
  const unblock = (who: Admin, id: string, reason = 'recurso aceito pelo suporte') => ctx.http.post(`/v1/admin/users/${id}/unblock`).set(bearer(who.accessToken)).send({ reason });

  let customer: Awaited<ReturnType<typeof registerUser>>;
  let other: Awaited<ReturnType<typeof registerUser>>;

  it('buscar por nome, e-mail, celular ou ID; só os dados mascarados; conta de admin não aparece; filtros e paginação', async () => {
    customer = await registerUser(ctx, { name: `${tag} Souza Lima`, phone: '(11) 97766-5544' });
    other = await registerUser(ctx, { name: `${tag} Pereira` });

    const byName = (await search(admins.operations, `q=${tag}`).expect(200)).body.data as { id: string; name: string; emailMasked: string; phoneMasked: string; status: string; roles: string[] }[];
    expect(byName.map((u) => u.id).sort()).toEqual([customer.userId, other.userId].sort());
    const row = byName.find((u) => u.id === customer.userId)!;
    expect(row).toMatchObject({ name: `${tag} L.`, status: 'active', roles: ['customer'], phoneMasked: '(11) 9****-5544' });
    expect(row.emailMasked).toBe(`${customer.email[0]}***@${customer.email.split('@')[1]}`);
    const text = JSON.stringify(byName);
    expect(text).not.toContain(customer.email); // nunca o e-mail inteiro
    expect(text).not.toContain('97766');
    expect(text).not.toContain('Souza');

    expect((await search(admins.support, `q=${encodeURIComponent(customer.email)}`).expect(200)).body.data.map((u: { id: string }) => u.id)).toEqual([customer.userId]);
    expect((await search(admins.support, 'q=977665544').expect(200)).body.data.map((u: { id: string }) => u.id)).toEqual([customer.userId]); // celular, só dígitos
    expect((await search(admins.support, `q=${customer.userId}`).expect(200)).body.data.map((u: { id: string }) => u.id)).toEqual([customer.userId]); // ID exato
    expect((await search(admins.support, `q=${encodeURIComponent(admins.super_admin.email)}`).expect(200)).body.data).toEqual([]); // admin: outra tela
    expect((await search(admins.support, `q=${tag}%25`).expect(200)).body.data).toEqual([]); // o curinga do usuário não vale

    expect((await search(admins.support, `q=${tag}&status=blocked`).expect(200)).body.data).toEqual([]);
    expect((await search(admins.support, `q=${tag}&role=merchant`).expect(200)).body.data).toEqual([]);
    expect((await search(admins.support, `q=${tag}&limit=1`).expect(200)).body.nextCursor).toEqual(expect.any(String));
    const first = (await search(admins.support, `q=${tag}&limit=1`).expect(200)).body;
    const second = (await search(admins.support, `q=${tag}&limit=1&cursor=${encodeURIComponent(first.nextCursor)}`).expect(200)).body;
    expect([...first.data, ...second.data].map((u: { id: string }) => u.id).sort()).toEqual([customer.userId, other.userId].sort());
    expect(second.nextCursor).toBeNull();

    await search(admins.support, 'q=a').expect(400); // curto demais
    await search(admins.support, 'role=admin').expect(400);
    await search(admins.finance, `q=${tag}`).expect(403); // o financeiro não lê usuários
    await ctx.http.get('/v1/admin/users').expect(401);
  });

  it('detalhe mascarado: lojas, pedidos recentes e histórico; ações permitidas por perfil; conta de admin é 404', async () => {
    const d = (await detail(admins.operations, customer.userId).expect(200)).body;
    expect(d).toMatchObject({ id: customer.userId, status: 'active', emailVerified: false, stores: [], recentOrders: [], blockHistory: [], allowedActions: ['block'], phoneMasked: '(11) 9****-5544' });
    expect((await detail(admins.support, customer.userId).expect(200)).body.allowedActions).toEqual([]); // suporte só lê
    await detail(admins.finance, customer.userId).expect(403);
    await detail(admins.operations, admins.super_admin.userId).expect(404);
    await detail(admins.operations, randomUUID()).expect(404);
    await detail(admins.operations, 'nao-uuid').expect(404);
  });

  it('bloquear: motivo obrigatório; só super admin e operação; derruba as sessões; login diz "Conta indisponível"; histórico, auditoria e repetição (409)', async () => {
    expect((await block(admins.operations, customer.userId, 'curto')).status).toBe(400);
    expect((await ctx.http.post(`/v1/admin/users/${customer.userId}/block`).set(bearer(admins.operations.accessToken)).send({})).status).toBe(400);
    expect((await block(admins.support, customer.userId)).status).toBe(403);
    expect((await block(admins.finance, customer.userId)).status).toBe(403);
    expect((await block(admins.operations, admins.super_admin.userId)).status).toBe(404); // admin: pela gestão de admins

    expect((await ctx.http.get('/v1/me/addresses').set(bearer(customer.accessToken))).status).toBe(200); // sessão viva antes
    const res = await block(admins.operations, customer.userId).expect(200);
    expect(res.body).toMatchObject({ id: customer.userId, status: 'blocked', suspendedStoreIds: [], failedStoreIds: [], allowedActions: ['unblock'] });
    expect(res.body.blockHistory[0]).toMatchObject({ action: 'blocked', reason: 'abuso: vários pedidos falsos em 1 dia', byName: 'Admin operations' });

    expect((await ctx.http.get('/v1/me/addresses').set(bearer(customer.accessToken))).status).toBe(401); // a sessão caiu
    await ctx.http.post('/v1/auth/refresh').send({ refreshToken: customer.refreshToken }).expect(401);
    const login = await ctx.http.post('/v1/auth/login').send({ email: customer.email, password: customer.password }).expect(403);
    expect(login.body.code).toBe('ACCOUNT_BLOCKED');

    expect((await block(admins.operations, customer.userId)).status).toBe(409);
    expect((await block(admins.operations, customer.userId)).body.code).toBe('USER_ALREADY_BLOCKED');
    expect((await search(admins.support, `q=${tag}&status=blocked`).expect(200)).body.data.map((u: { id: string }) => u.id)).toEqual([customer.userId]);

    const audit = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, customer.userId), eq(auditLog.action, 'user.block')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admins.operations.userId, reason: 'abuso: vários pedidos falsos em 1 dia', before: { status: 'active' }, after: { status: 'blocked' } });
  });

  it('desbloquear: motivo obrigatório; só quem bloqueia; reverte e o login volta; não vale para quem não está bloqueado; histórico com os dois atos', async () => {
    expect((await unblock(admins.support, customer.userId)).status).toBe(403);
    expect((await unblock(admins.operations, customer.userId, 'curto')).status).toBe(400);
    expect((await unblock(admins.operations, other.userId)).body.code).toBe('USER_NOT_BLOCKED'); // não estava bloqueado
    const res = await unblock(admins.super_admin, customer.userId).expect(200);
    expect(res.body).toMatchObject({ status: 'active', allowedActions: ['block'] });
    expect(res.body.blockHistory.map((h: { action: string }) => h.action)).toEqual(['unblocked', 'blocked']);
    expect(res.body.blockHistory[0]).toMatchObject({ reason: 'recurso aceito pelo suporte', byName: 'Admin super_admin' });
    await ctx.http.post('/v1/auth/login').send({ email: customer.email, password: customer.password }).expect(200);
    const audit = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, customer.userId), eq(auditLog.action, 'user.unblock')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admins.super_admin.userId, before: { status: 'blocked' }, after: { status: 'active' } });
    expect(await ctx.db.select().from(userStatusHistory).where(eq(userStatusHistory.userId, customer.userId))).toHaveLength(2);
  });

  it('bloquear o lojista suspende a loja aprovada dele e NÃO cancela o pedido em andamento; desbloquear não reativa a loja sozinho', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Bloqueio', priceCents: 4_000, stock: 10 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    expect((await orderRow(ctx, created.id)).status).toBe('received');

    const ownerId = shop.store.ownerUserId;
    const before = (await detail(admins.operations, ownerId).expect(200)).body;
    expect(before.stores).toEqual([expect.objectContaining({ id: shop.store.id, status: 'approved', role: 'owner' })]);

    const res = await block(admins.operations, ownerId, 'fraude: documentos de loja falsos').expect(200);
    expect(res.body.suspendedStoreIds).toEqual([shop.store.id]);
    expect(res.body.failedStoreIds).toEqual([]);
    expect(res.body.stores[0]).toMatchObject({ id: shop.store.id, status: 'suspended' });
    expect(res.body.blockHistory[0].suspendedStoreIds).toEqual([shop.store.id]);
    const [store] = await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id));
    expect(store).toMatchObject({ status: 'suspended' });
    expect(store!.suspensionReason).toContain('fraude: documentos de loja falsos');
    // o pedido em andamento segue (a decisão é do admin)
    expect((await orderRow(ctx, created.id)).status).toBe('received');
    const storeAudit = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, shop.store.id), eq(auditLog.action, 'store.suspend')));
    expect(storeAudit).toHaveLength(1);

    const back = await unblock(admins.operations, ownerId).expect(200);
    expect(back.body.status).toBe('active');
    expect(back.body.stores[0]).toMatchObject({ status: 'suspended' }); // a loja volta pela tela de lojas, de propósito
  });

  it('funcionário de loja também é achado pela busca e bloqueá-lo não mexe na loja', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item Equipe', priceCents: 4_000, stock: 10 }]);
    const staff = await registerUser(ctx, { name: `${tag} Equipe` });
    const { storeMembers } = await import('../src/platform/database/schema.js');
    await ctx.db.insert(storeMembers).values({ storeId: shop.store.id, userId: staff.userId, role: 'staff', permissions: ['orders'] });
    const row = (await search(admins.support, `q=${encodeURIComponent(staff.email)}`).expect(200)).body.data[0];
    expect(row).toMatchObject({ id: staff.userId, storeCount: 1 });
    const res = await block(admins.super_admin, staff.userId).expect(200);
    expect(res.body.suspendedStoreIds).toEqual([]);
    expect((await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id)))[0]!.status).toBe('approved');
  });
});
