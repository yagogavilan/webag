import { createParamDecorator, SetMetadata } from '@nestjs/common';
export const IS_PUBLIC = 'webag:public';
export const ADMIN_PERMISSION = 'webag:admin-permission';
export const STORE_PERMISSION = 'webag:store-permission';
export const ROLES = 'webag:roles';
export const REQUIRE_REAUTH = 'webag:reauth';
export const ALLOW_PENDING_MFA = 'webag:allow-pending-mfa';
/** Rota pública. Todas as demais exigem autenticação (nega por padrão, SEC-021). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Exige perfil de admin com a permissão (tabela única em permissions.ts). */
export const AdminOnly = (permission) => SetMetadata(ADMIN_PERMISSION, permission);
/** Exige membro da loja `:storeId` com a permissão; não-membro recebe 404 (SEC-020). */
export const StorePermission = (permission) => SetMetadata(STORE_PERMISSION, permission);
export const Roles = (...roles) => SetMetadata(ROLES, roles);
/** Exige reautenticação recente (SEC-016). */
export const RequireReauth = () => SetMetadata(REQUIRE_REAUTH, true);
/** Admin sem segundo fator concluído só alcança rotas com este decorator (configurar TOTP). */
export const AllowPendingMfa = () => SetMetadata(ALLOW_PENDING_MFA, true);
export const CurrentPrincipal = createParamDecorator((_data, ctx) => {
    const req = ctx.switchToHttp().getRequest();
    if (!req.principal)
        throw new Error('CurrentPrincipal usado em rota pública');
    return req.principal;
});
export function buildContext(req) {
    const device = req.headers['x-device-id'];
    return {
        ip: req.ip ?? null,
        userAgent: (req.headers['user-agent'] ?? '').slice(0, 300) || null,
        requestId: typeof req.id === 'string' ? req.id : null,
        deviceId: typeof device === 'string' && /^[A-Za-z0-9-]{8,64}$/.test(device) ? device : null,
        principal: req.principal ?? null,
    };
}
export const Ctx = createParamDecorator((_data, ctx) => buildContext(ctx.switchToHttp().getRequest()));
//# sourceMappingURL=decorators.js.map