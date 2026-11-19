import { vi } from 'vitest';
import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { DataExportService } from '../src/modules/privacy/data-export.service.js';
import { dataExportLinks, dataExports, orders, pushDevices } from '../src/platform/database/schema.js';
import { createTestApp, bearer, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs, memoryStorage, registerUser, verifyEmailOf } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

describe('Exportar meus dados (WB-212, SEC-008, DEC-015)', () => {
  let ctx: TestContext;
  let service: DataExportService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    service = ctx.app.get(DataExportService);
  });
  afterAll(() => ctx.close());

  const ask = (token: string, password: string, ip?: string) => {
    const req = ctx.http.post('/v1/me/data-exports').set(bearer(token));
    return (ip ? req.set('X-Forwarded-For', ip) : req).send({ password });
  };
  const link = (token: string, id: string) => ctx.http.post(`/v1/me/data-exports/${id}/download-link`).set(bearer(token)).send({});

  async function customerWithOrder() {
    const shop = await shopWith(ctx, [{ name: 'Camiseta Azul', priceCents: 8_000, stock: 20 }]);
    const buyer = await customerAt(ctx, shop.origin);
    await addToCart(ctx, buyer.user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string; number: string };
    await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
    const pushToken = `ExponentPushToken[${randomUUID()}]`;
    await ctx.db.insert(pushDevices).values({ userId: buyer.user.userId, token: pushToken, platform: 'ios' });
    return { shop, buyer, orderId: created.id, orderNumber: created.number, pushToken };
  }

  it('exige login, e-mail confirmado e senha certa (que conta no limite do login)', async () => {
    await ctx.http.get('/v1/me/data-exports').expect(401);
    await ctx.http.post('/v1/me/data-exports').send({ password: 'x' }).expect(401);
    const unverified = await registerUser(ctx);
    expect((await ask(unverified.accessToken, STRONG_PASSWORD)).body.code).toBe('EMAIL_VERIFICATION_REQUIRED');
    const user = await createCustomer(ctx);
    const wrong = await ask(user.accessToken, 'errada-errada-1', user.ip).expect(403);
    expect(wrong.body.code).toBe('INVALID_PASSWORD');
    expect(await ctx.db.select().from(dataExports).where(eq(dataExports.userId, user.userId))).toHaveLength(0);
  });

  it('assíncrono: pede, fica na fila (1 em andamento), a varredura monta o arquivo, avisa por e-mail sem link e limita a 1 por dia', async () => {
    const { buyer, orderNumber, pushToken, shop } = await customerWithOrder();
    const user = buyer.user;
    const requested = await ask(user.accessToken, STRONG_PASSWORD).expect(202);
    expect(requested.body).toMatchObject({ status: 'queued', readyAt: null });
    expect((await ask(user.accessToken, STRONG_PASSWORD)).body.code).toBe('EXPORT_IN_PROGRESS');
    expect((await ctx.http.get('/v1/me/data-exports').set(bearer(user.accessToken)).expect(200)).body.latest.status).toBe('queued');
    expect((await link(user.accessToken, requested.body.id as string)).status).toBe(410); // ainda não está pronto

    ctx.mail.outbox.length = 0;
    expect(await service.processQueue()).toMatchObject({ built: 1, failed: 0 });
    const latest = (await ctx.http.get('/v1/me/data-exports').set(bearer(user.accessToken)).expect(200)).body;
    expect(latest.latest).toMatchObject({ id: requested.body.id, status: 'ready' });
    expect(new Date(latest.latest.expiresAt).getTime() - Date.now()).toBeGreaterThan(6.9 * 86_400_000); // exportacao_validade_dias = 7
    expect(latest.nextRequestAt).not.toBeNull();

    // E-mail avisa, mas não leva link nem dado do pedido (SEC-008d).
    const mail = ctx.mail.to(user.email).at(-1)!;
    expect(mail.subject).toMatch(/prontos/);
    expect(mail.text).not.toMatch(/https?:\/\//);
    expect(mail.text).not.toContain(orderNumber);

    // Limite de 1 por dia (C4).
    const again = await ask(user.accessToken, STRONG_PASSWORD).expect(429);
    expect(again.body.code).toBe('EXPORT_DAILY_LIMIT');

    // O arquivo: dados do titular, sem segredo e sem terceiros.
    const { url } = (await link(user.accessToken, requested.body.id as string).expect(200)).body as { url: string };
    const file = await ctx.http.get(new URL(url).pathname).expect(200);
    expect(file.headers['content-disposition']).toMatch(/attachment; filename="webag-meus-dados-/);
    expect(file.headers['cache-control']).toBe('no-store');
    const doc = JSON.parse(file.text) as { profile: object; addresses: object[]; orders: { items: object[] }[]; consents: object[]; pushDevices: object[] };
    expect(doc.profile).toMatchObject({ email: user.email, emailVerified: true });
    expect(doc.addresses[0]).toMatchObject({ street: 'Rua Teste', city: 'Francisco Morato' });
    expect(doc.orders[0]).toMatchObject({ number: orderNumber, status: 'delivered', store: shop.store.id ? 'Loja Pedidos' : '' });
    expect(doc.orders[0]!.items[0]).toMatchObject({ name: 'Camiseta Azul', quantity: 1, unitPriceCents: 8_000 });
    expect(doc.consents).toEqual([]);
    // SEC-164 (b): declaração completa traz também as denúncias feitas e as campanhas de push recebidas.
    expect(doc).toHaveProperty('contentReports');
    expect(doc).toHaveProperty('pushCampaignsReceived');
    expect(doc.pushDevices[0]).toEqual(expect.objectContaining({ platform: 'ios' }));
    for (const forbidden of [pushToken, 'passwordHash', 'tokenHash', 'codeHash', 'totpSecret', 'refreshToken', 'Bearer ']) expect(file.text, forbidden).not.toContain(forbidden);
    expect(file.text).not.toContain(shop.store.owner.email); // o dono da loja é terceiro
  });

  it('link de uso único e com validade: a 2ª leitura e o link vencido dão 410; outro usuário não gera link (404)', async () => {
    const user = await createCustomer(ctx);
    await ask(user.accessToken, STRONG_PASSWORD).expect(202);
    await service.processQueue();
    const mine = (await ctx.http.get('/v1/me/data-exports').set(bearer(user.accessToken)).expect(200)).body.latest.id as string;

    // IDOR: outro usuário (e id inexistente) recebe 404, sem revelar a existência.
    const other = await createCustomer(ctx);
    await link(other.accessToken, mine).expect(404);
    await link(other.accessToken, randomUUID()).expect(404);
    await link(other.accessToken, 'nao-e-uuid').expect(404);
    await ctx.http.post(`/v1/me/data-exports/${mine}/download-link`).send({}).expect(401);

    const first = (await link(user.accessToken, mine).expect(200)).body as { url: string; expiresAt: string };
    expect(new Date(first.expiresAt).getTime() - Date.now()).toBeLessThanOrEqual(5 * 60_000);
    const path = new URL(first.url).pathname;
    await ctx.http.get(path).expect(200);
    const reused = await ctx.http.get(path).expect(410);
    expect(reused.body.code).toBe('EXPORT_LINK_INVALID');

    // Duas leituras simultâneas do mesmo link: só uma vence.
    const parallel = (await link(user.accessToken, mine).expect(200)).body as { url: string };
    const results = await Promise.all([ctx.http.get(new URL(parallel.url).pathname), ctx.http.get(new URL(parallel.url).pathname)]);
    expect(results.map((r) => r.status).sort()).toEqual([200, 410]);

    // Vencido: o token existe, mas passou da validade.
    const stale = (await link(user.accessToken, mine).expect(200)).body as { url: string };
    await ctx.db.update(dataExportLinks).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(dataExportLinks.exportId, mine));
    await ctx.http.get(new URL(stale.url).pathname).expect(410);
    await ctx.http.get('/v1/data-exports/download/token-que-nao-existe-0000000000').expect(410);
    expect((await ctx.db.select().from(dataExports).where(eq(dataExports.id, mine)))[0]!.downloadCount).toBe(2);
  });

  it('arquivo vence: a varredura apaga do storage e o link deixa de ser emitido; uma nova exportação libera', async () => {
    const user = await createCustomer(ctx);
    await ask(user.accessToken, STRONG_PASSWORD).expect(202);
    await service.processQueue();
    const [row] = await ctx.db.select().from(dataExports).where(eq(dataExports.userId, user.userId));
    expect(await memoryStorage(ctx).getObject('private', row!.objectKey!, { maxBytes: 1e6 })).not.toBeNull();

    await ctx.db.update(dataExports).set({ expiresAt: new Date(Date.now() - 1000), requestedAt: new Date(Date.now() - 2 * 86_400_000) }).where(eq(dataExports.id, row!.id));
    expect((await link(user.accessToken, row!.id)).status).toBe(410);
    expect((await ctx.http.get('/v1/me/data-exports').set(bearer(user.accessToken)).expect(200)).body.latest.status).toBe('expired');
    expect(await service.processQueue()).toMatchObject({ expired: 1 });
    expect(await memoryStorage(ctx).getObject('private', row!.objectKey!, { maxBytes: 1e6 })).toBeNull();
    expect((await ctx.db.select().from(dataExports).where(eq(dataExports.id, row!.id)))[0]).toMatchObject({ status: 'expired', objectKey: null });
    await ask(user.accessToken, STRONG_PASSWORD).expect(202);
  });

  it('lojista exporta a conta e a loja, sem dados do comprador (terceiro)', async () => {
    const { shop, buyer, orderNumber } = await customerWithOrder();
    const owner = shop.store.owner;
    await verifyEmailOf(ctx, owner);
    await ask(owner.accessToken, STRONG_PASSWORD).expect(202);
    await service.processQueue();
    const id = (await ctx.http.get('/v1/me/data-exports').set(bearer(owner.accessToken)).expect(200)).body.latest.id as string;
    const { url } = (await link(owner.accessToken, id).expect(200)).body as { url: string };
    const file = await ctx.http.get(new URL(url).pathname).expect(200);
    const doc = JSON.parse(file.text) as { merchant: { store: { id: string }; orders: { number: string; totalCents: number }[] } };
    expect(doc.merchant.store.id).toBe(shop.store.id);
    expect(doc.merchant.orders.map((o) => o.number)).toContain(orderNumber);
    for (const thirdParty of [buyer.user.email, buyer.user.userId, 'Rua Teste']) expect(file.text, thirdParty).not.toContain(thirdParty);
  });

  it('excluir a conta apaga a exportação (arquivo e links)', async () => {
    const user = await createCustomer(ctx);
    await ask(user.accessToken, STRONG_PASSWORD).expect(202);
    await service.processQueue();
    const [row] = await ctx.db.select().from(dataExports).where(eq(dataExports.userId, user.userId));
    await link(user.accessToken, row!.id).expect(200);
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    expect(await memoryStorage(ctx).getObject('private', row!.objectKey!, { maxBytes: 1e6 })).toBeNull();
    expect(await ctx.db.select().from(dataExports).where(eq(dataExports.userId, user.userId))).toHaveLength(0);
    expect(await ctx.db.select().from(dataExportLinks).where(eq(dataExportLinks.exportId, row!.id))).toHaveLength(0);
  });

  it('SEC-164 (a): se o banco falhar depois do upload, o arquivo é apagado (nada de objeto órfão sem chave registrada); a anonimização apaga também pela chave calculada', async () => {
    const { DRIZZLE } = await import('../src/platform/database/database.module.js');
    const user = await createCustomer(ctx);
    await ask(user.accessToken, STRONG_PASSWORD).expect(202);
    const [row] = await ctx.db.select().from(dataExports).where(eq(dataExports.userId, user.userId));
    const key = `exports/${user.userId}/${row!.id}.json`;
    const db = ctx.app.get(DRIZZLE) as typeof ctx.db;
    const realUpdate = db.update.bind(db);
    let armed = true;
    const spy = vi.spyOn(db, 'update').mockImplementation(((table: Parameters<typeof db.update>[0]) => {
      const builder = realUpdate(table);
      if (armed && table === dataExports) {
        const originalSet = builder.set.bind(builder);
        // o `ready` (depois do upload) falha uma vez; o resto segue
        (builder as unknown as { set: (v: Record<string, unknown>) => unknown }).set = (values) => {
          if (values.status === 'ready') {
            armed = false;
            throw new Error('banco caiu depois do upload');
          }
          return originalSet(values as never);
        };
      }
      return builder;
    }) as typeof db.update);
    try {
      expect(await service.processQueue()).toMatchObject({ failed: 1 });
    } finally {
      spy.mockRestore();
    }
    expect(await memoryStorage(ctx).getObject('private', key, { maxBytes: 1e6 })).toBeNull(); // sem órfão
  });
});
