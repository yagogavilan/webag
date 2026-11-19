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

  it('o limite exato vale: piso 55 min (regra 1), folga de 15 min pede teto de 60 (1/4) e o alcance mínimo de 3 km (DEC-064e) pede 74', async () => {
    await put('entrega_max_min', 54).expect(422); // regra 1
    await put('entrega_max_min', 59).expect(422); // 15 > 59 / 4
    const short = await put('entrega_max_min', 60).expect(422); // cabe nas regras 1 e 2, mas alcança só 1,28 km
    expect(short.body.code).toBe('PARAMETER_OUT_OF_RANGE');
    expect(short.body.detail).toMatch(/alcança só 1,2 km \(mínimo 3 km\)/);
    expect(short.body.reachKm).toBeLessThan(3);
    const edge = await put('entrega_max_min', 73).expect(422); // 2,94 km
    expect(edge.body.detail).toMatch(/alcança só 2,9 km/);
    expect((await put('entrega_max_min', 74).expect(200)).body.value).toBe(74); // 3,07 km
    const tooMuch = await put('entrega_despacho_min', 55).expect(422); // regra 1: 74 - 15 < 20 + 55 + 5
    expect(tooMuch.body.detail).toMatch(/preparo \(20\) \+ despacho \(55\)/);
    const noReach = await put('entrega_despacho_min', 20).expect(422); // a regra 1 passa (59 >= 45) e o alcance cai a 2,4 km
    expect(noReach.body.detail).toMatch(/alcança só 2,4 km \(mínimo 3 km\)/);
    await put('entrega_max_min', 120).expect(200);
    await put('entrega_despacho_min', 20).expect(200); // com o teto de 120 o alcance é de 6,4 km
    await put('entrega_despacho_min', 15).expect(200);
  });

  it('minutos por km e fator de rota também contam para o alcance (com teto 120: 17 min/km alcança 3,1 km, 18 não)', async () => {
    const slow = await put('entrega_min_por_km', 18).expect(422);
    expect(slow.body.detail).toMatch(/alcança só 2,9 km \(mínimo 3 km\)/);
    await put('entrega_min_por_km', 17).expect(200);
    await put('entrega_min_por_km', 6).expect(200);
    await put('entrega_rota_fator_pct', 250).expect(200); // 4,6 km
    await put('entrega_rota_fator_pct', 130).expect(200);
  });

  it('a folga não passa de 1/4 do teto; reset que violaria a regra também é recusado', async () => {
    await put('entrega_faixa_min', 31).expect(422); // 120 / 4 = 30
    await put('entrega_faixa_min', 30).expect(200);
    await put('entrega_max_min', 100).expect(422); // folga 30 > 100 / 4
    await put('entrega_max_min', 120).expect(200);
    await put('entrega_faixa_min', 15).expect(200);
    await put('entrega_max_min', 80).expect(200); // 80: 3,8 km
    await put('entrega_preparo_padrao_min', 51).expect(422); // 80 - 15 < 51 + 15 + 5
    const reset = await ctx.http.post('/v1/admin/parameters/entrega_max_min/reset').set(bearer(superAdmin.accessToken)).send({ reason: 'voltar ao padrão' });
    expect(reset.status).toBe(200); // o padrão (120) sempre cabe com os demais no padrão
  });
});
