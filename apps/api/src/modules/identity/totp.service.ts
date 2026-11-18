import { Inject, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, count, eq, isNull, ne, sql } from 'drizzle-orm';
import type { Principal, RequestContext } from '../../platform/auth/decorators.js';
import type { Env } from '../../platform/config/env.js';
import { hmacHex, randomToken, sha256Hex } from '../../platform/crypto/crypto.js';
import { openMfaSecret, sealMfaSecret } from '../../platform/crypto/mfa-seal.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { MailService } from '../../platform/mail/mail.service.js';
import {
  accessResetEmail,
  accessResetNoticeEmail,
  mfaBruteforceEmail,
  mfaThreeErrorsEmail,
  recoveryCodesRegeneratedEmail,
  recoveryCodeUsedEmail,
} from '../../platform/mail/templates.js';
import { RateLimitService } from '../../platform/ratelimit/rate-limit.service.js';
import { AuditService } from '../admin/index.js';
import { adminProfiles, adminRecoveryCodes, invitations, users } from './db/schema.js';
import { SessionService } from './session.service.js';
import { generateRecoveryCode, generateTotpSecret, normalizeRecoveryCode, otpauthUri, verifyTotp } from './totp.js';

const RECOVERY_CODE_COUNT = 10;
/** SEC-092: com 3 códigos ou menos o painel pede para gerar novos. */
export const RECOVERY_LOW_THRESHOLD = 3;
/** SEC-090: o segredo pendente vale 10 min e aceita no máximo 10 erros. */
export const TOTP_SETUP_TTL_MS = 10 * 60_000;
export const TOTP_SETUP_MAX_ATTEMPTS = 10;
/** SEC-093 / SEC-017: link de reativação com as regras do convite de admin. */
export const ACCESS_RESET_HOURS = 48;
export const RESET_CHANNELS = ['video_call', 'in_person', 'registered_phone'] as const;

export interface VerifiedFactor {
  kind: 'totp' | 'recovery';
  /** Códigos de recuperação que sobraram depois deste uso (só para `recovery`). */
  remaining: number;
}

export type ResetOrigin = 'super_admin' | 'cli' | 'cli_override';

/** TOTP obrigatório para todo admin (SEC-015, WB-222, SEC-090..SEC-093). */
@Injectable()
export class TotpService {
  private readonly logger = new Logger(TotpService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly config: ConfigService<Env, true>,
    private readonly sessions: SessionService,
    private readonly audit: AuditService,
    private readonly limiter: RateLimitService,
    private readonly mail: MailService,
  ) {}

  /** SEC-090: chave própria, fora do banco. */
  private get key(): string {
    return this.config.get('MFA_ENC_KEY', { infer: true });
  }

  private recoveryHash(userId: string, code: string): string {
    return hmacHex(this.config.get('AUTH_HMAC_KEY', { infer: true }), `recovery:${userId}:${normalizeRecoveryCode(code)}`);
  }

  private requireAdmin(principal: Principal): void {
    if (!principal.adminProfile) throw errors.forbidden();
  }

  // ---------------------------------------------------------------- setup

  /** Inicia a configuração. Enquanto não confirmada, repetir a chamada gera um segredo novo (e reinicia os 10 min). */
  async setup(principal: Principal): Promise<{ secret: string; otpauthUri: string }> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, principal.userId));
    if (!admin?.active) throw errors.forbidden();
    if (admin.totpConfirmedAt) {
      throw errors.conflict('TOTP_ALREADY_CONFIGURED', 'TOTP já configurado', 'Use um código de recuperação ou peça a redefinição a outro super admin.');
    }
    const secret = generateTotpSecret();
    await this.db
      .update(adminProfiles)
      .set({
        totpSecretEnc: sealMfaSecret(secret, principal.userId, this.key),
        totpLastStep: null,
        totpSetupStartedAt: new Date(),
        totpSetupAttempts: 0,
        updatedAt: new Date(),
      })
      .where(eq(adminProfiles.userId, principal.userId));
    return { secret, otpauthUri: otpauthUri(principal.email, secret) };
  }

  /** Confirma com um código, libera a sessão e mostra os 10 códigos de recuperação UMA vez (WB-222 C2). */
  async confirm(principal: Principal, code: string, ctx: RequestContext): Promise<{ recoveryCodes: string[] }> {
    // A tentativa é contada ANTES de conferir o código, numa operação atômica: 10 requisições paralelas não passam de 10.
    const [admin] = await this.db
      .update(adminProfiles)
      .set({ totpSetupAttempts: sql`${adminProfiles.totpSetupAttempts} + 1` })
      .where(and(eq(adminProfiles.userId, principal.userId), isNull(adminProfiles.totpConfirmedAt)))
      .returning();
    if (!admin?.active || !admin.totpSecretEnc || !admin.totpSetupStartedAt) {
      throw errors.conflict('TOTP_NOT_STARTED', 'Inicie a configuração do TOTP');
    }
    if (Date.now() - admin.totpSetupStartedAt.getTime() > TOTP_SETUP_TTL_MS) {
      await this.discardPending(principal.userId);
      throw errors.conflict('TOTP_SETUP_EXPIRED', 'Configuração vencida', 'O QR code vale por 10 minutos. Comece de novo.');
    }
    if (admin.totpSetupAttempts > TOTP_SETUP_MAX_ATTEMPTS) {
      await this.discardPending(principal.userId);
      throw new AppError(429, 'TOTP_SETUP_LOCKED', 'Muitas tentativas', { detail: 'Código errado vezes demais. Comece a configuração de novo.' });
    }
    const check = verifyTotp(openMfaSecret(admin.totpSecretEnc, principal.userId, this.key), code, Date.now(), null);
    if (!check.ok) throw errors.unauthenticated('Código inválido.');

    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminProfiles)
        .set({ totpConfirmedAt: new Date(), totpLastStep: check.step, totpSetupStartedAt: null, totpSetupAttempts: 0, updatedAt: new Date() })
        .where(eq(adminProfiles.userId, principal.userId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, principal.userId));
      await tx.insert(adminRecoveryCodes).values(
        recoveryCodes.map((recovery) => ({ userId: principal.userId, codeHash: this.recoveryHash(principal.userId, recovery) })),
      );
      await this.audit.record(tx, ctx, { action: 'admin.totp_configured', targetType: 'user', targetId: principal.userId });
    });
    await this.sessions.markMfaVerified(principal.sessionId);
    return { recoveryCodes };
  }

  private async discardPending(userId: string): Promise<void> {
    await this.db
      .update(adminProfiles)
      .set({ totpSecretEnc: null, totpSetupStartedAt: null, totpSetupAttempts: 0, updatedAt: new Date() })
      .where(and(eq(adminProfiles.userId, userId), isNull(adminProfiles.totpConfirmedAt)));
  }

  // ---------------------------------------------------- códigos de recuperação

  async recoveryRemaining(userId: string): Promise<number> {
    const [row] = await this.db
      .select({ total: count() })
      .from(adminRecoveryCodes)
      .where(and(eq(adminRecoveryCodes.userId, userId), isNull(adminRecoveryCodes.usedAt)));
    return row?.total ?? 0;
  }

  async status(principal: Principal): Promise<{ configured: boolean; recoveryCodesRemaining: number; recoveryCodesLow: boolean }> {
    this.requireAdmin(principal);
    const remaining = await this.recoveryRemaining(principal.userId);
    return { configured: principal.totpConfigured, recoveryCodesRemaining: remaining, recoveryCodesLow: principal.totpConfigured && remaining <= RECOVERY_LOW_THRESHOLD };
  }

  /** SEC-092: regenerar exige TOTP vigente (reautenticação, SEC-016), invalida todos os anteriores e avisa por e-mail. */
  async regenerateRecoveryCodes(principal: Principal, ctx: RequestContext): Promise<{ recoveryCodes: string[] }> {
    this.requireAdmin(principal);
    if (!principal.totpConfigured) throw errors.conflict('TOTP_NOT_CONFIGURED', 'Configure o TOTP primeiro');
    const recoveryCodes = Array.from({ length: RECOVERY_CODE_COUNT }, generateRecoveryCode);
    await this.db.transaction(async (tx) => {
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, principal.userId));
      await tx.insert(adminRecoveryCodes).values(
        recoveryCodes.map((recovery) => ({ userId: principal.userId, codeHash: this.recoveryHash(principal.userId, recovery) })),
      );
      await this.audit.record(tx, ctx, { action: 'admin.recovery_codes_regenerated', targetType: 'user', targetId: principal.userId });
    });
    this.mail.enqueue({ to: principal.email, ...recoveryCodesRegeneratedEmail() });
    return { recoveryCodes };
  }

  // ------------------------------------------------------------ verificação

  /**
   * SEC-091: limite do 2º fator POR CONTA, de qualquer IP. 5 erros em 15 min colocam o passo em espera (sem conferir o
   * código); 3 erros avisam o titular; 10 erros em 24 h invalidam a senha, revogam as sessões e alertam os super admins.
   * Só é alcançável por quem já tem a senha: não vira bloqueio da conta por terceiros.
   */
  async verifyWithLimits(userId: string, input: string, ctx: RequestContext, allowRecovery = true): Promise<VerifiedFactor | null> {
    const window = await this.limiter.peek(`mfa:15:${userId}`);
    if (window.count >= 5) {
      throw new AppError(429, 'MFA_RATE_LIMITED', 'Muitas tentativas do código', {
        detail: 'Muitas tentativas do código de verificação. Tente novamente mais tarde.',
        retryAfterSeconds: window.ttlSeconds || 900,
      });
    }
    const factor = await this.verifyLoginCode(userId, input, allowRecovery);
    if (factor) {
      if (factor.kind === 'recovery') await this.onRecoveryUsed(userId, factor.remaining, ctx);
      return factor;
    }

    const fifteen = await this.limiter.hit(`mfa:15:${userId}`, 900);
    const day = await this.limiter.hit(`mfa:24:${userId}`, 86_400);
    const email = await this.emailOf(userId);
    if (fifteen.count === 3 && (await this.limiter.hit(`mfa:mail:${userId}`, 3600, false)).count === 1) {
      this.mail.enqueue({ to: email, ...mfaThreeErrorsEmail() });
    }
    if (day.count === 10) await this.suspectBruteforce(userId, email, ctx);
    return null;
  }

  /** SEC-091(c): invalida a senha, derruba sessões, avisa titular e super admins, audita. */
  private async suspectBruteforce(userId: string, email: string, ctx: RequestContext): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, userId));
      await this.sessions.revokeSessions(tx, userId, 'mfa_bruteforce_suspected');
      await this.audit.record(tx, ctx, { action: 'mfa_bruteforce_suspected', actorId: userId, targetType: 'user', targetId: userId });
    });
    this.mail.enqueue({ to: email, ...mfaBruteforceEmail(email, true) });
    for (const superAdmin of await this.superAdminEmails()) this.mail.enqueue({ to: superAdmin, ...mfaBruteforceEmail(email, false) });
  }

  /** SEC-092: aviso ao titular (sem o código) e auditoria. */
  private async onRecoveryUsed(userId: string, remaining: number, ctx: RequestContext): Promise<void> {
    this.mail.enqueue({ to: await this.emailOf(userId), ...recoveryCodeUsedEmail(remaining) });
    await this.audit
      .recordStandalone(ctx, { action: 'admin.recovery_code_used', actorId: userId, targetType: 'user', targetId: userId, after: { remaining } })
      .catch((error: unknown) => this.logger.warn(`Falha ao auditar uso de código de recuperação: ${(error as Error).message}`));
  }

  /**
   * Aceita TOTP (6 dígitos) ou código de recuperação (uso único). Recuperação força reconfigurar o TOTP (WB-222 C5):
   * o segredo é descartado e a sessão sai sem MFA concluído (escopo `mfa_setup`).
   */
  async verifyLoginCode(userId: string, input: string, allowRecovery = true): Promise<VerifiedFactor | null> {
    const [admin] = await this.db.select().from(adminProfiles).where(eq(adminProfiles.userId, userId));
    if (!admin?.totpSecretEnc || !admin.totpConfirmedAt) return null;

    if (/^\d{6}$/.test(input)) {
      return this.db.transaction(async (tx) => {
        const [locked] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, userId)).for('update');
        if (!locked?.totpSecretEnc) return null;
        const check = verifyTotp(openMfaSecret(locked.totpSecretEnc, userId, this.key), input, Date.now(), locked.totpLastStep);
        if (!check.ok) return null;
        await tx.update(adminProfiles).set({ totpLastStep: check.step }).where(eq(adminProfiles.userId, userId));
        return { kind: 'totp' as const, remaining: 0 };
      });
    }

    if (!allowRecovery || normalizeRecoveryCode(input).length !== 16) return null;
    const used = await this.db
      .update(adminRecoveryCodes)
      .set({ usedAt: new Date() })
      .where(and(eq(adminRecoveryCodes.userId, userId), eq(adminRecoveryCodes.codeHash, this.recoveryHash(userId, input)), isNull(adminRecoveryCodes.usedAt)))
      .returning({ id: adminRecoveryCodes.id });
    if (used.length === 0) return null;
    const remaining = await this.recoveryRemaining(userId);
    await this.clear(userId);
    return { kind: 'recovery', remaining };
  }

  /** Remove segredo e códigos; o admin precisa configurar de novo no próximo acesso. */
  private async clear(userId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .update(adminProfiles)
        .set({ totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null, totpSetupStartedAt: null, totpSetupAttempts: 0, updatedAt: new Date() })
        .where(eq(adminProfiles.userId, userId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, userId));
    });
  }

  // ------------------------------------------------------- redefinir acesso

  /**
   * SEC-093: super admin redefine o acesso de OUTRO admin (nunca o próprio). Exige motivo e o canal em que a
   * identidade foi conferida fora do sistema. O super admin nunca vê o link.
   */
  async resetFor(actor: Principal, targetUserId: string, input: { reason: string; verifiedChannel: (typeof RESET_CHANNELS)[number] }, ctx: RequestContext): Promise<void> {
    if (actor.userId === targetUserId) throw errors.forbidden('CANNOT_RESET_OWN_TOTP', 'Você não pode redefinir o seu próprio acesso.');
    await this.performAccessReset({ targetUserId, origin: 'super_admin', reason: input.reason, verifiedChannel: input.verifiedChannel, ctx });
    // Mais de 3 redefinições por dia por super admin: alerta (HIPÓTESE do SEC-093).
    const today = await this.limiter.hit(`access-reset:${actor.userId}`, 86_400, false);
    if (today.count > 3) {
      for (const superAdmin of await this.superAdminEmails()) {
        this.mail.enqueue({ to: superAdmin, ...accessResetNoticeEmail(`${actor.email} (${today.count} redefinições hoje)`, 'super_admin', false) });
      }
    }
  }

  /**
   * Efeito comum do SEC-093 e do SEC-094 (CLI): apaga TOTP e códigos, INVALIDA a senha, revoga sessões e manda o
   * link de reativação (48 h, uso único, hash no banco) SOMENTE ao e-mail cadastrado. O link nunca é devolvido,
   * impresso nem logado. Avisa o alvo e os super admins; audita.
   */
  async performAccessReset(input: {
    targetUserId: string;
    origin: ResetOrigin;
    reason: string;
    verifiedChannel?: string;
    ctx: RequestContext;
    system?: { osUser: string; host: string };
    invitedBy?: string | null;
  }): Promise<{ email: string }> {
    const token = randomToken(32);
    const target = await this.db.transaction(async (tx) => {
      const [admin] = await tx.select().from(adminProfiles).where(eq(adminProfiles.userId, input.targetUserId)).for('update');
      if (!admin) throw errors.notFound('Admin não encontrado.');
      const [user] = await tx.select().from(users).where(eq(users.id, input.targetUserId));
      if (!user) throw errors.notFound('Admin não encontrado.');
      await tx
        .update(adminProfiles)
        .set({ totpSecretEnc: null, totpConfirmedAt: null, totpLastStep: null, totpSetupStartedAt: null, totpSetupAttempts: 0, updatedAt: new Date() })
        .where(eq(adminProfiles.userId, input.targetUserId));
      await tx.delete(adminRecoveryCodes).where(eq(adminRecoveryCodes.userId, input.targetUserId));
      await tx.update(users).set({ passwordHash: null, updatedAt: new Date() }).where(eq(users.id, input.targetUserId));
      await this.sessions.revokeSessions(tx, input.targetUserId, 'access_reset');
      await tx.insert(invitations).values({
        kind: 'admin',
        email: user.email,
        name: user.name,
        tokenHash: sha256Hex(token),
        payload: { profile: admin.profile, reactivateUserId: input.targetUserId },
        invitedBy: input.invitedBy ?? null,
        expiresAt: new Date(Date.now() + ACCESS_RESET_HOURS * 3_600_000),
      });
      await this.audit.record(tx, input.ctx, {
        action: input.origin === 'super_admin' ? 'admin.access_reset' : 'admin.access_reset_cli',
        ...(input.system ? { actorId: null, actorRole: 'system_cli' } : {}),
        targetType: 'user',
        targetId: input.targetUserId,
        reason: input.reason,
        after: { ...(input.verifiedChannel ? { verifiedChannel: input.verifiedChannel } : {}), ...(input.system ? { actorType: 'system_cli', ...input.system, override: input.origin === 'cli_override' } : {}) },
      });
      return user;
    });
    const link = `${this.config.get('ADMIN_WEB_URL', { infer: true })}/convite?token=${token}`;
    this.mail.enqueue({ to: target.email, ...accessResetEmail(link, ACCESS_RESET_HOURS) });
    this.mail.enqueue({ to: target.email, ...accessResetNoticeEmail(target.email, input.origin, true) });
    for (const superAdmin of await this.superAdminEmails(input.targetUserId)) {
      this.mail.enqueue({ to: superAdmin, ...accessResetNoticeEmail(target.email, input.origin, false) });
    }
    return { email: target.email };
  }

  async superAdminEmails(exceptUserId?: string): Promise<string[]> {
    const rows = await this.db
      .select({ email: users.email })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true), exceptUserId ? ne(users.id, exceptUserId) : undefined));
    return rows.map((row) => row.email);
  }

  async emailOf(userId: string): Promise<string> {
    const [row] = await this.db.select({ email: users.email }).from(users).where(eq(users.id, userId));
    return row?.email ?? '';
  }
}
