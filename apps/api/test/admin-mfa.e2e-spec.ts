import { and, eq } from 'drizzle-orm';
import { adminProfiles, auditLog, authTickets, invitations, sessions, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, STRONG_PASSWORD, totpAt, uniqueEmail, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, loginAdmin, type TestAdmin } from './helpers/fixtures.js';

describe('Admin: TOTP obrigatório, convites e gestão de admins (SEC-015/016/017, WB-100/101/222)', () => {
  let ctx: TestContext;
  let superAdmin: TestAdmin;

  const tokenFromInviteMail = (email: string): string => {
    const text = ctx.mail.to(email).findLast((m) => /token=/.test(m.text))?.text ?? '';
    const match = /token=([A-Za-z0-9_-]+)/.exec(text);
    if (!match?.[1]) throw new Error('Convite não encontrado no e-mail');
    return match[1];
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('convite e primeiro acesso', () => {
    it('convite de 48 h: aceitar cria o admin SEM acesso até configurar o TOTP; depois exige o código no login', async () => {
      const email = uniqueEmail('novo-admin');
      const invite = await ctx.http.post('/v1/admin/admins').set(bearer(superAdmin.accessToken)).send({ name: 'Novo Admin', email, profile: 'operations' }).expect(201);
      const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, invite.body.invitationId));
      const hoursLeft = ((row?.expiresAt.getTime() ?? 0) - Date.now()) / 3_600_000;
      expect(hoursLeft).toBeGreaterThan(47.9);
      expect(hoursLeft).toBeLessThanOrEqual(48);
      // o banco guarda só o hash do convite
      const token = tokenFromInviteMail(email);
      expect(row?.tokenHash).not.toBe(token);
      expect(ctx.mail.to(email).at(-1)?.text).toContain('48 horas');

      const accepted = await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: STRONG_PASSWORD }).expect(200);
      expect(accepted.body.mfaSetupRequired).toBe(true);
      const pending = bearer(accepted.body.tokens.accessToken);

      // WB-222 C3: sem TOTP só abre a configuração
      const blocked = await ctx.http.get('/v1/admin/regions/cities').set(pending).expect(403);
      expect(blocked.body.code).toBe('MFA_REQUIRED');
      await ctx.http.get('/v1/me').set(pending).expect(403);

      const setup = await ctx.http.post('/v1/admin/totp/setup').set(pending).expect(201);
      expect(setup.body.otpauthUri).toMatch(/^otpauth:\/\/totp\//);
      await ctx.http.post('/v1/admin/totp/confirm').set(pending).send({ code: '000000' }).expect(401);
      const confirm = await ctx.http.post('/v1/admin/totp/confirm').set(pending).send({ code: totpAt(setup.body.secret) }).expect(200);
      expect(confirm.body.recoveryCodes).toHaveLength(10);
      await ctx.http.get('/v1/admin/regions/cities').set(pending).expect(200);
      // reconfigurar um TOTP já ativo não é permitido
      await ctx.http.post('/v1/admin/totp/setup').set(pending).expect(409);

      // login seguinte: senha certa sem código → TOTP_REQUIRED; código errado → mensagem única
      const ip = randomIp();
      const noCode = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: STRONG_PASSWORD }).expect(200);
      expect(noCode.body).toMatchObject({ mfaRequired: true });
      expect(noCode.body.tokens).toBeUndefined();
      const wrong = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: STRONG_PASSWORD, totpCode: '000000' }).expect(401);
      expect(wrong.body.code).toBe('INVALID_CREDENTIALS');
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.profile, 'operations'));
      const ok = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email, password: STRONG_PASSWORD, totpCode: totpAt(setup.body.secret) }).expect(200);
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(ok.body.tokens.accessToken)).expect(200);
    });

    it('SEC-017: convite usado 2 vezes, revogado ou com 49 h → 410; senha fraca → 422', async () => {
      const email = uniqueEmail('convidado');
      const created = await ctx.http.post('/v1/admin/admins').set(bearer(superAdmin.accessToken)).send({ name: 'Convidado', email, profile: 'support' }).expect(201);
      const token = tokenFromInviteMail(email);

      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: '12345678' }).expect(422);
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: STRONG_PASSWORD }).expect(200);
      const twice = await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: STRONG_PASSWORD }).expect(410);
      expect(twice.body.code).toBe('INVITATION_INVALID');

      const revokedEmail = uniqueEmail('revogado');
      const revoked = await ctx.http.post('/v1/admin/admins').set(bearer(superAdmin.accessToken)).send({ name: 'Revogado', email: revokedEmail, profile: 'support' }).expect(201);
      await ctx.http.delete(`/v1/admin/admins/invitations/${revoked.body.invitationId}`).set(bearer(superAdmin.accessToken)).expect(204);
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: tokenFromInviteMail(revokedEmail), password: STRONG_PASSWORD }).expect(410);

      const lateEmail = uniqueEmail('atrasado');
      const late = await ctx.http.post('/v1/admin/admins').set(bearer(superAdmin.accessToken)).send({ name: 'Atrasado', email: lateEmail, profile: 'support' }).expect(201);
      await ctx.db.update(invitations).set({ expiresAt: new Date(Date.now() - 3_600_000) }).where(eq(invitations.id, late.body.invitationId));
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: tokenFromInviteMail(lateEmail), password: STRONG_PASSWORD }).expect(410);

      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: 'x'.repeat(43), password: STRONG_PASSWORD }).expect(410);
      expect(created.body.invitationId).toBeDefined();
    });

    it('só super admin convida (operação → 403) e convite de e-mail já cadastrado → 409', async () => {
      const ops = await createAdmin(ctx, 'operations');
      await ctx.http.post('/v1/admin/admins').set(bearer(ops.accessToken)).send({ name: 'X Y', email: uniqueEmail(), profile: 'support' }).expect(403);
      await ctx.http.post('/v1/admin/admins').set(bearer(superAdmin.accessToken)).send({ name: 'Duplicado', email: ops.email, profile: 'support' }).expect(409);
    });
  });

  describe('login de admin', () => {
    it('admin sem TOTP configurado entra, mas só alcança a configuração (WB-100 C6)', async () => {
      const admin = await createAdmin(ctx, 'finance', { totp: false });
      await ctx.http.get('/v1/admin/parameters').set(bearer(admin.accessToken)).expect(403);
      await ctx.http.post('/v1/admin/totp/setup').set(bearer(admin.accessToken)).expect(201);
    });

    it('SEC-015: TOTP não pode ser reusado no mesmo passo (anti-replay)', async () => {
      const admin = await createAdmin(ctx, 'support');
      const used = totpAt(admin.totpSecret!);
      // o login do helper já gastou o código do passo atual
      const res = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: used }).expect(401);
      expect(res.body.code).toBe('INVALID_CREDENTIALS');
    });

    it('código de recuperação vale uma vez e força reconfigurar o TOTP (WB-222 C5)', async () => {
      const admin = await createAdmin(ctx, 'operations', { totp: false });
      const pending = bearer(admin.accessToken);
      const setup = await ctx.http.post('/v1/admin/totp/setup').set(pending).expect(201);
      const confirm = await ctx.http.post('/v1/admin/totp/confirm').set(pending).send({ code: totpAt(setup.body.secret) }).expect(200);
      const [recovery] = confirm.body.recoveryCodes as string[];

      const login = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: recovery }).expect(200);
      // entrou, mas sem MFA concluído: só a tela de configurar
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(login.body.tokens.accessToken)).expect(403);
      expect(login.body.mfaSetupRequired).toBe(true);
      // o mesmo código não vale de novo
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: recovery }).expect(200).then((r) => {
        expect(r.body.mfaSetupRequired).toBe(true); // TOTP foi zerado: não há mais como usar recuperação antiga
      });
      const [again] = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.userId, admin.userId));
      expect(again?.totpConfirmedAt).toBeNull();
    });

    it('WB-100 C3: 30 min sem atividade expira a sessão do admin', async () => {
      const admin = await createAdmin(ctx, 'operations');
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(200);
      await ctx.db.update(sessions).set({ lastUsedAt: new Date(Date.now() - 31 * 60_000) }).where(eq(sessions.userId, admin.userId));
      const res = await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(401);
      expect(res.body.code).toBe('SESSION_IDLE');
    });

    it('WB-100 C2: 5 falhas do mesmo IP vão à auditoria e não travam o admin em outro IP', async () => {
      const admin = await createAdmin(ctx, 'finance');
      const ip = randomIp();
      for (let i = 0; i < 5; i++) {
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: admin.email, password: 'senha-errada-aqui-1', totpCode: '000000' }).expect(401);
      }
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: admin.email, password: 'senha-errada-aqui-1' }).expect(429);
      const [entry] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.actorId, admin.userId), eq(auditLog.action, 'admin.login_throttled')));
      expect(entry).toBeDefined();
      await loginAdmin(ctx, { email: admin.email, password: admin.password, totpSecret: admin.totpSecret });
    });
  });

  describe('reautenticação por TOTP (SEC-016) e gestão de admins (WB-101)', () => {
    it('ação sensível sem reautenticação recente → 403 REAUTH_REQUIRED; /auth/reauth com TOTP libera por 5 min', async () => {
      const admin = await createAdmin(ctx, 'super_admin');
      const target = await createAdmin(ctx, 'support');
      await ctx.db.update(sessions).set({ reauthAt: new Date(Date.now() - 6 * 60_000) }).where(eq(sessions.userId, admin.userId));

      const denied = await ctx.http.patch(`/v1/admin/admins/${target.userId}`).set(bearer(admin.accessToken)).send({ profile: 'operations' }).expect(403);
      expect(denied.body.code).toBe('REAUTH_REQUIRED');

      await ctx.http.post('/v1/auth/reauth').set(bearer(admin.accessToken)).send({ totpCode: '000000' }).expect(401);
      // o login gastou o passo atual: usa o próximo (a janela aceita ±1)
      await ctx.http.post('/v1/auth/reauth').set(bearer(admin.accessToken)).send({ totpCode: totpAt(admin.totpSecret!, 1) }).expect(204);
      await ctx.http.patch(`/v1/admin/admins/${target.userId}`).set(bearer(admin.accessToken)).send({ profile: 'operations' }).expect(204);
    });

    it('mudar perfil ou desativar vale na hora: as sessões do alvo caem; tudo vai à auditoria', async () => {
      const target = await createAdmin(ctx, 'support');
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(target.accessToken)).expect(200);

      await ctx.http.patch(`/v1/admin/admins/${target.userId}`).set(bearer(superAdmin.accessToken)).send({ active: false }).expect(204);
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(target.accessToken)).expect(401);
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: target.refreshToken }).expect(401);

      const rows = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, target.userId), eq(auditLog.action, 'admin.update')));
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({ actorId: superAdmin.userId, actorRole: 'super_admin', before: { active: true }, after: { active: false } });
    });

    it('WB-101 C3: não deixa remover o último super admin', async () => {
      const solo = await createAdmin(ctx, 'super_admin');
      // deixa só `solo` como super admin ativo neste banco de teste
      const others = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.profile, 'super_admin'));
      for (const other of others.filter((o) => o.userId !== solo.userId)) {
        await ctx.db.update(adminProfiles).set({ active: false }).where(eq(adminProfiles.userId, other.userId));
      }
      const res = await ctx.http.patch(`/v1/admin/admins/${solo.userId}`).set(bearer(solo.accessToken)).send({ active: false }).expect(409);
      expect(res.body.code).toBe('LAST_SUPER_ADMIN');
      await ctx.http.patch(`/v1/admin/admins/${solo.userId}`).set(bearer(solo.accessToken)).send({ profile: 'operations' }).expect(409);
      // restaura o super admin principal para os demais testes
      await ctx.db.update(adminProfiles).set({ active: true }).where(eq(adminProfiles.userId, superAdmin.userId));
    });

    it('SEC-093: super admin redefine o acesso de OUTRO admin (motivo + canal), invalida a senha e manda link de reativação; o próprio não', async () => {
      const target = await createAdmin(ctx, 'finance');
      const body = { reason: 'Perdeu o aparelho; identidade conferida por vídeo', verifiedChannel: 'video_call' };
      await ctx.http.post(`/v1/admin/admins/${superAdmin.userId}/totp/reset`).set(bearer(superAdmin.accessToken)).send(body).expect(403);
      await ctx.http.post(`/v1/admin/admins/${target.userId}/totp/reset`).set(bearer(superAdmin.accessToken)).send({ reason: 'curto', verifiedChannel: 'video_call' }).expect(400);
      await ctx.http.post(`/v1/admin/admins/${target.userId}/totp/reset`).set(bearer(superAdmin.accessToken)).send({ ...body, verifiedChannel: 'chat' }).expect(400);
      await ctx.http.post(`/v1/admin/admins/${target.userId}/totp/reset`).set(bearer(superAdmin.accessToken)).send(body).expect(204);

      const [profile] = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.userId, target.userId));
      expect(profile?.totpConfirmedAt).toBeNull();
      const [user] = await ctx.db.select().from(users).where(eq(users.id, target.userId));
      expect(user?.passwordHash).toBeNull(); // senha invalidada
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(target.accessToken)).expect(401);
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: target.email, password: target.password }).expect(401);
      const [row] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, target.userId), eq(auditLog.action, 'admin.access_reset')));
      expect(row).toMatchObject({ actorId: superAdmin.userId, reason: body.reason, after: { verifiedChannel: 'video_call' } });

      // o link vai só ao e-mail do alvo (o super admin nunca o vê) e reativa com senha nova + TOTP novo
      const token = tokenFromInviteMail(target.email);
      const reactivated = await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: 'senha-nova-reativada-77' }).expect(200);
      expect(reactivated.body.mfaSetupRequired).toBe(true);
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(reactivated.body.tokens.accessToken)).expect(403);
      await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: 'senha-nova-reativada-77' }).expect(410);
    });

    it('SEC-091: 5 erros do 2º fator na conta (de IPs diferentes) põem o passo em espera, mesmo com o código certo', async () => {
      const admin = await createAdmin(ctx, 'operations');
      for (let i = 0; i < 5; i++) {
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: '000000' }).expect(401);
      }
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      const wait = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: totpAt(admin.totpSecret!) }).expect(429);
      expect(wait.body.code).toBe('MFA_RATE_LIMITED');
      expect(Number(wait.headers['retry-after'])).toBeGreaterThan(0);
      // 3 erros avisam o titular por e-mail
      expect(ctx.mail.to(admin.email).some((m) => m.subject.includes('código errou'))).toBe(true);
    });

    it('SEC-091(c): 10 erros em 24 h invalidam a senha, derrubam sessões e alertam titular e super admins', async () => {
      const admin = await createAdmin(ctx, 'finance');
      for (let batch = 0; batch < 2; batch++) {
        for (let i = 0; i < 5; i++) {
          await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: admin.password, totpCode: '000000' }).expect(401);
        }
        await ctx.redis.del(`mfa:15:${admin.userId}`); // simula a passagem dos 15 min
      }
      const [user] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
      expect(user?.passwordHash).toBeNull();
      await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(401);
      expect(ctx.mail.to(admin.email).some((m) => m.subject.includes('segundo fator'))).toBe(true);
      expect(ctx.mail.to(superAdmin.email).some((m) => m.subject.includes('segundo fator'))).toBe(true);
      const [log] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, admin.userId), eq(auditLog.action, 'mfa_bruteforce_suspected')));
      expect(log).toBeDefined();
    });

    it('SEC-095: "esqueci a senha" de admin com TOTP: o código do e-mail vem primeiro e devolve um ticket; a senha só muda com os dois fatores', async () => {
      const admin = await createAdmin(ctx, 'support');
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: admin.email }).expect(202);
      const code = ctx.mail.lastCode(admin.email);
      const newPassword = 'senha-nova-do-admin-88';
      const step1 = await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email: admin.email, code, newPassword }).expect(200);
      expect(step1.body).toMatchObject({ tokens: null, mfaRequired: true, expiresIn: 600 });
      const ticket = step1.body.resetTicket as string;
      const [stored] = await ctx.db.select().from(authTickets).where(eq(authTickets.userId, admin.userId));
      expect(stored?.tokenHash).not.toBe(ticket); // só o hash fica no banco
      // a senha ainda é a antiga
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: newPassword, totpCode: totpAt(admin.totpSecret!) }).expect(401);

      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      const complete = (extra: Record<string, unknown>) =>
        ctx.http.post('/v1/auth/password/reset/complete').set('X-Forwarded-For', randomIp()).send({ resetTicket: ticket, newPassword, ...extra });
      await complete({ totpCode: '000000' }).expect(401);
      const ok = await complete({ totpCode: totpAt(admin.totpSecret!) }).expect(200);
      expect(ok.body.tokens).toBeNull(); // admin nunca ganha sessão pelo reset: precisa do login com TOTP
      await complete({ totpCode: totpAt(admin.totpSecret!, 1) }).expect(401); // ticket de uso único
      await ctx.db.update(adminProfiles).set({ totpLastStep: null }).where(eq(adminProfiles.userId, admin.userId));
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: admin.email, password: newPassword, totpCode: totpAt(admin.totpSecret!) }).expect(200);
      // SEC-095: aviso ao titular e aos outros super admins
      expect(ctx.mail.to(admin.email).some((m) => m.subject.includes('senha do painel'))).toBe(true);
      expect(ctx.mail.to(superAdmin.email).some((m) => m.subject.includes('senha do painel'))).toBe(true);
    });

    it('a lista de admins não vaza hash de senha nem segredo de TOTP', async () => {
      const res = await ctx.http.get('/v1/admin/admins').set(bearer(superAdmin.accessToken)).expect(200);
      expect(JSON.stringify(res.body)).not.toMatch(/passwordHash|totpSecret|argon2/);
      const [row] = await ctx.db.select().from(users).where(eq(users.id, superAdmin.userId));
      expect(row?.passwordHash).toBeDefined();
    });
  });
});
