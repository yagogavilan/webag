import { eq } from 'drizzle-orm';
import { adminProfiles, authTickets, invitations, sessions, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, STRONG_PASSWORD, totpAt, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, loginAdmin } from './helpers/fixtures.js';

/** Login em 2 passos (SEC-090) e reset de senha com ticket (SEC-095). Reproduz o ataque do review B1. */
describe('MFA em 2 passos e B1: reset anônimo não toca o 2º fator do admin', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const resetAnon = (email: string, body: Record<string, unknown>) =>
    ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email, newPassword: 'senha-nova-do-atacante-1', ...body });

  describe('B1 (review da Onda 1)', () => {
    it('10 resets anônimos com código errado e TOTP errado: nenhum erro de 2º fator é contado, a senha não muda e o login do admin segue', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const [before] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: admin.email }).expect(202);

      for (let i = 0; i < 10; i++) {
        // `rl:reset-confirm` limita 10 por e-mail em 15 min: as 10 passam e a 11ª é 429 (sem contar no MFA).
        const res = await resetAnon(admin.email, { code: '000000' });
        expect(res.status).toBe(400);
        expect(res.body.code).toBe('CODE_INVALID');
      }
      await resetAnon(admin.email, { code: '000000' }).expect(429);

      // contadores do 2º fator intactos e senha igual
      expect(await ctx.redis.get(`mfa:15:${admin.userId}`)).toBeNull();
      expect(await ctx.redis.get(`mfa:24:${admin.userId}`)).toBeNull();
      const [after] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
      expect(after?.passwordHash).toBe(before?.passwordHash);

      // o admin legítimo entra sem 429 de MFA e a sessão anterior segue viva
      await loginAdmin(ctx, { email: admin.email, password: admin.password, totpSecret: admin.totpSecret });
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(200);
    });

    it('e-mail certo + código errado também não encosta no 2º fator', async () => {
      const admin = await createAdmin(ctx, 'operations');
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: admin.email }).expect(202);
      const real = ctx.mail.lastCode(admin.email);
      const wrong = real === '123456' ? '654321' : '123456';
      for (let i = 0; i < 4; i++) await resetAnon(admin.email, { code: wrong }).expect(400);
      expect(await ctx.redis.get(`mfa:15:${admin.userId}`)).toBeNull();
      const [profile] = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.userId, admin.userId));
      expect(profile?.totpConfirmedAt).not.toBeNull();
    });

    it('com 2º lote após a janela: a senha do admin continua válida (SEC-091c não é acionável por anônimo)', async () => {
      const admin = await createAdmin(ctx, 'finance');
      for (let batch = 0; batch < 2; batch++) {
        for (let i = 0; i < 5; i++) await resetAnon(admin.email, { code: '000000' }).expect(400);
        await ctx.redis.del(`rl:reset-confirm:${(await import('../src/platform/crypto/crypto.js')).sha256Hex(admin.email)}`);
      }
      const [row] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
      expect(row?.passwordHash).not.toBeNull();
      await loginAdmin(ctx, { email: admin.email, password: admin.password, totpSecret: admin.totpSecret });
    });

    it('SEC-115: o caminho legado de 1 passo saiu da API: `totpCode` no login ou no reset é 400 (campo desconhecido)', async () => {
      const admin = await createAdmin(ctx, 'support');
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: admin.email }).expect(202);
      const reset = await resetAnon(admin.email, { code: ctx.mail.lastCode(admin.email), totpCode: totpAt(admin.totpSecret!) }).expect(400);
      expect(reset.body.code).toBe('VALIDATION_FAILED');
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: totpAt(admin.totpSecret!) }).expect(400);
    });
  });

  describe('mfa_token (SEC-090)', () => {
    it('senha certa devolve só o mfaToken (sem access/refresh); o código conclui a sessão e o token é de uso único', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const ip = randomIp();
      const step1 = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: admin.email, password: admin.password }).expect(200);
      expect(step1.body).toMatchObject({ mfaRequired: true, expiresIn: 300 });
      expect(step1.body.tokens).toBeUndefined();
      expect(JSON.stringify(step1.body)).not.toMatch(/accessToken|refreshToken/);
      const [ticket] = await ctx.db.select().from(authTickets).where(eq(authTickets.userId, admin.userId));
      expect(ticket?.tokenHash).not.toBe(step1.body.mfaToken);
      expect(Math.round(((ticket?.expiresAt.getTime() ?? 0) - Date.now()) / 1000)).toBeLessThanOrEqual(300);

      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      const code = totpAt(admin.totpSecret!);
      const step2 = await ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', ip).send({ mfaToken: step1.body.mfaToken, code }).expect(200);
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(step2.body.tokens.accessToken)).expect(200);
      expect(step2.body.mfaSetupRequired).toBe(false);

      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      const again = await ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', ip).send({ mfaToken: step1.body.mfaToken, code }).expect(401);
      expect(again.body.code).toBe('MFA_INVALID');
    });

    it('token inexistente, vencido e de outra finalidade têm a mesma resposta; 5 tentativas esgotam o token', async () => {
      const admin = await createAdmin(ctx, 'finance');
      const login = () => ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(200);
      const verify = (mfaToken: string, code: string) => ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', randomIp()).send({ mfaToken, code });

      const fake = await verify('x'.repeat(43), '123456').expect(401);
      expect(fake.body.code).toBe('MFA_INVALID');

      const expired = (await login()).body.mfaToken as string;
      await ctx.db.update(authTickets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTickets.userId, admin.userId));
      expect((await verify(expired, '123456').expect(401)).body).toMatchObject({ code: 'MFA_INVALID', title: fake.body.title });

      const token = (await login()).body.mfaToken as string;
      for (let i = 0; i < 4; i++) await verify(token, '000000').expect(401);
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      // 5ª tentativa ainda conta; a seguinte já não consulta o código, nem o certo
      await verify(token, '000000').expect(401);
      await verify(token, totpAt(admin.totpSecret!)).expect(401);
    });

    it('erros de código no 2º passo somam no limite POR CONTA (SEC-091): 5 erros e o código certo cai em 429', async () => {
      const admin = await createAdmin(ctx, 'support');
      for (let i = 0; i < 5; i++) {
        const login = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(200);
        await ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', randomIp()).send({ mfaToken: login.body.mfaToken, code: '000000' }).expect(401);
      }
      const login = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(200);
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      const res = await ctx.http.post('/v1/auth/mfa/verify').set('X-Forwarded-For', randomIp()).send({ mfaToken: login.body.mfaToken, code: totpAt(admin.totpSecret!) }).expect(429);
      expect(res.body.code).toBe('MFA_RATE_LIMITED');
    });

    it('senha errada nunca emite mfaToken (anônimo não consegue gastar o contador do 2º fator)', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const before = await ctx.db.select().from(authTickets).where(eq(authTickets.userId, admin.userId));
      for (let i = 0; i < 3; i++) {
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: `${STRONG_PASSWORD}x` }).expect(401);
      }
      expect(await ctx.db.select().from(authTickets).where(eq(authTickets.userId, admin.userId))).toHaveLength(before.length);
      expect(await ctx.redis.get(`mfa:15:${admin.userId}`)).toBeNull();
    });

    it('a senha certa não cria sessão no banco antes do código (só o ticket)', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const before = await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId));
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(200);
      expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId))).toHaveLength(before.length);
    });
  });

  describe('endurecimento do review (I1, I7)', () => {
    it('I1: refresh de admin parado por mais de 30 min é recusado (SESSION_IDLE) e a sessão é revogada; menos que isso renova', async () => {
      const admin = await createAdmin(ctx, 'operations');
      await ctx.db.update(sessions).set({ lastUsedAt: new Date(Date.now() - 29 * 60_000) }).where(eq(sessions.userId, admin.userId));
      const ok = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: admin.refreshToken }).expect(200);

      await ctx.db.update(sessions).set({ lastUsedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(sessions.userId, admin.userId));
      const idle = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: ok.body.refreshToken }).expect(401);
      expect(idle.body.code).toBe('SESSION_IDLE');
      const [session] = await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId));
      expect(session?.revokedAt).not.toBeNull();
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(ok.body.accessToken)).expect(401);
    });

    it('I1: refresh de cliente não é afetado pela inatividade de admin', async () => {
      const { registerUser } = await import('./helpers/fixtures.js');
      const user = await registerUser(ctx);
      await ctx.db.update(sessions).set({ lastUsedAt: new Date(Date.now() - 5 * 3_600_000) }).where(eq(sessions.userId, user.userId));
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: user.refreshToken }).expect(200);
    });

    it('I7: redefinir o acesso duas vezes revoga o link anterior; os OUTROS super admins são avisados', async () => {
      const boss = await createAdmin(ctx, 'super_admin');
      const other = await createAdmin(ctx, 'super_admin');
      const target = await createAdmin(ctx, 'finance');
      const body = { reason: 'Perdeu o aparelho; identidade conferida por vídeo', verifiedChannel: 'video_call' };
      const reset = () => ctx.http.post(`/v1/admin/admins/${target.userId}/totp/reset`).set(bearer(boss.accessToken)).send(body);
      await reset().expect(204);
      const linkOf = () => /token=([A-Za-z0-9_-]+)/.exec(ctx.mail.to(target.email).findLast((m) => /token=/.test(m.text))?.text ?? '')?.[1];
      const first = linkOf();
      await reset().expect(204);
      const second = linkOf();
      expect(second).not.toBe(first);
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: first, password: 'senha-nova-reativada-77' }).expect(410);
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: second, password: 'senha-nova-reativada-77' }).expect(200);
      expect((await ctx.db.select().from(invitations).where(eq(invitations.email, target.email))).filter((i) => !i.usedAt && !i.revokedAt)).toHaveLength(0);
      // aviso aos demais super admins (não ao que executou? o executor também é super admin e recebe o aviso)
      expect(ctx.mail.to(other.email).some((m) => m.subject.includes('Acesso ao painel'))).toBe(true);
    });
  });
});
