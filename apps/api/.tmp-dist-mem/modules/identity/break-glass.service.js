var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var BreakGlassService_1;
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, ne } from 'drizzle-orm';
import { DRIZZLE } from '../../platform/database/database.module.js';
import { MailService } from '../../platform/mail/mail.service.js';
import { breakGlassOverrideEmail } from '../../platform/mail/templates.js';
import { adminProfiles, users } from './db/schema.js';
import { TotpService } from './totp.service.js';
export class BreakGlassError extends Error {
    code;
    constructor(code, message) {
        super(message);
        this.code = code;
        this.name = 'BreakGlassError';
    }
}
/**
 * SEC-094: recuperação de emergência (break-glass). Só é chamada pela CLI (`dist/cli.js`), nunca por rota HTTP. O efeito
 * é o do SEC-093 (apaga TOTP e códigos, invalida a senha, revoga sessões, link de reativação só ao e-mail cadastrado), mas
 * sem exigir um super admin logado. O link NUNCA é devolvido, impresso nem logado.
 */
let BreakGlassService = BreakGlassService_1 = class BreakGlassService {
    db;
    totp;
    mail;
    logger = new Logger(BreakGlassService_1.name);
    constructor(db, totp, mail) {
        this.db = db;
        this.totp = totp;
        this.mail = mail;
    }
    async resetAccess(input) {
        const email = input.email.trim().toLowerCase();
        if (input.confirmEmail.trim().toLowerCase() !== email)
            throw new BreakGlassError('CONFIRM_MISMATCH', 'O e-mail de confirmação não confere.');
        if (input.reason.trim().length < 20)
            throw new BreakGlassError('REASON_TOO_SHORT', 'O motivo precisa ter pelo menos 20 caracteres.');
        const [target] = await this.db
            .select({ userId: adminProfiles.userId, active: adminProfiles.active, status: users.status })
            .from(adminProfiles)
            .innerJoin(users, eq(users.id, adminProfiles.userId))
            .where(eq(users.email, email));
        if (!target?.active || target.status !== 'active')
            throw new BreakGlassError('NOT_AN_ACTIVE_ADMIN', 'O e-mail não pertence a um admin ativo.');
        const others = await this.db
            .select({ userId: adminProfiles.userId, totp: adminProfiles.totpConfirmedAt })
            .from(adminProfiles)
            .where(and(eq(adminProfiles.profile, 'super_admin'), eq(adminProfiles.active, true), ne(adminProfiles.userId, target.userId)));
        const otherWithTotp = others.some((row) => row.totp !== null);
        if (otherWithTotp && !input.overrideOtherSuperAdmins) {
            throw new BreakGlassError('OTHER_SUPER_ADMIN_EXISTS', 'Existe outro super admin ativo com TOTP: use a redefinição pelo painel (SEC-093). Para ignorar, use --override-other-super-admins.');
        }
        const override = otherWithTotp && input.overrideOtherSuperAdmins === true;
        if (input.dryRun)
            return { dryRun: true, email, override };
        const ctx = { ip: null, userAgent: 'cli', requestId: null, deviceId: null, principal: null };
        this.logger.warn(`break-glass: redefinição de acesso executada (operador do SO ${input.osUser}@${input.host}, override=${String(override)})`);
        await this.totp.performAccessReset({
            targetUserId: target.userId,
            origin: override ? 'cli_override' : 'cli',
            reason: input.reason.trim(),
            ctx,
            system: { osUser: input.osUser, host: input.host },
        });
        if (override) {
            for (const superAdmin of await this.totp.superAdminEmails())
                this.mail.enqueue({ to: superAdmin, ...breakGlassOverrideEmail(email) });
        }
        return { dryRun: false, email, override };
    }
};
BreakGlassService = BreakGlassService_1 = __decorate([
    Injectable(),
    __param(0, Inject(DRIZZLE)),
    __metadata("design:paramtypes", [Object, TotpService,
        MailService])
], BreakGlassService);
export { BreakGlassService };
//# sourceMappingURL=break-glass.service.js.map