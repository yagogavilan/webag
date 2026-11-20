import { and, eq } from 'drizzle-orm';
import { BreakGlassError, BreakGlassService } from '../src/modules/identity/break-glass.service.js';
import { adminProfiles, auditLog, invitations, users } from '../src/platform/database/schema.js';
import { bearer, createTestApp, randomIp, type TestContext } from './helpers/app.js';
import { createAdmin, ensureLegalDocs } from './helpers/fixtures.js';

/** SEC-094: break-glass por CLI (a CLI é um invólucro fino do serviço; sem rota HTTP). */
describe('Break-glass (SEC-094)', () => {
  let ctx: TestContext;
  let service: BreakGlassService;
  const reason = 'Super admin único perdeu aparelho e códigos de recuperação';
  const base = { osUser: 'ops', host: 'api-prod-1' };

  beforeAll(async () => {
    ctx = await createTestApp();
    await ensureLegalDocs(ctx);
    service = ctx.app.get(BreakGlassService);
  });
  afterAll(async () => {
    await ctx.close();
  });

  /** Deixa só `keep` como super admin ativo (os demais viram suporte inativo para não interferir). */
  const onlySuper = async (keepUserId: string) => {
    const rows = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.profile, 'super_admin'));
    for (const row of rows.filter((r) => r.userId !== keepUserId)) await ctx.db.update(adminProfiles).set({ active: false }).where(eq(adminProfiles.userId, row.userId));
  };
  const fail = async (promise: Promise<unknown>): Promise<BreakGlassError> => {
    const error = await promise.then(
      () => null,
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(BreakGlassError);
    return error as BreakGlassError;
  };

  it('recusa confirmação diferente, motivo curto e alvo que não é admin ativo; nada é alterado', async () => {
    const admin = await createAdmin(ctx, 'super_admin');
    await onlySuper(admin.userId);
    expect((await fail(service.resetAccess({ ...base, email: admin.email, confirmEmail: 'outro@x.com', reason }))).code).toBe('CONFIRM_MISMATCH');
    expect((await fail(service.resetAccess({ ...base, email: admin.email, confirmEmail: admin.email, reason: 'curto' }))).code).toBe('REASON_TOO_SHORT');
    expect((await fail(service.resetAccess({ ...base, email: 'ninguem@teste.webag.local', confirmEmail: 'ninguem@teste.webag.local', reason }))).code).toBe('NOT_AN_ACTIVE_ADMIN');
    const [still] = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.userId, admin.userId));
    expect(still?.totpConfirmedAt).not.toBeNull();
  });

  it('--dry-run não altera nada', async () => {
    const admin = await createAdmin(ctx, 'super_admin');
    await onlySuper(admin.userId);
    const result = await service.resetAccess({ ...base, email: admin.email, confirmEmail: admin.email, reason, dryRun: true });
    expect(result).toMatchObject({ dryRun: true, override: false });
    const [user] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    expect(user?.passwordHash).not.toBeNull();
    await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(200);
    expect(await ctx.db.select().from(invitations).where(eq(invitations.email, admin.email))).toHaveLength(0);
  });

  it('com outro super admin ativo com TOTP recusa; com --override executa e gera alerta extra', async () => {
    const target = await createAdmin(ctx, 'super_admin');
    const other = await createAdmin(ctx, 'super_admin');
    const refused = await fail(service.resetAccess({ ...base, email: target.email, confirmEmail: target.email, reason }));
    expect(refused.code).toBe('OTHER_SUPER_ADMIN_EXISTS');
    await ctx.http.get('/v1/admin/regions/cities').set(bearer(target.accessToken)).expect(200);

    await service.resetAccess({ ...base, email: target.email, confirmEmail: target.email, reason, overrideOtherSuperAdmins: true });
    await ctx.http.get('/v1/admin/regions/cities').set(bearer(target.accessToken)).expect(401);
    expect(ctx.mail.to(other.email).some((m) => m.subject.includes('override'))).toBe(true);
    const [row] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, target.userId), eq(auditLog.action, 'admin.access_reset_cli')));
    expect(row?.after).toMatchObject({ actorType: 'system_cli', override: true });
  });

  it('super admin único: TOTP e senha removidos, sessões caem, link vai SÓ ao e-mail cadastrado, auditoria system_cli; o resultado não traz o link', async () => {
    const admin = await createAdmin(ctx, 'super_admin');
    await onlySuper(admin.userId);
    const before = ctx.mail.outbox.length;
    const result = await service.resetAccess({ ...base, email: admin.email, confirmEmail: admin.email.toUpperCase(), reason });
    expect(JSON.stringify(result)).not.toMatch(/token|convite|http/i);

    const [profile] = await ctx.db.select().from(adminProfiles).where(eq(adminProfiles.userId, admin.userId));
    expect(profile?.totpConfirmedAt).toBeNull();
    expect(profile?.totpSecretEnc).toBeNull();
    const [user] = await ctx.db.select().from(users).where(eq(users.id, admin.userId));
    expect(user?.passwordHash).toBeNull();
    await ctx.http.get('/v1/admin/regions/cities').set(bearer(admin.accessToken)).expect(401);

    const sent = ctx.mail.outbox.slice(before);
    const withLink = sent.filter((m) => /token=/.test(m.text));
    expect(withLink).toHaveLength(1);
    expect(withLink[0]?.to).toBe(admin.email);

    const [log] = await ctx.db.select().from(auditLog).where(and(eq(auditLog.targetId, admin.userId), eq(auditLog.action, 'admin.access_reset_cli')));
    expect(log).toMatchObject({ actorId: null, actorRole: 'system_cli', reason });
    expect(log?.after).toMatchObject({ actorType: 'system_cli', osUser: 'ops', host: 'api-prod-1', override: false });

    // reativa pelo link com senha nova (nunca com a senha antiga)
    const token = /token=([A-Za-z0-9_-]+)/.exec(withLink[0]?.text ?? '')?.[1];
    await ctx.http.post('/v1/auth/invitations/accept').set('X-Forwarded-For', randomIp()).send({ token, password: 'senha-nova-reativada-77' }).expect(200);
  });

  it('não existe rota HTTP de redefinição de emergência', async () => {
    for (const path of ['/admin-reset-access', '/v1/admin-reset-access', '/v1/admin/reset-access', '/v1/admin/break-glass']) {
      await ctx.http.post(path).send({}).expect(404);
    }
  });
});
