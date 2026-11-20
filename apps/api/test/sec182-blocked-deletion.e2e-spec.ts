import { eq } from 'drizzle-orm';
import { PasswordService } from '../src/modules/identity/index.js';
import { AccountDeletionService } from '../src/modules/privacy/account-deletion.service.js';
import { accountDeletions, stores, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';
import { shopWith } from './helpers/orders.js';

type Admin = Awaited<ReturnType<typeof createAdmin>>;

/** SEC-182: a conta bloqueada exerce a exclusão (LGPD art. 18, VI; Google Play) pelas duas vias da /excluir-conta e, ao desistir, continua bloqueada. */
describe('SEC-182: exclusão de conta bloqueada', () => {
  let ctx: TestContext;
  let operations: Admin;
  let service: AccountDeletionService;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    operations = await createAdmin(ctx, 'operations');
    service = ctx.app.get(AccountDeletionService);
  });
  afterAll(() => ctx.close());

  const post = (path: string, body: Record<string, unknown>) => ctx.http.post(`/v1/auth/account-deletion/${path}`).send(body);
  const statusOf = async (userId: string) => (await ctx.db.select({ status: users.status }).from(users).where(eq(users.id, userId)))[0]!.status;
  const block = (userId: string) => ctx.http.post(`/v1/admin/users/${userId}/block`).set(bearer(operations.accessToken)).send({ reason: 'fraude: vários pedidos falsos no mesmo dia' }).expect(200);
  const blockedCustomer = async () => {
    const user = await createCustomer(ctx);
    await block(user.userId);
    expect(await statusOf(user.userId)).toBe('blocked');
    await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(403); // sem sessão: o app não entra
    return user;
  };

  it('via A (código): a conta bloqueada recebe o código, conclui e fica excluída; nenhuma sessão é emitida', async () => {
    const user = await blockedCustomer();
    ctx.mail.outbox.length = 0;
    expect((await post('start', { email: user.email }).expect(200)).body).toEqual({ sent: true });
    expect(ctx.mail.to(user.email)).toHaveLength(1); // o código CHEGA
    const { deleteTicket } = (await post('verify-code', { email: user.email, code: ctx.mail.lastCode(user.email) }).expect(200)).body as { deleteTicket: string };
    expect((await post('review', { deleteTicket }).expect(200)).body).toMatchObject({ canDelete: true });
    const done = await post('finish', { deleteTicket }).expect(200);
    expect(done.body).toMatchObject({ status: 'completed' });
    expect(done.body.accessToken).toBeUndefined();
    expect(done.headers['set-cookie']).toBeUndefined();
    expect(await statusOf(user.userId)).toBe('deleted');
    const [row] = await ctx.db.select().from(accountDeletions).where(eq(accountDeletions.userId, user.userId));
    expect(row).toMatchObject({ via: 'web', status: 'completed', previousUserStatus: 'blocked' });
  });

  it('via B (e-mail + senha): a senha CERTA da conta bloqueada abre o ticket (não mais 401); a errada continua 401', async () => {
    const user = await blockedCustomer();
    expect((await post('start', { email: user.email, password: 'Errada-Errada-9' }).expect(401)).body.code).toBe('INVALID_CREDENTIALS');
    const { deleteTicket } = (await post('start', { email: user.email, password: user.password }).expect(200)).body as { deleteTicket: string };
    await post('finish', { deleteTicket }).expect(200);
    expect(await statusOf(user.userId)).toBe('deleted');
  });

  it('desistir da exclusão devolve a conta BLOQUEADA (não fura o bloqueio); a conta ativa que desiste volta ativa', async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 24);
    try {
      const user = await blockedCustomer();
      const { deleteTicket } = (await post('start', { email: user.email, password: user.password }).expect(200)).body as { deleteTicket: string };
      expect((await post('finish', { deleteTicket }).expect(200)).body).toMatchObject({ status: 'pending' });
      expect(await statusOf(user.userId)).toBe('deleted');

      ctx.mail.outbox.length = 0;
      await post('cancel', { email: user.email, password: user.password }).expect(204);
      expect(await statusOf(user.userId)).toBe('blocked');
      expect((await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(403)).body.code).toBe('ACCOUNT_BLOCKED');
      expect(ctx.mail.to(user.email).at(-1)!.text).toContain('continua indisponível');
      // continua um bloqueio de verdade para o admin (desbloquear funciona, a conta volta ativa)
      await ctx.http.post(`/v1/admin/users/${user.userId}/unblock`).set(bearer(operations.accessToken)).send({ reason: 'recurso aceito pelo suporte' }).expect(200);
      expect(await statusOf(user.userId)).toBe('active');

      // conta ativa: desiste e volta ATIVA
      const active = await createCustomer(ctx);
      const first = (await post('start', { email: active.email, password: active.password }).expect(200)).body.deleteTicket as string;
      await post('finish', { deleteTicket: first }).expect(200);
      await post('cancel', { email: active.email, password: active.password }).expect(204);
      expect(await statusOf(active.userId)).toBe('active');
      await ctx.http.post('/v1/auth/login').send({ email: active.email, password: active.password }).expect(200);
    } finally {
      await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    }
  });

  it('desistência pela operação (CLI privacy:cancel-deletion) também restaura bloqueada; dono bloqueado: a loja volta suspensa, não aprovada', async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 24);
    try {
      const shop = await shopWith(ctx, [{ name: 'Item SEC182', priceCents: 3_000, stock: 5 }]);
      const ownerId = shop.store.ownerUserId;
      const [owner] = await ctx.db.select().from(users).where(eq(users.id, ownerId));
      await block(ownerId);
      expect((await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id)))[0]!.status).toBe('suspended');
      const { deleteTicket } = await (async () => {
        // o dono da loja de teste não tem senha conhecida: define uma e usa a via B
        await ctx.db.update(users).set({ passwordHash: await new PasswordService().hash('Senha-Forte-182!'), emailVerifiedAt: new Date() }).where(eq(users.id, ownerId));
        return (await post('start', { email: owner!.email, password: 'Senha-Forte-182!' }).expect(200)).body as { deleteTicket: string };
      })();
      await post('finish', { deleteTicket }).expect(200);
      expect((await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id)))[0]!.status).toBe('closed');

      const out = await service.cancelByOperator({ email: owner!.email, confirmEmail: owner!.email, reason: 'pedido do titular, identidade conferida pelo encarregado', identityProof: 'protocolo 123 e resposta ao e-mail cadastrado', osUser: 'ops', host: 'test' });
      expect(out).toMatchObject({ dryRun: false, storeRestored: true });
      expect(await statusOf(ownerId)).toBe('blocked');
      expect((await ctx.db.select().from(stores).where(eq(stores.id, shop.store.id)))[0]!.status).toBe('suspended');
    } finally {
      await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    }
  });

  it('o que continua recusado: conta já excluída e admin (resposta igual à de senha errada)', async () => {
    const user = await createCustomer(ctx);
    const { deleteTicket } = (await post('start', { email: user.email, password: user.password }).expect(200)).body as { deleteTicket: string };
    await post('finish', { deleteTicket }).expect(200);
    await post('start', { email: user.email, password: user.password }).expect(401);
    await post('start', { email: operations.email, password: operations.password }).expect(401);
  });
});
