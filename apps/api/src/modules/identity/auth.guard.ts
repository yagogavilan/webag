import { type CanActivate, type ExecutionContext, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  ADMIN_PERMISSION,
  ADMIN_SELF,
  ALLOW_PENDING_MFA,
  buildContext,
  IS_PUBLIC,
  REQUIRE_REAUTH,
  ROLES,
  STORE_PERMISSION,
  type AuthedRequest,
} from '../../platform/auth/decorators.js';
import {
  adminHasPermission,
  memberHasStorePermission,
  type AdminPermission,
  type StorePermissionName,
} from '../../platform/auth/permissions.js';
import { AppError, errors } from '../../platform/http/app-error.js';
import { AuditService, ParametersService } from '../admin/index.js';
import type { UserRole } from './db/schema.js';
import { PrincipalService } from './principal.service.js';
import { SessionService } from './session.service.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
/** Atualiza `last_used_at` no máximo 1x por minuto (evita escrita em toda requisição). */
const TOUCH_INTERVAL_MS = 60_000;

/**
 * Guard global: NEGA POR PADRÃO (SEC-021). Rota pública só com @Public().
 * Ordem: token (HS256, iss, aud, typ) → sessão ativa no banco → expiração por inatividade do admin →
 * segundo fator do admin → permissão de admin / papel / loja → reautenticação.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly sessionsService: SessionService,
    private readonly principals: PrincipalService,
    private readonly params: ParametersService,
    private readonly audit: AuditService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Mensagens do Socket.IO (I10): a autenticação foi feita no handshake (RealtimeGateway), que grava `userId` no socket. NEGA POR PADRÃO:
    // todo `@SubscribeMessage` novo exige socket autenticado; mensagem de socket sem identidade é recusada.
    if (context.getType() === 'ws') return Boolean((context.switchToWs().getClient<{ data?: { userId?: unknown } }>().data ?? {}).userId);
    if (context.getType() !== 'http') return false;
    const targets = [context.getHandler(), context.getClass()];
    if (this.reflector.getAllAndOverride<boolean | undefined>(IS_PUBLIC, targets)) return true;

    const req = context.switchToHttp().getRequest<AuthedRequest>();
    const header = req.headers.authorization;
    const token = typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7).trim() : null;
    if (!token) throw errors.unauthenticated();

    const claims = await this.sessionsService.verifyAccess(token);
    if (!claims) throw errors.unauthenticated('Sessão inválida. Entre de novo.');
    const loaded = await this.principals.load(claims.sub, claims.sid);
    if (!loaded) throw SessionService.unauthorized();
    const { principal } = loaded;
    req.principal = principal;

    if (principal.adminProfile) {
      const idleMs = (await this.params.getNumber('admin_inatividade_min')) * 60_000;
      if (Date.now() - loaded.sessionLastUsedAt.getTime() > idleMs) {
        throw new AppError(401, 'SESSION_IDLE', 'Sessão expirada por inatividade', { detail: 'Entre de novo.' });
      }
    }
    if (Date.now() - loaded.sessionLastUsedAt.getTime() > TOUCH_INTERVAL_MS) {
      await this.sessionsService.touch(principal.sessionId);
    }

    if (principal.adminProfile && !principal.mfaVerified) {
      if (!this.reflector.getAllAndOverride<boolean | undefined>(ALLOW_PENDING_MFA, targets)) {
        throw errors.forbidden('MFA_REQUIRED', 'Conclua a verificação em duas etapas para continuar.');
      }
    }

    const adminPermission = this.reflector.getAllAndOverride<AdminPermission | undefined>(ADMIN_PERMISSION, targets);
    if (adminPermission) {
      if (!principal.adminProfile || !adminHasPermission(principal.adminProfile, adminPermission)) {
        // WB-100 C4: tentativa de não-admin (ou de perfil sem a permissão) é negada e registrada.
        await this.audit
          .recordStandalone(buildContext(req), {
            action: 'admin.access_denied',
            targetType: 'route',
            targetId: `${req.method} ${req.path}`,
            after: { permission: adminPermission },
          })
          .catch(() => undefined);
        throw errors.forbidden();
      }
    }

    // WB-355: rota do admin sobre a própria conta (TOTP): qualquer perfil de admin; outro papel é negado e registrado, antes de o corpo ser validado.
    if (this.reflector.getAllAndOverride<boolean | undefined>(ADMIN_SELF, targets) && !principal.adminProfile) {
      await this.audit
        .recordStandalone(buildContext(req), { action: 'admin.access_denied', targetType: 'route', targetId: `${req.method} ${req.path}`, after: { permission: 'admin-self' } })
        .catch(() => undefined);
      throw errors.forbidden();
    }

    const roles = this.reflector.getAllAndOverride<UserRole[] | undefined>(ROLES, targets);
    if (roles && !roles.some((role) => principal.roles.includes(role))) throw errors.forbidden();

    const storePermission = this.reflector.getAllAndOverride<StorePermissionName | undefined>(STORE_PERMISSION, targets);
    if (storePermission) await this.checkStore(req, principal.userId, storePermission);

    if (this.reflector.getAllAndOverride<boolean | undefined>(REQUIRE_REAUTH, targets)) {
      const windowMs = (await this.params.getNumber('reauth_min')) * 60_000;
      if (!principal.reauthAt || Date.now() - principal.reauthAt.getTime() > windowMs) {
        throw errors.forbidden('REAUTH_REQUIRED', 'Confirme sua identidade para continuar.');
      }
    }
    return true;
  }

  /** Loja da rota `:storeId`. Não-membro recebe 404 (não revela que a loja existe); membro sem a permissão, 403. */
  private async checkStore(req: AuthedRequest, userId: string, permission: StorePermissionName): Promise<void> {
    const storeId = (req.params as Record<string, string | undefined>).storeId;
    if (!storeId || !UUID.test(storeId)) throw errors.notFound();
    const member = await this.principals.storeMembership(userId, storeId);
    if (!member) throw errors.notFound();
    if (!memberHasStorePermission(member, permission)) throw errors.forbidden();
  }
}
