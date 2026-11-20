import { and, eq } from 'drizzle-orm';
import { adminRecoveryCodes, auditLog, sessions } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, totpAt, uniqueEmail, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, loginWithMfa, registerUser, type TestAdmin } from './helpers/fixtures.js';

/** Pendências de contrato do painel web admin (docs/arquitetura/pendencias-contrato-web-admin.md, itens 2 a 7). */
describe('Admin web: reason, versão em parâmetros, códigos de recuperação, termos, convites pendentes e auditoria', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;
  const sa = () => bearer(superAdmin.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(async () => {
    await ctx.close();
  });

  const lastAudit = async (action: string, targetId: string) => {
    const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.targetId, targetId))).orderBy(auditLog.at, auditLog.id); // BUG-019: sem ordem a "última" linha dependia do heap
    return rows.at(-1);
  };

  it('feature flag e PATCH de admin aceitam `reason` (opcional, mínimo 5) e gravam na auditoria', async () => {
    await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: true, reason: 'abc' }).expect(400);
    await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: true, reason: 'teste de campanha' }).expect(200);
    expect(await lastAudit('feature_flag.set', 'login_social')).toMatchObject({ reason: 'teste de campanha', after: { enabled: true } });
    await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: false }).expect(200); // sem reason continua valendo

    const target = await createAdmin(ctx, 'support');
    await ctx.http.patch(`/v1/admin/admins/${target.userId}`).set(sa()).send({ profile: 'operations', reason: 'mudou de função' }).expect(204);
    expect(await lastAudit('admin.update', target.userId)).toMatchObject({ reason: 'mudou de função' });
  });

  it('parâmetros com `expectedUpdatedAt`: edição concorrente devolve 409 PARAMETER_CONFLICT e não grava', async () => {
    const key = 'otp_validade_min';
    const list = await ctx.http.get('/v1/admin/parameters').set(sa()).expect(200);
    const view = (list.body.data as { key: string; updatedAt: string | null; value: number; min: number; max: number }[]).find((p) => p.key === key);
    expect(view).toBeDefined();
    const first = view!.value === view!.min ? view!.min + 1 : view!.min;
    const second = first === view!.max ? view!.min : first + 1 > view!.max ? view!.min : first + 1;

    // quem viu a versão original grava primeiro; a segunda pessoa (mesma versão antiga) é barrada
    const a = await ctx.http.put(`/v1/admin/parameters/${key}`).set(sa()).send({ value: first, reason: 'pessoa A', expectedUpdatedAt: view!.updatedAt }).expect(200);
    expect(a.body.updatedAt).not.toBe(view!.updatedAt);
    const b = await ctx.http.put(`/v1/admin/parameters/${key}`).set(sa()).send({ value: second, reason: 'pessoa B', expectedUpdatedAt: view!.updatedAt }).expect(409);
    expect(b.body.code).toBe('PARAMETER_CONFLICT');
    const reset = await ctx.http.post(`/v1/admin/parameters/${key}/reset`).set(sa()).send({ reason: 'pessoa C', expectedUpdatedAt: view!.updatedAt }).expect(409);
    expect(reset.body.code).toBe('PARAMETER_CONFLICT');
    const after = await ctx.http.get('/v1/admin/parameters').set(sa()).expect(200);
    expect((after.body.data as { key: string; value: number }[]).find((p) => p.key === key)?.value).toBe(first);

    // com a versão atual funciona; sem o campo (cliente antigo) também
    await ctx.http.put(`/v1/admin/parameters/${key}`).set(sa()).send({ value: second, reason: 'pessoa B de novo', expectedUpdatedAt: a.body.updatedAt }).expect(200);
    await ctx.http.post(`/v1/admin/parameters/${key}/reset`).set(sa()).send({ reason: 'volta ao padrão' }).expect(200);
  });

  it('SEC-092: POST /admin/totp/recovery-codes exige reautenticação, gera 10 códigos novos, invalida os antigos e avisa por e-mail', async () => {
    const admin = await createAdmin(ctx, 'finance', { totp: false });
    const setup = await ctx.http.post('/v1/admin/totp/setup').set(bearer(admin.accessToken)).expect(201);
    const confirm = await ctx.http.post('/v1/admin/totp/confirm').set(bearer(admin.accessToken)).send({ code: totpAt(setup.body.secret) }).expect(200);
    const old = confirm.body.recoveryCodes as string[];

    await ctx.db.update(sessions).set({ reauthAt: new Date(Date.now() - 6 * 60_000) }).where(eq(sessions.userId, admin.userId));
    const denied = await ctx.http.post('/v1/admin/totp/recovery-codes').set(bearer(admin.accessToken)).expect(403);
    expect(denied.body.code).toBe('REAUTH_REQUIRED');
    await ctx.http.post('/v1/auth/reauth').set(bearer(admin.accessToken)).send({ totpCode: totpAt(setup.body.secret, 1) }).expect(204);
    const fresh = await ctx.http.post('/v1/admin/totp/recovery-codes').set(bearer(admin.accessToken)).expect(200);
    expect(fresh.body.recoveryCodes).toHaveLength(10);
    expect(fresh.body.recoveryCodes.some((code: string) => old.includes(code))).toBe(false);
    expect(await ctx.db.select().from(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, admin.userId))).toHaveLength(10);
    expect(ctx.mail.to(admin.email).some((m) => /códigos de recupera/i.test(m.subject))).toBe(true);

    // o código antigo não abre mais; um novo abre (e segue a regra do SEC-113)
    const oldTry = await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: old[0] });
    expect(oldTry.status).toBe(401);
    const newTry = await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: fresh.body.recoveryCodes[0] });
    expect(newTry.status).toBe(200);
    expect(newTry.body.mfaSetupRequired).toBe(true);

    const status = await ctx.http.get('/v1/admin/totp/status').set(bearer(superAdmin.accessToken)).expect(200);
    expect(status.body).toMatchObject({ configured: true, recoveryCodesLow: expect.any(Boolean) });
  });

  it('termos: `changeSummary` na publicação; o histórico traz quem publicou e quantos aceitaram', async () => {
    const created = await ctx.http
      .post('/v1/admin/legal/merchant_terms')
      .set(sa())
      .send({ title: 'Termos do lojista v2', content: 'Texto novo com mais de vinte caracteres.', effectiveAt: new Date(Date.now() - 1000).toISOString(), relevantChange: true, changeSummary: 'Nova taxa de repasse' })
      .expect(201);
    expect(created.body).toMatchObject({ changeSummary: 'Nova taxa de repasse', publishedByName: expect.any(String), acceptances: 0 });
    await ctx.http.post('/v1/admin/legal/merchant_terms').set(sa()).send({ title: 'Termos', content: 'Texto com mais de vinte caracteres.', effectiveAt: new Date().toISOString(), changeSummary: 'ab' }).expect(400);

    await registerUser(ctx); // aceita os termos do cliente vigentes
    const versions = await ctx.http.get('/v1/admin/legal/customer_terms').set(sa()).expect(200);
    const current = (versions.body.data as { acceptances: number; publishedByName: string | null; changeSummary: string | null }[])[0];
    expect(current?.acceptances).toBeGreaterThanOrEqual(1);
    // a rota pública continua sem contagem de aceites
    const pub = await ctx.http.get('/v1/legal/customer_terms').expect(200);
    expect(pub.body.acceptances).toBeNull();
  });

  it('lista de admins traz último acesso e convites pendentes (revogado e usado saem da lista)', async () => {
    const email = uniqueEmail('pendente');
    const invite = await ctx.http.post('/v1/admin/admins').set(sa()).send({ name: 'Pendente Silva', email, profile: 'support' }).expect(201);
    const list = await ctx.http.get('/v1/admin/admins').set(sa()).expect(200);
    const mine = (list.body.data as { userId: string; lastLoginAt: string | null }[]).find((a) => a.userId === superAdmin.userId);
    expect(mine?.lastLoginAt).not.toBeNull();
    const pending = (list.body.pendingInvitations as { id: string; email: string; expired: boolean; reactivation: boolean; invitedByName: string }[]).find((p) => p.id === invite.body.invitationId);
    expect(pending).toMatchObject({ email, expired: false, reactivation: false, invitedByName: superAdmin.email.length > 0 ? expect.any(String) : '' });
    expect(JSON.stringify(list.body)).not.toMatch(/tokenHash|token_hash/);

    await ctx.http.delete(`/v1/admin/admins/invitations/${invite.body.invitationId}`).set(sa()).expect(204);
    const after = await ctx.http.get('/v1/admin/admins').set(sa()).expect(200);
    expect((after.body.pendingInvitations as { id: string }[]).some((p) => p.id === invite.body.invitationId)).toBe(false);
  });

  describe('auditoria: ator, aparelho, CSV e "só as próprias ações"', () => {
    it('cada linha traz o nome do ator e o aparelho; perfil não-super só enxerga as PRÓPRIAS ações (filtro forçado)', async () => {
      const ops = await createAdmin(ctx, 'operations');
      await ctx.http.post('/v1/admin/regions/cities').set(bearer(ops.accessToken)).set('User-Agent', 'Mozilla/5.0 (Windows NT 10.0) Chrome/120.0 Safari/537.36').send({ name: `Cidade ${uniqueTag(6)}` }).expect(201);

      const own = await ctx.http.get('/v1/admin/audit-log').set(bearer(ops.accessToken)).query({ actorId: superAdmin.userId }).expect(200);
      expect(own.body.data.length).toBeGreaterThan(0);
      expect((own.body.data as { actorId: string }[]).every((row) => row.actorId === ops.userId)).toBe(true); // o filtro enviado foi ignorado
      const entry = (own.body.data as { action: string; actorName: string; device: string }[]).find((row) => row.action === 'city.create');
      expect(entry).toMatchObject({ actorName: 'Admin operations', device: 'Chrome em Windows' });
      expect(JSON.stringify(own.body)).not.toContain('Mozilla/5.0'); // user agent cru não sai

      const all = await ctx.http.get('/v1/admin/audit-log').set(sa()).query({ action: 'city.create' }).expect(200);
      expect(all.body.data.length).toBeGreaterThan(0);
    });

    it('exportação CSV respeita os filtros, neutraliza fórmula de planilha e é auditada; não-super exporta só o seu', async () => {
      await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: false, reason: '=HYPERLINK("http://x","clique")' }).expect(200);
      const csv = await ctx.http.get('/v1/admin/audit-log/export').set(sa()).query({ action: 'feature_flag.set' }).expect(200);
      expect(csv.headers['content-type']).toContain('text/csv');
      expect(csv.headers['content-disposition']).toContain('attachment');
      const text = csv.text.replace(new RegExp(`^${String.fromCharCode(0xfeff)}`), '');
      const [header, ...lines] = text.trim().split('\r\n');
      expect(header).toContain('actorName');
      expect(lines.length).toBeGreaterThan(0);
      expect(text).toContain(`"'=HYPERLINK(""http://x"",""clique"")"`); // apóstrofo antes do `=`
      expect(text).not.toMatch(/(^|,)=HYPERLINK/);
      expect(await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'audit.export'))).not.toHaveLength(0);

      const support = await createAdmin(ctx, 'support');
      const mine = await ctx.http.get('/v1/admin/audit-log/export').set(bearer(support.accessToken)).expect(200);
      expect(mine.text).not.toContain('feature_flag.set');
      await ctx.http.get('/v1/admin/audit-log/export').set('X-Forwarded-For', randomIp()).expect(401);
    });
  });
});
