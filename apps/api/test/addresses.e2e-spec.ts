import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { createTestApp, bearer, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { userAddresses } from '../src/platform/database/schema.js';

const base = (over: Record<string, unknown> = {}) => ({ cep: '07900-100', street: 'Rua das Flores', number: '45', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', ...over });

describe('GET/POST/PATCH/DELETE /v1/me/addresses (WB-003, DEC-028)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    await ctx.close();
  });

  it('exige login; o primeiro endereço vira o padrão; o CEP resolve a coordenada', async () => {
    await ctx.http.get('/v1/me/addresses').expect(401);
    const user = await createCustomer(ctx);
    const created = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ label: 'home' })).expect(201);
    expect(created.body).toMatchObject({ isDefault: true, cep: '07900100', city: 'Francisco Morato', label: 'home' });
    expect(created.body.lat).toBeLessThan(-23);
    const list = await ctx.http.get('/v1/me/addresses').set(bearer(user.accessToken)).expect(200);
    expect(list.body).toMatchObject({ nextCursor: null });
    expect(list.body.data).toHaveLength(1);
  });

  it('reenvio do mesmo endereço devolve 200 sem duplicar (3G instável)', async () => {
    const user = await createCustomer(ctx);
    const first = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base()).expect(201);
    const again = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ number: '45' })).expect(200);
    expect(again.body.id).toBe(first.body.id);
    expect(await ctx.db.select().from(userAddresses).where(eq(userAddresses.userId, user.userId))).toHaveLength(1);
  });

  it('limite de 8; só um padrão; promover rebaixa o anterior; apagar o padrão promove outro', async () => {
    const user = await createCustomer(ctx);
    const ids: string[] = [];
    for (let n = 1; n <= 8; n += 1) {
      const res = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ number: String(n) })).expect(201);
      ids.push(res.body.id as string);
    }
    const over = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ number: '99' })).expect(422);
    expect(over.body.code).toBe('ADDRESS_LIMIT_REACHED');

    await ctx.http.patch(`/v1/me/addresses/${ids[3]}`).set(bearer(user.accessToken)).send({ isDefault: true }).expect(200);
    let rows = await ctx.http.get('/v1/me/addresses').set(bearer(user.accessToken)).expect(200);
    expect(rows.body.data.filter((a: { isDefault: boolean }) => a.isDefault).map((a: { id: string }) => a.id)).toEqual([ids[3]]);
    expect(rows.body.data[0].id).toBe(ids[3]);

    await ctx.http.delete(`/v1/me/addresses/${ids[3]}`).set(bearer(user.accessToken)).expect(204);
    rows = await ctx.http.get('/v1/me/addresses').set(bearer(user.accessToken)).expect(200);
    expect(rows.body.data).toHaveLength(7);
    expect(rows.body.data.filter((a: { isDefault: boolean }) => a.isDefault)).toHaveLength(1);
    await ctx.http.patch(`/v1/me/addresses/${ids[0]}`).set(bearer(user.accessToken)).send({ isDefault: false }).expect(400);
  });

  it('cidade fora da região atendida e CEP inexistente: 422 com code estável (SEC-169: o pino do app não salva um CEP que não existe)', async () => {
    const user = await createCustomer(ctx);
    const outside = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ cep: '01001-000', city: 'São Paulo' })).expect(422);
    expect(outside.body.code).toBe('REGION_NOT_SERVED');
    const noPoint = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ cep: '00000-000' })).expect(422);
    expect(noPoint.body.code).toBe('ADDRESS_CEP_NOT_FOUND');
    // Com o ponto do GPS também: o GPS não dispensa um CEP que não existe.
    const withPin = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ cep: '00000-000', lat: -23.28, lng: -46.74 })).expect(422);
    expect(withPin.body.code).toBe('ADDRESS_CEP_NOT_FOUND');
  });

  it('validação: campos obrigatórios, campo extra, lat sem lng e coordenada fora da faixa', async () => {
    const user = await createCustomer(ctx);
    const post = (body: unknown) => ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(body as object);
    await post({ cep: '07900100' }).expect(400);
    await post(base({ role: 'admin' })).expect(400);
    await post(base({ lat: -23.2 })).expect(400);
    await post(base({ lat: 123, lng: 0 })).expect(400);
    await post(base({ cep: '123' })).expect(400);
  });

  it('IDOR: endereço de outra conta responde 404 em ler, editar e apagar (e continua intacto)', async () => {
    const owner = await createCustomer(ctx);
    const intruder = await createCustomer(ctx);
    const mine = await ctx.http.post('/v1/me/addresses').set(bearer(owner.accessToken)).send(base()).expect(201);
    const url = `/v1/me/addresses/${mine.body.id}`;
    await ctx.http.get(url).set(bearer(intruder.accessToken)).expect(404);
    await ctx.http.patch(url).set(bearer(intruder.accessToken)).send({ street: 'Invadida' }).expect(404);
    await ctx.http.delete(url).set(bearer(intruder.accessToken)).expect(404);
    await ctx.http.get(`/v1/me/addresses/${randomUUID()}`).set(bearer(owner.accessToken)).expect(404);
    await ctx.http.get('/v1/me/addresses/nao-e-uuid').set(bearer(owner.accessToken)).expect(404);
    expect((await ctx.http.get(url).set(bearer(owner.accessToken)).expect(200)).body.street).toBe('Rua das Flores');
    expect((await ctx.http.get('/v1/me/addresses').set(bearer(intruder.accessToken)).expect(200)).body.data).toEqual([]);
  });

  it('coluna `location` (geography) é gerada a partir de lat/lng e fica no índice GiST', async () => {
    const user = await createCustomer(ctx);
    const a = await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send(base({ lat: -23.28, lng: -46.74 })).expect(201);
    const { rows } = await ctx.pool.query<{ lng: number; lat: number }>('select ST_X(location::geometry) as lng, ST_Y(location::geometry) as lat from user_addresses where id = $1', [a.body.id]);
    expect(rows[0]).toEqual({ lng: -46.74, lat: -23.28 });
    const idx = await ctx.pool.query("select 1 from pg_indexes where indexname = 'user_addresses_location_gist'");
    expect(idx.rowCount).toBe(1);
  });
});
