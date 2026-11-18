import { safeErrorMessage } from '../../platform/logging/mask.js';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import { sha256Hex } from '../../platform/crypto/crypto.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { loginAttemptsEmail, panelPasswordChangedEmail, passwordChangedEmail } from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService, FeatureFlagsService, ParametersService } from '../admin/index.js';
import { UsersService, type DocumentRef } from '../users/index.js';
import type { z } from 'zod';
import { CodeService } from './code.service.js';
import { accessLog, adminProfiles, CODE_PURPOSES, userRoles, users } from './db/schema.js';
import { PasswordService } from './password.service.js';
import { SessionService, type TokenPair } from './session.service.js';
import { TicketService } from './ticket.service.js';
import { hasSecondFactor, TotpService, type VerifiedFactor } from './totp.service.js';
import type { registerSchema } from './auth.schemas.js';
import { isUniqueViolation } from '../admin/util.js';

type UserRow = typeof users.$inferSelect;

export interface AuthResult {
  user: { id: string; email: string; emailVerified: boolean; name: string };
  tokens: TokenPair;
  /** Admin sem TOTP configurado: o painel só libera a tela de configuração (SEC-015). */
  mfaSetupRequired: boolean;
}

/** SEC-090: senha certa de admin com TOTP devolve só este desafio, sem access nem refresh. */
export interface MfaChallenge {
  mfaRequired: true;
  mfaToken: string;
  /** Segundos de validade do `mfaToken` (5 min, uso único, 5 tentativas). */
  expiresIn: number;
}

export const MFA_TOKEN_TTL_SECONDS = 300;
export const MFA_TOKEN_MAX_ATTEMPTS = 5;
/** SEC-095: `reset_ticket` de 10 min, uso único. */
export const RESET_TICKET_TTL_SECONDS = 600;

/** Mensagem única para token inválido/vencido/usado e para código errado (SEC-090). */
const MFA_INVALID = () => new AppError(401, 'MFA_INVALID', 'Código incorreto ou vencido', { detail: 'Código incorreto ou vencido.' });

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
    private readonly tickets: TicketService,
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
      this.logger.warn(`Falha ao enviar código de confirmação: ${safeErrorMessage(error)}`);
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
    // SEC-124: código de QUALQUER finalidade e ticket aberto enviados ao endereço errado deixam de valer.
    for (const purpose of CODE_PURPOSES) await this.codes.invalidateActive(user.id, purpose);
    await this.tickets.invalidateAll(user.id);
    await this.sendVerificationCode({ ...user, email: newEmail }, ctx);
  }

  // ------------------------------------------------------------------- login

  /**
   * SEC-004 / WB-221: mensagem única, tempo igual para e-mail inexistente, espera de 15 min só para o IP que
   * errou 5 vezes, step-up por e-mail após 20 falhas/h na conta, sem bloqueio da conta do dono.
   */
  async login(
    input: { email: string; password: string; code?: string },
    ctx: RequestContext,
  ): Promise<AuthResult | MfaChallenge> {
    const maxFails = await this.params.getNumber('login_falhas');
    const waitSeconds = (await this.params.getNumber('login_espera_min')) * 60;
    const ip = ctx.ip ?? 'unknown';
    const failKey = `lf:${sha256Hex(input.email)}:${ip}`;

    // SEC-117: conta antes de conferir (INCR atômico); só as `maxFails` primeiras tentativas simultâneas conferem a senha.
    const attempt = await this.limiter.hit(failKey, waitSeconds);
    if (attempt.count > maxFails) {
      throw errors.tooMany(attempt.ttlSeconds || waitSeconds, 'Muitas tentativas. Tente em 15 minutos ou redefina a senha.');
    }

    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));
    const passwordOk = await this.passwords.verify(user?.passwordHash ?? null, input.password);
    if (!user || !passwordOk) {
      await this.registerFailure(failKey, user ?? null, maxFails, waitSeconds, ctx, attempt.count);
      throw INVALID_CREDENTIALS();
    }
    // Senha certa: devolve a contagem (o 2º fator tem o limite próprio por conta, SEC-091).
    await this.limiter.release(failKey);

    if (user.status !== 'active') {
      throw new AppError(403, 'ACCOUNT_BLOCKED', 'Conta indisponível', { detail: 'Conta indisponível. Fale com o suporte.' });
    }

    // Step-up: muitas falhas na conta (de qualquer origem) pedem um código enviado ao e-mail.
    const accountFails = await this.limiter.peek(`lfa:${user.id}`);
    const stepUpLimit = await this.params.getNumber('login_stepup_falhas_h');
    const needsStepUp = accountFails.count >= stepUpLimit;
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
    if (activeAdmin && !hasSecondFactor(activeAdmin) && activeAdmin.totpSetupDeadlineAt.getTime() <= Date.now()) {
      // SEC-113 (5): nunca configurou o 2º fator e o prazo de 48 h do convite/reativação acabou: senha sozinha não abre sessão.
      throw new AppError(403, 'ENROLLMENT_EXPIRED', 'Prazo de configuração vencido', {
        detail: 'O prazo para configurar o autenticador acabou. Peça um novo convite a um super admin.',
      });
    }
    if (activeAdmin && hasSecondFactor(activeAdmin)) {
      // SEC-090: 2 passos. A senha certa devolve só um token opaco; sessão só depois do código (`/auth/mfa/verify`).
      const mfaToken = await this.tickets.issue('mfa_login', user.id, MFA_TOKEN_TTL_SECONDS);
      return { mfaRequired: true, mfaToken, expiresIn: MFA_TOKEN_TTL_SECONDS };
    }
    await this.limiter.reset(failKey);
    if (needsStepUp) await this.limiter.reset(`lfa:${user.id}`);
    return this.openSession(user, activeAdmin?.profile ?? null, null, ctx);
  }

  /**
   * SEC-090, 2º passo: `mfaToken` (256 bits, 5 min, uso único, 5 tentativas) + TOTP ou código de recuperação.
   * Os erros de código somam no limite POR CONTA (SEC-091), de qualquer IP.
   */
  async verifyMfa(input: { mfaToken: string; code: string }, ctx: RequestContext): Promise<AuthResult> {
    const ticket = await this.tickets.attempt('mfa_login', input.mfaToken, MFA_TOKEN_MAX_ATTEMPTS);
    if (!ticket) throw MFA_INVALID();
    const factor = await this.totp.verifyWithLimits(ticket.userId, input.code, ctx);
    if (!factor) throw MFA_INVALID();
    if (!(await this.tickets.consume(ticket.id))) throw MFA_INVALID();
    const user = await this.getUser(ticket.userId);
    if (user.status !== 'active') throw new AppError(403, 'ACCOUNT_BLOCKED', 'Conta indisponível', { detail: 'Conta indisponível. Fale com o suporte.' });
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    await this.limiter.reset(`lf:${sha256Hex(user.email)}:${ctx.ip ?? 'unknown'}`);
    await this.limiter.reset(`lfa:${user.id}`);
    return this.openSession(user, admin?.active ? admin.profile : null, factor, ctx);
  }

  private async openSession(user: UserRow, adminProfile: string | null, factor: VerifiedFactor | null, ctx: RequestContext): Promise<AuthResult> {
    // SEC-113: código de recuperação abre sessão SEM MFA concluído (só reconfigura o TOTP) e fica marcada `recovery`.
    const mfaVerified = factor?.kind === 'totp';
    const mfaSetupRequired = adminProfile !== null && !mfaVerified;
    const { tokens } = await this.db.transaction(async (tx) => {
      await tx.update(users).set({ lastLoginAt: new Date() }).where(eq(users.id, user.id));
      await tx.insert(accessLog).values({ userId: user.id, event: 'login', ip: ctx.ip, userAgent: ctx.userAgent });
      return this.sessions.createSession(tx, user.id, ctx, { mfaVerified, mfaFactor: factor?.kind ?? null, reauth: true });
    });
    if (adminProfile) {
      await this.audit.recordStandalone(ctx, { action: 'admin.login', actorId: user.id, actorRole: adminProfile, targetType: 'user', targetId: user.id, after: { mfaVerified, factor: factor?.kind ?? null } });
    }
    return { user: this.summary(user), tokens, mfaSetupRequired };
  }

  private async registerFailure(
    failKey: string,
    user: UserRow | null,
    maxFails: number,
    waitSeconds: number,
    ctx: RequestContext,
    alreadyCounted?: number,
  ): Promise<void> {
    const count = alreadyCounted ?? (await this.limiter.hit(failKey, waitSeconds)).count;
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
   * SEC-006 / SEC-095: nova senha pela política, código de reset, confirma o e-mail, revoga TODAS as sessões e avisa
   * por e-mail. Admin com TOTP: o código do e-mail é conferido PRIMEIRO (sem ele o 2º fator nem é avaliado nem
   * contado, review B1) e devolve um `resetTicket`; a senha só é gravada em `completeReset`, com o TOTP validado NESSE
   * ticket. Admin não ganha sessão (o TOTP continua exigido no login).
   */
  async resetPassword(
    input: { email: string; code: string; newPassword: string },
    ctx: RequestContext,
  ): Promise<{ tokens: TokenPair | null; mfaRequired?: true; resetTicket?: string; expiresIn?: number }> {
    const [user] = await this.db.select().from(users).where(eq(users.email, input.email));
    await this.limiter.enforce(`rl:reset-confirm:${sha256Hex(input.email)}`, 10, 900);
    if (!user) {
      await this.passwords.verifyDummy(input.newPassword);
      throw new AppError(400, 'CODE_INVALID', 'Código incorreto', { detail: 'Confira o código ou peça um novo.' });
    }
    this.passwords.assertPolicy(input.newPassword, await this.params.getNumber('senha_min'));
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    // 1º passo, sempre: o código do e-mail. Errado, vencido ou usado: 400 sem tocar no limite do 2º fator (B1).
    await this.codes.verify(user.id, 'reset_password', input.code);

    if (admin?.active && !hasSecondFactor(admin)) {
      // SEC-113 / SEC-095: admin que nunca configurou o 2º fator não tem reset por e-mail; pede novo convite.
      throw new AppError(403, 'ADMIN_INVITE_REQUIRED', 'Peça um novo convite', {
        detail: 'Esta conta ainda não configurou o autenticador. Peça um novo convite a um super admin.',
      });
    }
    if (admin?.active) {
      const resetTicket = await this.tickets.issue('password_reset', user.id, RESET_TICKET_TTL_SECONDS, { emailVerified: true });
      return { tokens: null, mfaRequired: true, resetTicket, expiresIn: RESET_TICKET_TTL_SECONDS };
    }
    return { tokens: await this.applyNewPassword(user, input.newPassword, null, ctx) };
  }

  /**
   * SEC-095, passos 2 e 3: `resetTicket` (e-mail já validado) + TOTP ou código de recuperação + senha nova. O servidor só
   * grava a senha se os DOIS fatores foram validados neste ticket. Erro de código soma no limite POR CONTA (SEC-091).
   */
  async completeReset(input: { resetTicket: string; totpCode: string; newPassword: string }, ctx: RequestContext): Promise<{ tokens: null }> {
    const ticket = await this.tickets.attempt('password_reset', input.resetTicket, MFA_TOKEN_MAX_ATTEMPTS);
    if (!ticket?.emailVerifiedAt) throw MFA_INVALID();
    this.passwords.assertPolicy(input.newPassword, await this.params.getNumber('senha_min'));
    const factor = await this.totp.verifyWithLimits(ticket.userId, input.totpCode, ctx);
    if (!factor) throw MFA_INVALID();
    await this.tickets.markMfa(ticket.id, factor.kind);
    if (!(await this.tickets.consume(ticket.id))) throw MFA_INVALID();
    const user = await this.getUser(ticket.userId);
    await this.applyNewPassword(user, input.newPassword, factor, ctx);
    return { tokens: null };
  }

  private async applyNewPassword(user: UserRow, newPassword: string, factor: VerifiedFactor | null, ctx: RequestContext): Promise<TokenPair | null> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, user.id));
    const passwordHash = await this.passwords.hash(newPassword);
    const tokens = await this.db.transaction(async (tx) => {
      await tx
        .update(users)
        .set({ passwordHash, passwordChangedAt: new Date(), emailVerifiedAt: user.emailVerifiedAt ?? new Date(), updatedAt: new Date() })
        .where(eq(users.id, user.id));
      await this.sessions.revokeSessions(tx, user.id, 'password_reset');
      await tx.insert(accessLog).values({ userId: user.id, event: 'password_reset', ip: ctx.ip, userAgent: ctx.userAgent });
      if (admin?.active) {
        await this.audit.record(tx, ctx, {
          action: 'admin.password_reset',
          actorId: user.id,
          actorRole: admin.profile,
          targetType: 'user',
          targetId: user.id,
          after: { secondFactor: factor?.kind ?? null },
        });
      }
      if (user.status !== 'active' || admin?.active) return null;
      return (await this.sessions.createSession(tx, user.id, ctx, { mfaVerified: false, reauth: true })).tokens;
    });
    // O dono pode ter errado várias vezes antes de redefinir: zera a espera deste IP.
    await this.limiter.reset(`lf:${sha256Hex(user.email)}:${ctx.ip ?? 'unknown'}`);
    if (admin?.active) {
      // SEC-095: e-mail ao titular e alerta aos OUTROS super admins.
      this.mail.enqueue({ to: user.email, ...panelPasswordChangedEmail(user.email, true) });
      for (const other of await this.totp.superAdminEmails(user.id)) this.mail.enqueue({ to: other, ...panelPasswordChangedEmail(user.email, false) });
    } else {
      this.mail.enqueue({ to: user.email, ...passwordChangedEmail() });
    }
    return tokens;
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
      if (!(await this.totp.verifyWithLimits(user.id, input.totpCode, ctx, false))) {
        // SEC-091(d) / SEC-118: no 5º erro do 2º fator a sessão é encerrada.
        if ((await this.limiter.peek(`mfa:15:${user.id}`, false)).count >= 5) {
          await this.sessions.revokeSessions(this.db, user.id, 'mfa_reauth_failures', { onlySessionId: principal.sessionId });
        }
        throw INVALID_CREDENTIALS();
      }
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
    // SEC-117: conta antes de conferir.
    const { count, ttlSeconds } = await this.limiter.hit(key, waitSeconds);
    if (count > maxFails) throw errors.tooMany(ttlSeconds || waitSeconds, 'Muitas tentativas. Tente novamente mais tarde.');
    if (!(await this.passwords.verify(user.passwordHash, password))) {
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
