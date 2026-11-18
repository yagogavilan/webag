import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import type { RequestContext } from '../../platform/auth/decorators.js';
import { DRIZZLE, type Db } from '../../platform/database/database.module.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { breakGlassOverrideEmail } from '../../platform/mail/templates.js';
import { adminProfiles, users } from './db/schema.js';
import { TotpService } from './totp.service.js';

export class BreakGlassError extends Error {
  constructor(
    readonly code: 'CONFIRM_MISMATCH' | 'REASON_TOO_SHORT' | 'NOT_AN_ACTIVE_ADMIN' | 'OTHER_SUPER_ADMIN_EXISTS',
    message: string,
  ) {
    super(message);
    this.name = 'BreakGlassError';
  }
}

export interface BreakGlassInput {
  email: string;
  /** O operador digita o e-mail de novo para confirmar (SEC-094). */
  confirmEmail: string;
  reason: string;
  dryRun?: boolean;
  overrideOtherSuperAdmins?: boolean;
  osUser: string;
  host: string;
}

/**
 * SEC-094: recuperação de emergência (break-glass). Só é chamada pela CLI (`dist/cli.js`), nunca por rota HTTP. O efeito
 * é o do SEC-093 (apaga TOTP e códigos, invalida a senha, revoga sessões, link de reativação só ao e-mail cadastrado), mas
 * sem exigir um super admin logado. O link NUNCA é devolvido, impresso nem logado.
 */
@Injectable()
export class BreakGlassService {
  private readonly logger = new Logger(BreakGlassService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Db,
    private readonly totp: TotpService,
    private readonly mail: MailService,
  ) {}

  async resetAccess(input: BreakGlassInput): Promise<{ dryRun: boolean; email: string; override: boolean }> {
    const email = input.email.trim().toLowerCase();
    if (input.confirmEmail.trim().toLowerCase() !== email) throw new BreakGlassError('CONFIRM_MISMATCH', 'O e-mail de confirmação não confere.');
    if (input.reason.trim().length < 20) throw new BreakGlassError('REASON_TOO_SHORT', 'O motivo precisa ter pelo menos 20 caracteres.');

    const [target] = await this.db
      .select({ userId: adminProfiles.userId, active: adminProfiles.active, status: users.status })
      .from(adminProfiles)
      .innerJoin(users, eq(users.id, adminProfiles.userId))
      .where(eq(users.email, email));
    if (!target?.active || target.status !== 'active') throw new BreakGlassError('NOT_AN_ACTIVE_ADMIN', 'O e-mail não pertence a um admin ativo.');

    const others = await this.db
      .select({ userId: adminProfiles.userId, totp: adminProfiles.totpConfirmedAt })
      .from(adminProfiles)
      .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true), ne(adminProfiles.userId, target.userId)));
    const otherWithTotp = others.some((row) => row.totp !== null);
    if (otherWithTotp && !input.overrideOtherSuperAdmins) {
      throw new BreakGlassError('OTHER_SUPER_ADMIN_EXISTS', 'Existe outro super admin ativo com TOTP: use a redefinição pelo painel (SEC-093). Para ignorar, use --override-other-super-admins.');
    }
    const override = otherWithTotp && input.overrideOtherSuperAdmins === true;
    if (input.dryRun) return { dryRun: true, email, override };

    const ctx: RequestContext = { ip: null, userAgent: 'cli', requestId: null, deviceId: null, principal: null };
    this.logger.warn(`break-glass: redefinição de acesso executada (operador do SO ${input.osUser}@${input.host}, override=${String(override)})`);
    await this.totp.performAccessReset({
      targetUserId: target.userId,
      origin: override ? 'cli_override' : 'cli',
      reason: input.reason.trim(),
      ctx,
      system: { osUser: input.osUser, host: input.host },
    });
    if (override) {
      for (const superAdmin of await this.totp.superAdminEmails()) this.mail.enqueue({ to: superAdmin, ...breakGlassOverrideEmail(email) });
    }
    return { dryRun: false, email, override };
  }
}
