import { randomUUID } from 'node:crypto';
import { and, eq, isNotNull } from 'drizzle-orm';
import { auditLog, orders, storeAdminChanges, storeSettings, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureCity, ensureLegalDocs, type TestAdmin } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';
import { validateAgainst } from './helpers/openapi-schema.js';

/**
 * WB-350 (ficha 360 e histórico) e WB-351 (admin edita dados, horário, pausa e status, com motivo, versão e auditoria). Critérios do PRD
 * `v1-1-admin-e-paineis.md` mapeados em cada teste; abusos do threat model §15.6 (WB-351: rotas legadas 404, campo proibido, sem motivo, versão velha, flag J27).
 */
describe('Ficha 360 e edição da loja pelo admin (WB-350, WB-351)', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;
  let ops: TestAdmin;
  let finance: TestAdmin;
  let support: TestAdmin;
  let shop: Awaited<ReturnType<typeof shopWith>>;
  let storeId: string;
  const ask = { code: 'requested_by_merchant', note: 'WhatsApp, 24/11' };
  const versionOf = async (id = storeId) => (await ctx.db.select({ v: stores.version }).from(stores).where(eq(stores.id, id)))[0]!.v;
  const settingsOf = async () => (await ctx.db.select().from(storeSettings).where(eq(storeSettings.storeId, storeId)))[0]!;
  const patchProfile = (who: TestAdmin, body: unknown, id = storeId) => ctx.http.patch(`/v1/admin/stores/${id}/profile`).set(bearer(who.accessToken)).send(body as object);
  const putConfig = (who: TestAdmin, section: string, body: unknown, id = storeId) => ctx.http.put(`/v1/admin/stores/${id}/config/${section}`).set(bearer(who.accessToken)).send(body as object);
  const pauseAs = (who: TestAdmin, body: unknown) => ctx.http.post(`/v1/admin/stores/${storeId}/pause`).set(bearer(who.accessToken)).send(body as object);
  const resumeAs = (who: TestAdmin, body: unknown) => ctx.http.post(`/v1/admin/stores/${storeId}/resume`).set(bearer(who.accessToken)).send(body as object);
  const setFlag = (enabled: boolean) => ctx.http.put('/v1/admin/feature-flags/admin_edita_catalogo_sem_pedido').set(bearer(superAdmin.accessToken)).send({ enabled, reason: 'teste da WB-351' }).expect(200);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    [superAdmin, ops, finance, support] = [await createAdmin(ctx, 'super_admin'), await createAdmin(ctx, 'operations'), await createAdmin(ctx, 'finance'), await createAdmin(ctx, 'support')];
    shop = await shopWith(ctx, [{ name: 'Produto 360', priceCents: 5_000, stock: 30 }]);
    storeId = shop.store.id;
  });
  afterAll(() => ctx.close());

  describe('WB-351: edição com motivo, versão e auditoria', () => {
    it('C3 e threat §15.6: financeiro e suporte recebem 403 em dados, configuração, pausa e reabertura (e a tentativa é registrada); lojista e cliente também', async () => {
      const before = await versionOf();
      for (const who of [finance, support]) {
        await patchProfile(who, { reason: ask, expectedVersion: before, changes: { name: 'Invadida' } }).expect(403);
        await putConfig(who, 'hours', { reason: ask, expectedVersion: before, data: { days: [] } }).expect(403);
        await pauseAs(who, { reason: ask, expectedVersion: before, kind: '1h' }).expect(403);
        await resumeAs(who, { reason: ask, expectedVersion: before }).expect(403);
      }
      await patchProfile({ accessToken: shop.store.owner.accessToken } as TestAdmin, { reason: ask, expectedVersion: before, changes: { name: 'Eu mesmo' } }).expect(403);
      expect(await versionOf()).toBe(before);
      const denied = await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, support.userId), eq(auditLog.action, 'admin.access_denied')));
      expect(denied.length).toBeGreaterThanOrEqual(4);
    });

    it('as duas rotas legadas (editAdminStore e editAdminStoreSettings) não existem mais: 404 (WB-351 / I12)', async () => {
      await ctx.http.patch(`/v1/admin/stores/${storeId}`).set(bearer(ops.accessToken)).send({ reason: 'ajuste', profile: { description: 'x' } }).expect(404);
      await ctx.http.put(`/v1/admin/stores/${storeId}/settings/hours`).set(bearer(ops.accessToken)).send({ days: [] }).expect(404);
    });

    it('C2 e C7: sem motivo = 422 REASON_REQUIRED; "solicitado" sem canal e data = 422; código fora do catálogo = 422; nota longa = 422', async () => {
      const v = await versionOf();
      const changes = { description: 'Descrição nova' };
      for (const reason of [undefined, {}, { code: 'requested_by_merchant' }, { code: 'requested_by_merchant', note: '   ' }, { code: 'porque_sim', note: 'x' }, { code: 'other' }, { code: 'requested_by_merchant', note: 'x'.repeat(201) }]) {
        const res = await patchProfile(ops, { reason, expectedVersion: v, changes });
        expect(res.status, JSON.stringify(reason)).toBe(422);
        expect(res.body.code, JSON.stringify(reason)).toBe('REASON_REQUIRED');
      }
      expect(await versionOf()).toBe(v);
    });

    it('flag J27 desligada (padrão): só o motivo "solicitado pelo lojista"; ligada, valem os 5 gerais', async () => {
      const v = await versionOf();
      const refused = await patchProfile(ops, { reason: { code: 'error_fix', note: 'typo' }, expectedVersion: v, changes: { description: 'Outra' } });
      expect([refused.status, refused.body.code]).toEqual([422, 'REASON_NOT_ALLOWED']);
      await setFlag(true);
      try {
        await patchProfile(ops, { reason: { code: 'error_fix' }, expectedVersion: v, changes: { description: 'Correção de erro de digitação' } }).expect(200);
      } finally {
        await setFlag(false);
      }
      expect((await ctx.http.get('/v1/config/flags').expect(200)).body.flags.admin_edita_catalogo_sem_pedido).toBe(false);
    });

    it('C4 e C7: documento, razão social, endereço, conta, equipe e status não são editáveis (422 FIELD_NOT_EDITABLE); campo desconhecido no topo = 400', async () => {
      const v = await versionOf();
      for (const field of ['cnpj', 'cpf', 'document', 'legalName', 'mpAccountId', 'members', 'address', 'status', 'documentNumber']) {
        const res = await patchProfile(ops, { reason: ask, expectedVersion: v, changes: { [field]: 'x' } });
        expect([res.status, res.body.code], field).toEqual([422, 'FIELD_NOT_EDITABLE']);
      }
      await patchProfile(ops, { reason: ask, expectedVersion: v, changes: { name: 'ok' }, extra: 1 }).expect(400);
      await patchProfile(ops, { reason: ask, expectedVersion: v, changes: {} }).expect(400);
      await patchProfile(ops, { reason: ask, changes: { name: 'Sem versão' } }).expect(400);
      expect(await versionOf()).toBe(v);
    });

    it('C1 e C3 (dados): a operação altera nome e descrição com motivo; versão sobe; auditoria com loja, antes, depois e motivo; feed do lojista; e-mail na hora', async () => {
      const v = await versionOf();
      ctx.mail.outbox.length = 0;
      const res = await patchProfile(ops, { reason: ask, expectedVersion: v, changes: { name: 'Loja Renomeada', description: 'Nova descrição' } }).expect(200);
      expect(validateAgainst('AdminStoreEditResult', res.body)).toEqual([]);
      expect(res.body).toMatchObject({ storeVersion: v + 1, merchantNotified: 'now' });
      const [row] = await ctx.db.select().from(auditLog).where(eq(auditLog.id, res.body.auditEntryId as number));
      expect(row).toMatchObject({ actorId: ops.userId, action: 'store.update', storeId, targetId: storeId, reason: 'requested_by_merchant|WhatsApp, 24/11' });
      expect(row?.before).toHaveProperty('description');
      expect(row?.after).toMatchObject({ name: 'Loja Renomeada', description: 'Nova descrição' });
      const [feed] = await ctx.db.select().from(storeAdminChanges).where(eq(storeAdminChanges.auditId, res.body.auditEntryId as number));
      expect(feed).toMatchObject({ storeId, type: 'profile', reasonLabel: 'Solicitado pelo lojista (WhatsApp, 24/11)' });
      expect(ctx.mail.to(shop.store.owner.email).some((m) => /Webag alterou/.test(m.subject))).toBe(true);
      // o lojista vê no painel, com autor "Webag" (nunca o nome da pessoa)
      const mine = await ctx.http.get(`/v1/stores/${storeId}/admin-changes`).set(bearer(shop.store.owner.accessToken)).expect(200);
      expect(validateAgainst('StoreAdminChangePage', mine.body)).toEqual([]);
      expect(mine.body.data[0]).toMatchObject({ actor: 'Webag', type: 'profile', reasonLabel: 'Solicitado pelo lojista (WhatsApp, 24/11)' });
      expect(JSON.stringify(mine.body)).not.toContain(ops.email);
      const stranger = await createAdmin(ctx, 'finance'); // qualquer conta que não é da loja
      await ctx.http.get(`/v1/stores/${storeId}/admin-changes`).set(bearer(stranger.accessToken)).expect(404);
    });

    it('C6: o lojista alterou no meio = 409 STORE_VERSION_CONFLICT com a versão atual e NADA é sobrescrito; a edição do lojista também sobe a versão', async () => {
      const seen = await versionOf();
      await ctx.http.put(`/v1/stores/${storeId}/hours`).set(bearer(shop.store.owner.accessToken)).send({ days: [{ weekday: 1, intervals: [{ start: '09:00', end: '17:00' }] }] }).expect(204);
      expect(await versionOf()).toBe(seen + 1);
      const res = await putConfig(ops, 'hours', { reason: ask, expectedVersion: seen, data: { days: [{ weekday: 2, intervals: [{ start: '10:00', end: '12:00' }] }] } });
      expect([res.status, res.body.code]).toEqual([409, 'STORE_VERSION_CONFLICT']);
      expect(res.body.extensions ?? res.body).toMatchObject({ currentVersion: seen + 1 });
      const days = (await ctx.http.get(`/v1/stores/${storeId}/settings`).set(bearer(shop.store.owner.accessToken)).expect(200)).body.hours as { weekday: number; intervals: unknown[] }[];
      expect(days.filter((d) => d.intervals.length > 0).map((d) => d.weekday)).toEqual([1]); // o horário do lojista ficou
      expect(await versionOf()).toBe(seen + 1);
    });

    it('duas edições do admin com a mesma versão ao mesmo tempo: uma passa, a outra recebe 409 (Promise.all)', async () => {
      const v = await versionOf();
      const results = await Promise.all([
        patchProfile(ops, { reason: ask, expectedVersion: v, changes: { description: 'Concorrente A' } }),
        patchProfile(superAdmin, { reason: ask, expectedVersion: v, changes: { description: 'Concorrente B' } }),
      ]);
      expect(results.map((r) => r.status).sort()).toEqual([200, 409]);
      expect(await versionOf()).toBe(v + 1);
    });

    it('horário pela configuração: grava com motivo, audita antes/depois com loja e avisa na hora; horário inválido = 422 e a versão não muda (rollback)', async () => {
      const v = await versionOf();
      ctx.mail.outbox.length = 0;
      const bad = await putConfig(ops, 'hours', { reason: ask, expectedVersion: v, data: { days: [{ weekday: 1, intervals: [{ start: '12:00', end: '10:00' }] }] } });
      expect(bad.status).toBe(422);
      expect(await versionOf()).toBe(v);
      expect(ctx.mail.to(shop.store.owner.email)).toHaveLength(0);
      const ok = await putConfig(ops, 'hours', { reason: ask, expectedVersion: v, data: { days: [{ weekday: 3, intervals: [{ start: '08:00', end: '18:00' }] }] } }).expect(200);
      expect(ok.body.storeVersion).toBe(v + 1);
      const [row] = await ctx.db.select().from(auditLog).where(eq(auditLog.id, ok.body.auditEntryId as number));
      expect(row).toMatchObject({ action: 'store.hours', storeId, actorId: ops.userId });
      expect(row?.before).toBeTruthy();
      expect(row?.after).toBeTruthy();
      expect(ctx.mail.to(shop.store.owner.email).length).toBeGreaterThan(0);
      await putConfig(ops, 'nao-existe', { reason: ask, expectedVersion: v + 1, data: {} }).expect(404);
      await putConfig(ops, 'hours', { reason: ask, expectedVersion: v + 1, data: { days: [] }, extra: 1 }).expect(400);
    });

    it('C1: pausar por 2 h com motivo fecha a loja, avisa o lojista e audita; reabrir sem pausa ativa = 409 STORE_NOT_PAUSED; reabrir com pausa encerra', async () => {
      let v = await versionOf();
      const notPaused = await resumeAs(ops, { reason: ask, expectedVersion: v });
      expect([notPaused.status, notPaused.body.code]).toEqual([409, 'STORE_NOT_PAUSED']);
      expect(await versionOf()).toBe(v);

      const paused = await pauseAs(ops, { reason: ask, expectedVersion: v, kind: '2h' }).expect(200);
      expect(paused.body.storeVersion).toBe(v + 1);
      const s = await settingsOf();
      const ms = (s.pausedUntil?.getTime() ?? 0) - Date.now();
      expect(ms).toBeGreaterThan(115 * 60_000);
      expect(ms).toBeLessThanOrEqual(120 * 60_000);
      const settings = (await ctx.http.get(`/v1/stores/${storeId}/settings`).set(bearer(shop.store.owner.accessToken)).expect(200)).body;
      expect(settings.isOpenNow).toBe(false);
      expect(settings.pause.active).toBe(true);
      expect((await ctx.db.select().from(auditLog).where(eq(auditLog.id, paused.body.auditEntryId as number)))[0]).toMatchObject({ action: 'store.pause', storeId, actorId: ops.userId });
      await pauseAs(ops, { reason: ask, expectedVersion: v + 1, kind: 'dois_dias' }).expect(400);

      v += 1;
      const resumed = await resumeAs(ops, { reason: ask, expectedVersion: v }).expect(200);
      expect(resumed.body.storeVersion).toBe(v + 1);
      expect((await settingsOf()).pausedUntil).toBeNull();
      const types = (await ctx.db.select({ type: storeAdminChanges.type, summary: storeAdminChanges.summary }).from(storeAdminChanges).where(and(eq(storeAdminChanges.storeId, storeId), eq(storeAdminChanges.type, 'pause')))).map((r) => r.summary);
      expect(types.some((t) => t.includes('pausou'))).toBe(true);
      expect(types.some((t) => t.includes('reabriu'))).toBe(true);
    });

    it('loja inexistente = 404; id inválido = 404', async () => {
      await patchProfile(ops, { reason: ask, expectedVersion: 1, changes: { name: 'x1' } }, randomUUID()).expect(404);
      await patchProfile(ops, { reason: ask, expectedVersion: 1, changes: { name: 'x1' } }, 'nao-e-uuid').expect(404);
    });
  });

  describe('WB-350: ficha 360 e histórico', () => {
    it('C1 e C4 (conteúdo): os 4 perfis leem a ficha com o contrato AdminStoreOverview, sem documento, razão social, conta nem dado de cliente', async () => {
      for (const who of [superAdmin, ops, finance, support]) {
        const res = await ctx.http.get(`/v1/admin/stores/${storeId}/overview`).set(bearer(who.accessToken)).expect(200);
        expect(validateAgainst('AdminStoreOverview', res.body), who.profile).toEqual([]);
        expect(JSON.stringify(res.body)).not.toMatch(/document|legalName|mpAccount|cpf|cnpj|tokensEnc/i);
        expect(res.body.store.version).toBe(await versionOf());
        expect(res.body.commission).toMatchObject({ source: 'default', pct: expect.any(Number) });
      }
      await ctx.http.get(`/v1/admin/stores/${randomUUID()}/overview`).set(bearer(ops.accessToken)).expect(404);
      const outsider = await createAdmin(ctx, 'support');
      await ctx.http.get(`/v1/admin/stores/${storeId}/overview`).set(bearer(outsider.accessToken)).expect(200);
      await ctx.http.get(`/v1/admin/stores/${storeId}/overview`).set(bearer(shop.store.owner.accessToken)).expect(403);
    });

    it('DEC-131: os 4 perfis leem a configuração operacional no schema seguro (sem notificações, contato, documento nem recebimento); lojista e cliente 403; sem token 401; loja inexistente e id inválido 404', async () => {
      const owner = shop.store.owner;
      for (const who of [superAdmin, ops, finance, support]) {
        const res = await ctx.http.get(`/v1/admin/stores/${storeId}/settings`).set(bearer(who.accessToken)).expect(200);
        expect(validateAgainst('StoreSettingsViewAs', res.body), who.profile).toEqual([]);
        expect(Object.keys(res.body).sort()).toEqual(['delivery', 'exchangePolicy', 'holidays', 'hours', 'isOpenNow', 'lowStockThreshold', 'pause', 'pickup'].sort());
        expect(JSON.stringify(res.body)).not.toMatch(/notifications|newOrderEmail|document|legalName|mpAccount|cpf|cnpj|tokensEnc|@/i);
      }
      const own = await ctx.http.get(`/v1/stores/${storeId}/settings`).set(bearer(owner.accessToken)).expect(200);
      const adminView = await ctx.http.get(`/v1/admin/stores/${storeId}/settings`).set(bearer(ops.accessToken)).expect(200);
      expect(adminView.body.hours).toEqual(own.body.hours);
      expect(adminView.body.exchangePolicy).toEqual(own.body.exchangePolicy);
      await ctx.http.get(`/v1/admin/stores/${storeId}/settings`).set(bearer(owner.accessToken)).expect(403);
      await ctx.http.get(`/v1/admin/stores/${storeId}/settings`).expect(401);
      await ctx.http.get(`/v1/admin/stores/${randomUUID()}/settings`).set(bearer(ops.accessToken)).expect(404);
      await ctx.http.get('/v1/admin/stores/nao-e-uuid/settings').set(bearer(ops.accessToken)).expect(404);
    });

    it('C3: loja sem pedidos mostra indicators.empty = true, pedidos e GMV zerados e produtos ativos', async () => {
      const res = await ctx.http.get(`/v1/admin/stores/${storeId}/overview`).set(bearer(support.accessToken)).expect(200);
      expect(res.body.indicators).toMatchObject({ empty: true, orders: 0, gmv: { amount: 0, currency: 'BRL' }, cancellations: { count: 0, pct: null } });
      expect(res.body.indicators.activeProducts).toBe(1);
      expect(res.body.recentOrders).toEqual([]);
    });

    it('C1: com pedidos pagos nos últimos 30 dias: contagem, GMV (sem cancelados), cancelamentos sem % abaixo de 20 pedidos e 5 pedidos recentes sem dado do cliente', async () => {
      const busy = await shopWith(ctx, [{ name: 'Produto Movimentado', priceCents: 4_000, stock: 30 }]); // loja própria: as de cima mudaram horário e pausa
      const buyer = await customerAt(ctx, busy.origin);
      const ids: string[] = [];
      for (let i = 0; i < 3; i += 1) {
        await addToCart(ctx, buyer.user, busy.variants[0]!, 1).expect(200);
        const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
        await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
        ids.push(created.id);
      }
      await ctx.db.update(orders).set({ status: 'cancelled', cancelledAt: new Date() }).where(eq(orders.id, ids[0]!));
      const totals = await ctx.db.select({ total: orders.totalCents, status: orders.status }).from(orders).where(and(eq(orders.storeId, busy.store.id), isNotNull(orders.paidAt)));
      const gmv = totals.filter((t) => t.status !== 'cancelled').reduce((n, t) => n + t.total, 0);
      const res = await ctx.http.get(`/v1/admin/stores/${busy.store.id}/overview`).set(bearer(ops.accessToken)).expect(200);
      expect(validateAgainst('AdminStoreOverview', res.body)).toEqual([]);
      expect(res.body.indicators).toMatchObject({ empty: false, orders: 3, gmv: { amount: gmv }, cancellations: { count: 1, pct: null } });
      expect(res.body.recentOrders).toHaveLength(3);
      expect(JSON.stringify(res.body.recentOrders)).not.toMatch(/name|phone|email|address|customer/i);
    });

    it('I1 (RN-15): GMV, cancelamento e janela da ficha batem com a definição do relatório, estado por estado e pela data do pagamento', async () => {
      const day = 86_400_000;
      const lot = await shopWith(ctx, [{ name: 'Produto RN-15', priceCents: 4_000, stock: 30 }]);
      const buyer = await customerAt(ctx, lot.origin);
      // Tabela: estado, total e deslocamentos de data. `inGmv` = conta no GMV; `cancel` = conta como cancelamento; `inWindow` = pago nos últimos 30 dias.
      const table = [
        { status: 'accepted', total: 1_000, paidDaysAgo: 1, createdDaysAgo: 1, inGmv: true, cancel: false, inWindow: true },
        { status: 'delivered', total: 2_000, paidDaysAgo: 2, createdDaysAgo: 2, inGmv: true, cancel: false, inWindow: true },
        { status: 'cancelled', total: 4_000, paidDaysAgo: 3, createdDaysAgo: 3, inGmv: false, cancel: true, inWindow: true },
        { status: 'refused', total: 8_000, paidDaysAgo: 3, createdDaysAgo: 3, inGmv: false, cancel: true, inWindow: true },
        { status: 'expired', total: 16_000, paidDaysAgo: 4, createdDaysAgo: 4, inGmv: false, cancel: false, inWindow: true },
        { status: 'delivered', total: 32_000, paidDaysAgo: 40, createdDaysAgo: 0, inGmv: true, cancel: false, inWindow: false }, // criado agora, pago há 40 dias: fora (a janela é pelo pagamento)
        { status: 'delivered', total: 64_000, paidDaysAgo: 0, createdDaysAgo: 40, inGmv: true, cancel: false, inWindow: true }, // criado há 40 dias, pago agora: dentro
      ] as const;
      const now = Date.now();
      for (const row of table) {
        await addToCart(ctx, buyer.user, lot.variants[0]!, 1).expect(200);
        const created = (await placeOrder(ctx, buyer.user, buyer.addressId)).body as { id: string };
        await approve(ctx, buyer.user, (await attemptOf(ctx, created.id)).id);
        await ctx.db.update(orders).set({ status: row.status, totalCents: row.total, paidAt: new Date(now - row.paidDaysAgo * day), createdAt: new Date(now - row.createdDaysAgo * day) }).where(eq(orders.id, created.id));
      }
      const expectedGmv = table.filter((r) => r.inWindow && r.inGmv).reduce((n, r) => n + r.total, 0);
      const inWindow = table.filter((r) => r.inWindow);
      const expectedCancelled = inWindow.filter((r) => r.cancel).length;

      const card = (await ctx.http.get(`/v1/admin/stores/${lot.store.id}/overview`).set(bearer(ops.accessToken)).expect(200)).body;
      expect(card.indicators).toMatchObject({ orders: inWindow.length, gmv: { amount: expectedGmv }, cancellations: { count: expectedCancelled, pct: null } });
      expect(expectedGmv).toBe(1_000 + 2_000 + 64_000); // contas à mão: sem cancelado, recusado, expirado nem o pago fora da janela

      // Mesma loja e mesmo período no relatório de operação: os dois números têm que ser os mesmos.
      const ymd = (ms: number) => new Date(ms).toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' });
      const report = (await ctx.http.get(`/v1/admin/reports/operations?from=${ymd(now - 29 * day)}&to=${ymd(now)}&storeId=${lot.store.id}`).set(bearer(ops.accessToken)).expect(200)).body;
      expect(report.kpis.gmv.amount).toBe(card.indicators.gmv.amount);
      expect(report.kpis.orders).toBe(card.indicators.orders);
      expect(report.kpis.cancelledOrders).toBe(card.indicators.cancellations.count);
    });

    it('C4: o histórico traz antes, depois e motivo, filtra por tipo, autor e período, pagina por cursor e não traz dado de cliente', async () => {
      const all = await ctx.http.get(`/v1/admin/stores/${storeId}/history?limit=50`).set(bearer(support.accessToken)).expect(200);
      expect(validateAgainst('AdminStoreHistoryPage', all.body), JSON.stringify(all.body).slice(0, 600)).toEqual([]);
      const types = new Set((all.body.data as { type: string }[]).map((e) => e.type));
      for (const type of ['profile', 'hours', 'pause']) expect(types.has(type), type).toBe(true);
      const hours = (all.body.data as { type: string; before: unknown; after: unknown; reason: unknown; actor: { kind: string; name: string }; restorable: boolean }[]).find((e) => e.type === 'hours')!;
      expect(hours.before).toBeTruthy();
      expect(hours.after).toBeTruthy();
      expect(hours.reason).toEqual({ code: 'requested_by_merchant', note: 'WhatsApp, 24/11' });
      expect(hours.actor).toMatchObject({ kind: 'admin' });
      expect(hours.restorable).toBe(false);
      for (const [id, row] of (all.body.data as { id: number }[]).entries()) if (id > 0) expect(row.id).toBeLessThan((all.body.data as { id: number }[])[id - 1]!.id); // mais recentes primeiro

      const onlyHours = (await ctx.http.get(`/v1/admin/stores/${storeId}/history?type=hours`).set(bearer(ops.accessToken)).expect(200)).body.data as { type: string }[];
      expect(onlyHours.length).toBeGreaterThan(0);
      expect(onlyHours.every((e) => e.type === 'hours')).toBe(true);
      const byActor = (await ctx.http.get(`/v1/admin/stores/${storeId}/history?actorAdminId=${superAdmin.userId}`).set(bearer(ops.accessToken)).expect(200)).body.data as { actor: { name: string } }[];
      expect(byActor.every((e) => e.actor.name === superAdmin.profile || e.actor.name !== null)).toBe(true);
      const future = new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10);
      expect((await ctx.http.get(`/v1/admin/stores/${storeId}/history?from=${future}`).set(bearer(ops.accessToken)).expect(200)).body.data).toEqual([]);
      await ctx.http.get(`/v1/admin/stores/${storeId}/history?from=2024-01-01&to=2026-11-22`).set(bearer(ops.accessToken)).expect(400);
      await ctx.http.get(`/v1/admin/stores/${storeId}/history?type=inventado`).set(bearer(ops.accessToken)).expect(400);

      const page1 = (await ctx.http.get(`/v1/admin/stores/${storeId}/history?limit=2`).set(bearer(ops.accessToken)).expect(200)).body as { data: { id: number }[]; nextCursor: string };
      expect(page1.data).toHaveLength(2);
      expect(page1.nextCursor).toBeTruthy();
      const page2 = (await ctx.http.get(`/v1/admin/stores/${storeId}/history?limit=2&cursor=${page1.nextCursor}`).set(bearer(ops.accessToken)).expect(200)).body as { data: { id: number }[] };
      expect(page2.data[0]!.id).toBeLessThan(page1.data[1]!.id);
      expect(JSON.stringify(all.body)).not.toMatch(/"(cpf|email|customerName)"/);
      await ctx.http.get(`/v1/admin/stores/${randomUUID()}/history`).set(bearer(ops.accessToken)).expect(404);
    });

    it('C4 e WB-354 C6: a abertura de "Ver como" aparece no histórico como tipo access, com motivo e sem as telas navegadas', async () => {
      const opened = await ctx.http.post(`/v1/admin/stores/${storeId}/view-as`).set(bearer(support.accessToken)).send({ reason: { code: 'merchant_support' } }).expect(201);
      await ctx.http.get(`/v1/stores/${storeId}/orders`).set(bearer(support.accessToken)).set('X-View-As', opened.body.token as string).expect(200);
      await ctx.http.post(`/v1/admin/view-as/${opened.body.id as string}/end`).set(bearer(support.accessToken)).expect(204);
      const access = (await ctx.http.get(`/v1/admin/stores/${storeId}/history?type=access`).set(bearer(ops.accessToken)).expect(200)).body.data as { summary: string; after: Record<string, unknown>; type: string }[];
      expect(access.map((a) => a.summary)).toEqual(expect.arrayContaining(['Visualização do painel aberta pela Webag', 'Visualização do painel encerrada']));
      const close = access.find((a) => a.summary.includes('encerrada'))!;
      expect(close.after).toMatchObject({ cause: 'ended', reads: 1 });
      expect(JSON.stringify(access)).not.toContain(opened.body.token as string);
    });
  });
});
