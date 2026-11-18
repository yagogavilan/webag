import { and, eq } from 'drizzle-orm';
import { decryptSecret } from '../src/platform/crypto/crypto.js';
import { ConfigService } from '@nestjs/config';
import { auditLog, invitations, paymentAccounts, paymentAlerts, paymentOauthStates, sessions, storeMembers, stores } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, STRONG_PASSWORD, uniqueEmail, type TestContext } from './helpers/app.js';
import {
  connectFakeAccount,
  createAdmin,
  createMerchant,
  createStoreViaApi,
  ensureCities,
  ensureLegalDocs,
  expireReauth,
  reauth,
  registerUser,
  uniqueCpf,
  type TestAdmin,
} from './helpers/fixtures.js';

/** Onda 2A: conta de recebimento (WB-053, SEC-045..048) e equipe (WB-075, SEC-014/016/017). */
describe('Onda 2A: conta de recebimento e equipe', () => {
  let ctx: TestContext;
  let ops: TestAdmin;
  let superAdmin: TestAdmin;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    await ensureCities(ctx);
    ops = await createAdmin(ctx, 'operations');
    superAdmin = await createAdmin(ctx, 'super_admin');
  });
  afterAll(async () => {
    await ctx.close();
  });

  describe('conta de recebimento (O2-PGT)', () => {
    it('O2-PGT-01: dono com senha recente conecta (fake); 5 min depois → 403 REAUTH_REQUIRED; funcionário → 403', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      await expireReauth(ctx, m.userId);
      const denied = await ctx.http.post(`/v1/stores/${store.id}/payment-account/connect`).set(bearer(m.accessToken)).send({}).expect(403);
      expect(denied.body.code).toBe('REAUTH_REQUIRED');
      const done = await connectFakeAccount(ctx, m, store.id);
      expect(done.status).toBe(200);
      expect(done.body).toMatchObject({ connected: true, status: 'active', holderMatchesStore: true });
      expect(JSON.stringify(done.body)).not.toContain(store.documentNumber);

      const staff = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: store.id, userId: staff.userId, role: 'staff', permissions: ['orders', 'catalog'] });
      await reauth(ctx, staff);
      await ctx.http.post(`/v1/stores/${store.id}/payment-account/connect`).set(bearer(staff.accessToken)).send({}).expect(403);
      await ctx.http.get(`/v1/stores/${store.id}/payment-account`).set(bearer(staff.accessToken)).expect(403);
    });

    it('O2-PGT-02/14: state de outra sessão, reutilizado, vencido, de outra loja e duplo toque → 400 e NADA gravado', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      await reauth(ctx, m);
      const start = () => ctx.http.post(`/v1/stores/${store.id}/payment-account/connect`).set(bearer(m.accessToken)).send({}).expect(200);
      const callback = (body: Record<string, unknown>, token = m.accessToken, storeId = store.id) => ctx.http.post(`/v1/stores/${storeId}/payment-account/callback`).set(bearer(token)).send(body);
      const accountRows = () => ctx.db.select().from(paymentAccounts).where(eq(paymentAccounts.storeId, store.id));

      // duplo toque em "Conectar": só o último state vale
      const first = (await start()).body.state as string;
      const second = (await start()).body.state as string;
      expect((await callback({ code: 'fake-ok', state: first }).expect(400)).body.detail).toBe('Link expirado. Conecte de novo.');
      expect(await accountRows()).toHaveLength(0);
      expect(await ctx.db.select().from(paymentOauthStates).where(and(eq(paymentOauthStates.storeId, store.id)))).toHaveLength(2);

      // sem state / state inválido
      await callback({ code: 'fake-ok' }).expect(400);
      await callback({ code: 'fake-ok', state: 'x'.repeat(43) }).expect(400);
      // state de OUTRA sessão do mesmo usuário
      const otherSession = await ctx.http.post('/v1/auth/login').set('X-Forwarded-For', randomIp()).send({ email: m.email, password: STRONG_PASSWORD }).expect(200);
      await callback({ code: 'fake-ok', state: second }, otherSession.body.tokens.accessToken).expect(400);
      // de outra loja do mesmo dono: a rota exige membro; outro lojista é 404
      const other = await createMerchant(ctx);
      await callback({ code: 'fake-ok', state: second }, other.accessToken).expect(404);
      expect(await accountRows()).toHaveLength(0);

      // vencido (10 min e 1 s)
      await ctx.db.update(paymentOauthStates).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(paymentOauthStates.storeId, store.id));
      await callback({ code: 'fake-ok', state: second }).expect(400);
      // state novo e bom: conecta; reutilizar o mesmo → 400
      const good = (await start()).body.state as string;
      await callback({ code: 'fake-ok', state: good }).expect(200);
      await callback({ code: 'fake-ok', state: good }).expect(400);
      // O2-PGT-03: redirect_uri vem da configuração: o corpo não aceita o campo
      await callback({ code: 'fake-ok', state: good, redirect_uri: 'https://evil.test' }).expect(400);
      const stored = await ctx.db.select().from(paymentOauthStates).where(eq(paymentOauthStates.storeId, store.id));
      expect(stored.every((s) => s.stateHash.length === 64 && s.stateHash !== good)).toBe(true); // só o hash (256 bits) fica no banco
    });

    it('O2-PGT-05: OAuth negado não vincula nada; a etapa continua pendente', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m);
      const res = await connectFakeAccount(ctx, m, store.id, 'fake-denied');
      expect(res.status).toBe(422);
      expect(res.body.code).toBe('OAUTH_DENIED');
      expect((await ctx.http.get(`/v1/stores/${store.id}/payment-account`).set(bearer(m.accessToken)).expect(200)).body).toEqual({ connected: false });
    });

    it('O2-PGT-08 / SEC-047: titular diferente fica "em análise", a loja NÃO fica apta, o admin é alertado e libera com TOTP recente, motivo e auditoria', async () => {
      const m = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, m, { complete: true, submit: false });
      // troca a conta do onboarding por uma com titular divergente
      await reauth(ctx, m);
      await ctx.http.delete(`/v1/stores/${store.id}/payment-account`).set(bearer(m.accessToken)).expect(204);
      const res = await connectFakeAccount(ctx, m, store.id, `fake-holder:${uniqueCpf()}`);
      expect(res.body).toMatchObject({ status: 'under_review', holderMatchesStore: false });
      expect(res.body.holderDocumentMasked).toMatch(/^\*+\d\d$/);
      expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'payment_account_holder_mismatch'))).length).toBeGreaterThan(0);
      expect(ctx.mail.to(m.email).some((mail) => mail.subject.includes('em análise'))).toBe(true);

      const queueDetail = await ctx.http.get(`/v1/admin/stores/${store.id}`).set(bearer(ops.accessToken)).expect(200);
      expect(queueDetail.body.paymentAccount.status).toBe('under_review');
      await ctx.http.post(`/v1/admin/stores/${store.id}/payment-account/release`).set(bearer(ops.accessToken)).send({ reason: 'curto' }).expect(400);
      await expireReauth(ctx, ops.userId);
      expect((await ctx.http.post(`/v1/admin/stores/${store.id}/payment-account/release`).set(bearer(ops.accessToken)).send({ reason: 'Titular é o sócio, contrato social conferido' }).expect(403)).body.code).toBe('REAUTH_REQUIRED');
      await ctx.http.post('/v1/auth/reauth').set(bearer(ops.accessToken)).send({ totpCode: (await import('./helpers/app.js')).totpAt(ops.totpSecret!, 1) }).expect(204);
      await ctx.http.post(`/v1/admin/stores/${store.id}/payment-account/release`).set(bearer(ops.accessToken)).send({ reason: 'Titular é o sócio, contrato social conferido' }).expect(204);
      const [account] = await ctx.db.select().from(paymentAccounts).where(and(eq(paymentAccounts.storeId, store.id), eq(paymentAccounts.status, 'active')));
      expect(account).toBeDefined();
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, store.id), eq(auditLog.action, 'store.payment_account_release')))).length).toBe(1);
      // uma 2ª liberação não tem o que liberar
      await ctx.http.post(`/v1/admin/stores/${store.id}/payment-account/release`).set(bearer(ops.accessToken)).send({ reason: 'Titular é o sócio, contrato social conferido' }).expect(409);
    });

    it('O2-PGT-09 / SEC-046: tokens cifrados (AES-256-GCM, AAD = loja); ciphertext trocado entre lojas não decifra; ausentes de respostas e auditoria', async () => {
      const [a, b] = [await createMerchant(ctx), await createMerchant(ctx)];
      const [sa, sb] = [await createStoreViaApi(ctx, a), await createStoreViaApi(ctx, b)];
      const resA = await connectFakeAccount(ctx, a, sa.id);
      await connectFakeAccount(ctx, b, sb.id);
      const encKey = ctx.app.get(ConfigService).get<string>('PAYMENT_TOKEN_ENC_KEY')!;
      const [rowA] = await ctx.db.select().from(paymentAccounts).where(eq(paymentAccounts.storeId, sa.id));
      const [rowB] = await ctx.db.select().from(paymentAccounts).where(eq(paymentAccounts.storeId, sb.id));
      expect(rowA?.tokensEnc).not.toMatch(/fake-access/);
      const plain = decryptSecret(rowA!.tokensEnc, encKey, 'payment-oauth', `store:${sa.id}:k1`);
      expect(plain).toContain('fake-access');
      expect(() => decryptSecret(rowA!.tokensEnc, encKey, 'payment-oauth', `store:${sb.id}:k1`)).toThrow();
      expect(() => decryptSecret(rowB!.tokensEnc, encKey, 'payment-oauth', `store:${sa.id}:k1`)).toThrow();
      expect(JSON.stringify(resA.body)).not.toMatch(/fake-access|fake-refresh|tokensEnc/);
      const audits = JSON.stringify(await ctx.db.select().from(auditLog).where(eq(auditLog.targetId, sa.id)));
      expect(audits).not.toMatch(/fake-access|fake-refresh/);
    });

    it('O2-PGT-14 / R-37a: a mesma conta do provedor em duas lojas → 409; trocar/desconectar exige senha recente, avisa o dono, audita e alerta o admin (SEC-048)', async () => {
      const [a, b] = [await createMerchant(ctx), await createMerchant(ctx)];
      const [sa, sb] = [await createStoreViaApi(ctx, a), await createStoreViaApi(ctx, b)];
      expect((await connectFakeAccount(ctx, a, sa.id, 'fake-ok:conta-compartilhada')).status).toBe(200);
      const dup = await connectFakeAccount(ctx, b, sb.id, 'fake-ok:conta-compartilhada');
      expect(dup.status).toBe(409);
      expect(dup.body.code).toBe('PAYMENT_ACCOUNT_IN_USE');

      await expireReauth(ctx, a.userId);
      expect((await ctx.http.delete(`/v1/stores/${sa.id}/payment-account`).set(bearer(a.accessToken)).expect(403)).body.code).toBe('REAUTH_REQUIRED');
      await reauth(ctx, a);
      await ctx.http.delete(`/v1/stores/${sa.id}/payment-account`).set(bearer(a.accessToken)).expect(204);
      expect(ctx.mail.to(a.email).some((mail) => mail.subject.includes('conta de recebimento'))).toBe(true);
      expect(ctx.mail.to(superAdmin.email).some((mail) => mail.subject.includes('Conta de recebimento'))).toBe(true);
      expect((await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, sa.id), eq(auditLog.action, 'store.payment_account_disconnect')))).length).toBe(1);
      expect((await ctx.db.select().from(paymentAlerts).where(eq(paymentAlerts.kind, 'payment_account_changed'))).length).toBeGreaterThan(0);
      await ctx.http.delete(`/v1/stores/${sa.id}/payment-account`).set(bearer(a.accessToken)).expect(404);
      // a conta liberada pode ser usada pela outra loja
      expect((await connectFakeAccount(ctx, b, sb.id, 'fake-ok:conta-compartilhada')).status).toBe(200);
    });

    it('O2-PGT-12 / DEC-016: nenhuma rota do contrato retém, ajusta ou desconta valor do lojista', async () => {
      const { listRoutes } = await import('./helpers/app.js');
      const bad = listRoutes(ctx.app).filter((r) => /hold|retain|withhold|discount-merchant|deduct/i.test(r.path));
      expect(bad).toEqual([]);
    });
  });

  describe('equipe (O2-EQP)', () => {
    const invite = (owner: { accessToken: string }, storeId: string, body: Record<string, unknown>) => ctx.http.post(`/v1/stores/${storeId}/members/invitations`).set(bearer(owner.accessToken)).send(body);
    const tokenFromMail = (email: string): string => /token=([A-Za-z0-9_-]+)/.exec(ctx.mail.to(email).findLast((m) => /token=/.test(m.text))?.text ?? '')?.[1] ?? '';

    it('O2-EQP-01/02/07: convite de 7 dias com hash no banco; permissão inexistente → 422; sem reautenticação → 403; funcionário não convida', async () => {
      const owner = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, owner);
      const email = uniqueEmail('joana');
      await expireReauth(ctx, owner.userId);
      expect((await invite(owner, store.id, { email, name: 'Joana Silva', permissions: ['orders'] }).expect(403)).body.code).toBe('REAUTH_REQUIRED');
      await reauth(ctx, owner);
      expect((await invite(owner, store.id, { email, name: 'Joana Silva', permissions: ['orders', 'finance'] }).expect(422)).body.code).toBe('INVALID_PERMISSION');
      const ok = await invite(owner, store.id, { email, name: 'Joana Silva', permissions: ['orders', 'catalog'] }).expect(201);
      const [row] = await ctx.db.select().from(invitations).where(eq(invitations.id, ok.body.invitationId));
      expect(((row?.expiresAt.getTime() ?? 0) - Date.now()) / 86_400_000).toBeGreaterThan(6.99);
      const token = tokenFromMail(email);
      expect(row?.tokenHash).not.toBe(token);
      expect(row?.tokenHash).toHaveLength(64);

      // convidar sem ser dono
      const staffUser = await createMerchant(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: store.id, userId: staffUser.userId, role: 'staff', permissions: ['orders', 'catalog'] });
      await reauth(ctx, staffUser);
      await invite(staffUser, store.id, { email: uniqueEmail(), name: 'Outro Nome', permissions: [] }).expect(403);
    });

    it('O2-EQP-01/08/10: aceite cria conta com e-mail JÁ confirmado; 2º uso, revogado, vencido ou lixo → 410; reenviar invalida o anterior', async () => {
      const owner = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, owner);
      const email = uniqueEmail('carlos');
      await invite(owner, store.id, { email, name: 'Carlos Souza', permissions: ['catalog'] }).expect(201);
      const first = tokenFromMail(email);
      await invite(owner, store.id, { email, name: 'Carlos Souza', permissions: ['catalog'] }).expect(201); // reenvio
      const second = tokenFromMail(email);
      expect(second).not.toBe(first);
      const accept = (token: string, password = STRONG_PASSWORD) => ctx.http.post('/v1/auth/store-invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password });
      await accept(first).expect(410);
      await accept('x'.repeat(43)).expect(410);
      const weak = await accept(second, '12345678').expect(422);
      expect(weak.body.code).toBeDefined();
      const ok = await accept(second).expect(200);
      expect(ok.body.storeId).toBe(store.id);
      await accept(second).expect(410);
      const [user] = await ctx.db.select().from((await import('../src/platform/database/schema.js')).users).where(eq((await import('../src/platform/database/schema.js')).users.email, email));
      expect(user?.emailVerifiedAt).not.toBeNull(); // R-09e: o clique prova a posse
      const [member] = await ctx.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.userId, user!.id)));
      expect(member).toMatchObject({ role: 'staff', permissions: ['catalog'] });

      const email2 = uniqueEmail('revogado');
      const inv = await invite(owner, store.id, { email: email2, name: 'Revogado Teste', permissions: [] }).expect(201);
      await ctx.http.delete(`/v1/stores/${store.id}/members/invitations/${inv.body.invitationId}`).set(bearer(owner.accessToken)).expect(204);
      await accept(tokenFromMail(email2)).expect(410);
      const email3 = uniqueEmail('vencido');
      const late = await invite(owner, store.id, { email: email3, name: 'Vencido Teste', permissions: [] }).expect(201);
      await ctx.db.update(invitations).set({ expiresAt: new Date(Date.now() - 1000) }).where(eq(invitations.id, late.body.invitationId));
      await accept(tokenFromMail(email3)).expect(410);
    });

    it('O2-EQP-05: e-mail já membro de outra loja → mesma mensagem genérica, que não revela se tem conta', async () => {
      const [o1, o2] = [await createMerchant(ctx), await createMerchant(ctx)];
      const [s1, s2] = [await createStoreViaApi(ctx, o1), await createStoreViaApi(ctx, o2)];
      const member = await registerUser(ctx);
      await ctx.db.insert(storeMembers).values({ storeId: s1.id, userId: member.userId, role: 'staff', permissions: [] });
      const taken = await invite(o2, s2.id, { email: member.email, name: 'Já Membro', permissions: [] }).expect(422);
      expect(taken.body.code).toBe('CANNOT_INVITE');
      // e-mail que é dono de outra loja: idem
      const ownerTaken = await invite(o2, s2.id, { email: o1.email, name: 'Dono Outro', permissions: [] }).expect(422);
      expect(ownerTaken.body).toMatchObject({ code: 'CANNOT_INVITE', detail: taken.body.detail });
      // e-mail sem conta e e-mail de cliente comum: convite aceito (201) sem distinção
      await invite(o2, s2.id, { email: uniqueEmail(), name: 'Sem Conta', permissions: [] }).expect(201);
      const customer = await registerUser(ctx);
      await invite(o2, s2.id, { email: customer.email, name: 'Cliente Comum', permissions: [] }).expect(201);
      // aceitar com conta existente exige a senha dela
      const token = tokenFromMail(customer.email);
      await ctx.http.post('/v1/auth/store-invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: 'senha-errada-qualquer-1' }).expect(401);
      await ctx.http.post('/v1/auth/store-invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: customer.password }).expect(200);
    });

    it('O2-EQP-03/09: matriz funcionário × rotas: financeiro, conta de recebimento, equipe e configurações → 403 sempre; outra loja → 404', async () => {
      const [o1, o2] = [await createMerchant(ctx), await createMerchant(ctx)];
      const [s1, s2] = [await createStoreViaApi(ctx, o1), await createStoreViaApi(ctx, o2)];
      const routes: { method: 'get' | 'put' | 'post' | 'patch' | 'delete'; path: (id: string) => string; body?: Record<string, unknown> }[] = [
        { method: 'get', path: (id) => `/v1/stores/${id}/settings` },
        { method: 'get', path: (id) => `/v1/stores/${id}/payment-account` },
        { method: 'post', path: (id) => `/v1/stores/${id}/payment-account/connect` },
        { method: 'delete', path: (id) => `/v1/stores/${id}/payment-account` },
        { method: 'get', path: (id) => `/v1/stores/${id}/members` },
        { method: 'post', path: (id) => `/v1/stores/${id}/members/invitations`, body: { email: uniqueEmail(), name: 'Alguém Aí', permissions: [] } },
        { method: 'put', path: (id) => `/v1/stores/${id}/hours`, body: { days: [] } },
        { method: 'put', path: (id) => `/v1/stores/${id}/delivery`, body: {} },
        { method: 'put', path: (id) => `/v1/stores/${id}/exchange-policy`, body: { voluntaryDays: 0 } },
        { method: 'patch', path: (id) => `/v1/stores/${id}/profile`, body: { name: 'X Y' } },
        { method: 'post', path: (id) => `/v1/stores/${id}/submit` },
        { method: 'get', path: (id) => `/v1/stores/${id}/documents` },
        { method: 'get', path: (id) => `/v1/stores/${id}/activity` },
      ];
      for (const permissions of [[], ['orders'], ['orders', 'catalog', 'exchanges', 'coupons', 'reviews', 'sales_values']]) {
        const staff = await registerUser(ctx);
        await ctx.db.insert(storeMembers).values({ storeId: s1.id, userId: staff.userId, role: 'staff', permissions });
        await reauth(ctx, staff);
        for (const route of routes) {
          const res = await ctx.http[route.method](route.path(s1.id)).set(bearer(staff.accessToken)).send(route.body ?? {});
          expect(res.status, `${route.method} ${route.path(s1.id)} com [${permissions.join(',')}]`).toBe(403);
          const foreign = await ctx.http[route.method](route.path(s2.id)).set(bearer(staff.accessToken)).send(route.body ?? {});
          expect(foreign.status, `${route.method} ${route.path(s2.id)} (outra loja)`).toBe(404);
        }
      }
      // dono da loja 1 em loja 2 → 404 em todas
      for (const route of routes) expect((await ctx.http[route.method](route.path(s2.id)).set(bearer(o1.accessToken)).send(route.body ?? {})).status, route.path(s2.id)).toBe(404);
    });

    it('O2-EQP-04 / SEC-014: remover funcionário derruba access e refresh dele na hora; o dono não se remove; permissões valem na próxima requisição', async () => {
      const owner = await createMerchant(ctx);
      const store = await createStoreViaApi(ctx, owner);
      const email = uniqueEmail('maria');
      await invite(owner, store.id, { email, name: 'Maria Souza', permissions: ['orders'] }).expect(201);
      const accepted = await ctx.http.post('/v1/auth/store-invitations/accept').set('X-Forwarded-For', randomIp()).send({ token: tokenFromMail(email), password: STRONG_PASSWORD }).expect(200);
      const staffAccess = accepted.body.tokens.accessToken as string;
      const staffRefresh = accepted.body.tokens.refreshToken as string;
      const [staffRow] = await ctx.db.select().from(storeMembers).where(and(eq(storeMembers.storeId, store.id), eq(storeMembers.role, 'staff')));

      await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(staffAccess)).expect(200);
      // permissões: antes sem 'catalog'
      expect((await ctx.http.get(`/v1/stores/${store.id}/activity`).set(bearer(staffAccess)).expect(403)).status).toBe(403);
      await ctx.http.patch(`/v1/stores/${store.id}/members/${staffRow!.userId}`).set(bearer(owner.accessToken)).send({ permissions: ['orders', 'catalog', 'ninja'] }).expect(422);
      await ctx.http.patch(`/v1/stores/${store.id}/members/${staffRow!.userId}`).set(bearer(owner.accessToken)).send({ permissions: ['orders', 'catalog'] }).expect(204);
      const log = await ctx.http.get(`/v1/stores/${store.id}/activity`).set(bearer(owner.accessToken)).expect(200);
      expect(JSON.stringify(log.body)).toMatch(/team\.permissions/);
      expect(JSON.stringify(log.body)).not.toMatch(/@teste\.webag\.local/); // sem dado de pessoa além do nome

      await ctx.http.delete(`/v1/stores/${store.id}/members/${owner.userId}`).set(bearer(owner.accessToken)).expect(409);
      await ctx.http.delete(`/v1/stores/${store.id}/members/${staffRow!.userId}`).set(bearer(owner.accessToken)).expect(204);
      await ctx.http.get(`/v1/stores/${store.id}`).set(bearer(staffAccess)).expect(401);
      await ctx.http.post('/v1/auth/refresh').set('X-Forwarded-For', randomIp()).send({ refreshToken: staffRefresh }).expect(401);
      expect((await ctx.db.select().from(sessions).where(eq(sessions.userId, staffRow!.userId))).every((s) => s.revokedAt !== null)).toBe(true);
      const members = await ctx.http.get(`/v1/stores/${store.id}/members`).set(bearer(owner.accessToken)).expect(200);
      expect(members.body.members).toHaveLength(1);
      expect(await ctx.db.select({ id: stores.id }).from(stores).where(eq(stores.id, store.id))).toHaveLength(1);
    });
  });
});
