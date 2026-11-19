import { randomUUID } from 'node:crypto';
import { inArray } from 'drizzle-orm';
import { ALERT_AREAS, ALERT_KINDS, ALERT_SEVERITIES, alertKindInfo, canSeeAlertKind } from '../src/modules/admin/index.js';
import { PaymentsService } from '../src/modules/payments/index.js';
import { paymentAlerts } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';

type Profile = 'super_admin' | 'finance' | 'operations' | 'support';
const PROFILES: Profile[] = ['super_admin', 'finance', 'operations', 'support'];

/**
 * Bug "GET /v1/admin/alerts?status=open devolve 500" (capturas finais): a causa foi o banco de dev sem as migrações 0053/0054 (a lista seleciona
 * `resolved_by` e `resolution_note`), não a regra do filtro. Este teste fixa o contrato da lista com um alerta de CADA tipo do catálogo (um deles
 * encerrado), em TODOS os perfis e para TODOS os filtros (status, gravidade, área, tipo e combinações), na consulta exata que o painel faz
 * (`status=open&limit=20`). O resultado esperado vem do catálogo, não de lista escrita à mão.
 */
describe('Alertas do admin: todos os filtros em todos os perfis', () => {
  let ctx: TestContext;
  const admins = {} as Record<Profile, Awaited<ReturnType<typeof createAdmin>>>;
  const marker = randomUUID();
  const kinds = [...Object.keys(ALERT_KINDS), 'tipo_novo_sem_cadastro'];
  const resolvedKinds = new Set(['delivery_ready', 'privacy_request_due', 'tipo_novo_sem_cadastro', 'conciliation_mismatch']);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    const payments = ctx.app.get(PaymentsService);
    for (const profile of PROFILES) admins[profile] = await createAdmin(ctx, profile);
    for (const kind of kinds) await payments.raiseAlert(null, kind, { marker, orderId: randomUUID() });
    // Encerra alguns à mão no banco (o fluxo de resolver tem teste próprio em b3-admin-alerts).
    await ctx.db.update(paymentAlerts).set({ resolvedAt: new Date(), resolutionNote: 'encerrado pelo teste' }).where(inArray(paymentAlerts.kind, [...resolvedKinds]));
  });
  afterAll(() => ctx.close());

  /** Percorre todas as páginas (limit 20, como o painel) e devolve só os tipos criados por este teste. */
  async function collect(profile: Profile, query: string): Promise<string[]> {
    const found: string[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < 100; page += 1) {
      const res: { status: number; body: { data: { kind: string; status: string; severity: string; area: string; details: { marker?: string } }[]; nextCursor: string | null } } = await ctx.http
        .get(`/v1/admin/alerts?${query}${query ? '&' : ''}limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
        .set(bearer(admins[profile].accessToken));
      expect(res.status, `${profile} ?${query}`).toBe(200);
      found.push(...res.body.data.filter((a) => a.details.marker === marker).map((a) => a.kind));
      cursor = res.body.nextCursor;
      if (!cursor) break;
    }
    return found.sort();
  }

  /** O que o catálogo diz que o perfil deve ver com o filtro. */
  const expected = (profile: Profile, f: { status?: 'open' | 'resolved' | 'all'; severity?: string; area?: string; kind?: string }): string[] =>
    kinds
      .filter((kind) => canSeeAlertKind(profile, kind))
      .filter((kind) => {
        const info = alertKindInfo(kind);
        const status = f.status ?? 'open';
        return (
          (status === 'all' || (status === 'resolved') === resolvedKinds.has(kind)) &&
          (!f.severity || info.severity === f.severity) &&
          (!f.area || info.area === f.area) &&
          (!f.kind || kind === f.kind)
        );
      })
      .sort();

  const qs = (f: Record<string, string | undefined>) => Object.entries(f).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join('&');

  it('a consulta exata do painel (status=open) e o padrão sem filtro respondem 200 em todos os perfis, sem os encerrados', async () => {
    for (const profile of PROFILES) {
      expect(await collect(profile, 'status=open'), profile).toEqual(expected(profile, { status: 'open' }));
      expect(await collect(profile, ''), profile).toEqual(expected(profile, { status: 'open' })); // padrão = abertos
      expect(await collect(profile, 'status=open'), profile).not.toContain('delivery_ready');
    }
  });

  it('status: resolved e all', async () => {
    for (const profile of PROFILES) {
      for (const status of ['resolved', 'all'] as const) expect(await collect(profile, `status=${status}`), `${profile} ${status}`).toEqual(expected(profile, { status }));
    }
  });

  it('gravidade e área, cada valor, nos 3 estados', async () => {
    for (const profile of PROFILES) {
      for (const status of ['open', 'resolved', 'all'] as const) {
        for (const severity of ALERT_SEVERITIES) expect(await collect(profile, qs({ status, severity })), `${profile} ${status} ${severity}`).toEqual(expected(profile, { status, severity }));
        for (const area of ALERT_AREAS) expect(await collect(profile, qs({ status, area })), `${profile} ${status} ${area}`).toEqual(expected(profile, { status, area }));
      }
    }
  });

  it('tipo: cada tipo do catálogo (e o desconhecido) por perfil; combinações de gravidade + área + tipo', async () => {
    for (const profile of PROFILES) {
      for (const kind of kinds) {
        for (const status of ['open', 'all'] as const) expect(await collect(profile, qs({ status, kind })), `${profile} ${status} ${kind}`).toEqual(expected(profile, { status, kind }));
      }
      for (const severity of ALERT_SEVERITIES) {
        for (const area of ALERT_AREAS) expect(await collect(profile, qs({ status: 'open', severity, area })), `${profile} ${severity} ${area}`).toEqual(expected(profile, { status: 'open', severity, area }));
      }
    }
  });

  it('valores inválidos são 400 (não 500) e o tipo não cadastrado ainda é 200 vazio', async () => {
    const get = (query: string) => ctx.http.get(`/v1/admin/alerts?${query}`).set(bearer(admins.super_admin.accessToken));
    for (const bad of ['status=talvez', 'severity=grave', 'area=nada', 'kind=Tipo-Invalido', 'kind=ab', 'limit=abcde', 'cursor=lixo', 'status=open&status=all']) expect((await get(bad)).status, bad).toBe(400);
    expect((await get('kind=tipo_que_nao_existe')).body).toEqual({ data: [], nextCursor: null });
  });
});
