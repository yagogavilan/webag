import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { AccountDeletionService, DeletionOpsError } from '../src/modules/privacy/account-deletion.service.js';
import { auditLog, paymentAlerts, users } from '../src/platform/database/schema.js';
import { sha256Hex } from '../src/platform/crypto/crypto.js';
import { RateLimitService } from '../src/platform/ratelimit/rate-limit.service.js';
import { bearer, createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createCustomer, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';

/**
 * SEC-180 (Média, obrigatório antes do piloto): quem só sabe o e-mail NÃO pode esgotar os limites de envio de código e travar o dono.
 * O ataque D2 da revisão (~21 requisições em 5 minutos) vira E2E: 11 senhas erradas de 11 IPs + 5 rodadas de via A + "esqueci a senha".
 * Docs: docs/seguranca/revisoes/onda-7-pos-dec-059.md.
 */
describe('SEC-180: o orçamento de envio de código do dono não é esgotável por terceiros', () => {
  let ctx: TestContext;
  let limiter: RateLimitService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    await useParam(ctx, 'exclusao_arrependimento_horas', 72);
    limiter = ctx.app.get(RateLimitService);
  });
  afterAll(async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    await ctx.close();
  });

  const ipOf = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const post = (path: string, body: Record<string, unknown>, ip: string) => ctx.http.post(path).set('X-Forwarded-For', ip).send(body);
  const cancel = (body: Record<string, unknown>, ip = ipOf()) => post('/v1/auth/account-deletion/cancel', body, ip);
  const startViaA = (email: string, ip: string) => post('/v1/auth/account-deletion/start', { email }, ip);
  const forgot = (email: string, ip: string) => post('/v1/auth/password/forgot', { email }, ip);
  const pendingUser = async () => {
    const user = await createCustomer(ctx);
    await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
    return user;
  };
  const inbox = (email: string) => ctx.mail.outbox.filter((m) => m.to === email);

  /** O atacante espera os 60 s entre pedidos do mesmo IP (`otp_reenvio_s`): o teste só zera as chaves de intervalo, como o passar do tempo. */
  const waitInterval = async (email: string, ip: string) => {
    const hash = sha256Hex(email);
    for (const purpose of ['delete_web', 'reset_password', 'login_stepup']) await limiter.reset(`code:int:anon:${hash}:${ip}:${purpose}`);
  };

  it('D2 (ataque da revisão, ~21 requisições): o dono recebe 403 LOGIN_CODE_REQUIRED COM o código e, com ele, reabre a conta', async () => {
    const user = await pendingUser();
    const destBefore = (await limiter.peek(`code:dest:${sha256Hex(user.email)}`)).count; // o cadastro e a exclusão já usaram o orçamento da sessão do dono
    const attackerIp = ipOf();
    let requests = 0;
    // 1) 11 senhas erradas de 11 IPs: liga o step-up
    for (let i = 0; i < 11; i += 1) {
      expect((await cancel({ email: user.email, password: 'errada-errada-1' })).status).toBe(401);
      requests += 1;
    }
    ctx.mail.outbox.length = 0;
    // 2) 5 rodadas de via A + "esqueci a senha" do MESMO IP, com o intervalo de 60 s passando entre elas
    for (let round = 0; round < 5; round += 1) {
      const a = await startViaA(user.email, attackerIp);
      const f = await forgot(user.email, attackerIp);
      expect([a.status, f.status], `rodada ${round}`).toEqual([200, 202]);
      requests += 2;
      await waitInterval(user.email, attackerIp);
    }
    expect(requests).toBe(21);
    expect(inbox(user.email)).toHaveLength(0); // com a conta pendente esses fluxos não mandam nada (nenhum sinal ao dono)
    // o que o atacante consumiu foi o orçamento anônimo DO PRÓPRIO IP; o global do e-mail e o de quem provou a senha ficam intactos
    const hash = sha256Hex(user.email);
    expect((await limiter.peek(`code:dest:${hash}`)).count).toBe(destBefore);
    expect((await limiter.peek(`code:h:${hash}:delete_web`)).count).toBe(0);
    expect((await limiter.peek(`code:h:proved:${user.userId}:delete_cancel`)).count).toBe(0);
    expect((await limiter.peek(`code:h:anon:${hash}:${attackerIp}:delete_web`)).count).toBe(5);

    // 3) o dono, de um IP novo e com a senha CERTA: antes da correção era 429 e a exclusão ficava irreversível
    const owner = await cancel({ email: user.email, password: user.password });
    expect(owner.status, JSON.stringify(owner.body)).toBe(403);
    expect(owner.body.code).toBe('LOGIN_CODE_REQUIRED');
    expect(inbox(user.email)).toHaveLength(1); // o código foi enviado
    const code = ctx.mail.lastCode(user.email);
    await cancel({ email: user.email, password: user.password, code }).expect(204);
    await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
  });

  it('o código só sai com a senha certa (terceiro sem a senha: 401 e nenhum e-mail) e o orçamento de quem provou a senha é por conta e finalidade', async () => {
    const user = await pendingUser();
    for (let i = 0; i < 12; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' }).expect(401);
    ctx.mail.outbox.length = 0;
    expect((await cancel({ email: user.email, password: 'errada-errada-1', code: '123456' })).status).toBe(401);
    expect(inbox(user.email)).toHaveLength(0);
    expect((await limiter.peek(`code:h:proved:${user.userId}:delete_cancel`)).count).toBe(0);
    expect((await cancel({ email: user.email, password: user.password })).status).toBe(403);
    expect((await limiter.peek(`code:h:proved:${user.userId}:delete_cancel`)).count).toBe(1);
  });

  it('(2) enquanto há código válido não se emite outro: repetir a senha certa devolve 403 sem e-mail novo e o código antigo continua valendo', async () => {
    const user = await pendingUser();
    for (let i = 0; i < 12; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' });
    ctx.mail.outbox.length = 0;
    expect((await cancel({ email: user.email, password: user.password })).body.code).toBe('LOGIN_CODE_REQUIRED');
    const first = ctx.mail.lastCode(user.email);
    for (let i = 0; i < 3; i += 1) expect((await cancel({ email: user.email, password: user.password })).body.code).toBe('LOGIN_CODE_REQUIRED');
    expect(inbox(user.email)).toHaveLength(1); // nenhum e-mail novo
    expect((await limiter.peek(`code:h:proved:${user.userId}:delete_cancel`)).count).toBe(1); // e nenhum limite consumido
    await cancel({ email: user.email, password: user.password, code: first }).expect(204);
  });

  it('(4) conta pendente sob ataque gera UM alerta à operação, sem dado pessoal', async () => {
    const user = await pendingUser();
    for (let i = 0; i < 12; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' });
    for (let i = 0; i < 3; i += 1) await cancel({ email: user.email, password: 'errada-errada-1' });
    const alerts = (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'account_deletion_under_attack'))).filter((a) => JSON.stringify(a.details).includes('deletionId'));
    const mine = alerts.filter((a) => (a.details as { emailAttempts?: number }).emailAttempts !== undefined);
    expect(mine.length).toBeGreaterThanOrEqual(1);
    const text = JSON.stringify(mine);
    expect(text).not.toContain(user.email);
    // um por exclusão
    const [deletion] = await ctx.db.execute<{ id: string }>(sql`select id from account_deletions where user_id = ${user.userId}::uuid and status = 'pending'`).then((r) => r.rows);
    expect(alerts.filter((a) => (a.details as { deletionId?: string }).deletionId === deletion!.id)).toHaveLength(1);
  });

  it('via A de exclusão (conta ATIVA): o atacante esgota só o próprio IP (6º pedido = 429); o dono, de outro IP, recebe o código', async () => {
    const user = await createCustomer(ctx);
    const attackerIp = ipOf();
    ctx.mail.outbox.length = 0;
    const statuses: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      statuses.push((await startViaA(user.email, attackerIp)).status);
      await waitInterval(user.email, attackerIp);
    }
    expect(statuses.slice(0, 5)).toEqual([200, 200, 200, 200, 200]);
    expect(statuses[5]).toBe(429); // o limite por IP + e-mail segue valendo
    ctx.mail.outbox.length = 0;
    const owner = await startViaA(user.email, ipOf());
    expect(owner.status).toBe(200);
    expect(inbox(user.email)).toHaveLength(1);
    const ticket = await post('/v1/auth/account-deletion/verify-code', { email: user.email, code: ctx.mail.lastCode(user.email) }, ipOf());
    expect(ticket.status, JSON.stringify(ticket.body)).toBe(200);
    expect(ticket.body.deleteTicket).toBeTruthy();
  });

  it('"esqueci a senha": 12 IPs diferentes pedindo o código NÃO esgotam o do dono, que recebe o dele de outro IP', async () => {
    const user = await createCustomer(ctx);
    const baseline = (await limiter.peek(`code:dest:${sha256Hex(user.email)}`)).count; // o cadastro já enviou o código de confirmação (orçamento da sessão)
    for (let i = 0; i < 12; i += 1) expect((await forgot(user.email, ipOf())).status).toBe(202);
    expect((await limiter.peek(`code:dest:${sha256Hex(user.email)}`)).count).toBe(baseline); // o orçamento global do e-mail não é tocado pelos anônimos
    ctx.mail.outbox.length = 0;
    expect((await forgot(user.email, ipOf())).status).toBe(202);
    expect(inbox(user.email)).toHaveLength(1);
    // o mesmo IP insistindo continua limitado (por IP + e-mail)
    const same = ipOf();
    const rounds: number[] = [];
    for (let i = 0; i < 6; i += 1) {
      rounds.push((await forgot(user.email, same)).status);
      await waitInterval(user.email, same);
    }
    expect(rounds[5]).toBe(429);
  });

  it('login com step-up: atacantes esgotando "esqueci a senha" e errando a senha não impedem o dono: 403 com o código e, com ele, 200', async () => {
    const user = await createCustomer(ctx);
    for (let i = 0; i < 12; i += 1) await forgot(user.email, ipOf());
    for (let i = 0; i < 20; i += 1) await limiter.hit(`lfa:${user.userId}`, 3600); // falhas de login de vários IPs ligam o step-up
    ctx.mail.outbox.length = 0;
    const owner = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: user.email, password: user.password });
    expect(owner.status, JSON.stringify(owner.body)).toBe(403);
    expect(owner.body.code).toBe('LOGIN_CODE_REQUIRED');
    expect(inbox(user.email)).toHaveLength(1);
    const code = ctx.mail.lastCode(user.email);
    // repetir a senha certa não emite outro código nem gasta limite
    await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: user.email, password: user.password }).expect(403);
    expect(inbox(user.email)).toHaveLength(1);
    await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: user.email, password: user.password, code }).expect(200);
  });

  it('W.2: a via B com a senha certa sob ataque já devolve o código na própria resposta 403 (e ele abre a via A)', async () => {
    const user = await createCustomer(ctx);
    for (let i = 0; i < 20; i += 1) await limiter.hit(`lfa:${user.userId}`, 3600);
    ctx.mail.outbox.length = 0;
    const start = await post('/v1/auth/account-deletion/start', { email: user.email, password: user.password }, ipOf());
    expect(start.status).toBe(403);
    expect(start.body.code).toBe('LOGIN_CODE_REQUIRED');
    expect(inbox(user.email)).toHaveLength(1);
    const ticket = await post('/v1/auth/account-deletion/verify-code', { email: user.email, code: ctx.mail.lastCode(user.email) }, ipOf());
    expect(ticket.status).toBe(200);
    expect(ticket.body.deleteTicket).toBeTruthy();
    // a senha ERRADA sob ataque segue 401 genérico e nunca manda e-mail
    ctx.mail.outbox.length = 0;
    expect((await post('/v1/auth/account-deletion/start', { email: user.email, password: 'errada-errada-1' }, ipOf())).status).toBe(401);
    expect(inbox(user.email)).toHaveLength(0);
  });

  describe('(3) privacy:cancel-deletion (CLI do super admin)', () => {
    const run = (over: Partial<Parameters<AccountDeletionService['cancelByOperator']>[0]> & { email: string }) =>
      ctx.app.get(AccountDeletionService).cancelByOperator({ confirmEmail: over.email, reason: 'Titular pediu pelo atendimento; identidade conferida pelo runbook.', identityProof: 'Protocolo DSR-1234: documento e selfie conferidos', osUser: 'ops', host: 'api-1', ...over });

    it('reabre a conta com e-mail NÃO confirmado sob ataque (sem caminho pelo cancel), audita com ator cli, zera os contadores e avisa o dono', async () => {
      const user = await registerUser(ctx); // e-mail não confirmado
      await ctx.http.post('/v1/me/deletion').set(bearer(user.accessToken)).send({ password: STRONG_PASSWORD }).expect(200);
      for (let i = 0; i < 20; i += 1) await limiter.hit(`lfa:${user.userId}`, 3600);
      expect((await cancel({ email: user.email, password: user.password })).status).toBe(401); // o autosserviço não tem volta para esta conta
      ctx.mail.outbox.length = 0;

      const dry = await run({ email: user.email, dryRun: true });
      expect(dry).toMatchObject({ dryRun: true, email: user.email });
      expect((await ctx.db.select().from(users).where(eq(users.id, user.userId)))[0]!.status).toBe('deleted');

      const result = await run({ email: user.email.toUpperCase() });
      expect(result).toMatchObject({ dryRun: false, userId: user.userId });
      expect((await ctx.db.select().from(users).where(eq(users.id, user.userId)))[0]!.status).toBe('active');
      const [audit] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.action, 'account.deletion_cancelled_by_operator'), eq(auditLog.targetId, user.userId)));
      expect(audit).toMatchObject({ actorRole: 'cli', actorId: null });
      expect(audit!.reason).toContain('identidade conferida');
      expect(audit!.after).toMatchObject({ identityProof: expect.stringContaining('DSR-1234'), osUser: 'ops', host: 'api-1' });
      expect((await limiter.peek(`lfa:${user.userId}`)).count).toBe(0);
      expect(inbox(user.email)).toHaveLength(1); // o titular foi avisado
      await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
    });

    it('recusa: e-mail de confirmação diferente, motivo curto, sem prova de identidade, sem exclusão pendente, prazo vencido', async () => {
      const user = await pendingUser();
      await expect(run({ email: user.email, confirmEmail: 'outro@exemplo.com' })).rejects.toMatchObject({ code: 'CONFIRM_MISMATCH' });
      await expect(run({ email: user.email, reason: 'curto' })).rejects.toMatchObject({ code: 'REASON_TOO_SHORT' });
      await expect(run({ email: user.email, identityProof: 'x' })).rejects.toMatchObject({ code: 'IDENTITY_PROOF_REQUIRED' });
      await expect(run({ email: `ninguem-${randomUUID()}@exemplo.com` })).rejects.toMatchObject({ code: 'NO_PENDING_DELETION' });
      await expect(run({ email: (await createCustomer(ctx)).email })).rejects.toBeInstanceOf(DeletionOpsError); // conta ativa: nada a reabrir
      await ctx.db.execute(sql`update account_deletions set effective_at = now() - interval '1 minute' where user_id = ${user.userId}::uuid`);
      await expect(run({ email: user.email })).rejects.toMatchObject({ code: 'DELETION_DUE' });
      expect((await ctx.db.select().from(users).where(eq(users.id, user.userId)))[0]!.status).toBe('deleted');
      // não deixa uma exclusão "vencida" no banco compartilhado: outro teste (`processDue`) a anonimizaria
      await ctx.db.execute(sql`update account_deletions set effective_at = now() + interval '72 hours' where user_id = ${user.userId}::uuid`);
    });
  });
});
