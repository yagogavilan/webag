import { randomUUID } from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { createTestApp, bearer, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, type TestAdmin, uploadBannerImage } from './helpers/fixtures.js';
import { auditLog, banners } from '../src/platform/database/schema.js';

const hours = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();

describe('Banners da home (WB-011, WB-115)', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let support: TestAdmin;
  let cityA: { id: string };
  let cityB: { id: string };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    ops = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
    cityA = await ensureCity(ctx, 'Francisco Morato');
    cityB = await ensureCity(ctx, 'Franco da Rocha');
  });
  afterAll(async () => {
    await ctx.close();
  });

  const create = (body: Record<string, unknown>, token = ops.accessToken) => ctx.http.post('/v1/admin/banners').set(bearer(token)).send(body);

  it('admin cria banner com imagem 2:1; público lê por cidade, sem login, em ordem de posição', async () => {
    await ctx.db.delete(banners);
    await ctx.redis.flushdb();
    const image = await uploadBannerImage(ctx, ops);
    const b1 = await create({ title: 'Frete grátis', imageAssetId: image, destinationType: 'none', startsAt: hours(-1), endsAt: hours(24), position: 2 }).expect(201);
    const b2 = await create({ title: 'Só Morato', imageAssetId: image, cityId: cityA.id, destinationType: 'coupon', destinationCode: 'BEMVINDO', startsAt: hours(-1), endsAt: hours(24), position: 1 }).expect(201);
    expect(b2.body.destination).toEqual({ type: 'coupon', id: null, code: 'BEMVINDO' });
    expect(Object.keys(b2.body.image.urls).length).toBeGreaterThan(0);

    const all = await ctx.http.get('/v1/banners').expect(200);
    expect(all.headers['cache-control']).toContain('max-age=60');
    expect(all.body.data.map((b: { id: string }) => b.id)).toEqual([b1.body.id]); // sem cityId: só os de todas as cidades
    const morato = await ctx.http.get(`/v1/banners?cityId=${cityA.id}`).expect(200);
    expect(morato.body.data.map((b: { id: string }) => b.id)).toEqual([b2.body.id, b1.body.id]);
    const franco = await ctx.http.get(`/v1/banners?cityId=${cityB.id}`).expect(200);
    expect(franco.body.data.map((b: { id: string }) => b.id)).toEqual([b1.body.id]);
    await ctx.http.get('/v1/banners?cityId=nao-uuid').expect(400);
  });

  it('fora do período ou inativo não aparece; mudança invalida o cache na hora', async () => {
    await ctx.db.delete(banners);
    await ctx.redis.flushdb();
    const image = await uploadBannerImage(ctx, ops);
    const future = await create({ title: 'Futuro', imageAssetId: image, destinationType: 'none', startsAt: hours(2), endsAt: hours(5) }).expect(201);
    const live = await create({ title: 'No ar', imageAssetId: image, destinationType: 'none', startsAt: hours(-1), endsAt: hours(5) }).expect(201);
    expect((await ctx.http.get('/v1/banners').expect(200)).body.data.map((b: { title: string }) => b.title)).toEqual(['No ar']);
    // Preenche o cache e depois desativa: a leitura seguinte não pode devolver o banner antigo.
    await ctx.http.patch(`/v1/admin/banners/${live.body.id}`).set(bearer(ops.accessToken)).send({ active: false }).expect(200);
    expect((await ctx.http.get('/v1/banners').expect(200)).body.data).toEqual([]);
    await ctx.http.patch(`/v1/admin/banners/${future.body.id}`).set(bearer(ops.accessToken)).send({ startsAt: hours(-1) }).expect(200);
    expect((await ctx.http.get('/v1/banners').expect(200)).body.data.map((b: { title: string }) => b.title)).toEqual(['Futuro']);
    const admin = await ctx.http.get('/v1/admin/banners').set(bearer(ops.accessToken)).expect(200);
    expect(admin.body.data.find((b: { title: string }) => b.title === 'No ar')).toMatchObject({ active: false, live: false });
    await ctx.http.delete(`/v1/admin/banners/${future.body.id}`).set(bearer(ops.accessToken)).expect(204);
    expect((await ctx.http.get('/v1/banners').expect(200)).body.data).toEqual([]);
    await ctx.http.delete(`/v1/admin/banners/${future.body.id}`).set(bearer(ops.accessToken)).expect(404);
  });

  it('validação: período, destino inexistente, cupom sem código, imagem que não é banner, campo extra', async () => {
    const image = await uploadBannerImage(ctx, ops);
    const ok = { title: 'X', imageAssetId: image, destinationType: 'none', startsAt: hours(-1), endsAt: hours(5) };
    await create({ ...ok, endsAt: hours(-2) }).expect(400);
    await create({ ...ok, destinationType: 'store', destinationId: randomUUID() }).expect(400);
    await create({ ...ok, destinationType: 'store' }).expect(400);
    await create({ ...ok, destinationType: 'coupon' }).expect(400);
    await create({ ...ok, cityId: randomUUID() }).expect(400);
    await create({ ...ok, imageAssetId: randomUUID() }).expect(404);
    await create({ ...ok, extra: 1 }).expect(400);
    await create({ ...ok, title: '' }).expect(400);
  });

  it('upload de banner: só admin com permissão, sem storeId, e a imagem precisa ser 2:1', async () => {
    const customer = await createCustomer(ctx);
    const body = { purpose: 'banner', contentType: 'image/jpeg', sizeBytes: 1000 };
    await ctx.http.post('/v1/uploads').set(bearer(customer.accessToken)).send(body).expect(403);
    await ctx.http.post('/v1/uploads').set(bearer(ops.accessToken)).send({ ...body, storeId: randomUUID() }).expect(400);
    await ctx.http.post('/v1/uploads').set(bearer(ops.accessToken)).send({ purpose: 'store_logo', contentType: 'image/jpeg', sizeBytes: 1000 }).expect(400);
    await expect(uploadBannerImage(ctx, ops, { width: 800, height: 800 })).rejects.toThrow(/422/);
  });

  it('RBAC: suporte lê e não escreve; cliente não toca no admin; escrita é auditada', async () => {
    const image = await uploadBannerImage(ctx, ops);
    const body = { title: 'Auditado', imageAssetId: image, destinationType: 'none', startsAt: hours(-1), endsAt: hours(5) };
    await ctx.http.get('/v1/admin/banners').set(bearer(support.accessToken)).expect(200);
    await create(body, support.accessToken).expect(403);
    const customer = await createCustomer(ctx);
    await ctx.http.get('/v1/admin/banners').set(bearer(customer.accessToken)).expect(403);
    await create(body, customer.accessToken).expect(403);
    const made = await create(body).expect(201);
    const [entry] = await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, made.body.id as string)).orderBy(desc(auditLog.at)).limit(1);
    expect(entry).toMatchObject({ action: 'banner.create', actorId: ops.userId });
  });

  it('regiões públicas em cache e invalidadas quando o admin muda uma cidade', async () => {
    const before = await ctx.http.get('/v1/regions').expect(200);
    const city = await ensureCity(ctx, 'Cidade Cache Teste', false);
    expect(before.body.data.some((c: { id: string }) => c.id === city.id)).toBe(false);
    await ctx.http.patch(`/v1/admin/regions/cities/${city.id}`).set(bearer(ops.accessToken)).send({ active: true }).expect(200);
    const after = await ctx.http.get('/v1/regions').expect(200);
    expect(after.body.data.some((c: { id: string }) => c.id === city.id)).toBe(true);
  });
});
