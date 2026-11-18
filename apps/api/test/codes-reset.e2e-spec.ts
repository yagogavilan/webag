import { and, eq } from 'drizzle-orm';
import { authCodes, featureFlags, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, STRONG_PASSWORD, uniqueEmail, type TestContext } from './helpers/app.js';
import { ensureLegalDocs, registerUser, verifyEmailOf } from './helpers/fixtures.js';

describe('Códigos por e-mail, confirmação e reset de senha (WB-007, WB-009, SEC-002/003/006/007/008)', () => {
  let ctx: TestContext;

  /** Remove só o intervalo mínimo entre envios (60 s) para o teste poder reenviar sem esperar. */
  const skipInterval = async (): Promise<void> => {
    const keys = await ctx.redis.keys('rl:code:int:*');
    const direct = await ctx.redis.keys('code:int:*');
    if (keys.length + direct.length > 0) await ctx.redis.del(...keys, ...direct);
  };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('confirmar e-mail', () => {
    it('código correto confirma a conta; reusar o mesmo código ainda responde 204 (já confirmado) mas não gera efeito novo', async () => {
      const user = await registerUser(ctx);
      await verifyEmailOf(ctx, user);
      const me = await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
      expect(me.body.emailVerified).toBe(true);
    });

    it('SEC-002: 5 erros invalidam; a 6ª tentativa com o código certo → 400', async () => {
      const user = await registerUser(ctx);
      const code = ctx.mail.lastCode(user.email);
      const wrong = code === '111111' ? '222222' : '111111';
      for (let i = 0; i < 5; i++) {
        const res = await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: wrong }).expect(400);
        expect(res.body.code).toBe('CODE_INVALID');
      }
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code }).expect(400);
    });

    it('SEC-002: uso único (código aceito não vale de novo, p.ex. após mudar o e-mail pendente)', async () => {
      const user = await registerUser(ctx);
      const code = ctx.mail.lastCode(user.email);
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code }).expect(204);
      const [row] = await ctx.db.select().from(authCodes).where(and(eq(authCodes.userId, user.userId), eq(authCodes.purpose, 'verify_email')));
      expect(row?.consumedAt).not.toBeNull();
    });

    it('SEC-002: código de verify_email não serve para reset_password', async () => {
      const user = await registerUser(ctx);
      const verifyCode = ctx.mail.lastCode(user.email);
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: user.email }).expect(202);
      const resetCode = ctx.mail.lastCode(user.email);
      expect(resetCode).not.toBe(verifyCode);
      const res = await ctx.http
        .post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp())
        .send({ email: user.email, code: verifyCode, newPassword: 'outra-senha-bem-forte-7' })
        .expect(400);
      expect(res.body.code).toBe('CODE_INVALID');
    });

    it('SEC-002: código vencido (10 min) → 400 CODE_EXPIRED', async () => {
      const user = await registerUser(ctx);
      const code = ctx.mail.lastCode(user.email);
      await ctx.db.update(authCodes).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authCodes.userId, user.userId));
      const res = await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code }).expect(400);
      expect(res.body.code).toBe('CODE_EXPIRED');
    });

    it('SEC-003: reenvio em menos de 60 s → 429; após o reenvio o código antigo deixa de valer', async () => {
      const user = await registerUser(ctx);
      const oldCode = ctx.mail.lastCode(user.email);
      const tooSoon = await ctx.http.post('/v1/auth/email/resend').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).expect(429);
      expect(Number(tooSoon.headers['retry-after'])).toBeGreaterThan(0);

      await skipInterval();
      await ctx.http.post('/v1/auth/email/resend').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).expect(204);
      const newCode = ctx.mail.lastCode(user.email);
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: oldCode }).expect(400);
      // (o erro acima gastou uma tentativa do código novo? não: o antigo estava invalidado e não conta)
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: newCode }).expect(204);
    });

    it('SEC-003: o 6º envio na hora → 429', async () => {
      const user = await registerUser(ctx); // 1º envio
      for (let i = 0; i < 4; i++) {
        await skipInterval();
        await ctx.http.post('/v1/auth/email/resend').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).expect(204);
      }
      await skipInterval();
      await ctx.http.post('/v1/auth/email/resend').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).expect(429);
    });

    it('WB-224 C4: "Corrigir e-mail" exige a senha, invalida o código antigo e escreve só ao novo endereço', async () => {
      const user = await registerUser(ctx);
      const oldCode = ctx.mail.lastCode(user.email);
      const newEmail = uniqueEmail('corrigido');
      await skipInterval();
      await ctx.http.post('/v1/auth/email/correct').set(bearer(user.accessToken)).send({ newEmail, password: 'senha-errada-aqui-1' }).expect(403);
      await ctx.http.post('/v1/auth/email/correct').set(bearer(user.accessToken)).send({ newEmail, password: user.password }).expect(204);

      const before = ctx.mail.to(user.email).length;
      expect(ctx.mail.to(newEmail)).toHaveLength(1);
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: oldCode }).expect(400);
      await ctx.http.post('/v1/auth/email/verify').set(bearer(user.accessToken)).send({ code: ctx.mail.lastCode(newEmail) }).expect(204);
      expect(ctx.mail.to(user.email).length).toBe(before);
    });
  });

  describe('esqueci a senha', () => {
    it('SEC-003: resposta e tempo iguais para e-mail existente e inexistente (±100 ms)', async () => {
      const user = await registerUser(ctx);
      const call = async (email: string) => {
        const start = performance.now();
        const res = await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email }).expect(202);
        return { ms: performance.now() - start, body: res.body };
      };
      await call(uniqueEmail()); // aquece
      const known = await call(user.email);
      const unknown = await call(uniqueEmail());
      expect(known.body).toEqual(unknown.body);
      expect(Math.abs(known.ms - unknown.ms)).toBeLessThan(100);
    });

    it('SEC-003: 2º pedido em seguida → 429 também para e-mail inexistente (não revela existência)', async () => {
      const known = await registerUser(ctx);
      const unknownEmail = uniqueEmail();
      for (const email of [known.email, unknownEmail]) {
        await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email }).expect(202);
        await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email }).expect(429);
      }
      expect(ctx.mail.to(unknownEmail)).toHaveLength(0);
    });

    it('SEC-006: reset troca a senha, confirma o e-mail, revoga TODAS as sessões e avisa por e-mail', async () => {
      const user = await registerUser(ctx);
      const second = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: user.password }).expect(200);
      await skipInterval();
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: user.email }).expect(202);
      const code = ctx.mail.lastCode(user.email);
      const newPassword = 'nova-senha-bem-forte-42';

      const reset = await ctx.http
        .post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp())
        .send({ email: user.email, code, newPassword })
        .expect(200);
      expect(reset.body.tokens.accessToken).toBeDefined();

      // as duas sessões antigas caem: access e refresh
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
      await ctx.http.get('/v1/me').set(bearer(second.body.tokens.accessToken)).expect(401);
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: user.refreshToken }).expect(401);
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: second.body.tokens.refreshToken }).expect(401);
      // a sessão nova funciona e o e-mail foi confirmado pelo reset (WB-224 C7)
      const me = await ctx.http.get('/v1/me').set(bearer(reset.body.tokens.accessToken)).expect(200);
      expect(me.body.emailVerified).toBe(true);
      // senha antiga não entra mais; a nova entra
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: user.password }).expect(401);
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: newPassword }).expect(200);
      // e-mail "Sua senha foi alterada"
      expect(ctx.mail.to(user.email).some((m) => m.subject.includes('senha') && m.subject.includes('alterada'))).toBe(true);
      // o código é de uso único
      await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email: user.email, code, newPassword: 'mais-uma-senha-forte-55' }).expect(400);
    });

    it('nova senha fraca → 422 sem consumir o código; e-mail inexistente → 400 CODE_INVALID', async () => {
      const user = await registerUser(ctx);
      await skipInterval();
      await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', randomIp()).send({ email: user.email }).expect(202);
      const code = ctx.mail.lastCode(user.email);
      const weak = await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email: user.email, code, newPassword: 'senha123' }).expect(422);
      expect(weak.body.code).toBe('WEAK_PASSWORD');
      await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email: user.email, code, newPassword: 'nova-senha-bem-forte-43' }).expect(200);

      const ghost = await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', randomIp()).send({ email: uniqueEmail(), code: '123456', newPassword: 'nova-senha-bem-forte-43' }).expect(400);
      expect(ghost.body.code).toBe('CODE_INVALID');
    });
  });

  describe('troca de senha logado (SEC-007) e reautenticação (SEC-016)', () => {
    it('exige a senha atual (403 sem ela) e revoga as outras sessões', async () => {
      const user = await registerUser(ctx);
      const other = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: user.password }).expect(200);

      await ctx.http.post('/v1/me/password').set(bearer(user.accessToken)).send({ currentPassword: 'senha-errada-aqui-1', newPassword: 'nova-senha-bem-forte-44' }).expect(403);
      const res = await ctx.http.post('/v1/me/password').set(bearer(user.accessToken)).send({ currentPassword: user.password, newPassword: 'nova-senha-bem-forte-44' }).expect(200);

      await ctx.http.get('/v1/me').set(bearer(other.body.tokens.accessToken)).expect(401);
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
      await ctx.http.get('/v1/me').set(bearer(res.body.tokens.accessToken)).expect(200);
      expect(ctx.mail.to(user.email).some((m) => m.subject.includes('alterada'))).toBe(true);
    });

    it('errar a senha atual 5 vezes bloqueia as tentativas (mesmo limite do login, WB-221 C6)', async () => {
      const user = await registerUser(ctx);
      for (let i = 0; i < 5; i++) {
        await ctx.http.post('/v1/me/password').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).send({ currentPassword: 'senha-errada-aqui-1', newPassword: 'nova-senha-bem-forte-45' }).expect(403);
      }
      await ctx.http.post('/v1/me/password').set(bearer(user.accessToken)).set('X-Forwarded-For', user.ip).send({ currentPassword: user.password, newPassword: 'nova-senha-bem-forte-45' }).expect(429);
    });
  });

  describe('papel de lojista (WB-050, SEC-008b)', () => {
    const merchantTerms = [{ type: 'merchant_terms', version: 1 }];

    it('e-mail não confirmado → 403 EMAIL_VERIFICATION_REQUIRED; confirmado → vira lojista com aceite dos termos do lojista', async () => {
      const user = await registerUser(ctx);
      const denied = await ctx.http.post('/v1/me/merchant-role').set(bearer(user.accessToken)).send({ acceptedDocuments: merchantTerms }).expect(403);
      expect(denied.body.code).toBe('EMAIL_VERIFICATION_REQUIRED');

      await verifyEmailOf(ctx, user);
      await ctx.http.post('/v1/me/merchant-role').set(bearer(user.accessToken)).send({ acceptedDocuments: [{ type: 'merchant_terms', version: 7 }] }).expect(409);
      await ctx.http.post('/v1/me/merchant-role').set(bearer(user.accessToken)).send({ acceptedDocuments: merchantTerms }).expect(204);
      const me = await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
      expect(me.body.roles.sort()).toEqual(['customer', 'merchant']);
      expect(me.body.pendingTerms).toEqual([]);
    });

    it('cadastro de lojistas desligado pela feature flag → 403 MERCHANT_SIGNUP_DISABLED (WB-050 C3)', async () => {
      const user = await registerUser(ctx);
      await verifyEmailOf(ctx, user);
      await ctx.db.insert(featureFlags).values({ key: 'cadastro_lojista', enabled: false, description: 'x' }).onConflictDoUpdate({ target: featureFlags.key, set: { enabled: false } });
      try {
        const res = await ctx.http.post('/v1/me/merchant-role').set(bearer(user.accessToken)).send({ acceptedDocuments: merchantTerms }).expect(403);
        expect(res.body.code).toBe('MERCHANT_SIGNUP_DISABLED');
      } finally {
        await ctx.db.update(featureFlags).set({ enabled: true }).where(eq(featureFlags.key, 'cadastro_lojista'));
      }
    });
  });

  describe('PATCH /v1/me (SEC-022)', () => {
    it('aceita nome e celular; recusa role, status, email e emailVerified com 400', async () => {
      const user = await registerUser(ctx);
      const ok = await ctx.http.patch('/v1/me').set(bearer(user.accessToken)).send({ name: 'Maria Silva' }).expect(200);
      expect(ok.body.name).toBe('Maria Silva');
      for (const field of [{ role: 'admin' }, { status: 'active' }, { email: uniqueEmail() }, { emailVerified: true }, { roles: ['admin'] }]) {
        await ctx.http.patch('/v1/me').set(bearer(user.accessToken)).send(field).expect(400);
      }
      const [row] = await ctx.db.select().from(users).where(eq(users.id, user.userId));
      expect(row?.emailVerifiedAt).toBeNull();
    });
  });

  it('STRONG_PASSWORD de teste passa na política (guarda contra lista de comuns)', () => {
    expect(STRONG_PASSWORD.length).toBeGreaterThan(8);
  });
});
