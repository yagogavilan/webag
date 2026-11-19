import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { restoreFees } from './helpers/fees.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';

/** BUG-022 (RN-02): validação cruzada dos parâmetros do ETA; valor que zeraria o alcance da plataforma é recusado, com a prévia do alcance. */
describe('Parâmetros do ETA: validação cruzada (BUG-022)', () => {
  let ctx: TestContext;
  let superAdmin: Awaited<ReturnType<typeof createAdmin>>;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
    await restoreFees(ctx);
  });
  afterAll(async () => {
    await restoreFees(ctx);
    await ctx.close();
  });
  const put = (key: string, value: unknown) => ctx.http.put(`/v1/admin/parameters/${key}`).set(bearer(superAdmin.accessToken)).send({ value, reason: 'teste da validação cruzada' });

  it('entrega_max_min = 40 com preparo 20 + despacho 15 + folga 15 é recusado (era o desligamento da entrega inteira) e mostra o alcance', async () => {
    const res = await put('entrega_max_min', 40).expect(422);
    expect(res.body.code).toBe('PARAMETER_OUT_OF_RANGE');
    expect(res.body.detail).toMatch(/pelo menos 55 min/);
    expect(res.body.detail).toMatch(/alcança até 0,0 km/);
    expect(res.body.reachKm).toBe(0);
    expect(((await ctx.http.get('/v1/admin/parameters').set(bearer(superAdmin.accessToken)).expect(200)).body.data ?? []).find((p: { key: string; value: number }) => p.key === 'entrega_max_min').value).toBe(120);
  });

  it('o limite exato vale: preparo + despacho + 5 + folga = 55 min é o piso, e a folga de 15 min pede teto de 60 (1/4)', async () => {
    await put('entrega_max_min', 54).expect(422); // piso da regra 1
    await put('entrega_max_min', 59).expect(422); // 15 > 59 / 4
    const ok = await put('entrega_max_min', 60).expect(200);
    expect(ok.body.value, JSON.stringify(ok.body)).toBe(60);
    const tooMuch = await put('entrega_despacho_min', 21).expect(422); // 60 - 15 < 20 + 21 + 5
    expect(tooMuch.body.detail).toMatch(/preparo \(20\) \+ despacho \(21\)/);
    expect(tooMuch.body.detail).toMatch(/alcança até/);
    await put('entrega_despacho_min', 20).expect(200);
    await put('entrega_max_min', 120).expect(200);
    await put('entrega_despacho_min', 15).expect(200);
  });

  it('a folga não passa de 1/4 do teto; reset que violaria a regra também é recusado', async () => {
    await put('entrega_faixa_min', 31).expect(422); // 120 / 4 = 30
    await put('entrega_faixa_min', 30).expect(200);
    await put('entrega_max_min', 100).expect(422); // folga 30 > 100 / 4
    await put('entrega_max_min', 120).expect(200);
    await put('entrega_faixa_min', 15).expect(200);
    await put('entrega_max_min', 70).expect(200);
    await put('entrega_preparo_padrao_min', 51).expect(422); // 70 - 15 < 51 + 15 + 5
    const reset = await ctx.http.post('/v1/admin/parameters/entrega_max_min/reset').set(bearer(superAdmin.accessToken)).send({ reason: 'voltar ao padrão' });
    expect(reset.status).toBe(200); // o padrão (120) sempre cabe com os demais no padrão
  });
});
