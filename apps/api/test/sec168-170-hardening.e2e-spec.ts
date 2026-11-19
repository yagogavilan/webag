import { eq } from 'drizzle-orm';
import { sha256Hex } from '../src/platform/crypto/crypto.js';
import { RateLimitService } from '../src/platform/ratelimit/rate-limit.service.js';
import { bearer, createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';

/** F.1 SEC-168: arrependimento da exclusão com limite por CONTA e reautenticação completa ao reabrir (ataque B2 da revisão). */
describe('SEC-168: arrependimento da exclusão sob força bruta distribuída', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await useParam(ctx, 'exclusao_arrependimento_horas', 72);
  });
  afterAll(async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    await ctx.close();
  });

  const ipOf = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const cancel = (body: Record<string, unknown>, ip = ipOf()) => ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', ip).send(body);
  const pendingUser = async () => {
    const user = await createCustomer(ctx);
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    return user;
  };

  /** Simula o resto do ataque pelo login (mesmo contador `lfa`) e zera o limite por e-mail para o dono tentar de novo. */
  const underAttack = async (user: { userId: string; email: string }) => {
    const limiter = ctx.app.get(RateLimitService);
    for (let i = 0; i < 20; i += 1) await limiter.hit(`lfa:${user.userId}`, 3600);
    await limiter.reset(`deletion-cancel:email:${sha256Hex(user.email)}`);
  };

  it('senhas erradas de IPs diferentes somam no contador da conta; a senha certa então exige o código do e-mail e só com ele a conta reabre', async () => {
    const user = await pendingUser();
    for (let i = 0; i < 5; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' }).expect(401);
    const lfa = await ctx.app.get(RateLimitService).peek(`lfa:${user.userId}`);
    expect(lfa.count).toBe(5); // antes da correção ficava em 0: força bruta distribuída sem o freio do login
    await underAttack(user);
    ctx.mail.outbox.length = 0;

    const stepUp = await cancel({ email: user.email, password: user.password });
    expect(stepUp.status).toBe(403);
    expect(stepUp.body.code).toBe('LOGIN_CODE_REQUIRED');
    const code = ctx.mail.lastCode(user.email); // código enviado ao e-mail
    expect((await cancel({ email: user.email, password: user.password, code: code === '000000' ? '111111' : '000000' })).status).toBe(400);
    expect((await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password })).status).toBe(403); // ainda fechada
    await cancel({ email: user.email, password: user.password, code }).expect(204);
    // o código é de uso único
    expect((await cancel({ email: user.email, password: user.password, code })).status).toBe(401);
  });

  it('há limite por e-mail sem o IP: 11 tentativas de IPs diferentes e a seguinte é 429', async () => {
    const user = await pendingUser();
    const statuses: number[] = [];
    for (let i = 0; i < 12; i += 1) statuses.push((await cancel({ email: user.email, password: 'errada-errada-1' })).status);
    expect(statuses.slice(0, 10).every((s) => s === 401)).toBe(true);
    expect(statuses.at(-1)).toBe(429);
  });

  it('conta sem e-mail confirmado sob ataque recebe a resposta genérica, nunca o código', async () => {
    const { registerUser } = await import('./helpers/fixtures.js');
    const user = await registerUser(ctx); // e-mail não confirmado
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    for (let i = 0; i < 3; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' }).expect(401);
    await underAttack(user);
    const res = await cancel({ email: user.email, password: user.password });
    expect(res.status).toBe(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('sem ataque, a senha certa reabre direto (sem código)', async () => {
    const user = await pendingUser();
    await cancel({ email: user.email, password: user.password }).expect(204);
    await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
    void eq;
  });
});
