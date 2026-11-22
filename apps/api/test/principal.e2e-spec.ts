import { and, eq } from 'drizzle-orm';
import { PrincipalService } from '../src/modules/identity/principal.service.js';
import { adminProfiles, sessions, userRoles, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs, registerUser, type RegisteredUser } from './helpers/fixtures.js';

/**
 * I4 do review de desempenho (2026-11-22): `PrincipalService.load` virou UMA consulta com SQL cru (sessão + usuário + perfil de admin + papéis).
 * Teste de caracterização: toda checagem de autenticação (ADR-003: o banco decide a cada requisição) continua valendo.
 * Cada caso mexe no banco e confere o efeito pela rota real (o guard) e/ou pelo `load()`.
 */
describe('PrincipalService: consulta única mantém todas as checagens de autenticação (I4, SEC-010, SEC-182, SEC-015/016/168/176)', () => {
  let ctx: TestContext;
  let principals: PrincipalService;

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    principals = ctx.app.get(PrincipalService);
  });
  afterAll(async () => {
    await ctx.close();
  });

  const sessionOf = async (userId: string) => (await ctx.db.select().from(sessions).where(eq(sessions.userId, userId)))[0]!;
  const loadFor = async (user: { userId: string }) => principals.load(user.userId, (await sessionOf(user.userId)).id);
  const me = (user: { accessToken: string }) => ctx.http.get('/v1/me').set(bearer(user.accessToken));
  const adminRoute = (admin: { accessToken: string }) => ctx.http.get('/v1/admin/parameters').set(bearer(admin.accessToken));

  describe('quem não passa', () => {
    it('conta bloqueada e conta excluída (ou com exclusão em andamento): o access token já emitido dá 401 e `load()` devolve null', async () => {
      const blocked = await registerUser(ctx);
      const deleted = await registerUser(ctx);
      await me(blocked).expect(200);
      await me(deleted).expect(200);
      await ctx.db.update(users).set({ status: 'blocked' }).where(eq(users.id, blocked.userId));
      await ctx.db.update(users).set({ status: 'deleted' }).where(eq(users.id, deleted.userId));
      await me(blocked).expect(401);
      await me(deleted).expect(401);
      expect(await loadFor(blocked)).toBeNull();
      expect(await loadFor(deleted)).toBeNull();
    });

    it('sessão revogada: 401 na hora; sessão de outro usuário com o mesmo id de sessão: null (a consulta confere usuário E sessão)', async () => {
      const user = await registerUser(ctx);
      const other = await registerUser(ctx);
      const session = await sessionOf(user.userId);
      expect(await principals.load(other.userId, session.id)).toBeNull(); // sessão de outro dono
      expect(await principals.load(user.userId, '00000000-0000-4000-8000-000000000000')).toBeNull(); // sessão inexistente
      await ctx.db.update(sessions).set({ revokedAt: new Date(), revokedReason: 'teste' }).where(eq(sessions.id, session.id));
      await me(user).expect(401);
      expect(await principals.load(user.userId, session.id)).toBeNull();
    });

    it('sessão com `absolute_expires_at` vencido: 401 mesmo com o access token ainda dentro da validade', async () => {
      const user = await registerUser(ctx);
      await me(user).expect(200);
      await ctx.db.update(sessions).set({ absoluteExpiresAt: new Date(Date.now() - 1_000) }).where(eq(sessions.userId, user.userId));
      await me(user).expect(401);
      expect(await loadFor(user)).toBeNull();
    });
  });

  describe('papéis e dados da sessão', () => {
    it('usuário com 2 papéis devolve os 2; sem nenhum papel, lista vazia (nunca null); e-mail verificado e datas chegam tipados', async () => {
      const user = await registerUser(ctx);
      const base = await loadFor(user);
      expect(base!.principal.roles).toEqual(['customer']);
      expect(base!.principal.email).toBe(user.email);
      await ctx.db.insert(userRoles).values({ userId: user.userId, role: 'merchant' });
      const two = (await loadFor(user))!.principal;
      expect([...two.roles].sort()).toEqual(['customer', 'merchant']);
      // o papel vale na rota na hora (ADR-003: nada de papel dentro do JWT)
      await ctx.http.get('/v1/stores/mine').set(bearer(user.accessToken)).expect(200);
      await ctx.db.delete(userRoles).where(eq(userRoles.userId, user.userId));
      expect((await loadFor(user))!.principal.roles).toEqual([]);
      await ctx.http.get('/v1/stores/mine').set(bearer(user.accessToken)).expect(403);

      const loaded = (await loadFor(user))!;
      expect(loaded.sessionLastUsedAt).toBeInstanceOf(Date);
      const session = await sessionOf(user.userId);
      expect(loaded.sessionLastUsedAt.getTime()).toBe(session.lastUsedAt.getTime());
      expect(loaded.principal.adminProfile).toBeNull();
      expect(loaded.principal.totpConfigured).toBe(false);
      expect(loaded.principal.mfaVerified).toBe(false);
      expect(loaded.principal.reauthAt).toBeNull();
    });

    it('step-up: `reauth_at` chega como Date; `mfa_verified_at` e `mfa_factor` refletem a sessão', async () => {
      const user: RegisteredUser = await registerUser(ctx);
      const when = new Date(Date.now() - 60_000);
      await ctx.db.update(sessions).set({ reauthAt: when, mfaVerifiedAt: when, mfaFactor: 'recovery' }).where(eq(sessions.userId, user.userId));
      const { principal } = (await loadFor(user))!;
      expect(principal.reauthAt?.getTime()).toBe(when.getTime());
      expect(principal.mfaVerified).toBe(true);
      expect(principal.mfaFactor).toBe('recovery');
    });
  });

  describe('administrador', () => {
    it('admin ativo com MFA: perfil, TOTP configurado e MFA verificado; a rota de admin responde', async () => {
      const admin = await createAdmin(ctx, 'finance');
      const { principal } = (await loadFor(admin))!;
      expect(principal.adminProfile).toBe('finance');
      expect(principal.totpConfigured).toBe(true);
      expect(principal.mfaVerified).toBe(true);
      expect(principal.mfaFactor).toBe('totp');
      expect(principal.totpReenrollRequired).toBe(false);
      await adminRoute(admin).expect(200);
    });

    it('admin com `active = false` perde o perfil (`adminProfile` nulo, `totpConfigured` falso) e a rota de admin dá 403; reativar devolve na hora', async () => {
      const admin = await createAdmin(ctx, 'finance');
      await ctx.db.update(adminProfiles).set({ active: false }).where(eq(adminProfiles.userId, admin.userId));
      const { principal } = (await loadFor(admin))!;
      expect(principal.adminProfile).toBeNull();
      expect(principal.totpConfigured).toBe(false);
      expect(principal.totpReenrollRequired).toBe(false);
      expect(principal.roles).toEqual(['customer']); // continua autenticado como cliente
      await adminRoute(admin).expect(403);
      await ctx.db.update(adminProfiles).set({ active: true }).where(eq(adminProfiles.userId, admin.userId));
      expect((await loadFor(admin))!.principal.adminProfile).toBe('finance');
      await adminRoute(admin).expect(200);
    });

    it('MFA: sessão de admin sem `mfa_verified_at` dá 403 MFA_REQUIRED na rota de admin', async () => {
      const admin = await createAdmin(ctx, 'finance');
      await ctx.db.update(sessions).set({ mfaVerifiedAt: null, mfaFactor: null }).where(eq(sessions.userId, admin.userId));
      expect((await loadFor(admin))!.principal.mfaVerified).toBe(false);
      const res = await adminRoute(admin).expect(403);
      expect(res.body.code).toBe('MFA_REQUIRED');
    });

    it('reenrolamento de TOTP pendente (`totp_reenroll_required_at`) aparece no principal', async () => {
      const admin = await createAdmin(ctx, 'support');
      await ctx.db.update(adminProfiles).set({ totpReenrollRequiredAt: new Date() }).where(eq(adminProfiles.userId, admin.userId));
      expect((await loadFor(admin))!.principal.totpReenrollRequired).toBe(true);
    });

    it('admin parado além de `admin_inatividade_min` (padrão 30 min) recebe 401 SESSION_IDLE; cliente com a mesma inatividade segue autenticado', async () => {
      const admin = await createAdmin(ctx, 'finance');
      const customer = await registerUser(ctx);
      const idle = new Date(Date.now() - 45 * 60_000);
      await ctx.db.update(sessions).set({ lastUsedAt: idle }).where(and(eq(sessions.userId, admin.userId)));
      await ctx.db.update(sessions).set({ lastUsedAt: idle }).where(eq(sessions.userId, customer.userId));
      const res = await adminRoute(admin).expect(401);
      expect(res.body.code).toBe('SESSION_IDLE');
      await me(customer).expect(200);
    });
  });
});
