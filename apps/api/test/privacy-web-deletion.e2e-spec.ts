import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { authTickets, orders, users } from '../src/platform/database/schema.js';
import { createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, registerUser } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, customerAt, placeOrder, shopWith } from './helpers/orders.js';

describe('Excluir conta pela web (WB-214, SEC-096, DEC-025c)', () => {
  let ctx: TestContext;
  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(() => ctx.close());

  const ipOf = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const post = (path: string, body: Record<string, unknown>, ip = ipOf()) => ctx.http.post(`/v1/auth/account-deletion/${path}`).set('X-Forwarded-For', ip).send(body);
  const statusOf = async (userId: string) => (await ctx.db.select({ status: users.status }).from(users).where(eq(users.id, userId)))[0]!.status;

  it('via A (código): só vai para conta existente com e-mail confirmado; a resposta é igual para todas', async () => {
    const confirmed = await createCustomer(ctx);
    const unconfirmed = await registerUser(ctx);
    const ghost = `ninguem-${randomUUID().slice(0, 8)}@teste.webag.local`;
    ctx.mail.outbox.length = 0;
    // Zera o e-mail de código do cadastro da conta não confirmada.
    ctx.mail.outbox.length = 0;

    const a = await post('start', { email: confirmed.email }).expect(200);
    const b = await post('start', { email: unconfirmed.email }).expect(200);
    const c = await post('start', { email: ghost }).expect(200);
    expect(a.body).toEqual({ sent: true });
    expect(b.body).toEqual(a.body);
    expect(c.body).toEqual(a.body);
    expect(a.headers['set-cookie']).toBeUndefined();
    expect(ctx.mail.to(confirmed.email)).toHaveLength(1);
    expect(ctx.mail.to(unconfirmed.email)).toHaveLength(0); // SEC-096: nada vai a e-mail não confirmado
    expect(ctx.mail.to(ghost)).toHaveLength(0);

    const code = ctx.mail.lastCode(confirmed.email);
    expect((await post('verify-code', { email: confirmed.email, code: code === '000000' ? '111111' : '000000' }).expect(400)).body.code).toBe('CODE_INVALID');
    expect((await post('verify-code', { email: ghost, code: '123456' }).expect(400)).body.code).toBe('CODE_INVALID');
    const ok = (await post('verify-code', { email: confirmed.email, code }).expect(200)).body as { deleteTicket: string; expiresIn: number };
    expect(ok.expiresIn).toBe(600);
    await post('verify-code', { email: confirmed.email, code }).expect(400); // código de uso único

    const review = (await post('review', { deleteTicket: ok.deleteTicket }).expect(200)).body;
    expect(review).toMatchObject({ canDelete: true, blockers: [], anonymizationDays: 15 });
    const done = await post('finish', { deleteTicket: ok.deleteTicket }).expect(200);
    expect(done.body).toMatchObject({ status: 'completed' });
    expect(done.body.accessToken).toBeUndefined();
    expect(done.headers['set-cookie']).toBeUndefined(); // nenhuma sessão
    expect(await statusOf(confirmed.userId)).toBe('deleted');
    expect((await post('finish', { deleteTicket: ok.deleteTicket }).expect(410)).body.code).toBe('DELETE_TICKET_INVALID'); // uso único
    await ctx.http.post('/v1/auth/login').send({ email: confirmed.email, password: confirmed.password }).expect(401);
    const finalMail = ctx.mail.to(confirmed.email).at(-1)!;
    expect(finalMail.subject).toMatch(/excluída/);
  });

  it('via B (e-mail + senha): única via com e-mail não confirmado; senha errada, e-mail inexistente e admin respondem igual', async () => {
    const unconfirmed = await registerUser(ctx);
    const ghost = `ninguem-${randomUUID().slice(0, 8)}@teste.webag.local`;
    const admin = await createAdmin(ctx, 'operations');
    const ip = ipOf();
    const wrong = await post('start', { email: unconfirmed.email, password: 'errada-errada-1' }, ip).expect(401);
    const none = await post('start', { email: ghost, password: STRONG_PASSWORD }, ip).expect(401);
    const asAdmin = await post('start', { email: admin.email, password: admin.password }, ip).expect(401);
    for (const res of [none, asAdmin]) expect({ status: res.status, code: res.body.code, title: res.body.title, detail: res.body.detail }).toEqual({ status: wrong.status, code: wrong.body.code, title: wrong.body.title, detail: wrong.body.detail });
    expect(wrong.headers['set-cookie']).toBeUndefined();
    expect(await statusOf(admin.userId)).toBe('active'); // a conta do admin segue intacta
    await post('start', { email: admin.email, password: admin.password }).expect(401);
    expect(await statusOf(admin.userId)).toBe('active');

    const ok = await post('start', { email: unconfirmed.email, password: unconfirmed.password }).expect(200);
    expect(ok.body.deleteTicket).toEqual(expect.any(String));
    expect(ok.body.accessToken).toBeUndefined();
    expect(ok.headers['set-cookie']).toBeUndefined();
    ctx.mail.outbox.length = 0;
    await post('finish', { deleteTicket: ok.body.deleteTicket }).expect(200);
    expect(await statusOf(unconfirmed.userId)).toBe('deleted');
    // E-mail final a endereço não confirmado: só texto genérico (SEC-008d).
    const mail = ctx.mail.to(unconfirmed.email).at(-1)!;
    expect(mail.text).not.toContain('Maria');
    expect(mail.text).not.toMatch(/pedido|R\$/i);
  });

  it('ticket vence em 10 min, não serve para outra conta e é ligado a quem o abriu; limite de 5 por hora por IP e por e-mail', async () => {
    const user = await createCustomer(ctx);
    const ticket = (await post('start', { email: user.email, password: user.password }).expect(200)).body.deleteTicket as string;
    await ctx.db.update(authTickets).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(authTickets.userId, user.userId));
    await post('review', { deleteTicket: ticket }).expect(410);
    await post('finish', { deleteTicket: ticket }).expect(410);
    await post('finish', { deleteTicket: 'token-inventado-0000000000000' }).expect(410);
    expect(await statusOf(user.userId)).toBe('active');

    const ip = '10.88.0.1';
    for (let i = 0; i < 5; i += 1) await post('start', { email: `x${i}-${randomUUID().slice(0, 6)}@teste.webag.local` }, ip).expect(200);
    await post('start', { email: `y-${randomUUID().slice(0, 6)}@teste.webag.local` }, ip).expect(429);
    const target = `alvo-${randomUUID().slice(0, 6)}@teste.webag.local`;
    for (let i = 0; i < 5; i += 1) await post('start', { email: target }).expect(200);
    await post('start', { email: target }).expect(429);
    await post('start', { email: 'nao-email' }).expect(400);
    await post('start', { email: user.email, extra: 1 }).expect(400);
  });

  it('bloqueio: pedido em aberto impede a confirmação (409 com a lista) e o ticket continua valendo até concluir', async () => {
    const shop = await shopWith(ctx, [{ name: 'Bolsa', priceCents: 5_000, stock: 5 }]);
    const { user, addressId } = await customerAt(ctx, shop.origin);
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, user, addressId)).body as { id: string };
    await approve(ctx, user, (await attemptOf(ctx, created.id)).id);

    const ticket = (await post('start', { email: user.email, password: user.password }).expect(200)).body.deleteTicket as string;
    const review = (await post('review', { deleteTicket: ticket }).expect(200)).body;
    expect(review).toMatchObject({ canDelete: false });
    expect(review.blockers[0]).toMatchObject({ kind: 'order', id: created.id });
    const blocked = await post('finish', { deleteTicket: ticket }).expect(409);
    expect(blocked.body.code).toBe('DELETION_BLOCKED');
    expect(await statusOf(user.userId)).toBe('active');

    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, created.id));
    await post('finish', { deleteTicket: ticket }).expect(200);
    expect(await statusOf(user.userId)).toBe('deleted');
  });
});
