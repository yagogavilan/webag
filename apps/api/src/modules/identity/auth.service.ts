import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { loginAttemptsEmail, passwordChangedEmail } from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { UsersService, type DocumentRef } from '../users/index.js';
import type { z } from 'zod';
import { CodeService } from './code.service.js';
import { accessLog, adminProfiles, userRoles, users } from './db/schema.js';
import { PasswordService } from './password.service.js';
import { SessionService, type TokenPair } from './session.service.js';
import { TotpService } from './totp.service.js';
import type { registerSchema } from './auth.schemas.js';
import { isUniqueViolation } from '../admin/util.js';

type UserRow = typeof users.$inferSelect;

export interface AuthResult {
  user: { id: string; email: string; emailVerified: boolean; name: string };
  tokens: TokenPair;
  /** Admin sem TOTP configurado: o painel só libera a tela de configuração (SEC-015). */
  mfaSetupRequired: boolean;
}

const INVALID_CREDENTIALS = () =>
  new AppError(401, 'INVALID_CREDENTIALS', 'E-mail ou senha incorretos', { detail: 'E-mail ou senha incorretos.' });

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly passwords: PasswordService,
    private readonly sessions: SessionService,
    private readonly codes: CodeService,
    private readonly totp: TotpService,
    private readonly params: ParametersService,
    private readonly flags: FeatureFlagsService,
    private readonly limiter: RateLimitService,
    private readonly users: UsersService,
    private readonly audit: AuditService,
    private readonly mail: MailService,
  ) {}

  // ---------------------------------------------------------------- cadastro

  /** WB-006 / WB-210: cria conta de cliente, registra aceite versionado, envia código e já abre sessão. */
  async register(input: z.infer<typeof registerSchema>, ctx: RequestContext): Promise<AuthResult> {
    // SEC-063: 20 contas/h por IP (o decorator do controller) e 3/dia por dispositivo.
    if (ctx.deviceId) await this.limiter.enforce(`rl:register-device:${ctx.deviceId}`, 3, 86_400);

    this.passwords.assertPolicy(input.password, await this.params.getNumber('senha_min'));
    const documentIds = await this.users.resolveAcceptance(input.acceptedDocuments, ['customer_terms', 'privacy']);
    const passwordHash = await this.passwords.hash(input.password);

    let created: UserRow;
    let result: { sessionId: string; tokens: TokenPair };
    try {
      ({ created, result } = await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email: input.email, passwordHash, name: input.name, phone: input.phone, adultDeclaredAt: new Date(), passwordChangedAt: new Date() })
          .returning();
        if (!user) throw new Error('Falha ao criar usuário');
        await tx.insert(userRoles).values({ userId: user.id, role: 'customer' });
        await this.users.recordAcceptance(tx, user.id, documentIds, ctx);
        const session = await this.sessions.createSession(tx, user.id, ctx, { mfaVerified: false });
        await tx.insert(accessLog).values({ userId: user.id, event: 'register', ip: ctx.ip, userAgent: ctx.userAgent });
        return { created: user, result: session };
      }));
    } catch (error) {
      // WB-006 C3: sem revelar se a conta existente foi confirmada.
      if (isUniqueViolation(error)) {
        throw errors.conflict('EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem conta', 'Esse e-mail já tem conta. Entrar?');
      }
      throw error;
    }

    await this.sendVerificationCode(created, ctx).catch((error: unknown) => {
      // O cadastro já está feito; o cliente pede "Reenviar" (WB-194 C2).
      this.logger.warn(`Falha ao enviar código de confirmação: ${(error as Error).message}`);
    });
    return { user: this.summary(created), tokens: result.tokens, mfaSetupRequired: false };
  }

  /** SEC-005: consulta "e-mail primeiro". Só `{exists}`, com limite por IP no controller e por dispositivo aqui. */
  async emailExists(email: string, ctx: RequestContext): Promise<boolean> {
    if (ctx.deviceId) await this.limiter.enforce(`rl:email-exists-device:${ctx.deviceId}`, 50, 86_400);
    const [row] = await this.db.select({ id: users.id }).from(users).where(eq(users.email, email));
    return row !== undefined;
  }

  private async sendVerificationCode(user: UserRow, ctx: RequestContext): Promise<void> {
    await this.codes.enforceSendLimits(user.id, 'verify_email', user.email, ctx);
    await this.codes.issue(user.id, 'verify_email', user.email);
  }

  /** WB-007 C4: reenvio (60 s entre envios, 5/h). */
  async resendVerification(principal: Principal, ctx: RequestContext): Promise<void> {
    const user = await this.getUser(principal.userId);
    if (user.emailVerifiedAt) throw errors.conflict('EMAIL_ALREADY_VERIFIED', 'E-mail já confirmado');
    await this.sendVerificationCode(user, ctx);
  }

  async verifyEmail(principal: Principal, code: string): Promise<void> {
    const user = await this.getUser(principal.userId);
    if (user.emailVerifiedAt) return;
    await this.codes.verify(user.id, 'verify_email', code);
    await this.db.update(users).set({ emailVerifiedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
  }

  /** WB-224 C4: "Corrigir e-mail" (com a senha) enquanto não confirmado; o código anterior deixa de valer. */
  async correctEmail(principal: Principal, newEmail: string, password: string, ctx: RequestContext): Promise<void> {
    const user = await this.getUser(principal.userId);
    if (user.emailVerifiedAt) throw errors.forbidden('EMAIL_ALREADY_VERIFIED', 'E-mail confirmado só muda por troca de e-mail com código.');
    await this.assertPassword(user, password, ctx, 'correct_email');
    try {
      await this.db.update(users).set({ email: newEmail, updatedAt: new Date() }).where(eq(users.id, user.id));
    } catch (error) {
      if (isUniqueViolation(error)) throw errors.conflict('EMAIL_ALREADY_REGISTERED', 'Esse e-mail já tem conta');
      throw error;
    }
    await this.codes.invalidateActive(user.id, 'verify_email');
    await this.sendVerificationCode({ ...user, email: newEmail }, ctx);
  }

  // ------------------------------------------------------------------- login

  /**
   * SEC-004 / WB-221: mensagem única, tempo igual para e-mail inexistente, espera de 15 min só para o IP que
   * errou 5 vezes, step-up por e-mail após 20 falhas/h na conta, sem bloqueio da conta do dono.
   */
  async login(
    input: { email: string; password: string; totpCode?: string; code?: string },
    ctx: RequestContext,
  ): Promise<AuthResult> {
    const maxFails = await this.params.getNumber('login_falhas');
    const waitSeconds = (await this.params.getNumber('login_espera_min')) * 60;
    const ip = ctx.ip ?? 'unknown';
    const failKey = `lf:${sha256Hex(input.email)}:${ip}`;

    const state = await this.limiter.peek(failKey);
    if (state.count >= maxFails) {
      throw errors.tooMany(state.ttlSeconds || waitSeconds, 'Muitas tentativas. Tente em 15 minutos ou redefina a senha.');
    }

    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));
    const passwordOk = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !passwordOk) {
      await this.registerFailure(failKey, user ?? null, maxFails, waitSeconds, ctx);
      throw INVALID_CREDENTIALS();
    }

    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_BLOCKED', 'Conta indisponível', { detail: 'Conta indisponível. Fale com o suporte.' });
    }

    // Step-up: muitas falhas na conta (de qualquer origem) pedem um código enviado ao e-mail.
    const accountFails = await this.limiter.peek(`lfa:${user.id}`);
    const stepUpLimit = await this.params.getNumber('login_stepup_falhas_h');
    const needsStepUp = accountFails.count > stepUpLimit;
    if (needsStepUp) {
      if (!input.code) {
        await this.codes.enforceSendLimits(user.id, 'login_stepup', user.email, ctx);
        await this.codes.issue(user.id, 'login_stepup', user.email);
        throw errors.forbidden('LOGIN_CODE_REQUIRED', 'Enviamos um código para o seu e-mail. Informe-o para entrar.');
      }
      await this.codes.verify(user.id, 'login_stepup', input.code);
    }

    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    const activeAdmin = admin?.active ? admin : null;
    let mfaVerified = false;
    let mfaSetupRequired = false;
    if (activeAdmin) {
      if (activeAdmin.totpConfirmedAt) {
        if (!input.totpCode) throw new AppError(401, 'TOTP_REQUIRED', 'Informe o código do autenticador', { detail: 'Informe o código do app autenticador.' });
        const kind = await this.totp.verifyLoginCode(user.id, input.totpCode);
        if (!kind) {
          // WB-222 C4: não diz qual passo falhou; conta no mesmo limite de falhas.
          await this.registerFailure(failKey, user, maxFails, waitSeconds, ctx);
          throw INVALID_CREDENTIALS();
        }
        // Código de recuperação entra uma vez e força reconfigurar o TOTP (WB-222 C5): sessão sem MFA concluído.
        mfaVerified = kind === 'totp';
        mfaSetupRequired = kind === 'recovery';
      } else {
        mfaSetupRequired = true;
      }
    }

    await this.limiter.reset(failKey);
    if (needsStepUp) await this.limiter.reset(`lfa:${user.id}`);

    const { tokens } = await this.db.transaction(async (tx) => {
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await tx.insert(accessLog).values({ userId: user.id, event: 'login', ip: ctx.ip, userAgent: ctx.userAgent });
      return this.sessions.createSession(tx, user.id, ctx, { mfaVerified, reauth: true });
    });
    if (activeAdmin) {
      await this.audit.recordStandalone(ctx, { action: 'admin.login', actorId: user.id, actorRole: activeAdmin.profile, targetType: 'user', targetId: user.id, after: { mfaVerified } });
    }
    return { user: this.summary(user), tokens, mfaSetupRequired };
  }

  private async registerFailure(failKey: string, user: UserRow | null, maxFails: number, waitSeconds: number, ctx: RequestContext): Promise<void> {
    const { count } = await this.limiter.hit(failKey, waitSeconds);
    if (count >= maxFails) await this.limiter.setWindow(failKey, waitSeconds);
    if (!user) return;
    await this.limiter.hit(`lfa:${user.id}`, 3600);
    if (count === maxFails) {
      // WB-100 C2 / WB-221 C7: auditoria do bloqueio de IP e aviso ao dono (no máximo 1 por hora).
      const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
      if (admin) {
        await this.audit.recordStandalone(ctx, { action: 'admin.login_throttled', actorId: user.id, actorRole: admin.profile, targetType: 'user', targetId: user.id });
      }
      const roles = await this.db.select({ role: userRoles.role }).from(userRoles).where(eq(userRoles.userId, user.id));
      if (admin || roles.some((r) => r.role === 'merchant')) {
        const mails = await this.limiter.hit(`lfmail:${user.id}`, 3600, false);
        if (mails.count === 1) this.mail.enqueue({ to: user.email, ...loginAttemptsEmail() });
      }
    }
  }

  // ----------------------------------------------------------------- refresh

  refresh(refreshToken: string, ctx: RequestContext): Promise<TokenPair> {
    return this.sessions.refresh(refreshToken, ctx);
  }

  async logout(principal: Principal): Promise<void> {
    await this.sessions.revokeSessions(this.db, principal.userId, 'logout', { onlySessionId: principal.sessionId });
  }

  async logoutAll(principal: Principal): Promise<void> {
    await this.sessions.revokeSessions(this.db, principal.userId, 'logout_all');
  }

  // ------------------------------------------------------------ reset de senha

  /**
   * WB-009 C1 / SEC-003: resposta idêntica exista ou não o e-mail. Os limites são por e-mail/IP (iguais nos dois
   * casos), então o 429 também não revela existência.
   */
  async forgotPassword(email: string, ctx: RequestContext): Promise<void> {
    const ownerKey = sha256Hex(email);
    await this.codes.enforceSendLimits(ownerKey, 'reset_password', email, ctx);
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user || user.status === 'deleted') return;
    await this.codes.issue(user.id, 'reset_password', user.email);
  }

  /**
   * SEC-006: nova senha pela política, código de reset, confirma o e-mail, revoga TODAS as sessões e avisa por e-mail.
   * Admin não ganha sessão aqui (o TOTP continua exigido no login).
   */
  async resetPassword(input: { email: string; code: string; newPassword: string }, ctx: RequestContext): Promise<{ tokens: TokenPair | null }> {
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));
    await this.limiter.enforce(`rl:reset-confirm:${sha256Hex(input.email)}`, 10, 900);
    if (!user) {
      await this.passwords.verifyDummy(input.newPassword);
      throw new AppError(400, 'CODE_INVALID', 'Código incorreto', { detail: 'Confira o código ou peça um novo.' });
    }
    this.passwords.assertPolicy(input.newPassword, await this.params.getNumber('senha_min'));
    await this.codes.verify(user.id, 'reset_password', input.code);

    const passwordHash = await this.passwords.hash(input.newPassword);
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    const tokens = await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, passwordChangedAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await this.sessions.revokeSessions(tx, user.id, 'password_reset');
      await tx.insert(accessLog).values({ userId: user.id, event: 'password_reset', ip: ctx.ip, userAgent: ctx.userAgent });
      if (user.status !== 'active' || admin?.active) return null;
      return (await this.sessions.createSession(tx, user.id, ctx, { mfaVerified: false, reauth: true })).tokens;
    });
    // O dono pode ter errado várias vezes antes de redefinir: zera a espera deste IP.
    await this.limiter.reset(`lf:${sha256Hex(input.email)}:${ctx.ip ?? 'unknown'}`);
    this.mail.enqueue({ to: user.email, ...passwordChangedEmail() });
    return { tokens };
  }

  /** SEC-007: troca logado pede a senha atual; revoga todas as sessões e abre uma nova. */
  async changePassword(principal: Principal, input: { currentPassword: string; newPassword: string }, ctx: RequestContext): Promise<TokenPair> {
    const user = await this.getUser(principal.userId);
    await this.assertPassword(user, input.currentPassword, ctx, 'change_password');
    this.passwords.assertPolicy(input.newPassword, await this.params.getNumber('senha_min'));
    const passwordHash = await this.passwords.hash(input.newPassword);
    const tokens = await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash, passwordChangedAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
      await this.sessions.revokeSessions(tx, user.id, 'password_changed');
      const session = await this.sessions.createSession(tx, user.id, ctx, { mfaVerified: principal.mfaVerified, reauth: true });
      return session.tokens;
    });
    this.mail.enqueue({ to: user.email, ...passwordChangedEmail() });
    return tokens;
  }

  // --------------------------------------------------------------- reautenticar

  /** SEC-016: senha (cliente/lojista) ou TOTP (admin) abre uma janela de `reauth_min`. */
  async reauth(principal: Principal, input: { password?: string; totpCode?: string }, ctx: RequestContext): Promise<void> {
    const user = await this.getUser(principal.userId);
    if (principal.adminProfile && principal.totpConfigured) {
      if (!input.totpCode) throw errors.validation([{ field: 'totpCode', message: 'Informe o código do autenticador.' }]);
      await this.limiter.enforce(`rl:reauth:${user.id}`, 10, 900);
      if (!(await this.totp.verifyLoginCode(user.id, input.totpCode, false))) throw INVALID_CREDENTIALS();
    } else {
      if (!input.password) throw errors.validation([{ field: 'password', message: 'Informe sua senha.' }]);
      await this.assertPassword(user, input.password, ctx, 'reauth');
    }
    await this.sessions.markReauth(principal.sessionId);
  }

  // ------------------------------------------------------------------- lojista

  /** WB-050 C2/C4 / SEC-008(b): papel de lojista só com e-mail confirmado, flag ligada e aceite dos termos do lojista. */
  async grantMerchantRole(principal: Principal, accepted: DocumentRef[], ctx: RequestContext): Promise<void> {
    if (!principal.emailVerified) throw errors.forbidden('EMAIL_VERIFICATION_REQUIRED', 'Confirme seu e-mail para criar a conta de lojista.');
    if (!(await this.flags.isEnabled('cadastro_lojista'))) {
      throw errors.forbidden('MERCHANT_SIGNUP_DISABLED', 'Cadastro de lojas indisponível.');
    }
    if (principal.roles.includes('merchant')) return;
    const ids = await this.users.resolveAcceptance(accepted, ['merchant_terms']);
    await this.db.transaction(async (tx) => {
      await tx.insert(userRoles).values({ userId: principal.userId, role: 'merchant' }).onConflictDoNothing();
      await this.users.recordAcceptance(tx, principal.userId, ids, ctx);
    });
  }

  // ------------------------------------------------------------------- helpers

  /** Confere a senha atual contando falhas no mesmo limite do login (WB-221 C6). Erro: 403. */
  private async assertPassword(user: UserRow, password: string, ctx: RequestContext, scope: string): Promise<void> {
    const maxFails = await this.params.getNumber('login_falhas');
    const waitSeconds = (await this.params.getNumber('login_espera_min')) * 60;
    const key = `lf:${scope}:${user.id}:${ctx.ip ?? 'unknown'}`;
    const state = await this.limiter.peek(key);
    if (state.count >= maxFails) throw errors.tooMany(state.ttlSeconds || waitSeconds, 'Muitas tentativas. Tente novamente mais tarde.');
    if (!(await this.passwords.verify(user.passwordHash, password))) {
      const { count } = await this.limiter.hit(key, waitSeconds);
      if (count >= maxFails) await this.limiter.setWindow(key, waitSeconds);
      throw errors.forbidden('INVALID_PASSWORD', 'Senha incorreta.');
    }
    await this.limiter.reset(key);
  }

  async getUser(userId: string): Promise<UserRow> {
    const [user] = await this.db.select().from(users).where(and(eq(users.id, userId)));
    if (!user) throw errors.notFound();
    return user;
  }

  private summary(user: UserRow): AuthResult['user'] {
    return { id: user.id, email: user.email, emailVerified: user.emailVerifiedAt !== null, name: user.name };
  }
}
