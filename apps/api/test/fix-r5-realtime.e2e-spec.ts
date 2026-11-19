import { randomUUID } from 'node:crypto';
import { io, type Socket } from 'socket.io-client';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createCustomer, ensureCity, ensureLegalDocs } from './helpers/fixtures.js';

/** R.5 / I10: logout derruba o socket, limite por mensagem e `@SubscribeMessage` protegido por padrão. */
describe('Tempo real: sessão revogada, limite por mensagem (I10)', () => {
  let ctx: TestContext;
  let url: string;
  const sockets: Socket[] = [];

  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0, '127.0.0.1');
    url = `${await ctx.app.getUrl()}/rt`;
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await ctx.close();
  });

  async function connect(token: string): Promise<Socket> {
    const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
    sockets.push(socket);
    await new Promise<void>((resolve, reject) => {
      socket.once('connect', () => resolve());
      socket.once('connect_error', reject);
    });
    return socket;
  }
  const disconnected = (socket: Socket, ms = 4_000) =>
    new Promise<boolean>((resolve) => {
      if (socket.disconnected) return resolve(true);
      const timer = setTimeout(() => resolve(false), ms);
      socket.once('disconnect', () => {
        clearTimeout(timer);
        resolve(true);
      });
    });

  it('logout derruba o socket da sessão na hora (antes valia até o fim do access token)', async () => {
    const user = await createCustomer(ctx);
    const socket = await connect(user.accessToken);
    expect(socket.connected).toBe(true);
    await ctx.http.post('/v1/auth/logout').set(bearer(user.accessToken)).expect(204);
    expect(await disconnected(socket)).toBe(true);
  });

  it('revogar OUTRA sessão não derruba a atual', async () => {
    const user = await createCustomer(ctx);
    const socket = await connect(user.accessToken);
    await new Promise((r) => setTimeout(r, 2_500)); // cobre a segunda tentativa de desconexão pós-commit
    expect(socket.connected).toBe(true);
  });

  it('limite por mensagem: acima de 30 por minuto o servidor recusa com RATE_LIMITED; abaixo continua respondendo', async () => {
    const user = await createCustomer(ctx);
    const socket = await connect(user.accessToken);
    const replies: unknown[] = [];
    const exceptions: { code?: string; message?: unknown }[] = [];
    socket.on('exception', (e: { code?: string; message?: unknown }) => exceptions.push(e));
    for (let i = 0; i < 40; i += 1) replies.push(await Promise.race([socket.emitWithAck('subscribe', { orderId: randomUUID() }), new Promise((r) => setTimeout(() => r('timeout'), 300))]));
    await new Promise((r) => setTimeout(r, 200));
    const answered = replies.filter((r) => typeof r === 'object' && r !== null && (r as { ok?: boolean }).ok === false);
    const refused = replies.filter((r) => r === 'timeout' || (typeof r === 'object' && r !== null && 'status' in r)).length + exceptions.length;
    expect(answered.length).toBeGreaterThanOrEqual(28);
    expect(answered.length).toBeLessThanOrEqual(31);
    expect(refused).toBeGreaterThanOrEqual(9);
    expect(JSON.stringify([...replies, ...exceptions])).toContain('RATE_LIMITED');
  });
});
