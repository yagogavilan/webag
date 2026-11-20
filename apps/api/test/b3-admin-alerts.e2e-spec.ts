import { randomUUID } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { PaymentsService } from '../src/modules/payments/index.js';
import { auditLog, paymentAlerts } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** B3 / WB-198 / WB-113 (leitura): caixa de alertas do admin, com RBAC por TIPO, filtros, contagem, resolução com nota e auditoria. */
describe('B3: alertas de operação no admin', () => {
  let ctx: TestContext;
  let payments: PaymentsService;
  const admins = {} as Record<'super_admin' | 'finance' | 'operations' | 'support', Admin>;
  const marker = randomUUID();

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    payments = ctx.app.get(PaymentsService);
    for (const profile of ['super_admin', 'finance', 'operations', 'support'] as const) admins[profile] = await createAdmin(ctx, profile);
  });
  afterAll(() => ctx.close());

  const get = (who: Admin, path: string) => ctx.http.get(`/v1/admin/alerts${path}`).set(bearer(who.accessToken));
  const kindsOf = async (who: Admin, query = '') => ((await get(who, `?limit=50${query}`).expect(200)).body.data as { kind: string; details: { marker?: string } }[]).filter((a) => a.details.marker === marker).map((a) => a.kind);
  async function raise(kind: string, details: Record<string, unknown> = {}) {
    await payments.raiseAlert(null, kind, { marker, ...details });
    const rows = (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, kind))).filter((r) => (r.details as { marker?: string }).marker === marker);
    return rows.sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime()).at(-1)!; // o mais novo deste teste (o jsonb reordena as chaves, então não compara texto)
  }

  let money: Awaited<ReturnType<typeof raise>>;
  let ops: Awaited<ReturnType<typeof raise>>;
  let late: Awaited<ReturnType<typeof raise>>;
  let privacy: Awaited<ReturnType<typeof raise>>;
  let unknown: Awaited<ReturnType<typeof raise>>;
  const orderId = randomUUID();
  const storeId = randomUUID();

  it('cada perfil vê só os tipos do seu público: dinheiro é do financeiro e do super admin; pedidos e logística, da operação e do suporte; LGPD, só do super admin', async () => {
    money = await raise('conciliation_mismatch', { orderId });
    ops = await raise('order_not_received', { orderId, orderNumber: 'WB-TESTE', storeId });
    late = await raise('late_cancel_requested', { orderId });
    privacy = await raise('account_deletion_overdue', { deletionId: randomUUID() });
    unknown = await raise('algo_novo_sem_cadastro');

    expect((await kindsOf(admins.super_admin)).sort()).toEqual(['account_deletion_overdue', 'algo_novo_sem_cadastro', 'conciliation_mismatch', 'late_cancel_requested', 'order_not_received']);
    expect((await kindsOf(admins.finance)).sort()).toEqual(['conciliation_mismatch', 'late_cancel_requested']); // logística é de todos, exceto "não recebi"
    expect((await kindsOf(admins.operations)).sort()).toEqual(['late_cancel_requested', 'order_not_received']);
    expect((await kindsOf(admins.support)).sort()).toEqual(['late_cancel_requested', 'order_not_received']);
    await ctx.http.get('/v1/admin/alerts').expect(401);
  });

  it('o item traz rótulo, gravidade, área, o que fazer, os detalhes e os atalhos; o tipo desconhecido vira "Outro alerta" (só o super admin)', async () => {
    const item = (await get(admins.operations, `/${ops.id}`).expect(200)).body;
    expect(item).toMatchObject({
      id: ops.id,
      kind: 'order_not_received',
      label: 'Cliente diz que não recebeu o pedido',
      area: 'orders',
      severity: 'warning',
      status: 'open',
      resolvedAt: null,
      links: { orderId, storeId, deliveryId: null, exchangeId: null },
    });
    expect(item.hint.length).toBeGreaterThan(20);
    expect(item.details).toMatchObject({ orderNumber: 'WB-TESTE' });
    expect((await get(admins.super_admin, `/${unknown.id}`).expect(200)).body).toMatchObject({ label: 'Outro alerta', area: 'platform', severity: 'info' });
    await get(admins.operations, `/${unknown.id}`).expect(404);
    await get(admins.finance, `/${ops.id}`).expect(404); // tipo que o perfil não vê: não revela que existe
    await get(admins.operations, `/${money.id}`).expect(404);
    await get(admins.operations, `/${randomUUID()}`).expect(404);
    await get(admins.operations, '/nao-e-uuid').expect(404);
  });

  it('filtros por área, gravidade, tipo e situação; o catálogo de tipos do perfil', async () => {
    expect(await kindsOf(admins.super_admin, '&area=privacy')).toEqual(['account_deletion_overdue']);
    expect((await kindsOf(admins.super_admin, '&severity=critical')).sort()).toEqual(['account_deletion_overdue', 'conciliation_mismatch', 'late_cancel_requested']);
    expect(await kindsOf(admins.super_admin, '&kind=order_not_received')).toEqual(['order_not_received']);
    expect(await kindsOf(admins.finance, '&area=orders')).toEqual([]); // a área existe, mas o financeiro não vê o tipo
    await get(admins.super_admin, '?area=inexistente').expect(400);
    await get(admins.super_admin, '?status=talvez').expect(400);
    expect(await kindsOf(admins.super_admin, '&status=resolved')).toEqual([]);

    const kinds = (await get(admins.finance, '/kinds').expect(200)).body.data as { kind: string; label: string; area: string }[];
    expect(kinds.some((k) => k.kind === 'conciliation_mismatch')).toBe(true);
    expect(kinds.some((k) => k.kind === 'order_not_received')).toBe(false);
    expect(kinds.every((k) => k.label.length > 5)).toBe(true);
  });

  it('paginação por cursor: páginas de 1 percorrem todos os alertas do perfil sem repetir', async () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 200; page += 1) {
      const res: { body: { data: { id: string }[]; nextCursor: string | null } } = await get(admins.operations, `?limit=1${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`).expect(200);
      expect(res.body.data.length).toBeLessThanOrEqual(1);
      seen.push(...res.body.data.map((a) => a.id));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    expect(new Set(seen).size).toBe(seen.length);
    expect(seen).toContain(ops.id);
    expect(seen).toContain(late.id);
    expect(seen).not.toContain(money.id);
    await get(admins.operations, '?cursor=lixo').expect(400);
  });

  it('a contagem respeita o perfil e o Início (overview) traz o mesmo número', async () => {
    const summary = (who: Admin) => get(who, '/summary').expect(200).then((r) => r.body as { open: number; bySeverity: Record<string, number>; byArea: Record<string, number>; byKind: { kind: string; count: number }[] });
    const sa = await summary(admins.super_admin);
    const fin = await summary(admins.finance);
    expect(sa.open).toBe(sa.bySeverity.critical! + sa.bySeverity.warning! + sa.bySeverity.info!);
    expect(sa.open).toBe(Object.values(sa.byArea).reduce((n, v) => n + v, 0));
    expect(sa.byKind.find((k) => k.kind === 'account_deletion_overdue')!.count).toBeGreaterThanOrEqual(1);
    expect(fin.byKind.some((k) => k.kind === 'order_not_received')).toBe(false); // o financeiro nem vê o número desse tipo
    expect(fin.open).toBeLessThan(sa.open);
    for (const who of [admins.super_admin, admins.finance, admins.operations, admins.support]) {
      const s = await summary(who);
      const overview = (await ctx.http.get('/v1/admin/overview/pending').set(bearer(who.accessToken)).expect(200)).body as { alerts: { open: number; critical: number } };
      expect(overview.alerts, who.profile).toEqual({ open: s.open, critical: s.bySeverity.critical });
    }
  });

  it('encerrar com nota: só quem vê o tipo e tem a permissão; nota obrigatória; auditado; encerrar de novo é 409; some da lista de abertos', async () => {
    const resolve = (who: Admin, id: string, body: Record<string, unknown> = { note: 'conferido com o provedor, valor correto' }) => ctx.http.post(`/v1/admin/alerts/${id}/resolve`).set(bearer(who.accessToken)).send(body);
    expect((await resolve(admins.finance, money.id, { note: 'ok' })).status).toBe(400); // nota curta
    expect((await resolve(admins.finance, money.id, {})).status).toBe(400);
    expect((await resolve(admins.finance, money.id, { note: 'conferido com o provedor', extra: true })).status).toBe(400);
    expect((await resolve(admins.support, ops.id)).status).toBe(403); // suporte só lê
    expect((await resolve(admins.operations, money.id)).status).toBe(404); // dinheiro não é da operação
    await ctx.http.post(`/v1/admin/alerts/${money.id}/resolve`).send({ note: 'conferido com o provedor' }).expect(401);

    const done = await resolve(admins.finance, money.id).expect(200);
    expect(done.body).toMatchObject({ id: money.id, status: 'resolved', resolvedByName: 'Admin finance', resolutionNote: 'conferido com o provedor, valor correto', resolvedAt: expect.any(String) });
    expect((await resolve(admins.finance, money.id)).status).toBe(409);
    expect((await resolve(admins.finance, money.id)).body.code).toBe('ALERT_ALREADY_RESOLVED');

    expect(await kindsOf(admins.finance)).not.toContain('conciliation_mismatch');
    expect(await kindsOf(admins.finance, '&status=resolved')).toEqual(['conciliation_mismatch']);
    expect((await kindsOf(admins.finance, '&status=all')).sort()).toEqual(['conciliation_mismatch', 'late_cancel_requested']);

    const audit = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, money.id), eq(auditLog.action, 'alert.resolve')));
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ actorId: admins.finance.userId, reason: 'conferido com o provedor, valor correto', before: { kind: 'conciliation_mismatch', open: true }, after: { open: false } });

    // o mesmo problema volta: o sistema abre um alerta NOVO (o encerrado fica no histórico)
    const again = await raise('conciliation_mismatch', { orderId });
    expect(again.id).not.toBe(money.id);
    // operação encerra o que é dela e o super admin, qualquer um
    expect((await resolve(admins.operations, ops.id, { note: 'falei com o cliente, entrega confirmada' })).status).toBe(200);
    expect((await resolve(admins.super_admin, privacy.id, { note: 'exclusão concluída pela CLI' })).status).toBe(200);
  });

  it('a lista antiga /payments/alerts continua valendo, com a mesma permissão de antes', async () => {
    const legacy = await ctx.http.get('/v1/admin/payments/alerts?openOnly=true').set(bearer(admins.finance.accessToken)).expect(200);
    expect(Array.isArray(legacy.body.data)).toBe(true);
    await ctx.http.get('/v1/admin/payments/alerts').set(bearer(admins.operations.accessToken)).expect(403);
  });
});
