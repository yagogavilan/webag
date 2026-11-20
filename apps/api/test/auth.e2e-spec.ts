import { eq } from 'drizzle-orm';
import { refreshTokens, sessions, users } from '../src/platform/database/schema.js';
import { sha256Hex } from '../src/platform/crypto/crypto.js';
import { bearer, createTestApp, randomIp, STRONG_PASSWORD, uniqueEmail, type TestContext, uniqueTag } from './helpers/app.js';
import { acceptedCustomer, ensureLegalDocs, registerUser } from './helpers/fixtures.js';

describe('Auth: cadastro, login e refresh (WB-006, WB-008, WB-220, SEC-001/004/010/011)', () => {
  let ctx: TestContext;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('cadastro', () => {
    it('cria a conta com consentimento versionado, Argon2id e envia o código sem dados pessoais', async () => {
      const user = await registerUser(ctx);

      const [row] = await ctx.db.select().from(users).where(eq(users.email, user.email));
      expect(row?.passwordHash).toMatch(/^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
      expect(row?.emailVerifiedAt).toBeNull();
      expect(row?.phone).toBe('11988887777');

      const me = await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
      expect(me.body).toMatchObject({ email: user.email, emailVerified: false, roles: ['customer'], pendingTerms: [] });
      expect(me.body).not.toHaveProperty('passwordHash');

      // SEC-008(d): só o código e texto genérico, sem nome nem dados do pedido.
      const mail = ctx.mail.to(user.email).at(-1);
      expect(mail?.subject).toMatch(/^Seu código Webag: \d{6}$/);
      expect(mail?.text).not.toContain('Maria');
    });

    it('SEC-001: 12345678 e senha123 voltam 422; 129 caracteres 422; 128 caracteres 201', async () => {
      const accepted = await acceptedCustomer(ctx);
      const attempt = (password: string) =>
        ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp()).send({
          name: 'Teste', email: uniqueEmail(), phone: '11977776666', password, adultDeclaration: true, acceptedDocuments: accepted,
        });
      for (const weak of ['12345678', 'senha123', 'a'.repeat(129)]) {
        const res = await attempt(weak).expect(422);
        expect(res.body).toMatchObject({ code: 'WEAK_PASSWORD', status: 422 });
        expect(res.headers['content-type']).toContain('application/problem+json');
      }
      await attempt('x7Qm'.repeat(32)).expect(201);
    });

    it('recusa campo desconhecido (SEC-022) e termos desatualizados', async () => {
      const base = { name: 'Teste', email: uniqueEmail(), phone: '11977776666', password: STRONG_PASSWORD, adultDeclaration: true, acceptedDocuments: await acceptedCustomer(ctx) };
      const ip = randomIp();
      await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', ip).send({ ...base, role: 'admin' }).expect(400);
      await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', ip).send({ ...base, emailVerified: true }).expect(400);
      const outdated = await ctx.http
        .post('/v1/auth/register').set('X-Forwarded-For', ip)
        .send({ ...base, acceptedDocuments: [{ type: 'customer_terms', version: 99 }, { type: 'privacy', version: 1 }] })
        .expect(409);
      expect(outdated.body.code).toBe('TERMS_OUTDATED');
      await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', ip).send({ ...base, adultDeclaration: false }).expect(400);
    });

    it('e-mail repetido: 409 sem revelar se está confirmado', async () => {
      const first = await registerUser(ctx);
      const res = await ctx.http
        .post('/v1/auth/register').set('X-Forwarded-For', randomIp())
        .send({ name: 'Outra', email: first.email.toUpperCase(), phone: '11977776666', password: STRONG_PASSWORD, adultDeclaration: true, acceptedDocuments: await acceptedCustomer(ctx) })
        .expect(409);
      expect(res.body.code).toBe('EMAIL_ALREADY_REGISTERED');
    });

    it('SEC-063: 4ª conta no mesmo dispositivo é barrada (429)', async () => {
      const device = `dev-${uniqueTag(8)}-abcd`;
      const accepted = await acceptedCustomer(ctx);
      const payload = () => ({ name: 'Teste', email: uniqueEmail(), phone: '11977776666', password: STRONG_PASSWORD, adultDeclaration: true, acceptedDocuments: accepted });
      for (let i = 0; i < 3; i++) {
        await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp()).set('X-Device-Id', device).send(payload()).expect(201);
      }
      const fourth = await ctx.http.post('/v1/auth/register').set('X-Forwarded-For', randomIp()).set('X-Device-Id', device).send(payload()).expect(429);
      expect(fourth.headers['retry-after']).toBeDefined();
    });

    it('SEC-005: e-mail-exists devolve só { exists } e limita a 10 por minuto por IP', async () => {
      const ip = randomIp();
      const known = await registerUser(ctx);
      const yes = await ctx.http.post('/v1/auth/email-exists').set('X-Forwarded-For', ip).send({ email: known.email }).expect(200);
      expect(yes.body).toEqual({ exists: true });
      const no = await ctx.http.post('/v1/auth/email-exists').set('X-Forwarded-For', ip).send({ email: uniqueEmail() }).expect(200);
      expect(no.body).toEqual({ exists: false });
      for (let i = 0; i < 8; i++) await ctx.http.post('/v1/auth/email-exists').set('X-Forwarded-For', ip).send({ email: uniqueEmail() }).expect(200);
      await ctx.http.post('/v1/auth/email-exists').set('X-Forwarded-For', ip).send({ email: uniqueEmail() }).expect(429);
    });
  });

  describe('login', () => {
    it('entra com e-mail e senha corretos (e-mail ainda não confirmado entra normalmente, WB-008 C5)', async () => {
      const user = await registerUser(ctx);
      const res = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: user.password }).expect(200);
      expect(res.body.tokens).toMatchObject({ tokenType: 'Bearer', expiresIn: 900 });
      expect(res.body.mfaSetupRequired).toBe(false);
      await ctx.http.get('/v1/me').set(bearer(res.body.tokens.accessToken)).expect(200);
    });

    it('mesma mensagem para senha errada e e-mail inexistente (WB-008 C2)', async () => {
      const user = await registerUser(ctx);
      const ip = randomIp();
      const wrong = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: user.email, password: 'senha-errada-aqui-1' }).expect(401);
      const missing = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: uniqueEmail(), password: 'senha-errada-aqui-1' }).expect(401);
      expect(wrong.body).toEqual(missing.body);
      expect(wrong.body.title).toBe('E-mail ou senha incorretos');
    });

    it('SEC-004: tempo de resposta igual (±100 ms) para e-mail inexistente', async () => {
      const user = await registerUser(ctx);
      const time = async (email: string): Promise<number> => {
        const start = performance.now();
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email, password: 'senha-errada-aqui-1' }).expect(401);
        return performance.now() - start;
      };
      await time(user.email); // aquece
      const samples = async (email: string) => {
        const values: number[] = [];
        for (let i = 0; i < 4; i++) values.push(await time(email));
        return values.reduce((a, b) => a + b, 0) / values.length;
      };
      const existing = await samples(user.email);
      const missing = await samples(uniqueEmail());
      expect(Math.abs(existing - missing)).toBeLessThan(100);
    });

    it('SEC-004/WB-221: após 5 falhas só aquele IP espera; outro IP com a senha certa entra; a conta não trava', async () => {
      const user = await registerUser(ctx);
      const ipA = randomIp();
      const ipB = randomIp();
      for (let i = 0; i < 5; i++) {
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipA).send({ email: user.email, password: 'senha-errada-aqui-1' }).expect(401);
      }
      const blocked = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipA).send({ email: user.email, password: 'senha-errada-aqui-1' }).expect(429);
      expect(Number(blocked.headers['retry-after'])).toBeGreaterThan(800);
      // mesmo IP com a senha certa também espera (a espera é por IP+conta)...
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipA).send({ email: user.email, password: user.password }).expect(429);
      // ...mas o dono, em outro IP, entra normalmente.
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipB).send({ email: user.email, password: user.password }).expect(200);
    });

    it('SEC-004: 20 falhas distribuídas na conta exigem código por e-mail (step-up) mesmo com a senha certa', async () => {
      const user = await registerUser(ctx);
      for (let i = 0; i < 20; i++) {
        await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: 'senha-errada-aqui-1' }).expect(401);
      }
      const ip = randomIp();
      const need = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: user.email, password: user.password }).expect(403);
      expect(need.body.code).toBe('LOGIN_CODE_REQUIRED');
      const code = ctx.mail.lastCode(user.email);
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: user.email, password: user.password, code: '000000' }).expect(400);
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ip).send({ email: user.email, password: user.password, code }).expect(200);
    });

    it('conta bloqueada pelo admin: 403 ACCOUNT_BLOCKED só depois da senha certa (WB-008 C4)', async () => {
      const user = await registerUser(ctx);
      await ctx.db.update(users).set({ status: 'blocked' }).where(eq(users.id, user.userId));
      const res = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: user.email, password: user.password }).expect(403);
      expect(res.body.code).toBe('ACCOUNT_BLOCKED');
      // e o access token que já existia deixa de valer na hora (usuário não está ativo)
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
    });
  });

  describe('access token (SEC-010)', () => {
    it('rota sem token, com alg:none e com typ errado → 401', async () => {
      await ctx.http.get('/v1/me').expect(401);
      const none = `${Buffer.from('{"alg":"none","typ":"JWT"}').toString('base64url')}.${Buffer.from(JSON.stringify({ sub: 'x', sid: 'y', typ: 'access' })).toString('base64url')}.`;
      await ctx.http.get('/v1/me').set(bearer(none)).expect(401);
      const user = await registerUser(ctx);
      // o refresh token (opaco) nunca vale como access
      await ctx.http.get('/v1/me').set(bearer(user.refreshToken)).expect(401);
    });

    it('logout: o mesmo access token passa a dar 401 na hora', async () => {
      const user = await registerUser(ctx);
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(200);
      await ctx.http.post('/v1/auth/logout').set(bearer(user.accessToken)).expect(204);
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
      const refresh = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: user.refreshToken }).expect(401);
      expect(refresh.body.code).toBe('SESSION_REVOKED');
    });
  });

  describe('refresh rotativo (SEC-011, WB-220)', () => {
    it('rotaciona a cada uso e guarda só o SHA-256', async () => {
      const user = await registerUser(ctx);
      const ip = randomIp();
      const first = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }).expect(200);
      expect(first.body.refreshToken).not.toBe(user.refreshToken);
      await ctx.http.get('/v1/me').set(bearer(first.body.accessToken)).expect(200);

      const stored = await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, sha256Hex(first.body.refreshToken)));
      expect(stored).toHaveLength(1);
      expect((await ctx.db.select().from(refreshTokens).where(eq(refreshTokens.tokenHash, first.body.refreshToken)))).toHaveLength(0);
    });

    it('repetição dentro de 30 s devolve o MESMO novo refresh (e duas simultâneas também)', async () => {
      const user = await registerUser(ctx);
      const ip = randomIp();
      const [a, b] = await Promise.all([
        ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }),
        ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }),
      ]);
      expect([a.status, b.status]).toEqual([200, 200]);
      expect(a.body.refreshToken).toBe(b.body.refreshToken);
      const again = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }).expect(200);
      expect(again.body.refreshToken).toBe(a.body.refreshToken);
      // e o novo token continua utilizável (ninguém foi deslogado)
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: a.body.refreshToken }).expect(200);
    });

    it('reuso fora da janela revoga a família inteira', async () => {
      const user = await registerUser(ctx);
      const ip = randomIp();
      const rotated = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }).expect(200);
      // envelhece o uso do token antigo para além da janela de 30 s
      await ctx.db.update(refreshTokens).set({ usedAt: new Date(Date.now() - 31_000) }).where(eq(refreshTokens.tokenHash, sha256Hex(user.refreshToken)));

      const reuse = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }).expect(401);
      expect(reuse.body.code).toBe('REFRESH_REUSED');
      // o token novo (legítimo) e o access token da sessão caíram juntos
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: rotated.body.refreshToken }).expect(401);
      await ctx.http.get('/v1/me').set(bearer(rotated.body.accessToken)).expect(401);
    });

    it('dia 91 (limite absoluto) → 401; token inventado → 401', async () => {
      const user = await registerUser(ctx);
      const ip = randomIp();
      await ctx.db.update(sessions).set({ absoluteExpiresAt: new Date(Date.now() - 1000) }).where(eq(sessions.userId, user.userId));
      const res = await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: user.refreshToken }).expect(401);
      expect(res.body.code).toBe('REFRESH_EXPIRED');
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', ip).send({ refreshToken: 'x'.repeat(43) }).expect(401);
    });
  });

  describe('sessões (SEC-020)', () => {
    it('lista as próprias sessões e revoga uma; sessão de outro usuário responde 404', async () => {
      const alice = await registerUser(ctx);
      const bob = await registerUser(ctx);
      const aliceSecond = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: alice.email, password: alice.password }).expect(200);

      const list = await ctx.http.get('/v1/me/sessions').set(bearer(alice.accessToken)).expect(200);
      expect(list.body.data).toHaveLength(2);
      const bobSessions = await ctx.http.get('/v1/me/sessions').set(bearer(bob.accessToken)).expect(200);
      const bobSessionId = (bobSessions.body.data as { id: string }[])[0]?.id;

      await ctx.http.delete(`/v1/me/sessions/${bobSessionId}`).set(bearer(alice.accessToken)).expect(404);
      const other = (list.body.data as { id: string; current: boolean }[]).find((s) => !s.current);
      await ctx.http.delete(`/v1/me/sessions/${other?.id}`).set(bearer(alice.accessToken)).expect(204);
      await ctx.http.get('/v1/me').set(bearer(aliceSecond.body.tokens.accessToken)).expect(401);
      await ctx.http.get('/v1/me').set(bearer(alice.accessToken)).expect(200);
    });
  });
});

describe('SEC-114: IP informado pelo BFF só vale com o segredo', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
  });
  afterAll(async () => {
    await ctx.close();
  });
  const SECRET = 'test-bff-shared-secret-0123456789abcdef';
  const wrong = { email: '', password: 'senha-errada-aqui-1' };

  it('com o segredo, o limite por conta+IP vale para o IP que o BFF declarou', async () => {
    const user = await registerUser(ctx);
    const browserIp = randomIp();
    const attempt = () => ctx.http.post('/v1/auth/login').set('X-Forwarded-For', browserIp).set('X-Webag-BFF-Secret', SECRET).send({ ...wrong, email: user.email });
    for (let i = 0; i < 5; i++) await attempt().expect(401);
    await attempt().expect(429);
    // o dono, de outro IP declarado, entra normalmente
    await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).set('X-Webag-BFF-Secret', SECRET).send({ email: user.email, password: user.password }).expect(200);
  });

  it('sem o segredo (ou errado), o valor da esquerda do X-Forwarded-For não escolhe o IP: vale o do proxy confiável (direita)', async () => {
    const user = await registerUser(ctx);
    const realIp = randomIp();
    for (let i = 0; i < 5; i++) {
      await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', `${randomIp()}, ${realIp}`).set('X-Webag-BFF-Secret', 'segredo-errado-0123456789abcdef0123456789').send({ ...wrong, email: user.email }).expect(401);
    }
    await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', `${randomIp()}, ${realIp}`).send({ ...wrong, email: user.email }).expect(429);
  });
});
