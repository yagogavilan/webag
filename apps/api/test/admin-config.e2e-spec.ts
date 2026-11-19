import { and, eq, sql } from 'drizzle-orm';
import { seedOnda1 } from '../seed/onda1.js';
import { sanitizeForAudit } from '../src/modules/admin/audit.service.js';
import { PARAMETER_DEFINITIONS } from '../src/modules/admin/parameters.definitions.js';
import { auditLog, categories, cities, featureFlags, parameterHistory, parameters } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, uniqueEmail, type TestContext, uniqueTag } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type TestAdmin } from './helpers/fixtures.js';

describe('Admin: regiões, categorias, parâmetros, flags, termos e auditoria (WB-106/117/118/119/120/123)', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;
  let operations: TestAdmin;
  let support: TestAdmin;
  const sa = () => bearer(superAdmin.accessToken);

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
    operations = await createAdmin(ctx, 'operations');
    support = await createAdmin(ctx, 'support');
  });
  afterAll(async () => {
    await ctx.close();
  });

  const auditOf = (action: string, targetId: string) =>
    ctx.db.select().from(auditLog).where(and(eq(auditLog.action, action), eq(auditLog.targetId, targetId)));

  describe('regiões (WB-118)', () => {
    it('operação cria cidade e bairro com auditoria; suporte só lê; inativa some do app público', async () => {
      const name = `Cidade ${uniqueTag(6)}`;
      await ctx.http.post('/v1/admin/regions/cities').set(bearer(support.accessToken)).send({ name }).expect(403);
      const city = await ctx.http.post('/v1/admin/regions/cities').set(bearer(operations.accessToken)).send({ name, active: true }).expect(201);
      await ctx.http.post('/v1/admin/regions/cities').set(bearer(operations.accessToken)).send({ name }).expect(409);

      const hood = await ctx.http.post(`/v1/admin/regions/cities/${city.body.id}/neighborhoods`).set(bearer(operations.accessToken)).send({ name: 'Centro' }).expect(201);
      await ctx.http.post(`/v1/admin/regions/cities/${city.body.id}/neighborhoods`).set(bearer(operations.accessToken)).send({ name: 'CENTRO' }).expect(409);

      const publicList = await ctx.http.get('/v1/regions').expect(200);
      const listed = (publicList.body.data as { id: string; neighborhoods: unknown[] }[]).find((c) => c.id === city.body.id);
      expect(listed?.neighborhoods).toHaveLength(1);

      await ctx.http.patch(`/v1/admin/regions/neighborhoods/${hood.body.id}`).set(bearer(operations.accessToken)).send({ active: false }).expect(200);
      await ctx.http.patch(`/v1/admin/regions/cities/${city.body.id}`).set(bearer(operations.accessToken)).send({ active: false }).expect(200);
      const after = await ctx.http.get('/v1/regions').expect(200);
      expect((after.body.data as { id: string }[]).some((c) => c.id === city.body.id)).toBe(false);
      // o admin ainda enxerga a inativa
      const adminList = await ctx.http.get('/v1/admin/regions/cities').set(bearer(support.accessToken)).expect(200);
      expect((adminList.body.data as { id: string }[]).some((c) => c.id === city.body.id)).toBe(true);

      expect(await auditOf('city.create', city.body.id)).toHaveLength(1);
      const [update] = await auditOf('city.update', city.body.id);
      expect(update).toMatchObject({ actorId: operations.userId, actorRole: 'operations', before: { active: true }, after: { active: false } });
      expect(update?.requestId).toMatch(/^[A-Za-z0-9-]{8,64}$/);
    });
  });

  describe('categorias (WB-106)', () => {
    it('2 níveis, nome único por nível, ícone da biblioteca, nome até 30', async () => {
      const unique = `Cat${Date.now()}`;
      const root = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: unique, icon: 'basket' }).expect(201);
      await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: unique.toLowerCase(), icon: 'basket' }).expect(409);
      const child = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'Filha', icon: 'basket', parentId: root.body.id }).expect(201);
      // mesmo nome em outro pai é permitido
      await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'Filha', icon: 'basket' }).expect(201);
      const deep = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'Neta', icon: 'basket', parentId: child.body.id }).expect(422);
      expect(deep.body.code).toBe('CATEGORY_DEPTH_EXCEEDED');
      await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'Ícone ruim', icon: 'nao-existe' }).expect(422);
      await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'x'.repeat(31), icon: 'basket' }).expect(400);
      await ctx.http.post('/v1/admin/categories').set(bearer(support.accessToken)).send({ name: 'Nao pode', icon: 'basket' }).expect(403);
    });

    it('reordena, inativa (some do app), e só exclui sem vínculos', async () => {
      const a = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: `Ord A ${Date.now()}`, icon: 'tag' }).expect(201);
      const b = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: `Ord B ${Date.now()}`, icon: 'tag' }).expect(201);
      await ctx.http.put('/v1/admin/categories/order').set(bearer(operations.accessToken)).send({ ids: [b.body.id, a.body.id] }).expect(204);
      const rows = await ctx.db.select().from(categories).where(sql`${categories.id} in (${a.body.id}, ${b.body.id})`);
      expect(rows.find((r) => r.id === b.body.id)?.position).toBe(0);
      expect(rows.find((r) => r.id === a.body.id)?.position).toBe(1);

      const child = await ctx.http.post('/v1/admin/categories').set(bearer(operations.accessToken)).send({ name: 'Sub', icon: 'tag', parentId: a.body.id }).expect(201);
      const blocked = await ctx.http.delete(`/v1/admin/categories/${a.body.id}`).set(bearer(operations.accessToken)).expect(409);
      expect(blocked.body.code).toBe('CATEGORY_IN_USE');

      await ctx.http.patch(`/v1/admin/categories/${a.body.id}`).set(bearer(operations.accessToken)).send({ active: false }).expect(200);
      const pub = await ctx.http.get('/v1/categories').expect(200);
      const ids = JSON.stringify(pub.body);
      expect(ids).not.toContain(a.body.id);
      expect(ids).not.toContain(child.body.id); // subcategoria some junto com a categoria inativa
      expect(ids).toContain(b.body.id);

      await ctx.http.delete(`/v1/admin/categories/${child.body.id}`).set(bearer(operations.accessToken)).expect(204);
      await ctx.http.delete(`/v1/admin/categories/${a.body.id}`).set(bearer(operations.accessToken)).expect(204);
    });
  });

  describe('parâmetros (WB-119)', () => {
    it('lista com valor, padrão, faixa e descrição; só super admin edita', async () => {
      const list = await ctx.http.get('/v1/admin/parameters').set(bearer(operations.accessToken)).expect(200);
      expect(list.body.data).toHaveLength(PARAMETER_DEFINITIONS.length);
      const commission = (list.body.data as Record<string, unknown>[]).find((p) => p.key === 'comissao_padrao_pct');
      expect(commission).toMatchObject({ default: 15, min: 0, max: 30, type: 'decimal' }) // `value` é 10: `createTestApp` fixa 10% para as contas dos testes de dinheiro;
      await ctx.http.get('/v1/admin/parameters').set(bearer(support.accessToken)).expect(403);
      await ctx.http.put('/v1/admin/parameters/pix_expiracao_min').set(bearer(operations.accessToken)).send({ value: 20, reason: 'ajuste de teste' }).expect(403);
    });

    it('valida faixa e motivo, grava histórico e auditoria, restaura o padrão', async () => {
      const put = (value: unknown, reason: string | null = 'ajuste de teste') =>
        ctx.http.put('/v1/admin/parameters/pix_expiracao_min').set(sa()).send({ value, ...(reason ? { reason } : {}) });

      const out = await put(61).expect(422);
      expect(out.body.code).toBe('PARAMETER_OUT_OF_RANGE');
      await put(4).expect(422);
      await put(10.5).expect(422);
      await put('abc').expect(422);
      await put(20, null).expect(400);
      await ctx.http.put('/v1/admin/parameters/nao_existe').set(sa()).send({ value: 1, reason: 'teste de erro' }).expect(404);

      const ok = await put(20, 'campanha de teste').expect(200);
      expect(ok.body).toMatchObject({ key: 'pix_expiracao_min', value: 20, default: 15 });
      const [hist] = await ctx.db.select().from(parameterHistory).where(and(eq(parameterHistory.key, 'pix_expiracao_min'), eq(parameterHistory.newValue, 20)));
      expect(hist).toMatchObject({ oldValue: 15, reason: 'campanha de teste', changedBy: superAdmin.userId });
      const [log] = await auditOf('parameter.update', 'pix_expiracao_min');
      expect(log).toMatchObject({ before: { value: 15 }, after: { value: 20 }, reason: 'campanha de teste' });

      const reset = await ctx.http.post('/v1/admin/parameters/pix_expiracao_min/reset').set(sa()).send({ reason: 'fim da campanha' }).expect(200);
      expect(reset.body.value).toBe(15);
    });

    it('piso legal de troca é fixo, nem o super admin edita (DEC-011/DEC-023)', async () => {
      const res = await ctx.http.put('/v1/admin/parameters/troca_arrependimento_dias').set(sa()).send({ value: 3, reason: 'tentativa indevida' }).expect(422);
      expect(res.body.code).toBe('PARAMETER_LOCKED');
      await ctx.http.put('/v1/admin/parameters/troca_defeito_dias').set(sa()).send({ value: 60, reason: 'tentativa indevida' }).expect(422);
      await ctx.http.post('/v1/admin/parameters/troca_defeito_dias/reset').set(sa()).send({ reason: 'tentativa indevida' }).expect(422);
    });

    it('mudança de parâmetro vale para o servidor na hora (otp_tentativas usado pelos códigos)', async () => {
      await ctx.http.put('/v1/admin/parameters/otp_tentativas').set(sa()).send({ value: 3, reason: 'teste de efeito' }).expect(200);
      try {
        const user = await registerUser(ctx);
        const code = ctx.mail.lastCode(user.email);
        for (let i = 0; i < 3; i++) await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: '000000' }).expect(400);
        await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code }).expect(400);
      } finally {
        await ctx.http.post('/v1/admin/parameters/otp_tentativas/reset').set(sa()).send({ reason: 'fim do teste' }).expect(200);
      }
    });
  });

  describe('feature flags (WB-120)', () => {
    it('super admin liga e desliga; o app lê o mapa público (cache de 60 s); tudo auditado', async () => {
      await ctx.http.put('/v1/admin/feature-flags/login_social').set(bearer(operations.accessToken)).send({ enabled: true }).expect(403);
      await ctx.http.get('/v1/admin/feature-flags').set(bearer(support.accessToken)).expect(200);
      await ctx.http.put('/v1/admin/feature-flags/inexistente').set(sa()).send({ enabled: true }).expect(404);

      await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: true }).expect(200);
      const pub = await ctx.http.get('/v1/config/flags').expect(200);
      expect(pub.headers['cache-control']).toContain('max-age=60');
      expect(pub.body.flags).toMatchObject({ login_social: true, pix: true, cartao: true });
      await ctx.http.put('/v1/admin/feature-flags/login_social').set(sa()).send({ enabled: false }).expect(200);
      expect((await ctx.http.get('/v1/config/flags')).body.flags.login_social).toBe(false);

      const logs = await auditOf('feature_flag.set', 'login_social');
      expect(logs.length).toBeGreaterThanOrEqual(2);
      expect(logs.at(-1)?.after).toEqual({ enabled: false });
      const [row] = await ctx.db.select().from(featureFlags).where(eq(featureFlags.key, 'login_social'));
      expect(row?.enabled).toBe(false);
    });
  });

  describe('termos e privacidade (WB-117, WB-210, WB-211)', () => {
    const publish = (type: string, body: Record<string, unknown>) =>
      ctx.http.post(`/v1/admin/legal/${type}`).set(sa()).send(body);
    const valid = (extra: Record<string, unknown> = {}) => ({
      title: 'Política de Privacidade',
      content: 'Novo texto da política de privacidade em vigor.',
      effectiveAt: new Date(Date.now() - 1000).toISOString(),
      ...extra,
    });

    it('publica nova versão (a anterior fica consultável); texto vazio e sem data não publicam; só super admin', async () => {
      await publish('privacy', valid({ content: '' })).expect(400);
      await publish('privacy', { title: 'x'.repeat(5), content: 'texto longo o bastante para valer' }).expect(400);
      await ctx.http.post('/v1/admin/legal/privacy').set(bearer(operations.accessToken)).send(valid()).expect(403);
      await publish('inexistente', valid()).expect(404);

      const before = (await ctx.http.get('/v1/legal/privacy').expect(200)).body.version as number;
      const v = await publish('privacy', valid()).expect(201);
      expect(v.body.version).toBe(before + 1);
      const current = await ctx.http.get('/v1/legal/privacy').expect(200);
      expect(current.body).toMatchObject({ version: before + 1, type: 'privacy' });
      const versions = await ctx.http.get('/v1/admin/legal/privacy').set(bearer(support.accessToken)).expect(200);
      expect((versions.body.data as { version: number }[]).map((d) => d.version)).toContain(before);

      // versão com vigência futura ainda não é a vigente
      await publish('privacy', valid({ effectiveAt: new Date(Date.now() + 86_400_000).toISOString() })).expect(201);
      expect((await ctx.http.get('/v1/legal/privacy')).body.version).toBe(before + 1);
    });

    it('mudança relevante exige novo aceite (pendingTerms); mudança comum não; aceitar versão antiga → 409', async () => {
      const user = await registerUser(ctx);
      const me = async () => (await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200)).body;
      expect((await me()).pendingTerms).toEqual([]);

      const cur = (await ctx.http.get('/v1/legal/customer_terms')).body.version as number;
      await publish('customer_terms', valid({ title: 'Termos', relevantChange: false })).expect(201);
      expect((await me()).pendingTerms).toEqual([]);

      const relevant = await publish('customer_terms', valid({ title: 'Termos', relevantChange: true })).expect(201);
      const pending = (await me()).pendingTerms as { type: string; version: number; reason: string }[];
      expect(pending).toEqual([expect.objectContaining({ type: 'customer_terms', version: relevant.body.version, reason: 'relevant_change' })]);

      await ctx.http.post('/v1/me/terms/accept').set(bearer(user.accessToken)).send({ acceptedDocuments: [{ type: 'customer_terms', version: cur }] }).expect(409);
      await ctx.http.post('/v1/me/terms/accept').set(bearer(user.accessToken)).send({ acceptedDocuments: [{ type: 'customer_terms', version: relevant.body.version }] }).expect(200);
      expect((await me()).pendingTerms).toEqual([]);
      // quem se cadastra depois da publicação precisa aceitar a versão vigente
      await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp())
        .send({ name: 'Nova', email: uniqueEmail(), phone: '11977776666', password: 'cavalo-bateria-grampo-9', adultDeclaration: true, acceptedDocuments: [{ type: 'customer_terms', version: cur }, { type: 'privacy', version: 1 }] })
        .expect(409);
    });

    it('consentimentos granulares: desmarcados por padrão, concede e revoga com histórico (WB-211)', async () => {
      const user = await registerUser(ctx);
      const state = async () => (await ctx.http.get('/v1/me/consents').set(bearer(user.accessToken)).expect(200)).body.consents;
      expect(await state()).toEqual({ marketing_push: false, marketing_email: false, precise_location: false, waitlist: false });
      await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: true }).expect(200);
      expect((await state()).marketing_push).toBe(true);
      await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: false }).expect(200);
      expect((await state()).marketing_push).toBe(false);
      await ctx.http.put('/v1/me/consents/inventado').set(bearer(user.accessToken)).send({ granted: true }).expect(404);
      await ctx.http.put('/v1/me/consents/waitlist').set(bearer(user.accessToken)).send({ granted: true, extra: 1 }).expect(400);
    });
  });

  describe('auditoria (WB-123, SEC-074)', () => {
    it('super admin lê tudo e filtra por ator e ação; os demais perfis só veem as próprias ações; pagina por cursor', async () => {
      const own = await ctx.http.get('/v1/admin/audit-log').set(bearer(operations.accessToken)).query({ limit: '50' }).expect(200);
      expect((own.body.data as { actorId: string }[]).every((row) => row.actorId === operations.userId)).toBe(true);
      const first = await ctx.http.get('/v1/admin/audit-log').query({ actorId: operations.userId, limit: '1' }).set(sa()).expect(200);
      expect(first.body.data).toHaveLength(1);
      expect(first.body.nextCursor).not.toBeNull();
      const second = await ctx.http.get('/v1/admin/audit-log').query({ actorId: operations.userId, limit: '1', cursor: first.body.nextCursor }).set(sa()).expect(200);
      expect(second.body.data[0].id).toBeLessThan(first.body.data[0].id);
      const byAction = await ctx.http.get('/v1/admin/audit-log').query({ action: 'city.create' }).set(sa()).expect(200);
      expect((byAction.body.data as { action: string }[]).every((r) => r.action === 'city.create')).toBe(true);
      await ctx.http.get('/v1/admin/audit-log').query({ limit: '1000' }).set(sa()).expect(200).then((r) => expect(r.body.data.length).toBeLessThanOrEqual(50));
      await ctx.http.get('/v1/admin/audit-log').query({ cursor: '###' }).set(sa()).expect(400);
      await ctx.http.get('/v1/admin/audit-log').query({ desconhecido: 'x' }).set(sa()).expect(400);
    });

    it('append-only: UPDATE, DELETE e TRUNCATE em audit_log e no histórico de parâmetros falham no banco', async () => {
      await ctx.http.put('/v1/admin/parameters/estoque_baixo_un').set(sa()).send({ value: 4, reason: 'gera linha de histórico' }).expect(200);
      await expect(ctx.pool.query(`UPDATE audit_log SET action = 'x'`)).rejects.toThrow(/append-only/);
      await expect(ctx.pool.query(`DELETE FROM audit_log`)).rejects.toThrow(/append-only/);
      await expect(ctx.pool.query(`TRUNCATE audit_log CASCADE`)).rejects.toThrow(/append-only/);
      await expect(ctx.pool.query(`UPDATE parameter_history SET reason = 'x'`)).rejects.toThrow(/append-only/);
      await expect(ctx.pool.query(`DELETE FROM parameter_history`)).rejects.toThrow(/append-only/);
      await expect(ctx.pool.query(`UPDATE legal_documents SET content = 'x'`)).rejects.toThrow(/append-only/);
      await ctx.http.post('/v1/admin/parameters/estoque_baixo_un/reset').set(sa()).send({ reason: 'volta ao padrão' }).expect(200);
    });

    it('falha fechada: se o log de auditoria não grava, a ação inteira é desfeita (WB-123 C4)', async () => {
      await ctx.pool.query(`
        CREATE OR REPLACE FUNCTION test_fail_audit() RETURNS trigger AS $$
        BEGIN RAISE EXCEPTION 'auditoria indisponível'; END; $$ LANGUAGE plpgsql`);
      await ctx.pool.query(`CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW WHEN (NEW.action = 'parameter.update') EXECUTE FUNCTION test_fail_audit()`);
      try {
        await ctx.http.put('/v1/admin/parameters/avaliacao_min_exibicao').set(sa()).send({ value: 5, reason: 'não deve gravar' }).expect(500);
        const [row] = await ctx.db.select().from(parameters).where(eq(parameters.key, 'avaliacao_min_exibicao'));
        expect(row?.value).not.toBe(5);
        const hist = await ctx.db.select().from(parameterHistory).where(eq(parameterHistory.key, 'avaliacao_min_exibicao'));
        expect(hist).toHaveLength(0);
      } finally {
        await ctx.pool.query('DROP TRIGGER test_fail_audit ON audit_log');
        await ctx.pool.query('DROP FUNCTION test_fail_audit()');
      }
    });

    it('erro interno sai como problem+json sem stack nem detalhe interno', async () => {
      await ctx.pool.query(`CREATE OR REPLACE FUNCTION test_fail_audit() RETURNS trigger AS $$ BEGIN RAISE EXCEPTION 'segredo-interno-123'; END; $$ LANGUAGE plpgsql`);
      await ctx.pool.query(`CREATE TRIGGER test_fail_audit BEFORE INSERT ON audit_log FOR EACH ROW WHEN (NEW.action = 'feature_flag.set') EXECUTE FUNCTION test_fail_audit()`);
      try {
        const res = await ctx.http.put('/v1/admin/feature-flags/pix').set(sa()).send({ enabled: true }).expect(500);
        expect(res.headers['content-type']).toContain('application/problem+json');
        expect(res.body).toMatchObject({ status: 500, code: 'INTERNAL_ERROR' });
        expect(JSON.stringify(res.body)).not.toMatch(/segredo-interno|stack|at /);
      } finally {
        await ctx.pool.query('DROP TRIGGER test_fail_audit ON audit_log');
        await ctx.pool.query('DROP FUNCTION test_fail_audit()');
      }
    });

    it('registra IP e requestId; before/after nunca levam segredos', async () => {
      expect(sanitizeForAudit({ name: 'x', passwordHash: 'abc', nested: { refreshToken: 'y', totpSecret: 'z', ok: 1 } })).toEqual({
        name: 'x',
        passwordHash: '[REDACTED]',
        nested: { refreshToken: '[REDACTED]', totpSecret: '[REDACTED]', ok: 1 },
      });
      const [row] = await ctx.db.select().from(auditLog).where(eq(auditLog.action, 'admin.login')).limit(1);
      expect(row?.ip).toBeTruthy();
    });
  });

  describe('seed (idempotência, plano de execução §1)', () => {
    it('rodar o seed duas vezes não duplica nem sobrescreve o que o admin editou', async () => {
      await ctx.http.put('/v1/admin/parameters/foto_max_produto').set(sa()).send({ value: 6, reason: 'edição antes do seed' }).expect(200);
      const count = async () => ({
        cities: (await ctx.db.select().from(cities)).length,
        categories: (await ctx.db.select().from(categories)).length,
        params: (await ctx.db.select().from(parameters)).length,
      });
      await seedOnda1(ctx.db);
      const first = await count();
      await seedOnda1(ctx.db);
      expect(await count()).toEqual(first);
      const [param] = await ctx.db.select().from(parameters).where(eq(parameters.key, 'foto_max_produto'));
      expect(param?.value).toBe(6);
      const slugs = (await ctx.db.select().from(cities)).map((c) => c.slug);
      expect(slugs).toEqual(expect.arrayContaining(['francisco-morato-sp', 'franco-da-rocha-sp', 'caieiras-sp', 'campo-limpo-paulista-sp']));
      await ctx.http.post('/v1/admin/parameters/foto_max_produto/reset').set(sa()).send({ reason: 'volta ao padrão' }).expect(200);
    });
  });
});
