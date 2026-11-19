import { eq } from 'drizzle-orm';
import { storeMembers, storeSettings } from '../src/platform/database/schema.js';
import { restoreFees, useFeeTable, useParam } from './helpers/fees.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createMerchant, ensureLegalDocs, insertStoreRow, registerUser, type TestMerchant } from './helpers/fixtures.js';

/** Configuração da loja (WB-055 a WB-059, §2.6 e §2.7 do plano da Onda 2): horários, feriados, pausa, entrega (PostGIS), retirada, trocas. */
describe('Loja: horários, feriados, pausa, entrega, retirada e política de trocas', () => {
  let ctx: TestContext;
  let owner: TestMerchant;
  let storeId: string;
  let other: TestMerchant;
  const as = (u: { accessToken: string }) => bearer(u.accessToken);
  const url = (suffix: string, id = storeId) => `/v1/stores/${id}/${suffix}`;
  // Centro de Francisco Morato (a loja); pontos a distâncias conhecidas em linha reta.
  const STORE = { lat: -23.2808, lng: -46.7442 };
  const at = (northMeters: number) => ({ lat: STORE.lat + northMeters / 111_195, lng: STORE.lng });

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    owner = await createMerchant(ctx);
    storeId = (await insertStoreRow(ctx, owner.userId, { status: 'approved', name: 'Loja Configurável', ...STORE })).id;
    other = await createMerchant(ctx);
    await insertStoreRow(ctx, other.userId, { status: 'approved', name: 'Outra' });
  });
  afterAll(async () => {
    await ctx.close();
  });

  const settings = async () => (await ctx.http.get(url('settings')).set(as(owner)).expect(200)).body;

  it('autorização: lojista de outra loja → 404; funcionário sem `settings` → 403; com `orders` também; sem token → 401', async () => {
    await ctx.http.get(url('settings')).set(as(other)).expect(404);
    await ctx.http.put(url('hours')).set(as(other)).send({ days: [] }).expect(404);
    const staff = await registerUser(ctx);
    await ctx.db.insert(storeMembers).values({ storeId, userId: staff.userId, role: 'staff', permissions: ['orders', 'catalog'] });
    await ctx.http.get(url('settings')).set(as(staff)).expect(403);
    await ctx.http.put(url('delivery')).set(as(staff)).send({}).expect(403);
    await ctx.http.get(url('settings')).expect(401);
  });

  describe('horários e feriados (WB-056)', () => {
    it('O2-HOR: dia aberto com 1 ou 2 intervalos e dia fechado; fim posterior ao início; sobreposição e 4º intervalo recusados; 24:00 inválido', async () => {
      const put = (days: unknown) => ctx.http.put(url('hours')).set(as(owner)).send({ days });
      await put([
        { weekday: 1, intervals: [{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }] },
        { weekday: 2, intervals: [{ start: '08:00', end: '23:59' }] },
        { weekday: 0, intervals: [] },
      ]).expect(204);
      const saved = (await settings()).hours as { weekday: number; intervals: { start: string; end: string }[] }[];
      expect(saved.find((d) => d.weekday === 1)?.intervals).toEqual([{ start: '08:00', end: '12:00' }, { start: '14:00', end: '18:00' }]);
      expect(saved.find((d) => d.weekday === 0)?.intervals).toEqual([]);
      for (const bad of [
        [{ weekday: 1, intervals: [{ start: '12:00', end: '08:00' }] }],
        [{ weekday: 1, intervals: [{ start: '08:00', end: '12:00' }, { start: '11:00', end: '13:00' }] }],
        [{ weekday: 1, intervals: [{ start: '08:00', end: '08:00' }] }],
        [{ weekday: 1, intervals: [] }, { weekday: 1, intervals: [] }],
      ]) {
        expect((await put(bad).expect(422)).body.errors.length).toBeGreaterThan(0);
      }
      await put([{ weekday: 1, intervals: [{ start: '08:00', end: '24:00' }] }]).expect(400);
      await put([{ weekday: 1, intervals: [1, 2, 3, 4].map((h) => ({ start: `0${h}:00`, end: `0${h}:30` })) }]).expect(400);
      await put([{ weekday: 7, intervals: [] }]).expect(400);
    });

    it('feriados: grava e substitui a lista; data repetida ou inválida → 400', async () => {
      await ctx.http.put(url('holidays')).set(as(owner)).send({ holidays: [{ date: '2026-12-25', label: 'Natal' }, { date: '2027-01-01' }] }).expect(204);
      expect((await settings()).holidays).toEqual([{ date: '2026-12-25', label: 'Natal' }, { date: '2027-01-01', label: null }]);
      await ctx.http.put(url('holidays')).set(as(owner)).send({ holidays: [{ date: '2026-12-25' }, { date: '2026-12-25' }] }).expect(400);
      await ctx.http.put(url('holidays')).set(as(owner)).send({ holidays: [{ date: '25/12/2026' }] }).expect(400);
      await ctx.http.put(url('holidays')).set(as(owner)).send({ holidays: [] }).expect(204);
      expect((await settings()).holidays).toEqual([]);
    });

    it('pausa: 1 hora vira "fechada" na hora e reabre sozinha (cálculo na leitura); "até eu reabrir" fica até a ação; retomar zera', async () => {
      await ctx.http.post(url('pause')).set(as(owner)).send({ kind: '1h' }).expect(204);
      let s = await settings();
      expect(s.pause.active).toBe(true);
      expect(s.isOpenNow).toBe(false);
      expect(new Date(s.pause.until).getTime() - Date.now()).toBeGreaterThan(59 * 60_000);
      await ctx.db.update(storeSettings).set({ pausedUntil: new Date(Date.now() - 1000) }).where(eq(storeSettings.storeId, storeId));
      expect((await settings()).pause.active).toBe(false); // sem job: só passou o prazo
      await ctx.http.post(url('pause')).set(as(owner)).send({ kind: 'until_resume' }).expect(204);
      s = await settings();
      expect(s.pause).toMatchObject({ active: true, indefinitely: true });
      await ctx.http.delete(url('pause')).set(as(owner)).expect(204);
      expect((await settings()).pause.active).toBe(false);
      await ctx.http.post(url('pause')).set(as(owner)).send({ kind: '5h' }).expect(400);
    });
  });

  describe('entrega (WB-057, RN-04) e retirada (WB-058)', () => {
    // DEC-036: o lojista só escolhe "entrega pela Webag" e o tempo de preparo; taxa, raio, mínimo e grátis são do admin.
    const delivery = (over: Record<string, unknown> = {}) => ({ acceptsDelivery: true, etaMinMinutes: 30, etaMaxMinutes: 50, ...over });
    const preview = (point: { lat: number; lng: number }, subtotalCents: number) => ctx.http.post(url('delivery/preview')).set(as(owner)).send({ ...point, subtotalCents });

    it('regras de validação: tempo máx > mín e sempre sobra entrega ou retirada; os campos antigos de taxa e raio são aceitos e IGNORADOS', async () => {
      const put = (over: Record<string, unknown>) => ctx.http.put(url('delivery')).set(as(owner)).send(delivery(over));
      await put({ etaMinMinutes: 50, etaMaxMinutes: 50 }).expect(422);
      await put({ acceptsDelivery: false }).expect(422); // retirada desligada: sobraria nada
      await put({ acceptsDelivery: 'sim' }).expect(400);
      await put({ radiusKm: 99, feeMode: 'fixed', feeFixedCents: 99_999, tiers: [{ x: 1 }], minOrderCents: 1, freeAboveCents: 1 }).expect(204); // legado ignorado
      const saved = (await settings()).delivery;
      // continuam valendo os valores GLOBAIS do admin (raio máximo, mínimo, grátis), não os enviados
      expect(saved).toMatchObject({ acceptsDelivery: true, etaMinMinutes: 30, etaMaxMinutes: 50, feeManagedBy: 'webag', radiusKm: 15, feeMode: 'by_distance', tiers: [] });
      expect(saved.minOrderCents).not.toBe(1);
      expect(saved.freeAboveCents).not.toBe(1);
    });

    it('O2-ENT: prévia no PostGIS com a MESMA função do checkout e a tabela do admin: faixa [de, até), fora do raio não entrega, grátis acima de X, abaixo do mínimo', async () => {
      await useParam(ctx, 'raio_max_km', 5);
      await useParam(ctx, 'pedido_minimo_cents', 3000);
      await useParam(ctx, 'frete_gratis_acima_cents', 10_000);
      await useFeeTable(ctx, [{ fromM: 0, toM: 2_000, feeCents: 500 }, { fromM: 2_000, toM: 5_000, feeCents: 900 }]);
      await ctx.http.put(url('delivery')).set(as(owner)).send(delivery()).expect(204);
      const near = await preview(at(1000), 5000).expect(200);
      expect(near.body).toMatchObject({ available: true, feeCents: 500, freeShipping: false, belowMinimum: false });
      expect(near.body.distanceM).toBeGreaterThan(990);
      expect(near.body.distanceM).toBeLessThan(1010);
      expect((await preview(at(3000), 5000).expect(200)).body.feeCents).toBe(900);
      expect((await preview(at(1990), 5000).expect(200)).body.feeCents).toBe(500);
      expect((await preview(at(2010), 5000).expect(200)).body.feeCents).toBe(900);
      expect((await preview(at(4990), 5000).expect(200)).body).toMatchObject({ available: true, feeCents: 900 });
      const out = await preview(at(5200), 5000).expect(200);
      expect(out.body).toMatchObject({ available: false, feeCents: null });
      const free = await preview(at(3000), 10_000).expect(200);
      expect(free.body).toMatchObject({ feeCents: 0, freeShipping: true });
      expect((await preview(at(1000), 2000).expect(200)).body.belowMinimum).toBe(true);
      // CEP de Francisco Morato (geocodificador fake) também funciona; sem endereço → 422
      expect((await ctx.http.post(url('delivery/preview')).set(as(owner)).send({ cep: '07900-100', subtotalCents: 5000 }).expect(200)).body).toHaveProperty('available');
      await ctx.http.post(url('delivery/preview')).set(as(owner)).send({ subtotalCents: 5000 }).expect(422);
      await restoreFees(ctx);
    });

    it('entrega desligada pelo lojista: a prévia diz que não entrega, mesmo com a tabela do admin', async () => {
      await ctx.http.put(url('pickup')).set(as(owner)).send({ enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20 }).expect(204);
      await ctx.http.put(url('delivery')).set(as(owner)).send(delivery({ acceptsDelivery: false })).expect(204);
      expect((await preview(at(1000), 5000).expect(200)).body).toMatchObject({ available: false, feeCents: null });
      await ctx.http.put(url('delivery')).set(as(owner)).send(delivery()).expect(204);
    });

    it('retirada: tempo de preparo máx > mín; endereço próprio exige o endereço; desligar a retirada só com a entrega ativa; a flag `retirada` manda', async () => {
      const put = (over: Record<string, unknown>) => ctx.http.put(url('pickup')).set(as(owner)).send({ enabled: true, useStoreAddress: true, prepMinMinutes: 10, prepMaxMinutes: 20, ...over });
      await put({ prepMinMinutes: 20, prepMaxMinutes: 20 }).expect(422);
      await put({ useStoreAddress: false }).expect(422);
      await put({ instructions: 'x'.repeat(201) }).expect(400);
      await put({ useStoreAddress: false, address: 'Rua do Balcão, 10', instructions: 'Tocar a campainha' }).expect(204);
      expect((await settings()).pickup).toMatchObject({ enabled: true, useStoreAddress: false, address: 'Rua do Balcão, 10' });
      await put({ enabled: false }).expect(204); // a entrega segue ativa
      await ctx.http.put(url('delivery')).set(as(owner)).send(delivery({ acceptsDelivery: false })).expect(422); // agora é a entrega que não pode sumir sozinha
    });
  });

  describe('política de trocas e estoque baixo (WB-059, WB-064)', () => {
    it('O2-TRC: só a troca voluntária é configurável, dentro do mínimo e máximo do admin; o piso legal não é campo (400); a taxa de coleta é do admin (campo antigo ignorado); a versão sobe só quando algo muda', async () => {
      const put = (body: Record<string, unknown>) => ctx.http.put(url('exchange-policy')).set(as(owner)).send(body);
      await put({ voluntaryDays: 7, withdrawalDays: 0 }).expect(400);
      await put({ voluntaryDays: 7, defectDays: 5 }).expect(400);
      await put({ voluntaryDays: 91 }).expect(400);
      expect((await put({ voluntaryDays: 31 })).status).toBe(422); // acima do máximo do admin (30)
      expect((await put({ voluntaryDays: 2 })).status).toBe(422); // abaixo do mínimo do admin (3)
      const before = (await settings()).exchangePolicy;
      expect(before.legalFloor).toEqual({ withdrawalDays: 7, defectDays: 30 });
      await put({ voluntaryDays: 7, collectionFeeCents: 1000 }).expect(204); // campo antigo: aceito e ignorado
      const v1 = (await settings()).exchangePolicy;
      expect(v1).toMatchObject({ voluntaryDays: 7, collectionFeeCents: 0, version: before.version + 1 });
      await put({ voluntaryDays: 7 }).expect(204);
      expect((await settings()).exchangePolicy.version).toBe(v1.version); // nada mudou: mesma versão
      await put({ voluntaryDays: 0 }).expect(204);
      expect((await settings()).exchangePolicy).toMatchObject({ voluntaryDays: 0, collectionFeeCents: 0 });
    });

    it('limite de estoque baixo da loja: 0 a 100 ou nulo (volta ao padrão); 101 → 400', async () => {
      await ctx.http.put(url('low-stock')).set(as(owner)).send({ threshold: 101 }).expect(400);
      await ctx.http.put(url('low-stock')).set(as(owner)).send({ threshold: 8 }).expect(204);
      expect((await settings()).lowStockThreshold).toBe(8);
      await ctx.http.put(url('low-stock')).set(as(owner)).send({ threshold: null }).expect(204);
      expect((await settings()).lowStockThreshold).toBe(3);
    });
  });

  it('loja suspensa não altera a configuração nem força visibilidade (409/403)', async () => {
    const m = await createMerchant(ctx);
    const sid = (await insertStoreRow(ctx, m.userId, { status: 'suspended', name: 'Suspensa', ...STORE })).id;
    const res = await ctx.http.put(url('hours', sid)).set(as(m)).send({ days: [] });
    expect([403, 409]).toContain(res.status);
  });
});
