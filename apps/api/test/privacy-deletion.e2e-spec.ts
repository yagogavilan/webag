import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { AccountDeletionService } from '../src/modules/privacy/account-deletion.service.js';
import {
  accountDeletions,
  carts,
  consents,
  deliveries,
  favorites,
  mediaAssets,
  orders,
  pushDevices,
  reviews,
  searchHistory,
  sessions,
  stores,
  userAddresses,
  users,
} from '../src/platform/database/schema.js';
import { createTestApp, bearer, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createAdmin, createCustomer, currentDocs, ensureCity, ensureLegalDocs, memoryStorage, registerUser, verifyEmailOf } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

describe('Excluir conta (WB-213/215, SEC-096, DT-052)', () => {
  let ctx: TestContext;
  let service: AccountDeletionService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    service = ctx.app.get(AccountDeletionService);
  });
  afterAll(() => ctx.close());

  const del = (token: string, password: string, ip?: string) => {
    const req = ctx.http.post('/v1/me/deletion').set(bearer(token));
    return (ip ? req.set('X-Forwarded-For', ip) : req).send({ password });
  };

  /** Cliente com pedido ENTREGUE (endereço no pedido, contato na corrida), avaliação, favorito, busca, push, sacola e consentimento. */
  async function richCustomer() {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    // Identidade única: a varredura procura estes valores em TODAS as tabelas, e outros testes usam nome e rua iguais.
    const tag = randomUUID().slice(0, 8);
    const user = await registerUser(ctx, { name: `Zuleica ${tag}`, phone: `(11) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` });
    await verifyEmailOf(ctx, user);
    const street = `Travessa Ipe ${tag}`;
    const addressId = (await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street, number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201)).body.id as string;
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, user, addressId)).body as { id: string };
    await approve(ctx, user, (await attemptOf(ctx, created.id)).id);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
    const phone = (await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, user.userId)))[0]!.phone!;
    await ctx.db.insert(deliveries).values({ orderId: created.id, storeId: shop.store.id, kind: 'delivery', status: 'delivered', contact: { customerName: `Zuleica ${tag}`, phone, dropoffAddress: `${street}, 10, Centro` }, note: `Cliente Zuleica ${tag} pediu portaria` }).onConflictDoUpdate({ target: [deliveries.orderId], targetWhere: sql`${deliveries.kind} = 'delivery'`, set: { contact: { customerName: `Zuleica ${tag}`, phone, dropoffAddress: `${street}, 10, Centro` }, note: `Cliente Zuleica ${tag} pediu portaria`, status: 'delivered' } });
    await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: user.userId, rating: 5, comment: `Chamem a Zuleica ${tag} de volta, moro na ${street}` });
    await ctx.db.insert(favorites).values({ userId: user.userId, storeId: shop.store.id });
    await ctx.db.insert(searchHistory).values({ userId: user.userId, termKey: 'camiseta', term: 'camiseta' });
    await ctx.db.insert(pushDevices).values({ userId: user.userId, token: `ExponentPushToken[${randomUUID()}]`, platform: 'android' });
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: true }).expect(200);
    return { shop, user, addressId, orderId: created.id, tag, street, phone };
  }

  it('exige login; admin não exclui por aqui; senha errada não exclui e conta no limite do login', async () => {
    await ctx.http.get('/v1/me/deletion').expect(401);
    await ctx.http.post('/v1/me/deletion').send({ password: 'x' }).expect(401);
    const admin = await createAdmin(ctx, 'operations');
    const adminTry = await del(admin.accessToken, admin.password);
    expect(adminTry.status).toBe(403);
    expect(adminTry.body.code).toBe('ADMIN_ACCOUNT_NOT_DELETABLE');

    const user = await createCustomer(ctx);
    const wrong = await del(user.accessToken, 'senha-errada-123', user.ip).expect(403);
    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    expect((await ctx.db.select().from(users).where(eq(users.id, user.userId)))[0]!.status).toBe('active');
    await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
    // 5 erros (login_falhas) e a próxima, mesmo certa, espera.
    for (let i = 0; i < 5; i += 1) await del(user.accessToken, 'senha-errada-123', user.ip);
    await del(user.accessToken, STRONG_PASSWORD, user.ip).expect(429);
  });

  it('bloqueia com pedido em aberto e lista o pedido; libera quando conclui', async () => {
    const shop = await shopWith(ctx, [{ name: 'Bolsa', priceCents: 5_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, user, addressId)).body as { id: string; number: string };
    await approve(ctx, user, (await attemptOf(ctx, created.id)).id);

    const overview = (await ctx.http.get('/v1/me/deletion').set(bearer(user.accessToken)).expect(200)).body;
    expect(overview).toMatchObject({ canDelete: false, hasPassword: true, anonymizationDays: 15, fiscalRetentionYears: 5, regretHours: 0 });
    expect(overview.blockers[0]).toMatchObject({ kind: 'order', id: created.id, status: 'received' });

    const blocked = await del(user.accessToken, STRONG_PASSWORD).expect(409);
    expect(blocked.body.code).toBe('DELETION_BLOCKED');
    expect(blocked.body.blockers[0].id).toBe(created.id);
    await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200); // nada mudou

    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
    expect((await ctx.http.get('/v1/me/deletion').set(bearer(user.accessToken)).expect(200)).body.canDelete).toBe(true);
  });

  it('exclui na hora: login impossível, sessões e push fora; apaga e anonimiza o que deve e mantém o que a lei obriga', async () => {
    const { user, orderId, shop, tag, street, phone } = await richCustomer();
    const email = user.email;
    // Foto de troca guardada no storage privado e vinculada a uma troca.
    const key = `exchange/${randomUUID()}.jpg`;
    await memoryStorage(ctx).putObject('private', key, Buffer.from('foto'), 'image/jpeg');
    await ctx.db.insert(mediaAssets).values({ ownerUserId: user.userId, purpose: 'exchange_photo', status: 'ready', objectKey: key, declaredContentType: 'image/jpeg', declaredSizeBytes: 4, expiresAt: new Date(Date.now() + 1e6) });

    const outcome = (await del(user.accessToken, STRONG_PASSWORD).expect(200)).body;
    expect(outcome).toMatchObject({ status: 'completed', cancelableUntil: null });

    // Efeito imediato: nem o token nem o refresh nem a senha funcionam.
    await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
    await ctx.http.post('/v1/auth/refresh').send({ refreshToken: user.refreshToken }).expect(401);
    await ctx.http.post('/v1/auth/login').send({ email, password: user.password }).expect(401);

    // Apagado.
    for (const [name, rows] of [
      ['endereços', await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, user.userId))],
      ['favoritos', await ctx.db.select().from(favorites).where(eq(favorites.userId, user.userId))],
      ['buscas', await ctx.db.select().from(searchHistory).where(eq(searchHistory.userId, user.userId))],
      ['push', await ctx.db.select().from(pushDevices).where(eq(pushDevices.userId, user.userId))],
      ['sessões', await ctx.db.select().from(sessions).where(eq(sessions.userId, user.userId))],
      ['sacola', await ctx.db.select().from(carts).where(eq(carts.userId, user.userId))],
      ['fotos', await ctx.db.select().from(mediaAssets).where(eq(mediaAssets.ownerUserId, user.userId))],
    ] as const) expect(rows, name).toHaveLength(0);
    expect(await memoryStorage(ctx).getObject('private', key, { maxBytes: 10 })).toBeNull();

    // Anonimizado: pedido fica (fiscal), sem rua; contato da corrida e comentário saem.
    const [row] = await ctx.db.select().from(users).where(eq(users.id, user.userId));
    expect(row).toMatchObject({ name: 'Conta excluída', phone: null, passwordHash: null, status: 'deleted' });
    expect(row!.email).toMatch(/^deleted-.*@anon\.webag\.invalid$/);
    const [order] = await ctx.db.select().from(orders).where(eq(orders.id, orderId));
    expect(order!.totalCents).toBeGreaterThan(0);
    expect(order!.address).toMatchObject({ city: 'Francisco Morato', state: 'SP' });
    expect(order!.address).not.toHaveProperty('street');
    expect(order!.address).not.toHaveProperty('lat');
    const [run] = await ctx.db.select().from(deliveries).where(eq(deliveries.orderId, orderId));
    expect(run).toMatchObject({ contact: null, note: null });
    expect(run!.piiClearedAt).not.toBeNull();
    expect((await ctx.db.select().from(reviews).where(eq(reviews.userId, user.userId)))[0]).toMatchObject({ rating: 5, comment: null });
    expect((await ctx.db.select().from(consents).where(eq(consents.userId, user.userId)))[0]).toMatchObject({ granted: true });
    expect((await ctx.db.select().from(accountDeletions).where(eq(accountDeletions.userId, user.userId)))[0]).toMatchObject({ status: 'completed', via: 'app' });

    // Varredura: nenhuma tabela guarda nome, e-mail, celular ou rua originais (WB-215 C5). Exceção documentada: access_log (IP, Marco Civil).
    const needles = [email, phone, street, `Zuleica ${tag}`, tag];
    const tables = (await ctx.pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)).rows.map((r) => r.table_name);
    const leaks: string[] = [];
    for (const table of tables) {
      for (const needle of needles) {
        const found = await ctx.pool.query(`select 1 from "${table}" t where t::text ilike $1 limit 1`, [`%${needle}%`]);
        if (found.rowCount) leaks.push(`${table}:${needle}`);
      }
    }
    expect(leaks, `dado pessoal restante: ${leaks.join(', ')}`).toEqual([]);
    expect(shop.store.id).toBeTruthy();

    // C6: o mesmo e-mail cria conta nova, sem herdar nada.
    const again = await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', '10.99.1.1').send({ name: 'Outra Pessoa', email, phone: '(11) 97777-6666', password: STRONG_PASSWORD, adultDeclaration: true, acceptedDocuments: await currentDocs(ctx, ['customer_terms', 'privacy']) });
    expect(again.status).toBe(201);
    expect(again.body.user.id).not.toBe(user.userId);
    expect(await ctx.db.select().from(orders).where(eq(orders.userId, again.body.user.id as string))).toHaveLength(0);
  });

  it('período de arrependimento: fecha na hora, anonimiza só depois do prazo e dá para cancelar com e-mail e senha', async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 24);
    try {
      const user = await createCustomer(ctx);
      await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Nova', number: '5', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP' }).expect(201);
      const outcome = (await del(user.accessToken, STRONG_PASSWORD).expect(200)).body;
      expect(outcome.status).toBe('pending');
      expect(new Date(outcome.cancelableUntil).getTime()).toBeGreaterThan(Date.now() + 23 * 3_600_000);
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
      await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(403);
      expect(await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, user.userId))).toHaveLength(1); // ainda não anonimizado
      expect(await service.processDue()).toMatchObject({ completed: 0 }); // prazo não venceu

      // Senha errada e conta inexistente respondem igual.
      const bad = await ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', '10.55.0.1').send({ email: user.email, password: 'errada-errada-1' }).expect(401);
      const ghost = await ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', '10.55.0.2').send({ email: 'ninguem@teste.webag.local', password: 'errada-errada-1' }).expect(401);
      expect(ghost.body.code).toBe(bad.body.code);

      await ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', '10.55.0.3').send({ email: user.email, password: user.password }).expect(204);
      await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
      expect(await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, user.userId))).toHaveLength(1);

      // Pede de novo e deixa vencer: o job anonimiza.
      const second = await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
      await del((second.body as { tokens: { accessToken: string } }).tokens.accessToken, STRONG_PASSWORD).expect(200);
      await ctx.db.update(accountDeletions).set({ effectiveAt: new Date(Date.now() - 1000) }).where(eq(accountDeletions.userId, user.userId));
      expect(await service.processDue()).toMatchObject({ completed: 1 });
      expect(await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, user.userId))).toHaveLength(0);
      await ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', '10.55.0.4').send({ email: user.email, password: user.password }).expect(401);
      // Idempotente: rodar de novo não faz nada.
      expect(await service.processDue()).toEqual({ completed: 0, postponed: 0, failed: 0 });
    } finally {
      await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    }
  });

  it('lojista dono: bloqueia com pedido aberto na loja; ao excluir, a loja é encerrada e some da vitrine', async () => {
    const shop = await shopWith(ctx, [{ name: 'Tênis', priceCents: 9_000, stock: 9 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);

    const owner = shop.store.owner;
    const blocked = await del(owner.accessToken, STRONG_PASSWORD).expect(409);
    expect(blocked.body.blockers.some((b: { kind: string }) => b.kind === 'store_order')).toBe(true);

    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
    await del(owner.accessToken, STRONG_PASSWORD).expect(200);
    const [store] = await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id));
    expect(store).toMatchObject({ status: 'closed', phone: null, addressStreet: null });
    // O comprador continua com o pedido (histórico) e o dado do comprador não foi tocado pela exclusão do lojista.
    expect((await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, buyer.user.userId))).length).toBe(1);
  });

  it('exclusão não vaza entre contas (IDOR): o corpo não aceita userId e cada token só afeta a própria conta', async () => {
    const a = await createCustomer(ctx);
    const b = await createCustomer(ctx);
    await ctx.http.post('/v1/me/deletion').set(bearer(a.accessToken)).send({ password: STRONG_PASSWORD, userId: b.userId }).expect(400);
    await del(a.accessToken, STRONG_PASSWORD).expect(200);
    expect((await ctx.db.select().from(users).where(eq(users.id, b.userId)))[0]!.status).toBe('active');
    await ctx.http.get('/v1/me').set(bearer(b.accessToken)).expect(200);
  });
});
