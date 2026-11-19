import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { vi } from 'vitest';
import { PushTransport } from '../src/modules/notifications/index.js';
import { PushCampaignsService } from '../src/modules/marketing/push-campaigns.service.js';
import { paymentAlerts, pushCampaignRecipients, pushCampaigns, pushDevices, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createAdmin, createCustomer, ensureCity, fakeCepCityIs, ensureLegalDocs, registerUser, verifyEmailOf, type RegisteredUser, type TestAdmin } from './helpers/fixtures.js';

const sp = (iso: string): Date => new Date(`${iso}-03:00`);
/**
 * SEC-165 (flakiness): o envio só sai dentro da janela de 9h às 20h (Brasília) e o teste anda o relógio em passos de 6 min (retry de 5 min, 3 tentativas).
 * Com a campanha "para agora", rodar o teste entre 19:48 e 20:00 empurrava a 2ª/3ª varredura para fora da janela (adiada em vez de enviada).
 * Agora toda campanha do teste é agendada para MEIO-DIA de amanhã (dentro da janela, sempre no futuro e a menos de 30 dias): o resultado não depende
 * da hora em que o teste roda. As varreduras passam o instante explicitamente (`processDue(at)`), nunca o relógio real.
 */
const tomorrowNoon = (): Date => sp(`${new Date(Date.now() + 86_400_000 - 3 * 3_600_000).toISOString().slice(0, 10)}T12:00:00`);

describe('Push segmentado do admin (WB-197, WB-196)', () => {
  let ctx: TestContext;
  let service: PushCampaignsService;
  let transport: PushTransport;
  let ops: TestAdmin;
  let superAdmin: TestAdmin;
  let cityId: string;
  let cityName: string;
  const tokens = new Map<string, string>();
  const cohort: { consenting: RegisteredUser[]; noConsent: RegisteredUser[]; noDevice: RegisteredUser; revoked: RegisteredUser; blocked: RegisteredUser } = { consenting: [], noConsent: [], noDevice: undefined as never, revoked: undefined as never, blocked: undefined as never };

  async function customerInCity(opts: { consent?: boolean; device?: boolean } = {}): Promise<RegisteredUser> {
    const user = await registerUser(ctx);
    await verifyEmailOf(ctx, user);
    await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua Push', number: String(1 + Math.floor(Math.random() * 900)), neighborhood: 'Centro', city: cityName, state: 'SP' }).expect(201);
    if (opts.consent !== false) await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: true }).expect(200);
    if (opts.device !== false) {
      const token = `ExponentPushToken[${randomUUID()}]`;
      tokens.set(user.userId, token);
      await ctx.db.insert(pushDevices).values({ userId: user.userId, token, platform: 'android' });
    }
    return user;
  }

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    cityName = `Cidade Push ${randomUUID().slice(0, 6)}`;
    cityId = (await ensureCity(ctx, cityName)).id;
    fakeCepCityIs(ctx, cityName);
    transport = ctx.app.get(PushTransport);
    service = ctx.app.get(PushCampaignsService);
    ops = await createAdmin(ctx, 'operations');
    superAdmin = await createAdmin(ctx, 'super_admin');
    for (let i = 0; i < 22; i += 1) cohort.consenting.push(await customerInCity());
    for (let i = 0; i < 3; i += 1) cohort.noConsent.push(await customerInCity({ consent: false }));
    cohort.noDevice = await customerInCity({ device: false });
    cohort.revoked = await customerInCity();
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(cohort.revoked.accessToken)).send({ granted: false }).expect(200);
    cohort.blocked = await customerInCity();
    await ctx.db.update(users).set({ status: 'blocked' }).where(eq(users.id, cohort.blocked.userId));
  }, 120_000);
  afterAll(() => ctx.close());

  const post = (path: string, body: Record<string, unknown>, token = ops.accessToken, key?: string) => {
    const req = ctx.http.post(`/v1/admin/push/${path}`).set(bearer(token));
    return (key ? req.set('Idempotency-Key', key) : req).send(body);
  };
  const setFlag = (enabled: boolean) => ctx.http.put('/v1/admin/feature-flags/push_marketing').set(bearer(superAdmin.accessToken)).send({ enabled }).expect(200);
  const segment = { kind: 'city', cityId: '' };
  const seg = () => ({ ...segment, cityId });
  const campaign = (over: Record<string, unknown> = {}) => ({ title: 'Oferta da semana', body: 'Frete grátis hoje nas lojas perto de você', destination: { type: 'home' }, segment: seg(), expectedRecipients: 22, scheduleAt: tomorrowNoon().toISOString(), ...over });
  const resetCampaigns = async () => {
    await ctx.db.delete(pushCampaigns);
    transport.sent.length = 0;
  };

  it('só super admin e operação; financeiro, suporte e cliente não veem (C6)', async () => {
    await ctx.http.get('/v1/admin/push/campaigns').expect(401);
    for (const profile of ['finance', 'support'] as const) {
      const admin = await createAdmin(ctx, profile);
      await ctx.http.get('/v1/admin/push/campaigns').set(bearer(admin.accessToken)).expect(403);
      await post('estimate', { segment: seg() }, admin.accessToken).expect(403);
    }
    await ctx.http.get('/v1/admin/push/campaigns').set(bearer((await createCustomer(ctx)).accessToken)).expect(403);
    await ctx.http.get('/v1/admin/push/campaigns').set(bearer(ops.accessToken)).expect(200);
  });

  it('estimativa: só entre quem aceitou, tem aparelho e está ativo; abaixo do mínimo a contagem exata não sai', async () => {
    await resetCampaigns();
    const est = (await post('estimate', { segment: seg() }).expect(200)).body;
    expect(est).toMatchObject({ eligible: 22, excludedByCap: 0, belowMinimum: false, minimum: 20, marketingEnabled: true });
    // Cidade pequena: abaixo do mínimo, sem a contagem (proteção contra reidentificação).
    const small = (await ensureCity(ctx, `Cidade Pequena ${randomUUID().slice(0, 6)}`)).id;
    const smallEst = (await post('estimate', { segment: { kind: 'city', cityId: small } }).expect(200)).body;
    expect(smallEst).toMatchObject({ eligible: null, excludedByCap: null, belowMinimum: true, minimum: 20 });
    await post('estimate', { segment: { kind: 'city', cityId: randomUUID() } }).expect(400); // cidade inexistente
    await post('estimate', { segment: { kind: 'inactive', days: 3 } }).expect(400);
    await post('estimate', { segment: { kind: 'city', cityId, extra: 1 } }).expect(400);
    // Mudar o mínimo no admin muda a regra.
    await useParam(ctx, 'push_mkt_min_segmento', 30);
    expect((await post('estimate', { segment: seg() }).expect(200)).body).toMatchObject({ eligible: null, belowMinimum: true, minimum: 30 });
    await useParam(ctx, 'push_mkt_min_segmento', 20);
  });

  it('criar: recusa segmento pequeno e flag desligada; N confirmado precisa bater; Idempotency-Key não duplica', async () => {
    await resetCampaigns();
    const small = (await ensureCity(ctx, `Cidade Pequena ${randomUUID().slice(0, 6)}`)).id;
    expect((await post('campaigns', campaign({ segment: { kind: 'city', cityId: small }, expectedRecipients: 0 }))).body.code).toBe('SEGMENT_TOO_SMALL');
    const changed = await post('campaigns', campaign({ expectedRecipients: 25 })).expect(409);
    expect(changed.body).toMatchObject({ code: 'ESTIMATE_CHANGED', eligible: 22 });
    await post('campaigns', campaign({ title: 'x'.repeat(61) })).expect(400);
    await post('campaigns', campaign({ body: 'x'.repeat(121) })).expect(400);
    await post('campaigns', campaign({ destination: { type: 'store', id: randomUUID() } })).expect(400); // loja inexistente
    await post('campaigns', campaign({ scheduleAt: new Date(Date.now() - 1000).toISOString() })).expect(400);

    await setFlag(false);
    expect((await post('campaigns', campaign()).expect(409)).body.code).toBe('PUSH_MARKETING_DISABLED');
    expect((await post('estimate', { segment: seg() }).expect(200)).body.marketingEnabled).toBe(false);
    await setFlag(true);

    const key = `camp-${randomUUID()}`;
    const first = await post('campaigns', campaign(), ops.accessToken, key).expect(201);
    const again = await post('campaigns', campaign(), ops.accessToken, key).expect(201); // repetição devolve a MESMA campanha
    expect((await post('campaigns', campaign({ title: 'Outro texto' }), ops.accessToken, key)).body.code).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(again.body.id).toBe(first.body.id);
    expect(await ctx.db.select().from(pushCampaigns)).toHaveLength(1);
    expect(first.body).toMatchObject({ status: 'scheduled', estimated: 22, sent: 0, title: 'Oferta da semana' });
  });

  it('envio: só quem consentiu recebe, o público é recalculado na hora (revogou depois de agendar), grava quem recebeu e audita', async () => {
    await resetCampaigns();
    const created = (await post('campaigns', campaign()).expect(201)).body as { id: string; sendAt: string };
    // Alguém revoga entre o agendamento e o envio: não recebe (21 ainda passa do mínimo de 20).
    const late = cohort.consenting[0]!;
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(late.accessToken)).send({ granted: false }).expect(200);
    expect(await service.processDue(new Date(new Date(created.sendAt).getTime() - 60_000))).toEqual({ sent: 0, deferred: 0, cancelled: 0 }); // ainda não venceu

    expect(await service.processDue(new Date(created.sendAt))).toMatchObject({ sent: 1 });
    const receivers = new Set(transport.sent.map((m) => m.to));
    expect(receivers.size).toBe(21);
    for (const user of cohort.consenting.slice(1)) expect(receivers.has(tokens.get(user.userId)!), 'consentiu').toBe(true);
    for (const user of [late, ...cohort.noConsent, cohort.noDevice, cohort.revoked, cohort.blocked]) expect(receivers.has(tokens.get(user.userId) ?? 'sem-token'), `não deve receber: ${user.userId}`).toBe(false);
    expect(transport.sent[0]).toMatchObject({ title: 'Oferta da semana', data: { type: 'campaign', campaignId: created.id, destination: 'home' } });
    const detail = (await ctx.http.get(`/v1/admin/push/campaigns/${created.id}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(detail).toMatchObject({ status: 'sent', sent: 21, delivered: 21, opened: 0, unsubscribed: 0 });
    expect(await ctx.db.select().from(pushCampaignRecipients).where(eq(pushCampaignRecipients.campaignId, created.id))).toHaveLength(21);
    // Reenviar a varredura não reenvia.
    transport.sent.length = 0;
    expect(await service.processDue(new Date(created.sendAt))).toEqual({ sent: 0, deferred: 0, cancelled: 0 });
    expect(transport.sent).toHaveLength(0);
    const audit = (await ctx.http.get('/v1/admin/audit-log?action=push_campaign.created').set(bearer((await createAdmin(ctx, 'super_admin')).accessToken)).expect(200)).body.data as { targetId: string }[];
    expect(audit.some((a) => a.targetId === created.id)).toBe(true);
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(late.accessToken)).send({ granted: true }).expect(200); // devolve para os próximos testes
  });

  it('SEC-165: se a gravação depois do envio falhar, quem já recebeu NÃO recebe de novo; no teto de 3 tentativas a campanha é cancelada com alerta; presa em envio por 30 min também', async () => {
    await resetCampaigns();
    const created = (await post('campaigns', campaign({ title: 'Sem reenvio' })).expect(201)).body as { id: string; sendAt: string };
    const { AuditService } = await import('../src/modules/admin/index.js');
    const spy = vi.spyOn(AuditService.prototype, 'record').mockRejectedValueOnce(new Error('auditoria fora do ar'));
    const at = new Date(created.sendAt);
    try {
      expect(await service.processDue(at)).toEqual({ sent: 0, deferred: 0, cancelled: 0 }); // falhou depois do envio
    } finally {
      spy.mockRestore();
    }
    const firstRound = transport.sent.length;
    expect(firstRound).toBeGreaterThan(0);
    const reachedCount = new Set(transport.sent.map((m) => m.to)).size;
    const [back] = await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, created.id));
    expect(back).toMatchObject({ status: 'scheduled', attempts: 1 });
    expect(await ctx.db.select().from(pushCampaignRecipients).where(eq(pushCampaignRecipients.campaignId, created.id))).toHaveLength(reachedCount);
    // o retry 5 min depois: ninguém recebe de novo e a campanha fecha como enviada, com a contagem real
    expect(await service.processDue(new Date(at.getTime() + 6 * 60_000))).toMatchObject({ sent: 1 });
    expect(transport.sent).toHaveLength(firstRound);
    expect((await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, created.id)))[0]).toMatchObject({ status: 'sent', recipientsCount: reachedCount });

    // teto de 3 tentativas
    await resetCampaigns();
    const loop = (await post('campaigns', campaign({ title: 'Em laço' })).expect(201)).body as { id: string; sendAt: string };
    const boom = vi.spyOn(transport, 'send').mockRejectedValue(new Error('provedor fora'));
    try {
      let when = new Date(loop.sendAt);
      for (let i = 0; i < 3; i += 1) {
        await service.processDue(when);
        when = new Date(when.getTime() + 6 * 60_000);
      }
    } finally {
      boom.mockRestore();
    }
    expect((await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, loop.id)))[0]).toMatchObject({ status: 'cancelled', attempts: 3 });
    expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'push_campaign_failed'))).some((a) => (a.details as { campaignId?: string }).campaignId === loop.id)).toBe(true);

    // presa em `sending` por mais de 30 min: cancelada com alerta, sem reenvio
    await resetCampaigns();
    const stuck = (await post('campaigns', campaign({ title: 'Presa' })).expect(201)).body as { id: string; sendAt: string };
    await ctx.db.update(pushCampaigns).set({ status: 'sending', sendingStartedAt: new Date(Date.now() - 40 * 60_000) }).where(eq(pushCampaigns.id, stuck.id));
    const before = transport.sent.length;
    await service.processDue(new Date(stuck.sendAt));
    expect((await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, stuck.id)))[0]!.status).toBe('cancelled');
    expect(transport.sent).toHaveLength(before);
  });

  it('janela de 9h às 20h: fora dela o envio vai para o próximo início; agendar noite vira 9h do dia seguinte', async () => {
    await resetCampaigns();
    const tomorrowNight = new Date(Date.now() + 86_400_000);
    const day = new Date(tomorrowNight.getTime() - 3 * 3_600_000).toISOString().slice(0, 10);
    const scheduled = (await post('campaigns', campaign({ scheduleAt: sp(`${day}T22:30:00`).toISOString() })).expect(201)).body as { id: string; sendAt: string };
    const nextDay = new Date(sp(`${day}T09:00:00`).getTime() + 86_400_000);
    expect(new Date(scheduled.sendAt).toISOString()).toBe(nextDay.toISOString());
    // A varredura roda às 21h (fora da janela) com a campanha vencida: adia, não envia.
    await ctx.db.update(pushCampaigns).set({ sendAt: sp(`${day}T10:00:00`) }).where(eq(pushCampaigns.id, scheduled.id));
    expect(await service.processDue(sp(`${day}T21:00:00`))).toMatchObject({ sent: 0, deferred: 1 });
    const [row] = await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, scheduled.id));
    expect(row!.status).toBe('scheduled');
    expect(row!.sendAt.toISOString()).toBe(nextDay.toISOString());
    expect(transport.sent).toHaveLength(0);
  });

  it('limite de 2 por semana: depois de 2 campanhas, ninguém do segmento recebe a 3ª; abaixo do mínimo no envio cancela; flag desligada no envio cancela', async () => {
    await resetCampaigns();
    await ctx.db.delete(pushCampaignRecipients);
    for (let n = 1; n <= 2; n += 1) {
      const c = (await post('campaigns', campaign({ title: `Rodada ${n}`, expectedRecipients: 22 })).expect(201)).body as { id: string; sendAt: string };
      expect(await service.processDue(new Date(c.sendAt))).toMatchObject({ sent: 1 });
    }
    const est = (await post('estimate', { segment: seg() }).expect(200)).body;
    expect(est).toMatchObject({ eligible: null, belowMinimum: true }); // todos no teto (a contagem não sai)
    expect((await post('campaigns', campaign({ expectedRecipients: 0 }))).body.code).toBe('SEGMENT_TOO_SMALL');
    // Com o teto maior, voltam a ser elegíveis (parâmetro editável no admin).
    await useParam(ctx, 'push_mkt_max_semana', 3);
    expect((await post('estimate', { segment: seg() }).expect(200)).body).toMatchObject({ eligible: 22, excludedByCap: 0 });
    const third = (await post('campaigns', campaign({ title: 'Rodada 3' })).expect(201)).body as { id: string; sendAt: string };
    // Flag desligada no envio: cancela.
    await setFlag(false);
    transport.sent.length = 0;
    expect(await service.processDue(new Date(third.sendAt))).toMatchObject({ sent: 0, cancelled: 1 });
    expect(transport.sent).toHaveLength(0);
    await setFlag(true);
    expect((await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, third.id)))[0]).toMatchObject({ status: 'cancelled', cancelReason: 'Push de marketing desligado no envio' });
    // Muita gente revoga antes do envio: abaixo do mínimo, cancela.
    const fourth = (await post('campaigns', campaign({ title: 'Rodada 4' })).expect(201)).body as { id: string; sendAt: string };
    for (const user of cohort.consenting.slice(0, 5)) await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: false }).expect(200);
    expect(await service.processDue(new Date(fourth.sendAt))).toMatchObject({ sent: 0, cancelled: 1 });
    expect((await ctx.db.select().from(pushCampaigns).where(eq(pushCampaigns.id, fourth.id)))[0]!.cancelReason).toBe('Segmento abaixo do mínimo no envio');
    await useParam(ctx, 'push_mkt_max_semana', 2);
    for (const user of cohort.consenting.slice(0, 5)) await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: true }).expect(200);
  });

  it('cancelar só enquanto agendada; abertos e descadastros nas métricas; histórico paginado', async () => {
    await resetCampaigns();
    await ctx.db.delete(pushCampaignRecipients);
    const toCancel = (await post('campaigns', campaign()).expect(201)).body as { id: string };
    await post(`campaigns/${toCancel.id}/cancel`, { reason: 'x' }).expect(400);
    expect((await post(`campaigns/${toCancel.id}/cancel`, { reason: 'Erro no texto' }).expect(200)).body).toMatchObject({ status: 'cancelled', cancelReason: 'Erro no texto' });
    expect((await post(`campaigns/${toCancel.id}/cancel`, { reason: 'Erro no texto' })).body.code).toBe('CAMPAIGN_NOT_CANCELLABLE');
    await post(`campaigns/${randomUUID()}/cancel`, { reason: 'Erro no texto' }).expect(404);

    const sent = (await post('campaigns', campaign({ title: 'Para medir' })).expect(201)).body as { id: string; sendAt: string };
    await service.processDue(new Date(sent.sendAt));
    expect((await post(`campaigns/${sent.id}/cancel`, { reason: 'Tarde demais' })).body.code).toBe('CAMPAIGN_NOT_CANCELLABLE');

    const opener = cohort.consenting[10]!;
    await ctx.http.post(`/v1/me/push-campaigns/${sent.id}/opened`).set(bearer(opener.accessToken)).expect(204);
    await ctx.http.post(`/v1/me/push-campaigns/${sent.id}/opened`).set(bearer(opener.accessToken)).expect(204); // idempotente
    await ctx.http.post(`/v1/me/push-campaigns/${sent.id}/opened`).set(bearer(cohort.noConsent[0]!.accessToken)).expect(204); // quem não recebeu: sem efeito
    await ctx.http.post(`/v1/me/push-campaigns/${sent.id}/opened`).expect(401);
    await ctx.db.update(pushCampaignRecipients).set({ sentAt: new Date() }).where(eq(pushCampaignRecipients.campaignId, sent.id)); // o teste simulou o horário do envio
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(cohort.consenting[11]!.accessToken)).send({ granted: false }).expect(200); // descadastro logo após o envio
    const metrics = (await ctx.http.get(`/v1/admin/push/campaigns/${sent.id}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(metrics).toMatchObject({ opened: 1, unsubscribed: 1, sent: 22 });
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(cohort.consenting[11]!.accessToken)).send({ granted: true }).expect(200);

    const page = (await ctx.http.get('/v1/admin/push/campaigns?limit=1').set(bearer(ops.accessToken)).expect(200)).body;
    expect(page.data).toHaveLength(1);
    expect(page.data[0].id).toBe(sent.id); // mais recente primeiro
    const next = (await ctx.http.get(`/v1/admin/push/campaigns?limit=1&cursor=${page.nextCursor}`).set(bearer(ops.accessToken)).expect(200)).body;
    expect(next.data[0].id).toBe(toCancel.id);
    expect((await ctx.http.get('/v1/admin/push/campaigns?status=cancelled').set(bearer(ops.accessToken)).expect(200)).body.data.map((c: { id: string }) => c.id)).toEqual([toCancel.id]);
    await ctx.http.get('/v1/admin/push/campaigns/nao-uuid').set(bearer(ops.accessToken)).expect(404);
  });
});
