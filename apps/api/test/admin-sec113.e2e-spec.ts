import { eq } from 'drizzle-orm';
import { TotpService } from '../src/modules/identity/totp.service.js';
import { adminProfiles, auditLog, sessions, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, totpAt, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, loginWithMfa } from './helpers/fixtures.js';

/** Revisão de segurança da Onda 1: SEC-113 (recuperação não dispensa o 2º fator), SEC-117 (corrida), SEC-118, SEC-124/125. */
describe('SEC-113: reenrolamento, reset e prazo de configuração do admin', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await createAdmin(ctx, 'super_admin'); // alguém para receber os avisos
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** Admin com TOTP ativo e 10 códigos de recuperação (setup + confirm reais). */
  async function adminWithRecovery(profile: 'operations' | 'finance' | 'support' = 'operations') {
    const admin = await createAdmin(ctx, profile, { totp: false });
    const pending = bearer(admin.accessToken);
    const setup = await ctx.http.post('/v1/admin/totp/setup').set(pending).expect(201);
    const confirm = await ctx.http.post('/v1/admin/totp/confirm').set(pending).send({ code: totpAt(setup.body.secret) }).expect(200);
    return { ...admin, secret: setup.body.secret as string, codes: confirm.body.recoveryCodes as string[] };
  }

  const ask = (email: string) => ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email }).expect(202);
  const reset = (body: Record<string, unknown>) => ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send(body);
  const complete = (body: Record<string, unknown>) => ctx.http.post('/v1/auth/password/reset/complete').set('X-Forwarded-For', randomIp()).send(body);

  it('reenrolamento: reset de senha só com o código do e-mail NÃO troca a senha; precisa de código de recuperação restante', async () => {
    const admin = await adminWithRecovery();
    const [first, second] = admin.codes;
    await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: first, ip: randomIp() }).expect(200);

    const newPassword = 'senha-nova-reenrolamento-55';
    await ask(admin.email);
    const step1 = await reset({ email: admin.email, code: ctx.mail.lastCode(admin.email), newPassword }).expect(200);
    expect(step1.body).toMatchObject({ tokens: null, mfaRequired: true });
    const [mid] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    const before = mid?.passwordHash;

    await complete({ resetTicket: step1.body.resetTicket, newPassword, totpCode: first }).expect(401); // já usado
    await complete({ resetTicket: step1.body.resetTicket, newPassword, totpCode: '123456' }).expect(401); // sem segredo: TOTP não vale
    const [still] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    expect(still?.passwordHash).toBe(before);

    await complete({ resetTicket: step1.body.resetTicket, newPassword, totpCode: second }).expect(200);
    const [changed] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    expect(changed?.passwordHash).not.toBe(before);
  });

  it('admin que nunca configurou o TOTP não tem reset por e-mail: pede novo convite', async () => {
    const admin = await createAdmin(ctx, 'finance', { totp: false });
    await ask(admin.email);
    const res = await reset({ email: admin.email, code: ctx.mail.lastCode(admin.email), newPassword: 'senha-nova-sem-totp-66' }).expect(403);
    expect(res.body.code).toBe('ADMIN_INVITE_REQUIRED');
    const [row] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId))).toHaveLength(1);
    await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(200);
    expect(row?.passwordHash).not.toBeNull();
  });

  it('/admin/totp/setup só em sessão aberta por recuperação quando o TOTP foi perdido; sessão comum recebe 403', async () => {
    const admin = await createAdmin(ctx, 'support', { totp: false });
    // sessão pendente (aberta só com a senha, dentro do prazo de 48 h), depois o admin passa a estar em reenrolamento
    await ctx.db.update(adminProfiles).set({ totpReenrollRequiredAt: new Date() }).where(eq(adminProfiles.userId, admin.userId));
    const res = await ctx.http.post('/v1/admin/totp/setup').set(bearer(admin.accessToken)).expect(403);
    expect(res.body.code).toBe('RECOVERY_SESSION_REQUIRED');
    await ctx.http.post('/v1/admin/totp/confirm').set(bearer(admin.accessToken)).send({ code: '000000' }).expect(403);
  });

  it('prazo de 48 h do primeiro enrolamento: vencido, a senha sozinha não abre sessão nem permite configurar', async () => {
    const admin = await createAdmin(ctx, 'operations', { totp: false });
    await ctx.db.update(adminProfiles).set({ totpSetupDeadlineAt: new Date(Date.now() - 3_600_000) }).where(eq(adminProfiles.userId, admin.userId));
    const before = await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId));
    const login = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password }).expect(403);
    expect(login.body.code).toBe('ENROLLMENT_EXPIRED');
    expect(await ctx.db.select().from(sessions).where(eq(sessions.userId, admin.userId))).toHaveLength(before.length);
    // a sessão antiga (de antes do prazo vencer) também não consegue configurar
    const setup = await ctx.http.post('/v1/admin/totp/setup').set(bearer(admin.accessToken)).expect(403);
    expect(setup.body.code).toBe('ENROLLMENT_EXPIRED');
  });

  it('usar código de recuperação grava auditoria sem o código e avisa o titular', async () => {
    const admin = await adminWithRecovery('finance');
    await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: admin.codes[0], ip: randomIp() }).expect(200);
    const rows = await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, admin.userId));
    const used = rows.find((r) => r.action === 'admin.recovery_code_used');
    expect(used).toBeDefined();
    expect(JSON.stringify(rows)).not.toContain(admin.codes[0]!);
    expect(ctx.mail.to(admin.email).some((m) => /recupera/i.test(m.subject))).toBe(true);
  });

  describe('SEC-117: limite do 2º fator e da senha resiste a requisições paralelas', () => {
    it('20 verificações paralelas do 2º fator com código errado: no máximo 5 conferem, o resto leva 429 sem conferir', async () => {
      const admin = await createAdmin(ctx, 'operations');
      const totp = ctx.app.get(TotpService);
      const context = { ip: randomIp(), userAgent: null, requestId: null, deviceId: null, principal: null };
      const results = await Promise.allSettled(Array.from({ length: 20 }, () => totp.verifyWithLimits(admin.userId, '000000', context)));
      const checked = results.filter((r) => r.status === 'fulfilled').length;
      const limited = results.filter((r) => r.status === 'rejected' && (r.reason as { code?: string }).code === 'MFA_RATE_LIMITED').length;
      expect(checked).toBeLessThanOrEqual(5);
      expect(checked + limited).toBe(20);
    });

    it('20 logins paralelos com senha errada do mesmo IP: exatamente 5 conferências', async () => {
      const admin = await createAdmin(ctx, 'support');
      const ip = randomIp();
      const results = await Promise.all(
        Array.from({ length: 20 }, () => ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: admin.email, password: 'senha-errada-aqui-1' })),
      );
      expect(results.filter((r) => r.status === 401)).toHaveLength(5);
      expect(results.filter((r) => r.status === 429)).toHaveLength(15);
    });

    it('acerto devolve a contagem: 4 erros + acerto + 4 erros não travam o passo', async () => {
      const admin = await createAdmin(ctx, 'finance');
      for (let i = 0; i < 4; i++) {
        await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: '000000', ip: randomIp() }).expect(401);
      }
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      await loginWithMfa(ctx, { email: admin.email, password: admin.password, code: totpAt(admin.totpSecret!), ip: randomIp() }).expect(200);
      expect(Number(await ctx.redis.get(`mfa:15:${admin.userId}`))).toBe(4);
    });
  });

  it('SEC-118: 5 TOTP errados na reautenticação encerram a sessão', async () => {
    const admin = await createAdmin(ctx, 'super_admin');
    let last = 0;
    for (let i = 0; i < 5; i++) {
      last = (await ctx.http.post('/v1/auth/reauth').set(bearer(admin.accessToken)).send({ totpCode: '000000' })).status;
    }
    expect(last).toBe(401);
    await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(401);
  });
});
